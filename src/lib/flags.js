import { bizDaysFrom, isWeekday } from './fmt'

// Stage → minimum expected FC category
export const STAGE_MIN_FC = {
  'discovery':          'pipeline',
  'qualification':      'pipeline',
  'demo':               'upside',
  'solution design':    'upside',
  'value proposition':  'upside',
  'business case':      'upside',
  'proposal':           'upside',
  'negotiation':        'probable',
  'legal & commercial': 'probable',
  'contract review':    'probable',
  'verbal commit':      'probable',
}

export const STAGE_MAX_FC = {
  'discovery':          'pipeline',
  'qualification':      'pipeline',
  'demo':               'upside',
  'solution design':    'upside',
  'value proposition':  'upside',
  'business case':      'probable',
  'proposal':           'probable',
  'negotiation':        'commit',
  'legal & commercial': 'commit',
  'contract review':    'commit',
  'verbal commit':      'commit',
}

export const CAT_RANK = { pipeline: 0, upside: 1, probable: 2, commit: 3 }

export const MEDDPICC_FIELDS = [
  { key: 'f_metrics',      label: 'Metrics (M)' },
  { key: 'f_econ_buyer',   label: 'Economic Buyer (E)' },
  { key: 'f_dec_criteria', label: 'Decision Criteria (DC)' },
  { key: 'f_dec_process',  label: 'Decision Process (DP)' },
  { key: 'f_proc_process', label: 'Procurement Process (PP)' },
  { key: 'f_implicated',   label: 'Implicated Pain (I)' },
  { key: 'f_champion',     label: 'Champion (C)' },
]

export const EARLY_STAGES = ['discovery', 'qualification', 'demo']

export const CAT_COLORS = {
  closed:   '#0d7c3d',
  commit:   '#1a56db',
  probable: '#0d7c3d',
  upside:   '#b45309',
  pipeline: '#6b7280',
  omitted:  '#9ca3af',
}

export const CAT_BG = {
  closed:   '#f0fdf4',
  commit:   '#eff6ff',
  probable: '#f0fdf4',
  upside:   '#fffbeb',
  pipeline: '#f9fafb',
  omitted:  '#f9fafb',
}

export function flagDeal(deal) {
  const flags = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const cat = deal.f_fc_cat_norm || 'pipeline'
  const stage = (deal.f_stage || '').toLowerCase().trim()
  const amt = deal.f_amount_num || 0

  // 1. Close date
  if (!deal.f_close_date) {
    flags.push({ sev: 'amber', text: 'No close date' })
  } else {
    const cd = new Date(deal.f_close_date)
    cd.setHours(0, 0, 0, 0)
    if (!isNaN(cd)) {
      const calDays = Math.floor((cd - now) / 86400000)
      const cdDay = cd.getDay()
      if (calDays < 0) {
        flags.push({ sev: 'red', text: 'Close date in the past' })
      } else if (cdDay === 0 || cdDay === 6) {
        flags.push({ sev: 'amber', text: 'Close date lands on a weekend' })
      } else {
        const bizDays = bizDaysFrom(now, cd)
        if (bizDays <= 3) {
          flags.push({ sev: 'red', text: 'Close date within 3 business days' })
        } else if (stage.includes('discovery') && bizDays < 10) {
          flags.push({ sev: 'amber', text: 'Discovery stage — close <10 business days away' })
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
      if (catRank > maxRank)
        flags.push({ sev: 'red', text: `FC too high for ${stageKey} stage (max: ${STAGE_MAX_FC[stageKey]})` })
      else if (catRank < minRank)
        flags.push({ sev: 'amber', text: `FC too low for ${stageKey} stage (min: ${STAGE_MIN_FC[stageKey]})` })
    }
  }

  // 3. Next step
  if (!deal.f_next_step || deal.f_next_step.trim() === '')
    flags.push({ sev: ['commit', 'probable'].includes(cat) ? 'red' : 'amber', text: 'Next step empty' })

  // 4. MEDDPICC — Commit/Probable only, not early stage
  const isEarlyStage = EARLY_STAGES.some(s => stage.includes(s))
  if (['commit', 'probable'].includes(cat) && !isEarlyStage) {
    MEDDPICC_FIELDS.forEach(f => {
      if (!(deal[f.key] || '').trim())
        flags.push({ sev: 'amber', text: `${f.label} empty` })
    })
  }

  // 5. Last activity >14d
  if (deal.f_last_activity) {
    const la = new Date(deal.f_last_activity)
    if (!isNaN(la)) {
      const daysSince = Math.floor((now - la) / 86400000)
      if (daysSince > 14) flags.push({ sev: 'red', text: `No activity ${daysSince}d` })
    }
  } else {
    flags.push({ sev: 'amber', text: 'No activity date available' })
  }

  // 6. Amount
  if (amt === 0) flags.push({ sev: 'red', text: 'Amount $0' })

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
