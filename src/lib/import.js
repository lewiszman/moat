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
  'Commit':      'commit',
  'Commit ':     'commit',
  'Best Case':   'probable',
  'Probable':    'probable',
  'Pipeline':    'pipeline',
  'Upside':      'upside',
  'Omitted':     'omitted',
}

export function normalizeFcCat(raw, catMap = DEFAULT_CAT_MAP) {
  if (!raw) return 'pipeline'
  const trimmed = raw.trim()
  if (catMap[trimmed]) return catMap[trimmed]
  const lower = trimmed.toLowerCase()
  if (lower.includes('closed') || lower.includes('won')) return 'closed'
  if (lower.includes('commit')) return 'commit'
  if (lower.includes('probable') || lower.includes('best')) return 'probable'
  if (lower.includes('upside')) return 'upside'
  if (lower.includes('omit')) return 'omitted'
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
    pipe_commit:  byCategory('commit'),
    pipe_prob:    byCategory('probable'),
    pipe_up:      byCategory('upside'),
    pipe_pipe:    byCategory('pipeline'),
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
