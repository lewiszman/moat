// ── CSV field normalisation ────────────────────────────────────
import { getFiscalQuarterInfo } from './fmt'

const DEFAULT_COL_MAP = {
  'Opportunity Name':         'f_opp_name',
  'Account Name':             'f_account',
  'Owner':                    'f_owner',
  'Amount':                   'f_amount',
  'Close Date':               'f_close_date',
  'Stage':                    'f_stage',
  'Forecast Category':        'f_fc_cat',
  'Next Step':                'f_next_step',
  'Account: Last Activity':   'f_last_activity',
  'Metrics':                  'f_metrics',
  'Economic Buyer':           'f_econ_buyer',
  'Decision Criteria':        'f_dec_criteria',
  'Decision Process':         'f_dec_process',
  'Procurement Process':      'f_proc_process',
  'Implicated Pain':          'f_implicated',
  'Champion':                 'f_champion',
}

const DEFAULT_CAT_MAP = {
  'Closed Won':  'closed',
  'Worst Case':  'worst_case',
  'Commit':      'worst_case',   // legacy SFDC
  'Commit ':     'worst_case',   // legacy SFDC with trailing space
  'Call':        'call',
  'Probable':    'call',         // legacy SFDC
  'Best Case':   'best_case',
  'Upside':      'best_case',    // legacy SFDC
  'Pipeline':    'pipeline',
  'Omitted':     'omitted',
}

export function normalizeFcCat(raw, catMap = DEFAULT_CAT_MAP) {
  if (!raw) return 'pipeline'
  const trimmed = raw.trim()
  if (catMap[trimmed]) return catMap[trimmed]
  const lower = trimmed.toLowerCase()
  if (lower.includes('closed') || lower.includes('won')) return 'closed'
  if (lower.includes('worst'))    return 'worst_case'
  if (lower.includes('commit'))   return 'worst_case'   // legacy
  if (lower.includes('best'))     return 'best_case'
  if (lower.includes('call'))     return 'call'
  if (lower.includes('probable')) return 'call'         // legacy
  if (lower.includes('upside'))   return 'best_case'    // legacy
  if (lower.includes('omit'))     return 'omitted'
  return 'pipeline'
}

export function parseAmount(s) {
  if (typeof s === 'number') return s
  return parseFloat(String(s).replace(/[$,\s]/g, '')) || 0
}

export function normalizeRecords(rows, colMap = DEFAULT_COL_MAP, catMap = DEFAULT_CAT_MAP) {
  return rows.map(row => {
    const d = {}
    // Apply column mapping
    Object.entries(colMap).forEach(([header, field]) => {
      if (row[header] !== undefined) d[field] = row[header]
    })
    // Also apply any direct field keys already mapped
    Object.entries(row).forEach(([k, v]) => {
      const mapped = colMap[k]
      if (mapped) d[mapped] = v
    })
    // Normalize derived fields
    d.f_amount_num = parseAmount(d.f_amount || 0)
    d.f_fc_cat_norm = normalizeFcCat(d.f_fc_cat, catMap)
    return d
  }).filter(d => d.f_opp_name || d.f_account)
}

// ── Forecast aggregation from import ──────────────────────────
export function aggregateForecast(records) {
  const active = records.filter(r => !['closed', 'omitted'].includes(r.f_fc_cat_norm))
  const closed = records
    .filter(r => r.f_fc_cat_norm === 'closed')
    .reduce((s, r) => s + r.f_amount_num, 0)

  const byCategory = (cat) =>
    active.filter(r => r.f_fc_cat_norm === cat).reduce((s, r) => s + r.f_amount_num, 0)

  return {
    closed,
    pipe_worst_case: byCategory('worst_case'),
    pipe_call:       byCategory('call'),
    pipe_best_case:  byCategory('best_case'),
    pipe_pipe:       byCategory('pipeline'),
  }
}

// ── Per-rep forecast calculation ──────────────────────────────
// Uses team conversion rates applied to per-rep pipeline.
// C&C is prorated by AE deal share (team-level input, not per-rep).
export function calcRepForecast(ownerName, importedData, storeState) {
  const active = importedData.filter(d =>
    d.f_owner === ownerName && !['closed', 'omitted'].includes(d.f_fc_cat_norm)
  )
  const closedDeals = importedData.filter(d =>
    d.f_owner === ownerName && d.f_fc_cat_norm === 'closed'
  )

  const closed = closedDeals.reduce((s, d) => s + d.f_amount_num, 0)
  const bycat  = (cat) => active.filter(d => d.f_fc_cat_norm === cat).reduce((s, d) => s + d.f_amount_num, 0)

  const pipe_wc   = bycat('worst_case')
  const pipe_call = bycat('call')
  const pipe_bc   = bycat('best_case')
  const pipe_pipe = bycat('pipeline')

  const { r_worst_case, r_call, r_best_case, r_pipe, callIncludesBestCase, derived } = storeState

  const bk_wc   = pipe_wc   * ((r_worst_case || 0) / 100)
  const bk_call = pipe_call * ((r_call       || 0) / 100)
  const bk_bc   = pipe_bc   * ((r_best_case  || 0) / 100)
  const bk_pp   = pipe_pipe * ((r_pipe       || 0) / 100)

  const totalActive = importedData.filter(d => !['closed', 'omitted'].includes(d.f_fc_cat_norm)).length
  const aeShare  = totalActive > 0 ? active.length / totalActive : 0
  const cnc_rep  = (derived?.cnc_prorated || 0) * aeShare

  const bk_bc_in_call = callIncludesBestCase ? bk_bc * 0.5 : 0

  const fc_worst_case = closed + cnc_rep + bk_wc
  const fc_call       = fc_worst_case + bk_call + bk_bc_in_call
  const fc_best_case  = fc_call + (bk_bc - bk_bc_in_call)

  return {
    closed, pipe_wc, pipe_call, pipe_bc, pipe_pipe,
    bk_wc, bk_call, bk_bc, bk_pp, cnc_rep,
    fc_worst_case, fc_call, fc_best_case,
    dealCount:     active.length,
    totalPipeline: pipe_wc + pipe_call + pipe_bc + pipe_pipe,
  }
}

// Monthly closed breakdown from import — respects fiscal year start month
export function calcMonthlyClosedBreakdown(records, fyStartMonth = 1) {
  const closed = records.filter(r => r.f_fc_cat_norm === 'closed')
  const { qStartMonth, qStartYear } = getFiscalQuarterInfo('current', fyStartMonth)

  // Build three calendar months for this fiscal quarter (handles year boundary)
  const months = [0, 1, 2].map(offset => {
    const m = ((qStartMonth - 1 + offset) % 12)
    const y = qStartYear + Math.floor((qStartMonth - 1 + offset) / 12)
    return { m, y }
  })

  return months.map(({ m, y }) =>
    closed
      .filter(r => {
        if (!r.f_close_date) return false
        const d = new Date(r.f_close_date)
        return d.getMonth() === m && d.getFullYear() === y
      })
      .reduce((s, r) => s + r.f_amount_num, 0)
  )
}
