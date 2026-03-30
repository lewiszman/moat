import { bizDaysFrom, isWeekday } from './fmt'

// ── Stage alignment maps ────────────────────────────────────────
export const STAGE_MIN_FC = {
  'discovery':          'pipeline',
  'qualification':      'pipeline',
  'demo':               'best_case',
  'solution design':    'best_case',
  'value proposition':  'best_case',
  'business case':      'best_case',
  'proposal':           'best_case',
  'negotiation':        'call',
  'legal & commercial': 'call',
  'contract review':    'call',
  'verbal commit':      'call',
}

export const STAGE_MAX_FC = {
  'discovery':          'pipeline',
  'qualification':      'pipeline',
  'demo':               'best_case',
  'solution design':    'best_case',
  'value proposition':  'best_case',
  'business case':      'call',
  'proposal':           'call',
  'negotiation':        'worst_case',
  'legal & commercial': 'worst_case',
  'contract review':    'worst_case',
  'verbal commit':      'worst_case',
}

export const CAT_RANK = { pipeline: 0, best_case: 1, call: 2, worst_case: 3 }

export const MEDDPICC_FIELDS = [
  { key: 'f_metrics',      label: 'Metrics (M)',            flagId: 'MEDDPICC_M'  },
  { key: 'f_econ_buyer',   label: 'Economic Buyer (E)',     flagId: 'MEDDPICC_E'  },
  { key: 'f_dec_criteria', label: 'Decision Criteria (DC)', flagId: 'MEDDPICC_DC' },
  { key: 'f_dec_process',  label: 'Decision Process (DP)',  flagId: 'MEDDPICC_DP' },
  { key: 'f_proc_process', label: 'Procurement (PP)',       flagId: 'MEDDPICC_PP' },
  { key: 'f_implicated',   label: 'Implicated Pain (I)',    flagId: 'MEDDPICC_I'  },
  { key: 'f_champion',     label: 'Champion (C)',           flagId: 'MEDDPICC_C'  },
]

export const EARLY_STAGES = ['discovery', 'qualification', 'demo']

export const CAT_COLORS = {
  closed:     '#0d7c3d',
  worst_case: '#1a56db',
  call:       '#0d7c3d',
  best_case:  '#b45309',
  pipeline:   '#6b7280',
  omitted:    '#9ca3af',
}

export const CAT_BG = {
  closed:     '#f0fdf4',
  worst_case: '#eff6ff',
  call:       '#f0fdf4',
  best_case:  '#fffbeb',
  pipeline:   '#f9fafb',
  omitted:    '#f9fafb',
}

// ── Typed flag definitions ──────────────────────────────────────
// Shape: { id, label, sev: 'critical'|'warn', weight }
// Higher weight = sorted to top. sev='critical' renders red, sev='warn' renders amber.
export const FLAG_DEFS = {
  CLOSE_PAST:        { id: 'CLOSE_PAST',        label: 'Close date passed',             sev: 'critical', weight: 100 },
  CLOSE_3BD:         { id: 'CLOSE_3BD',          label: 'Close ≤3 biz days',             sev: 'critical', weight:  90 },
  NO_NEXT_STEP:      { id: 'NO_NEXT_STEP',       label: 'Next step empty',               sev: 'critical', weight:  85 }, // sev/weight override at runtime for non-worst_case/call
  LAST_ACTIVITY_14D: { id: 'LAST_ACTIVITY_14D',  label: 'No activity 14d+',              sev: 'critical', weight:  80 },
  AMOUNT_ZERO:       { id: 'AMOUNT_ZERO',        label: 'Amount $0',                     sev: 'critical', weight:  75 },
  FC_TOO_HIGH:       { id: 'FC_TOO_HIGH',        label: 'FC too high for stage',         sev: 'critical', weight:  70 },
  CLOSE_WEEKEND:     { id: 'CLOSE_WEEKEND',      label: 'Close on weekend',              sev: 'warn',     weight:  50 },
  CLOSE_10BD_DISC:   { id: 'CLOSE_10BD_DISC',   label: 'Discovery: close <10 biz days', sev: 'warn',     weight:  45 },
  FC_TOO_LOW:        { id: 'FC_TOO_LOW',         label: 'FC too low for stage',          sev: 'warn',     weight:  40 },
  MEDDPICC_E:        { id: 'MEDDPICC_E',         label: 'Economic Buyer empty',          sev: 'warn',     weight:  35 },
  MEDDPICC_C:        { id: 'MEDDPICC_C',         label: 'Champion empty',                sev: 'warn',     weight:  35 },
  MEDDPICC_M:        { id: 'MEDDPICC_M',         label: 'Metrics empty',                 sev: 'warn',     weight:  30 },
  MEDDPICC_I:        { id: 'MEDDPICC_I',         label: 'Implicated Pain empty',         sev: 'warn',     weight:  30 },
  MEDDPICC_DC:       { id: 'MEDDPICC_DC',        label: 'Decision Criteria empty',       sev: 'warn',     weight:  30 },
  MEDDPICC_DP:       { id: 'MEDDPICC_DP',        label: 'Decision Process empty',        sev: 'warn',     weight:  30 },
  MEDDPICC_PP:       { id: 'MEDDPICC_PP',        label: 'Procurement Process empty',     sev: 'warn',     weight:  25 },
  NO_ACTIVITY_DATA:  { id: 'NO_ACTIVITY_DATA',   label: 'No activity date available',    sev: 'warn',     weight:  20 },
}

