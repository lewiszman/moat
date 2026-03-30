import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { calcForecast } from '../lib/forecast'
import { aggregateForecast, calcMonthlyClosedBreakdown } from '../lib/import'
import { getFiscalQuarterInfo, sellDaysRemaining } from '../lib/fmt'

// ── Snapshot key allowlist ─────────────────────────────────────
// Only these fields are merged when restoring a snapshot or share URL.
// Prevents injection of arbitrary keys (functions, credentials, etc.).
const SNAPSHOT_KEYS = [
  'managerName', 'managerTeam', 'quarterLabel', 'monthUnlocked', 'sfdcUrl',
  'quota', 'closed',
  'r_worst_case', 'r_call', 'r_best_case', 'r_pipe', 'r_cnc',
  'pipe_worst_case', 'pipe_call', 'pipe_best_case', 'pipe_pipe',
  'cnc_opps', 'cnc_asp', 'callIncludesBestCase', 'activeView',
  'forecastDefaults', 'fyStartMonth',
  'm1_closed', 'm1_worst_case', 'm1_call', 'm1_best_case',
  'm2_closed', 'm2_worst_case', 'm2_call', 'm2_best_case',
  'm3_closed', 'm3_worst_case', 'm3_call', 'm3_best_case',
]

// ── Supabase snapshot migration ────────────────────────────────
// Handles sessions saved before the Worst Case / Call / Best Case rename.
export function migrateSnapshot(snapshot) {
  const map = {
    pipe_commit:        'pipe_worst_case',
    pipe_prob:          'pipe_call',
    pipe_up:            'pipe_best_case',
    r_commit:           'r_worst_case',
    r_prob:             'r_call',
    r_up:               'r_best_case',
    bk_c:               'bk_wc',
    bk_p:               'bk_call',
    bk_u:               'bk_bc',
    fc_commit:          'fc_worst_case',
    fc_prob:            'fc_call',
    fc_up:              'fc_best_case',
    probIncludesUpside: 'callIncludesBestCase',
    m1_commit: 'm1_worst_case', m1_prob: 'm1_call', m1_up: 'm1_best_case',
    m2_commit: 'm2_worst_case', m2_prob: 'm2_call', m2_up: 'm2_best_case',
    m3_commit: 'm3_worst_case', m3_prob: 'm3_call', m3_up: 'm3_best_case',
  }
  const migrated = { ...snapshot }
  Object.entries(map).forEach(([old, next]) => {
    if (old in migrated) {
      migrated[next] = migrated[old]
      delete migrated[old]
    }
  })
  return migrated
}

// ── Default values ─────────────────────────────────────────────
const DEFAULT_RATES    = { r_worst_case: 80, r_call: 75, r_best_case: 50, r_pipe: 18, r_cnc: 18 }
const DEFAULT_PIPELINE = { pipe_worst_case: 0, pipe_call: 0, pipe_best_case: 0, pipe_pipe: 0 }
const DEFAULT_CNC      = { cnc_opps: 5, cnc_asp: 14000 }
const DEFAULT_MONTHLY  = {
  m1_closed: 0, m1_worst_case: 0, m1_call: 0, m1_best_case: 0,
  m2_closed: 0, m2_worst_case: 0, m2_call: 0, m2_best_case: 0,
  m3_closed: 0, m3_worst_case: 0, m3_call: 0, m3_best_case: 0,
}

