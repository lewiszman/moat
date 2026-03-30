import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = SUPABASE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

// ── Auth ────────────────────────────────────────────────────────
export function signInWithGoogle() {
  if (!supabase) return Promise.resolve({ error: new Error('Auth not configured') })
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
  })
}

export function signOut() {
  if (!supabase) return Promise.resolve()
  return supabase.auth.signOut()
}

// ── Snapshot helpers ────────────────────────────────────────────

// Strip any field whose key looks like a credential — belt-and-suspenders safety.
// extractSnapshot already does explicit field selection, but this guards against
// accidental spread or future changes.
export function sanitizeSnapshot(obj) {
  const safe = { ...obj }
  Object.keys(safe).forEach(k => {
    if (/key|secret|token/i.test(k)) delete safe[k]
  })
  return safe
}

// Pull only the saveable keys from the forecast store state
export function extractSnapshot(state) {
  return sanitizeSnapshot({
    managerName: state.managerName,
    managerTeam: state.managerTeam,
    quarterLabel: state.quarterLabel,
    monthUnlocked: state.monthUnlocked,
    quota: state.quota,
    closed: state.closed,
    r_worst_case: state.r_worst_case, r_call: state.r_call,
    r_best_case: state.r_best_case,   r_pipe: state.r_pipe, r_cnc: state.r_cnc,
    pipe_worst_case: state.pipe_worst_case, pipe_call: state.pipe_call,
    pipe_best_case: state.pipe_best_case,   pipe_pipe: state.pipe_pipe,
    cnc_opps: state.cnc_opps, cnc_asp: state.cnc_asp,
    callIncludesBestCase: state.callIncludesBestCase,
    forecastDefaults: state.forecastDefaults,
    m1_closed: state.m1_closed, m1_worst_case: state.m1_worst_case,
    m1_call: state.m1_call,   m1_best_case: state.m1_best_case,
    m2_closed: state.m2_closed, m2_worst_case: state.m2_worst_case,
    m2_call: state.m2_call,   m2_best_case: state.m2_best_case,
    m3_closed: state.m3_closed, m3_worst_case: state.m3_worst_case,
    m3_call: state.m3_call,   m3_best_case: state.m3_best_case,
  })
}

// ── CRUD ────────────────────────────────────────────────────────

// Auto-save: upsert the single rolling auto-save per user + quarter.
// Avoids unbounded DB growth — one row per quarter gets refreshed.
export async function autoSaveSession(userId, quarterLabel, snapshot) {
  if (!supabase) return
  const safe = sanitizeSnapshot(snapshot)
  const { data: existing } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('quarter_label', quarterLabel)
    .eq('is_auto', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return supabase
      .from('sessions')
      .update({ snapshot: safe, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  }
  return supabase
    .from('sessions')
    .insert({ user_id: userId, quarter_label: quarterLabel, snapshot: safe, is_auto: true })
}

// Named snapshot: always insert a new row
export async function saveNamedSession(userId, quarterLabel, snapshot, label) {
  if (!supabase) return
  const safe = sanitizeSnapshot(snapshot)
  return supabase.from('sessions').insert({
    user_id: userId,
    quarter_label: quarterLabel,
    snapshot: safe,
    is_auto: false,
    label: label || null,
  })
}

// List the last N sessions (metadata only — no snapshot blob)
export async function listSessions(userId, limit = 20) {
  if (!supabase) return { data: [], error: null }
  return supabase
    .from('sessions')
    .select('id, quarter_label, is_auto, label, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
}

// Fetch the full snapshot for a specific session (for restore)
// userId is required as defence-in-depth alongside Supabase RLS
export async function fetchSession(sessionId, userId) {
  if (!supabase) return { data: null, error: new Error('Auth not configured') }
  let q = supabase.from('sessions').select('snapshot').eq('id', sessionId)
  if (userId) q = q.eq('user_id', userId)
  return q.single()
}

// Delete a session row
// userId is required as defence-in-depth alongside Supabase RLS
export async function deleteSession(sessionId, userId) {
  if (!supabase) return
  let q = supabase.from('sessions').delete().eq('id', sessionId)
  if (userId) q = q.eq('user_id', userId)
  return q
}
