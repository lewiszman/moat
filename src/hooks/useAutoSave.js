import { useEffect, useRef } from 'react'
import { useForecastStore, useWowStore, useDealBackStore, useSectionComments } from '../store/forecastStore'
import { useSessionStore } from '../store/sessionStore'
import { autoSaveSession } from '../lib/supabase'
import { buildSnapshot } from '../lib/snapshot'

const DEBOUNCE_MS = 3000

// Subscribes to all persistent stores and auto-saves a full snapshot to Supabase
// when the user is signed in. Debounced to avoid excessive writes.
export function useAutoSave() {
  const user     = useSessionStore(s => s.user)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!user) return

    const debouncedSave = () => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const snapshot     = buildSnapshot()
        const quarterLabel = useForecastStore.getState().quarterLabel || 'Unknown'
        autoSaveSession(user.id, quarterLabel, snapshot)
          .then(() => useSessionStore.getState().loadSessions())
      }, DEBOUNCE_MS)
    }

    const unsubFc  = useForecastStore.subscribe(debouncedSave)
    const unsubWow = useWowStore.subscribe(debouncedSave)
    const unsubDb  = useDealBackStore.subscribe(debouncedSave)
    const unsubSc  = useSectionComments.subscribe(debouncedSave)

    return () => {
      unsubFc(); unsubWow(); unsubDb(); unsubSc()
      clearTimeout(timerRef.current)
    }
  }, [user])
}