// ── Derived calculator (quarter-aware) ─────────────────────────
function makeComputeDerived(isNextQuarter) {
  return function computeDerived(s) {
    const bk_wc   = s.pipe_worst_case * (s.r_worst_case / 100)
    const bk_call = s.pipe_call       * (s.r_call       / 100)
    const bk_bc   = s.pipe_best_case  * (s.r_best_case  / 100)
    const bk_pp   = s.pipe_pipe       * (s.r_pipe       / 100)
    const cnc_pipe = s.cnc_opps * s.cnc_asp
    const cnc_rev  = cnc_pipe   * (s.r_cnc    / 100)

    const qMode      = isNextQuarter ? 'next' : 'current'
    const qInfo      = getFiscalQuarterInfo(qMode, s.fyStartMonth || 1)
    const qStartDate = new Date(qInfo.qStartYear, qInfo.qStartMonth - 1, 1)
    const calWeeks   = Math.round((qInfo.qEndDate - qStartDate) / (7 * 24 * 3600 * 1000))
    const weeks_total = Math.max(1, calWeeks - 2)
    const weeks_remaining = isNextQuarter
      ? weeks_total
      : Math.max(0, Math.ceil(sellDaysRemaining(new Date(), qInfo.qEndDate) / 5))
    const cnc_prorated = cnc_rev * (weeks_total > 0 ? weeks_remaining / weeks_total : 0)

    const { fc_worst_case, fc_call, fc_best_case, fc_full, bk_bc_in_call } = calcForecast({
      closed: s.closed, bk_wc, bk_call, bk_bc, bk_pp, cnc_prorated,
      callIncludesBestCase: s.callIncludesBestCase,
    })
    return { bk_wc, bk_call, bk_bc, bk_pp, cnc_pipe, cnc_rev, cnc_prorated, weeks_total, weeks_remaining, fc_worst_case, fc_call, fc_best_case, fc_full, bk_bc_in_call }
  }
}

// ── Forecast store factory ─────────────────────────────────────
function makeForecastStore(storeName, isNextQuarter = false) {
  const computeDerived = makeComputeDerived(isNextQuarter)
  const qMode = isNextQuarter ? 'next' : 'current'

  return create(
    persist(
      immer((set) => ({
        managerName: '', managerTeam: '', quarterLabel: '',
        monthUnlocked: { m1: false, m2: false, m3: false },
        sfdcUrl: '',
        quota: 0, closed: 0,
        ...DEFAULT_RATES, ...DEFAULT_PIPELINE, ...DEFAULT_CNC, ...DEFAULT_MONTHLY,
        callIncludesBestCase: false,
        derived: {},
        importedData: null, importMeta: null, scopeSelected: null,
        previousImportSnapshot: null,
        activeView: 'manager',
        forecastDefaults: { r_worst_case: 80, r_call: 75, r_best_case: 50, r_pipe: 18, r_cnc: 18, cnc_opps: 5, cnc_asp: 14000 },
        fyStartMonth: 1,

        setField:  (key, value) => set(s => { s[key] = value }),
        setFields: (fields)     => set(s => { Object.assign(s, fields) }),
        recalc:    ()           => set(s => { s.derived = computeDerived(s) }),

        toggleCallIncludesBestCase: () => set(s => {
          s.callIncludesBestCase = !s.callIncludesBestCase
          s.derived = computeDerived(s)
        }),

        setActiveView: (view) => set(s => { s.activeView = view }),

        toggleMonthLock: (month) => set(s => {
          s.monthUnlocked[month] = !s.monthUnlocked[month]
        }),

        setForecastDefault: (key, value) => set(s => { s.forecastDefaults[key] = value }),

        applyForecastDefaults: () => set(s => {
          const d = s.forecastDefaults
          s.r_worst_case = d.r_worst_case; s.r_call = d.r_call; s.r_best_case = d.r_best_case
          s.r_pipe       = d.r_pipe;       s.r_cnc  = d.r_cnc
          s.cnc_opps = d.cnc_opps; s.cnc_asp = d.cnc_asp
          s.derived  = computeDerived(s)
        }),

        loadShareState: (fields) => set(s => { SNAPSHOT_KEYS.forEach(k => { if (fields[k] !== undefined) s[k] = fields[k] }); s.derived = computeDerived(s) }),
        loadSnapshot:   (snap)   => set(s => {
          const migrated = migrateSnapshot(snap)
          SNAPSHOT_KEYS.forEach(k => { if (migrated[k] !== undefined) s[k] = migrated[k] })
          s.derived = computeDerived(s)
        }),

        setImportData: (records, meta) => set(s => {
          // Save snapshot of current import for slippage detection on next import
          if (s.importedData?.length) {
            const snap = {}
            s.importedData.forEach(d => {
              const key = (d.f_opp_name || '').toLowerCase()
              if (key) snap[key] = { closeDate: d.f_close_date || null, stage: d.f_stage || null }
            })
            s.previousImportSnapshot = snap
          }
          s.importedData = records; s.importMeta = meta; s.scopeSelected = null
          const agg     = aggregateForecast(records)
          const monthly = calcMonthlyClosedBreakdown(records, s.fyStartMonth || 1)
          Object.assign(s, agg)
          s.m1_closed = monthly[0] || 0
          s.m2_closed = monthly[1] || 0
          s.m3_closed = monthly[2] || 0
          s.closed    = agg.closed
          s.derived   = computeDerived(s)
        }),

        clearImport: () => set(s => { s.importedData = null; s.importMeta = null; s.scopeSelected = null }),

        setScopeSelected: (scope) => set(s => {
          s.scopeSelected = scope
          if (s.importedData) {
            const records = scope
              ? s.importedData.filter(d => scope.has(d.f_owner || 'Unknown'))
              : s.importedData
            const agg = aggregateForecast(records)
            Object.assign(s, agg); s.closed = agg.closed; s.derived = computeDerived(s)
          }
        }),

        updateInput: (key, value) => set(s => { s[key] = value; s.derived = computeDerived(s) }),
      })),
      {
        name: storeName,
        storage: createJSONStorage(() => localStorage),
        partialize: (s) => ({
          managerName: s.managerName, managerTeam: s.managerTeam, quarterLabel: s.quarterLabel,
          monthUnlocked: s.monthUnlocked, sfdcUrl: s.sfdcUrl,
          quota: s.quota, closed: s.closed,
          r_worst_case: s.r_worst_case, r_call: s.r_call, r_best_case: s.r_best_case, r_pipe: s.r_pipe, r_cnc: s.r_cnc,
          pipe_worst_case: s.pipe_worst_case, pipe_call: s.pipe_call, pipe_best_case: s.pipe_best_case, pipe_pipe: s.pipe_pipe,
          cnc_opps: s.cnc_opps, cnc_asp: s.cnc_asp,
          callIncludesBestCase: s.callIncludesBestCase,
          activeView: s.activeView, forecastDefaults: s.forecastDefaults, fyStartMonth: s.fyStartMonth,
          m1_closed: s.m1_closed, m1_worst_case: s.m1_worst_case, m1_call: s.m1_call, m1_best_case: s.m1_best_case,
          m2_closed: s.m2_closed, m2_worst_case: s.m2_worst_case, m2_call: s.m2_call, m2_best_case: s.m2_best_case,
          m3_closed: s.m3_closed, m3_worst_case: s.m3_worst_case, m3_call: s.m3_call, m3_best_case: s.m3_best_case,
          previousImportSnapshot: s.previousImportSnapshot,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            if (!state.quarterLabel) {
              const info = getFiscalQuarterInfo(qMode, state.fyStartMonth || 1)
              state.quarterLabel = info.label
            }
            state.derived = computeDerived(state)
          }
        },
      }
    )
  )
}

