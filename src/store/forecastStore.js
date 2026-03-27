import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { calcForecast } from '../lib/forecast'
import { aggregateForecast, calcMonthlyClosedBreakdown, normalizeRecords } from '../lib/import'

// ── Default values ─────────────────────────────────────────────
const DEFAULT_RATES = {
  r_commit: 80, r_prob: 75, r_up: 50, r_pipe: 18, r_cnc: 18,
}
const DEFAULT_PIPELINE = {
  pipe_commit: 0, pipe_prob: 0, pipe_up: 0, pipe_pipe: 0,
}
const DEFAULT_CNC = { cnc_opps: 5, cnc_asp: 14000 }
const DEFAULT_MONTHLY = {
  m1_closed: 0, m1_commit: 0, m1_prob: 0, m1_up: 0,
  m2_closed: 0, m2_commit: 0, m2_prob: 0, m2_up: 0,
  m3_closed: 0, m3_commit: 0, m3_prob: 0, m3_up: 0,
}

// Fields that are isolated per qMode (snapshot/restore on switch)
const ISOLATED_FIELDS = [
  'quota', 'closed', 'probIncludesUpside',
  'r_commit', 'r_prob', 'r_up', 'r_pipe', 'r_cnc',
  'pipe_commit', 'pipe_prob', 'pipe_up', 'pipe_pipe',
  'cnc_opps', 'cnc_asp',
  'm1_closed', 'm1_commit', 'm1_prob', 'm1_up',
  'm2_closed', 'm2_commit', 'm2_prob', 'm2_up',
  'm3_closed', 'm3_commit', 'm3_prob', 'm3_up',
]

const DEFAULT_ISOLATED = {
  quota: 0, closed: 0, probIncludesUpside: false,
  ...DEFAULT_RATES, ...DEFAULT_PIPELINE, ...DEFAULT_CNC, ...DEFAULT_MONTHLY,
}

function computeDerived(s) {
  const bk_c  = s.pipe_commit * (s.r_commit / 100)
  const bk_p  = s.pipe_prob   * (s.r_prob   / 100)
  const bk_u  = s.pipe_up     * (s.r_up     / 100)
  const bk_pp = s.pipe_pipe   * (s.r_pipe   / 100)
  const cnc_pipe = s.cnc_opps * s.cnc_asp
  const cnc_rev  = cnc_pipe   * (s.r_cnc    / 100)
  const { fc_commit, fc_prob, fc_up, fc_full, bk_u_in_prob } = calcForecast({
    closed: s.closed, bk_c, bk_p, bk_u, bk_pp, cnc_rev,
    probIncludesUpside: s.probIncludesUpside,
  })
  return { bk_c, bk_p, bk_u, bk_pp, cnc_pipe, cnc_rev, fc_commit, fc_prob, fc_up, fc_full, bk_u_in_prob }
}

