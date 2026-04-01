import { getCqState, getQ1State, useWowStore, useDealBackStore, useSectionComments, migrateSnapshot } from '../store/forecastStore'
import { useVocabStore, useCatMapStore } from './vocab'
import { sanitizeSnapshot } from './supabase'

// Keys snapshotted per-quarter
const FORECAST_SNAP_KEYS = [
  'managerName', 'managerTeam', 'quarterLabel', 'monthUnlocked', 'sfdcUrl',
  'quota', 'closed',
  'r_worst_case', 'r_call', 'r_best_case', 'r_pipe', 'r_cnc',
  'pipe_worst_case', 'pipe_call', 'pipe_best_case', 'pipe_pipe',
  'cnc_opps', 'cnc_asp', 'callIncludesBestCase', 'forecastDefaults', 'fyStartMonth',
  'm1_closed', 'm1_worst_case', 'm1_call', 'm1_best_case',
  'm2_closed', 'm2_worst_case', 'm2_call', 'm2_best_case',
  'm3_closed', 'm3_worst_case', 'm3_call', 'm3_best_case',
]

function pickForecast(state) {
  const out = {}
  FORECAST_SNAP_KEYS.forEach(k => { if (state[k] !== undefined) out[k] = state[k] })
  return out
}

// Build a comprehensive snapshot from all stores.
// Callers pass this to autoSaveSession / saveNamedSession.
export function buildSnapshot() {
  const cq    = getCqState()
  const q1    = getQ1State()
  const wow   = useWowStore.getState()
  const db    = useDealBackStore.getState()
  const sc    = useSectionComments.getState()
  const vocab   = useVocabStore.getState()
  const catMapS = useCatMapStore.getState()

  let importMeta = null
  try {
    const raw = localStorage.getItem('moat-import-meta')
    if (raw) importMeta = JSON.parse(raw)
  } catch {}

  return sanitizeSnapshot({
    cq:       pickForecast(cq),
    q1:       pickForecast(q1),
    wow: {
      snapshots:               wow.snapshots,
      actualClosedAtQuarterEnd: wow.actualClosedAtQuarterEnd,
    },
    dealBack: {
      positions_cq:     db.positions_cq,
      positions_q1:     db.positions_q1,
      cncOverrides_cq:  db.cncOverrides_cq,
      cncOverrides_q1:  db.cncOverrides_q1,
    },
    sectionComments: sc.comments,
    vocab:    vocab.vocab,
    catMap:   catMapS.catMap,
    importMeta,
  })
}

// Distribute a snapshot to all stores.
// Safe to call with partial snapshots — each section is optional.
export function applySnapshot(snap) {
  if (!snap) return

  if (snap.cq) getCqState().loadSnapshot(migrateSnapshot(snap.cq))
  if (snap.q1) getQ1State().loadSnapshot(migrateSnapshot(snap.q1))

  if (snap.wow) {
    useWowStore.setState({
      snapshots:               snap.wow.snapshots               || [],
      actualClosedAtQuarterEnd: snap.wow.actualClosedAtQuarterEnd || { cq: null, q1: null },
    })
  }

  if (snap.dealBack) {
    useDealBackStore.setState({
      positions_cq:    snap.dealBack.positions_cq    || {},
      positions_q1:    snap.dealBack.positions_q1    || {},
      cncOverrides_cq: snap.dealBack.cncOverrides_cq || { opps: null, asp: null, rate: null },
      cncOverrides_q1: snap.dealBack.cncOverrides_q1 || { opps: null, asp: null, rate: null },
    })
  }

  if (snap.sectionComments) {
    useSectionComments.setState({ comments: snap.sectionComments })
  }

  if (snap.vocab) {
    useVocabStore.setState({ vocab: snap.vocab })
  }

  if (snap.catMap) {
    useCatMapStore.setState({ catMap: snap.catMap })
  }

  if (snap.importMeta) {
    // Restore importMeta UI state without re-aggregating pipeline inputs
    getCqState().setImportMeta(snap.importMeta)
    getQ1State().setImportMeta(snap.importMeta)
    try {
      localStorage.setItem('moat-import-meta', JSON.stringify(snap.importMeta))
    } catch {}
  }
}