// ── Two independent quarter stores ─────────────────────────────
const useCqStore = makeForecastStore('moat-forecast-cq-v2', false)
const useQ1Store = makeForecastStore('moat-forecast-q1-v2', true)

// ── Quarter switcher store ─────────────────────────────────────
export const useQuarterStore = create(
  persist(
    (set) => ({
      activeQuarter: 'cq',
      setActiveQuarter: (q) => set({ activeQuarter: q }),
    }),
    { name: 'moat-active-quarter', storage: createJSONStorage(() => localStorage) }
  )
)

// ── Proxy hook — single import for all components ──────────────
export function useForecastStore(selector) {
  const aq       = useQuarterStore(s => s.activeQuarter)
  // Always call both (rules of hooks) — return active quarter's result
  const cqResult = selector ? useCqStore(selector) : useCqStore()
  const q1Result = selector ? useQ1Store(selector) : useQ1Store()
  return aq === 'q1' ? q1Result : cqResult
}

// Static getState for non-hook contexts (store actions, run callbacks)
useForecastStore.getState = () => {
  const aq = useQuarterStore.getState().activeQuarter
  return aq === 'q1' ? useQ1Store.getState() : useCqStore.getState()
}

// subscribe — fires with active quarter's state when either store changes
useForecastStore.subscribe = (listener) => {
  const unsubCq = useCqStore.subscribe((state) => {
    if (useQuarterStore.getState().activeQuarter !== 'q1') listener(state)
  })
  const unsubQ1 = useQ1Store.subscribe((state) => {
    if (useQuarterStore.getState().activeQuarter === 'q1') listener(state)
  })
  return () => { unsubCq(); unsubQ1() }
}

