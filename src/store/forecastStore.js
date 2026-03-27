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

      // ── Actions ──
      setField: (key, value) => set(s => { s[key] = value }),

      setFields: (fields) => set(s => { Object.assign(s, fields) }),

      recalc: () => set(s => { s.derived = computeDerived(s) }),

      toggleProbUpside: () => set(s => {
        s.probIncludesUpside = !s.probIncludesUpside
        s.derived = computeDerived(s)
      }),

      setQMode: (mode) => set(s => { s.qMode = mode }),

      setActiveView: (view) => set(s => { s.activeView = view }),

      // Import
      setImportData: (records, meta) => set(s => {
        s.importedData = records
        s.importMeta = meta
        s.scopeSelected = null
        // Auto-populate forecast fields
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
        quota: s.quota,
        closed: s.closed,
        r_commit: s.r_commit, r_prob: s.r_prob, r_up: s.r_up,
        r_pipe: s.r_pipe,     r_cnc: s.r_cnc,
        pipe_commit: s.pipe_commit, pipe_prob: s.pipe_prob,
        pipe_up: s.pipe_up,   pipe_pipe: s.pipe_pipe,
        cnc_opps: s.cnc_opps, cnc_asp: s.cnc_asp,
        probIncludesUpside: s.probIncludesUpside,
        activeView: s.activeView,
        ...DEFAULT_MONTHLY,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.derived = computeDerived(state)
        }
      },
    }
  )
)

// ── Inspector store (separate — not persisted except API key) ──
export const useInspectorStore = create(
  persist(
    immer((set, get) => ({
      // Settings
      apiKey: '',
      systemPrompt: '',      // empty = use DEFAULT_SYSTEM_PROMPT
      coachingFocus: '',

      // Run state
      isRunning: false,
      abortController: null,
      repResults: {},        // { [owner]: { text, loading, error } }
      lastResult: null,      // { repsSorted, active, runDate, ... }
      activeTab: 'reps',     // 'reps' | 'insights'

      // Usage log
      usageLog: [],

      setApiKey: (key) => set(s => { s.apiKey = key }),
      setSystemPrompt: (p) => set(s => { s.systemPrompt = p }),
      setCoachingFocus: (f) => set(s => { s.coachingFocus = f }),
      setActiveTab: (tab) => set(s => { s.activeTab = tab }),

      startRun: (abortController) => set(s => {
        s.isRunning = true
        s.abortController = abortController
        s.repResults = {}
      }),

      setRepLoading: (owner) => set(s => {
        s.repResults[owner] = { loading: true, text: null, error: null }
      }),

      setRepResult: (owner, text) => set(s => {
        s.repResults[owner] = { loading: false, text, error: null }
      }),

      setRepError: (owner, error) => set(s => {
        s.repResults[owner] = { loading: false, text: null, error }
      }),

      finishRun: (lastResult) => set(s => {
        s.isRunning = false
        s.abortController = null
        s.lastResult = lastResult
      }),

      stopRun: () => set(s => {
        if (s.abortController) s.abortController.abort()
        s.isRunning = false
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
      partialize: (s) => ({
        apiKey: s.apiKey,
        systemPrompt: s.systemPrompt,
        coachingFocus: s.coachingFocus,
        usageLog: s.usageLog,
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
