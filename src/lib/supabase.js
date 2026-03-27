import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Auth ────────────────────────────────────────────────────────
export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  })
}

export function signOut() {
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
    r_commit: state.r_commit, r_prob: state.r_prob,
    r_up: state.r_up,        r_pipe: state.r_pipe, r_cnc: state.r_cnc,
    pipe_commit: state.pipe_commit, pipe_prob: state.pipe_prob,
    pipe_up: state.pipe_up,  pipe_pipe: state.pipe_pipe,
    cnc_opps: state.cnc_opps, cnc_asp: state.cnc_asp,
    probIncludesUpside: state.probIncludesUpside,
    forecastDefaults: state.forecastDefaults,
    m1_closed: state.m1_closed, m1_commit: state.m1_commit,
    m1_prob: state.m1_prob,   m1_up: state.m1_up,
    m2_closed: state.m2_closed, m2_commit: state.m2_commit,
    m2_prob: state.m2_prob,   m2_up: state.m2_up,
    m3_closed: state.m3_closed, m3_commit: state.m3_commit,
    m3_prob: state.m3_prob,   m3_up: state.m3_up,
  })
}

// ── CRUD ────────────────────────────────────────────────────────

// Auto-save: upsert the single rolling auto-save per user + quarter.
// Avoids unbounded DB growth — one row per quarter gets refreshed.
export async function autoSaveSession(userId, quarterLabel, snapshot) {
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
  return supabase
    .from('sessions')
    .select('id, quarter_label, is_auto, label, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
}

// Fetch the full snapshot for a specific session (for restore)
export async function fetchSession(sessionId) {
  return supabase
    .from('sessions')
    .select('snapshot')
    .eq('id', sessionId)
    .single()
}

// Delete a session row
export async function deleteSession(sessionId) {
  return supabase.from('sessions').delete().eq('id', sessionId)
}