// ── Inspector store ─────────────────────────────────────────────
export const useInspectorStore = create(
  persist(
    immer((set) => ({
      apiKey: '',
      systemPrompt: '',
      coachingFocus: '',
      aiEnabled:   false,
      defaultSfdcUrl: '',
      setDefaultSfdcUrl: (url) => set(s => { s.defaultSfdcUrl = url }),
      groupBy:     'category',
      sortBy:      'severity',
      flaggedOnly: false,
      isRunning: false,
      abortController: null,
      repResults: {},
      lastResult: null,
      activeTab: 'reps',
      usageLog: [],

      initApiKey: (userId) => {
        const lsKey = userId ? `moat_apikey_${userId}` : 'moat_apikey'
        const key   = localStorage.getItem(lsKey) || ''
        set(s => { s.apiKey = key; if (key && !s.aiEnabled) s.aiEnabled = true })
      },

      setApiKey: (key, userId) => {
        const lsKey = userId ? `moat_apikey_${userId}` : 'moat_apikey'
        if (key) localStorage.setItem(lsKey, key)
        else     localStorage.removeItem(lsKey)
        set(s => { s.apiKey = key })
      },

      setSystemPrompt:  (p)   => set(s => { s.systemPrompt  = p }),
      setCoachingFocus: (f)   => set(s => { s.coachingFocus = f }),
      setActiveTab:     (tab) => set(s => { s.activeTab     = tab }),
      setAiEnabled:     (v)   => set(s => { s.aiEnabled     = v }),
      setGroupBy:       (v)   => set(s => { s.groupBy       = v }),
      setSortBy:        (v)   => set(s => { s.sortBy        = v }),
      setFlaggedOnly:   (v)   => set(s => { s.flaggedOnly   = v }),

      startRun: (abortController) => set(s => {
        s.isRunning = true; s.abortController = abortController; s.repResults = {}
      }),
      setRepLoading: (owner) => set(s => {
        s.repResults[owner] = { loading: true, summary: null, actions: {}, aiFlags: {}, error: null }
      }),
      setRepResult: (owner, result) => set(s => {
        s.repResults[owner] = { loading: false, summary: result.summary, actions: result.actions || {}, aiFlags: result.aiFlags || {}, error: null }
      }),
      setRepError: (owner, error) => set(s => {
        s.repResults[owner] = { loading: false, summary: null, actions: {}, aiFlags: {}, error }
      }),
      finishRun: (lastResult) => set(s => {
        s.isRunning = false; s.abortController = null; s.lastResult = lastResult
      }),
      stopRun: () => set(s => {
        if (s.abortController) s.abortController.abort()
        s.isRunning = false; s.abortController = null
      }),
      logUsage: (inputTokens, outputTokens, repCount, oppCount) => set(s => {
        const cutoff = Date.now() - 90 * 24 * 3600 * 1000
        s.usageLog = [
          ...s.usageLog.filter(r => r.ts > cutoff),
          { ts: Date.now(), input: inputTokens, output: outputTokens, reps: repCount, opps: oppCount },
        ]
      }),
      clearUsageLog: () => set(s => { s.usageLog = [] }),
    })),
    {
      name: 'moat-inspector-v27',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        systemPrompt: s.systemPrompt, coachingFocus: s.coachingFocus,
        usageLog: s.usageLog, aiEnabled: s.aiEnabled,
        defaultSfdcUrl: s.defaultSfdcUrl,
        groupBy: s.groupBy, sortBy: s.sortBy,
        repResults: s.repResults, lastResult: s.lastResult,
      }),
    }
  )
)

// ── Section comments store ──────────────────────────────────────
export const useSectionComments = create(
  persist(
    (set) => ({
      comments: {},
      setComment: (key, value) => set(s => ({ comments: { ...s.comments, [key]: value } })),
      clearComment: (key) => set(s => {
        const next = { ...s.comments }; delete next[key]; return { comments: next }
      }),
    }),
    { name: 'moat-section-comments-v27', storage: createJSONStorage(() => localStorage) }
  )
)