// ── Store ──────────────────────────────────────────────────────
export const useForecastStore = create(
  persist(
    immer((set, get) => ({
      // Identity
      managerName: '',
      managerTeam: '',
      quarterLabel: '',

      // Quarter mode
      qMode: 'current', // 'current' | 'next'

      // Per-mode isolated state snapshots
      stateByMode: { current: null, next: null },

      // Monthly unlock overrides (true = manually unlocked past month)
      monthUnlocked: { m1: false, m2: false, m3: false },

      // Core inputs
      quota: 0,
      closed: 0,
      ...DEFAULT_RATES,
      ...DEFAULT_PIPELINE,
      ...DEFAULT_CNC,
      ...DEFAULT_MONTHLY,

      // Toggles
      probIncludesUpside: false,

      // Derived (computed, not persisted separately)
      derived: {},

      // Import
      importedData: null,   // normalized deal records
      importMeta: null,     // { filename, count, date }
      scopeSelected: null,  // null = all, Set of owner names

      // Active view
      activeView: 'manager',

      // Forecast defaults (persisted, used in Settings → Defaults tab)
      forecastDefaults: {
        r_commit: 80, r_prob: 75, r_up: 50, r_pipe: 18, r_cnc: 18,
        cnc_opps: 5, cnc_asp: 14000,
      },

      // Fiscal year start month (1 = Jan, used in quarter status bar)
      fyStartMonth: 1,

      // ── Actions ──
      setField: (key, value) => set(s => { s[key] = value }),

      setFields: (fields) => set(s => { Object.assign(s, fields) }),

      recalc: () => set(s => { s.derived = computeDerived(s) }),

      toggleProbUpside: () => set(s => {
        s.probIncludesUpside = !s.probIncludesUpside
        s.derived = computeDerived(s)
      }),

      // ── CQ / Q+1 isolated state ──
      setQMode: (mode) => set(s => {
        if (mode === s.qMode) return
        // Snapshot current mode's inputs
        const snap = {}
        ISOLATED_FIELDS.forEach(k => { snap[k] = s[k] })
        s.stateByMode[s.qMode] = snap
        // Restore target mode (or defaults if never visited)
        const restore = s.stateByMode[mode]
        if (restore) {
          ISOLATED_FIELDS.forEach(k => { s[k] = restore[k] })
        } else {
          ISOLATED_FIELDS.forEach(k => { s[k] = DEFAULT_ISOLATED[k] })
        }
        s.qMode = mode
        s.derived = computeDerived(s)
        s.monthUnlocked = { m1: false, m2: false, m3: false }
      }),

      setActiveView: (view) => set(s => { s.activeView = view }),

      // ── Monthly breakdown ──
      toggleMonthLock: (month) => set(s => {
        s.monthUnlocked[month] = !s.monthUnlocked[month]
      }),

      // ── Forecast defaults ──
      setForecastDefault: (key, value) => set(s => {
        s.forecastDefaults[key] = value
      }),

      applyForecastDefaults: () => set(s => {
        const d = s.forecastDefaults
        s.r_commit  = d.r_commit
        s.r_prob    = d.r_prob
        s.r_up      = d.r_up
        s.r_pipe    = d.r_pipe
        s.r_cnc     = d.r_cnc
        s.cnc_opps  = d.cnc_opps
        s.cnc_asp   = d.cnc_asp
        s.derived   = computeDerived(s)
      }),

      // ── Share URL ──
      loadShareState: (fields) => set(s => {
        Object.assign(s, fields)
        s.derived = computeDerived(s)
      }),

      // ── Supabase session restore ──
      loadSnapshot: (snapshot) => set(s => {
        Object.assign(s, snapshot)
        s.derived = computeDerived(s)
      }),

      // Import
      setImportData: (records, meta) => set(s => {
        s.importedData = records
        s.importMeta = meta
        s.scopeSelected = null
        const agg = aggregateForecast(records)
        const monthly = calcMonthlyClosedBreakdown(records)
        Object.assign(s, agg)
        s.m1_closed = monthly[0] || 0
        s.m2_closed = monthly[1] || 0
        s.m3_closed = monthly[2] || 0
        s.closed = agg.closed
        s.derived = computeDerived(s)
      }),

      clearImport: () => set(s => {
        s.importedData = null
        s.importMeta = null
        s.scopeSelected = null
      }),

      setScopeSelected: (scope) => set(s => {
        s.scopeSelected = scope
        if (s.importedData) {
          const records = scope
            ? s.importedData.filter(d => scope.has(d.f_owner || 'Unknown'))
            : s.importedData
          const agg = aggregateForecast(records)
          Object.assign(s, agg)
          s.closed = agg.closed
          s.derived = computeDerived(s)
        }
      }),

      // Input change → recalc
      updateInput: (key, value) => set(s => {
        s[key] = value
        s.derived = computeDerived(s)
      }),
    })),
    {
      name: 'moat-forecast-v27',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        managerName: s.managerName,
        managerTeam: s.managerTeam,
        quarterLabel: s.quarterLabel,
        qMode: s.qMode,
        stateByMode: s.stateByMode,
        monthUnlocked: s.monthUnlocked,
        quota: s.quota,
        closed: s.closed,
        r_commit: s.r_commit, r_prob: s.r_prob, r_up: s.r_up,
        r_pipe: s.r_pipe,     r_cnc: s.r_cnc,
        pipe_commit: s.pipe_commit, pipe_prob: s.pipe_prob,
        pipe_up: s.pipe_up,   pipe_pipe: s.pipe_pipe,
        cnc_opps: s.cnc_opps, cnc_asp: s.cnc_asp,
        probIncludesUpside: s.probIncludesUpside,
        activeView: s.activeView,
        forecastDefaults: s.forecastDefaults,
        fyStartMonth: s.fyStartMonth,
        m1_closed: s.m1_closed, m1_commit: s.m1_commit, m1_prob: s.m1_prob, m1_up: s.m1_up,
        m2_closed: s.m2_closed, m2_commit: s.m2_commit, m2_prob: s.m2_prob, m2_up: s.m2_up,
        m3_closed: s.m3_closed, m3_commit: s.m3_commit, m3_prob: s.m3_prob, m3_up: s.m3_up,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.derived = computeDerived(state)
        }
      },
    }
  )
)

