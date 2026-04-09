// ── CSV field normalisation ────────────────────────────────────
import { getFiscalQuarterInfo } from './fmt'
import { DEFAULT_CAT_MAP } from './vocab'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Returns 3 month objects for the fiscal quarter.
// fyStartMonth: 1-based fiscal year start month.
// isNextQuarter: advance 3 months from current quarter start.
export function getQuarterMonths(fyStartMonth = 1, isNextQuarter = false) {
  const info = getFiscalQuarterInfo('current', fyStartMonth)
  const now  = new Date()
  now.setHours(0, 0, 0, 0)

  let startMonth = info.qStartMonth
  let startYear  = info.qStartYear
  if (isNextQuarter) {
    const next = ((info.qStartMonth - 1 + 3) % 12) + 1
    if (next <= info.qStartMonth) startYear++
    startMonth = next
  }

  return [0, 1, 2].map(offset => {
    const rawIdx    = startMonth - 1 + offset
    const year      = startYear + Math.floor(rawIdx / 12)
    const monthIndex = rawIdx % 12   // 0-based JS month
    const startDate = new Date(year, monthIndex, 1)
    const endDate   = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
    const isPast    = endDate < now
    const isCurrent = now.getMonth() === monthIndex && now.getFullYear() === year
    return {
      label:      MONTH_NAMES[monthIndex],
      short:      MONTH_SHORT[monthIndex],
      monthIndex,
      year,
      startDate,
      endDate,
      isPast,
      isCurrent,
    }
  })
}

// Returns true if deal.f_close_date falls within month.startDate..month.endDate.
export function isCloseInMonth(deal, month) {
  if (!deal.f_close_date) return false
  const d = new Date(deal.f_close_date)
  if (isNaN(d.getTime())) return false
  return d >= month.startDate && d <= month.endDate
}

// Breaks down importedData by forecast category for each of the 3 quarter months.
// Returns null if importedData is empty/null.
export function calcMonthlyBreakdown(importedData, fyStartMonth = 1, isNextQuarter = false) {
  if (!importedData?.length) return null
  const months = getQuarterMonths(fyStartMonth, isNextQuarter)

  return months.map(month => {
    const inMonth = importedData.filter(d => isCloseInMonth(d, month))

    const sumCat = (cat) => {
      const matched = inMonth.filter(d => d.f_fc_cat_norm === cat)
      return { amount: matched.reduce((s, d) => s + d.f_amount_num, 0), count: matched.length }
    }

    const closed     = sumCat('closed')
    const worst_case = sumCat('worst_case')
    const call       = sumCat('call')
    const best_case  = sumCat('best_case')
    const pipeline   = sumCat('pipeline')

    const total       = closed.amount + worst_case.amount + call.amount + best_case.amount + pipeline.amount
    const total_count = closed.count  + worst_case.count  + call.count  + best_case.count  + pipeline.count

    return {
      ...month,
      closed:          closed.amount,     closed_count:     closed.count,
      worst_case:      worst_case.amount, worst_case_count: worst_case.count,
      call:            call.amount,       call_count:       call.count,
      best_case:       best_case.amount,  best_case_count:  best_case.count,
      pipeline:        pipeline.amount,   pipeline_count:   pipeline.count,
      total,           total_count,
    }
  })
}

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

// normalizeFcCat — resolves a raw CSV forecast category value to an internal key.
// catMap format: { worst_case: string[], call: string[], ... }
// Returns: { key: string, unmapped: boolean, rawValue?: string }
export function normalizeFcCat(raw, catMap = DEFAULT_CAT_MAP) {
  if (!raw) return { key: 'pipeline', unmapped: false }
  const trimmed = raw.trim()
  const lower   = trimmed.toLowerCase()

  // 1. Exact match (case-insensitive) against user catMap
  if (catMap) {
    for (const [internalKey, values] of Object.entries(catMap)) {
      if (Array.isArray(values) && values.some(v => v.trim().toLowerCase() === lower)) {
        return { key: internalKey, unmapped: false }
      }
    }
  }

  // 2. Fuzzy fallback — covers common SFDC variants not in catMap
  if (lower.includes('closed') || lower.includes('won')) return { key: 'closed',     unmapped: false }
  if (lower.includes('worst'))    return { key: 'worst_case', unmapped: false }
  if (lower.includes('commit'))   return { key: 'worst_case', unmapped: false }
  if (lower.includes('best'))     return { key: 'best_case',  unmapped: false }
  if (lower.includes('call'))     return { key: 'call',       unmapped: false }
  if (lower.includes('probable')) return { key: 'call',       unmapped: false }
  if (lower.includes('upside'))   return { key: 'best_case',  unmapped: false }
  if (lower.includes('omit'))     return { key: 'omitted',    unmapped: false }

  // 3. No match — default to pipeline, flag as unmapped
  return { key: 'pipeline', unmapped: true, rawValue: trimmed }
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
    const catResult  = normalizeFcCat(d.f_fc_cat, catMap)
    d.f_fc_cat_norm  = catResult.key
    d._rawFcCat      = (d.f_fc_cat || '').trim()
    d._unmapped      = catResult.unmapped || false
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
// C&C is split equally by headcount (1/totalAECount per AE — team-level input, not deal-count-weighted).
export function calcRepForecast(ownerName, importedData, storeState, totalAECount) {
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

  // Equal headcount split — C&C is a team input, not deal-count-weighted
  const aeShare = totalAECount > 0 ? 1 / totalAECount : 0
  const cnc_rep = (derived?.cnc_prorated || 0) * aeShare

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