// ── Deal-Backing store (quarter-scoped positions) ───────────────
export const useDealBackStore = create(
  persist(
    immer((set) => ({
      positions_cq:     {},
      positions_q1:     {},
      cncOverrides_cq:  { opps: null, asp: null, rate: null },
      cncOverrides_q1:  { opps: null, asp: null, rate: null },

      reset: () => set(s => {
        const aq = useQuarterStore.getState().activeQuarter
        s[`positions_${aq}`]    = {}
        s[`cncOverrides_${aq}`] = { opps: null, asp: null, rate: null }
      }),
      move: (id, col) => set(s => {
        const aq = useQuarterStore.getState().activeQuarter
        s[`positions_${aq}`][id] = col
      }),
      setCncOverride: (key, value) => set(s => {
        const aq = useQuarterStore.getState().activeQuarter
        s[`cncOverrides_${aq}`][key] = value
      }),
      clearCncOverrides: () => set(s => {
        const aq = useQuarterStore.getState().activeQuarter
        s[`cncOverrides_${aq}`] = { opps: null, asp: null, rate: null }
      }),
    })),
    {
      name: 'moat-deal-back-v27',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        positions_cq: s.positions_cq, positions_q1: s.positions_q1,
        cncOverrides_cq: s.cncOverrides_cq, cncOverrides_q1: s.cncOverrides_q1,
      }),
    }
  )
)

// ── Week-over-Week tracker store ────────────────────────────────
export const useWowStore = create(
  persist(
    immer((set) => ({
      snapshots: [],              // each has quarterKey: 'cq'|'q1'
      actualClosedAtQuarterEnd: { cq: null, q1: null },

      takeSnapshot: (isAuto = false) => set(s => {
        const aq  = useQuarterStore.getState().activeQuarter
        const fs  = useForecastStore.getState()
        const d   = fs.derived || {}
        const now = new Date()
        const qInfo      = getFiscalQuarterInfo('current', fs.fyStartMonth || 1)
        const qStartDate = new Date(qInfo.qStartYear, qInfo.qStartMonth - 1, 1)
        const weekInQ    = Math.floor((now - qStartDate) / (7 * 86400000)) + 1
        s.snapshots.push({
          id: Date.now().toString(),
          week: weekInQ,
          date: now.toISOString(),
          isAuto,
          quarterKey:    aq,
          quarterLabel:  fs.quarterLabel || '',
          fc_worst_case: d.fc_worst_case || 0,
          fc_call:       d.fc_call       || 0,
          fc_best_case:  d.fc_best_case  || 0,
          pipeline: (fs.pipe_worst_case || 0) + (fs.pipe_call || 0) + (fs.pipe_best_case || 0) + (fs.pipe_pipe || 0),
          closed: fs.closed || 0,
          monthly: {
            m1: { closed: fs.m1_closed || 0, worst_case: fs.m1_worst_case || 0, call: fs.m1_call || 0, best_case: fs.m1_best_case || 0 },
            m2: { closed: fs.m2_closed || 0, worst_case: fs.m2_worst_case || 0, call: fs.m2_call || 0, best_case: fs.m2_best_case || 0 },
            m3: { closed: fs.m3_closed || 0, worst_case: fs.m3_worst_case || 0, call: fs.m3_call || 0, best_case: fs.m3_best_case || 0 },
          },
        })
      }),

      deleteSnapshot: (id) => set(s => { s.snapshots = s.snapshots.filter(snap => snap.id !== id) }),

      setActualClosed: (amount) => set(s => {
        const aq = useQuarterStore.getState().activeQuarter
        // Migrate scalar → object if needed
        if (!s.actualClosedAtQuarterEnd || typeof s.actualClosedAtQuarterEnd !== 'object') {
          s.actualClosedAtQuarterEnd = { cq: null, q1: null }
        }
        s.actualClosedAtQuarterEnd[aq] = amount
      }),

      clearSnapshots: () => set(s => {
        const aq = useQuarterStore.getState().activeQuarter
        s.snapshots = s.snapshots.filter(snap => (snap.quarterKey ?? 'cq') !== aq)
        if (!s.actualClosedAtQuarterEnd || typeof s.actualClosedAtQuarterEnd !== 'object') {
          s.actualClosedAtQuarterEnd = { cq: null, q1: null }
        }
        s.actualClosedAtQuarterEnd[aq] = null
      }),
    })),
    {
      name: 'moat-wow-v27',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        snapshots: s.snapshots,
        actualClosedAtQuarterEnd: s.actualClosedAtQuarterEnd,
      }),
    }
  )
)
