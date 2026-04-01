import { create } from 'zustand'
import { listSessions, saveNamedSession, fetchSession, deleteSession, autoSaveSession } from '../lib/supabase'
import { useForecastStore } from './forecastStore'
import { buildSnapshot, applySnapshot } from '../lib/snapshot'

export const useSessionStore = create((set, get) => ({
  user: null,          // Supabase User object or null
  sessions: [],        // list of session metadata rows
  loadingSessions: false,
  saving: false,
  saveError: null,

  // Called by App.jsx auth listener
  setUser: (user) => {
    set({ user })
    if (user) {
      get().loadSessions()
    } else {
      set({ sessions: [] })
    }
  },

  // Refresh the session list from Supabase
  loadSessions: async () => {
    const { user } = get()
    if (!user) return
    set({ loadingSessions: true })
    const { data, error } = await listSessions(user.id)
    set({ sessions: error ? [] : data, loadingSessions: false })
  },

  // Explicit named snapshot — prompts caller for label
  saveSnapshot: async (label) => {
    const { user } = get()
    if (!user) return
    set({ saving: true, saveError: null })
    const snapshot     = buildSnapshot()
    const quarterLabel = useForecastStore.getState().quarterLabel || 'Unknown'
    const { error } = await saveNamedSession(user.id, quarterLabel, snapshot, label)
    if (error) {
      set({ saving: false, saveError: error.message })
    } else {
      set({ saving: false })
      get().loadSessions()
    }
  },

  // Restore a specific session: fetch snapshot and apply to all stores
  restoreSession: async (sessionId) => {
    const { user } = get()
    const { data, error } = await fetchSession(sessionId, user?.id)
    if (error || !data?.snapshot) return
    applySnapshot(data.snapshot)
  },

  // Restore the most recent auto-save on initial sign-in
  restoreLatest: async (user) => {
    if (!user) return
    const { data } = await listSessions(user.id, 1)
    if (!data?.length) return
    const { data: full, error } = await fetchSession(data[0].id, user.id)
    if (error || !full?.snapshot) return
    applySnapshot(full.snapshot)
  },

  // Delete a session and refresh list
  deleteSession: async (sessionId) => {
    const { user } = get()
    if (!user) return
    await deleteSession(sessionId, user.id)
    get().loadSessions()
  },
}))