// ── Inspector store (separate — not persisted except prefs) ──
export const useInspectorStore = create(
  persist(
    immer((set, get) => ({
      // API key — in-memory only; read/written to localStorage directly (user-scoped)
      apiKey: '',

      // Settings
      systemPrompt: '',
      coachingFocus: '',

      // View prefs (persisted)
      aiEnabled:   false,
      groupBy:     'category',  // 'category'|'rep'|'stage'|'none'
      sortBy:      'severity',  // 'severity'|'amount'|'closeDate'
      flaggedOnly: false,

      // Run state
      isRunning: false,
      abortController: null,
      repResults: {},        // { [owner]: { summary, actions, loading, error } }
      lastResult: null,      // { repsSorted, active, runDate }
      activeTab: 'reps',     // 'reps'|'insights'

      // Usage log
      usageLog: [],

      // ── API key (localStorage-scoped) ──
      // Read key from localStorage under user-scoped or generic key
      initApiKey: (userId) => {
        const lsKey = userId ? `moat_apikey_${userId}` : 'moat_apikey'
        const key   = localStorage.getItem(lsKey) || ''
        set(s => {
          s.apiKey   = key
          // Auto-enable AI if a key is found and aiEnabled was never explicitly set
          if (key && !s.aiEnabled) s.aiEnabled = true
        })
      },

      // Write key to localStorage and update in-memory state
      setApiKey: (key, userId) => {
        const lsKey = userId ? `moat_apikey_${userId}` : 'moat_apikey'
        if (key) {
          localStorage.setItem(lsKey, key)
        } else {
          localStorage.removeItem(lsKey)
        }
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
        s.isRunning      = true
        s.abortController = abortController
        s.repResults     = {}
      }),

      setRepLoading: (owner) => set(s => {
        s.repResults[owner] = { loading: true, summary: null, actions: {}, error: null }
      }),

      // result: { summary: string, actions: { [nameLower]: string } }
      setRepResult: (owner, result) => set(s => {
        s.repResults[owner] = { loading: false, summary: result.summary, actions: result.actions || {}, error: null }
      }),

      setRepError: (owner, error) => set(s => {
        s.repResults[owner] = { loading: false, summary: null, actions: {}, error }
      }),

      finishRun: (lastResult) => set(s => {
        s.isRunning       = false
        s.abortController = null
        s.lastResult      = lastResult
      }),

      stopRun: () => set(s => {
        if (s.abortController) s.abortController.abort()
        s.isRunning       = false
        s.abortController = null
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
      // apiKey is NOT persisted here — managed directly in localStorage with user scoping
      partialize: (s) => ({
        systemPrompt:  s.systemPrompt,
        coachingFocus: s.coachingFocus,
        usageLog:      s.usageLog,
        aiEnabled:     s.aiEnabled,
        groupBy:       s.groupBy,
        sortBy:        s.sortBy,
      }),
    }
  )
)

// ── Section comments store ──────────────────────────────────────
export const useSectionComments = create(
  persist(
    (set) => ({
      comments: {},
      setComment: (key, value) => set(s => ({
        comments: { ...s.comments, [key]: value }
      })),
      clearComment: (key) => set(s => {
        const next = { ...s.comments }
        delete next[key]
        return { comments: next }
      }),
    }),
    {
      name: 'moat-section-comments-v27',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// ── Deal-Backing store ──────────────────────────────────────────
export const useDealBackStore = create(
  immer((set) => ({
    positions: {},   // { [dealId]: 'commit' | 'probable' | 'upside' | 'bench' }
    reset: () => set(s => { s.positions = {} }),
    move: (id, col) => set(s => { s.positions[id] = col }),
  }))
)
