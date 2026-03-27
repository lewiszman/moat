import { useEffect, useRef } from 'react'
import { useForecastStore } from '../store/forecastStore'
import { useSessionStore } from '../store/sessionStore'
import { autoSaveSession, extractSnapshot } from '../lib/supabase'

const DEBOUNCE_MS = 3000

// Subscribes to forecast store changes and auto-saves to Supabase
// when the user is signed in. Debounced to avoid excessive writes.
export function useAutoSave() {
  const user     = useSessionStore(s => s.user)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!user) return

    const unsub = useForecastStore.subscribe((state) => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const snapshot     = extractSnapshot(state)
        const quarterLabel = state.quarterLabel || 'Unknown'
        autoSaveSession(user.id, quarterLabel, snapshot)
          .then(() => useSessionStore.getState().loadSessions())
      }, DEBOUNCE_MS)
    })

    return () => {
      unsub()
      clearTimeout(timerRef.current)
    }
  }, [user])
}