// Flat list for filter UI
export const FLAG_DEF_LIST = Object.values(FLAG_DEFS)

// ── Flag engine ─────────────────────────────────────────────────
export function flagDeal(deal) {
  const flags = []
  const now   = new Date()
  now.setHours(0, 0, 0, 0)
  const cat   = deal.f_fc_cat_norm || 'pipeline'
  const stage = (deal.f_stage || '').toLowerCase().trim()
  const amt   = deal.f_amount_num || 0

  // 1. Close date
  if (deal.f_close_date) {
    const cd = new Date(deal.f_close_date)
    cd.setHours(0, 0, 0, 0)
    if (!isNaN(cd)) {
      const calDays = Math.floor((cd - now) / 86400000)
      const cdDay   = cd.getDay()
      if (calDays < 0) {
        flags.push(FLAG_DEFS.CLOSE_PAST)
      } else if (cdDay === 0 || cdDay === 6) {
        flags.push(FLAG_DEFS.CLOSE_WEEKEND)
      } else {
        const bizDays = bizDaysFrom(now, cd)
        if (bizDays <= 3) {
          flags.push(FLAG_DEFS.CLOSE_3BD)
        } else if (stage.includes('discovery') && bizDays < 10) {
          flags.push(FLAG_DEFS.CLOSE_10BD_DISC)
        }
      }
    }
  }

  // 2. FC vs stage alignment
  if (stage) {
    const stageKey = Object.keys(STAGE_MAX_FC).find(k => stage.includes(k))
    if (stageKey) {
      const minRank = CAT_RANK[STAGE_MIN_FC[stageKey]] ?? 0
      const maxRank = CAT_RANK[STAGE_MAX_FC[stageKey]] ?? 3
      const catRank = CAT_RANK[cat] ?? 0
      if (catRank > maxRank)      flags.push(FLAG_DEFS.FC_TOO_HIGH)
      else if (catRank < minRank) flags.push(FLAG_DEFS.FC_TOO_LOW)
    }
  }

  // 3. Next step — critical for worst_case/call, warn otherwise
  if (!deal.f_next_step || deal.f_next_step.trim() === '') {
    const isCrit = ['worst_case', 'call'].includes(cat)
    flags.push({ ...FLAG_DEFS.NO_NEXT_STEP, sev: isCrit ? 'critical' : 'warn', weight: isCrit ? 85 : 22 })
  }

  // 4. MEDDPICC — worst_case/call only, not early stage
  const isEarlyStage = EARLY_STAGES.some(s => stage.includes(s))
  if (['worst_case', 'call'].includes(cat) && !isEarlyStage) {
    MEDDPICC_FIELDS.forEach(({ key, flagId }) => {
      if (!(deal[key] || '').trim()) flags.push(FLAG_DEFS[flagId])
    })
  }

  // 5. Last activity >14d
  if (deal.f_last_activity) {
    const la = new Date(deal.f_last_activity)
    if (!isNaN(la)) {
      const daysSince = Math.floor((now - la) / 86400000)
      if (daysSince > 14) flags.push(FLAG_DEFS.LAST_ACTIVITY_14D)
    }
  } else {
    flags.push(FLAG_DEFS.NO_ACTIVITY_DATA)
  }

  // 6. Amount zero
  if (amt === 0) flags.push(FLAG_DEFS.AMOUNT_ZERO)

  return flags
}

export function groupByRep(records) {
  return records.reduce((map, r) => {
    const owner = r.f_owner || 'Unknown'
    if (!map[owner]) map[owner] = []
    map[owner].push(r)
    return map
  }, {})
}

// Total flag weight for a deal (used for sort)
export function dealWeight(deal) {
  return (deal._flags || []).reduce((s, f) => s + (f.weight || 0), 0)
}
