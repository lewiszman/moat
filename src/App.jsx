import React, { useEffect } from 'react'
import { useForecastStore, useInspectorStore, useWowStore } from './store/forecastStore'
import { useSessionStore } from './store/sessionStore'
import { useDarkMode } from './hooks/useDarkMode'
import { useAutoSave } from './hooks/useAutoSave'
import { getFiscalQuarterInfo } from './lib/fmt'
import { parseShareUrl } from './components/shared/ShareModal'
import { supabase } from './lib/supabase'
import Sidebar from './components/shared/Sidebar'
import Topbar from './components/shared/Topbar'
import ManagerView from './components/ManagerView/ManagerView'
import Inspector from './components/Inspector/Inspector'
import DealBacking from './components/DealBacking/DealBacking'
import Settings from './components/Settings/Settings'
import RepView from './components/RepView/RepView'

export default function App() {
  const activeView    = useForecastStore(s => s.activeView)
  const quarterLabel  = useForecastStore(s => s.quarterLabel)
  const setFields     = useForecastStore(s => s.setFields)
  const recalc        = useForecastStore(s => s.recalc)
  const loadShareState = useForecastStore(s => s.loadShareState)
  const setUser       = useSessionStore(s => s.setUser)
  const initApiKey    = useInspectorStore(s => s.initApiKey)
  const [dark] = useDarkMode()

  // Activate debounced auto-save (no-ops when not signed in)
  useAutoSave()

  // On mount: initialise Supabase auth listener + share URL + quarter label
  useEffect(() => {
    // Supabase auth — sync current session and listen for changes (no-op if not configured)
    let subscription = null
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const user = session?.user ?? null
        setUser(user)
        initApiKey(user?.id)
      })
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user ?? null
        // On sign-in: migrate generic moat_apikey → user-scoped key
        if (user) {
          const generic = localStorage.getItem('moat_apikey')
          if (generic) {
            localStorage.setItem(`moat_apikey_${user.id}`, generic)
            localStorage.removeItem('moat_apikey')
          }
        }
        setUser(user)
        initApiKey(user?.id)
      })
      subscription = data.subscription
    }

    // Share URL params
    const shared = parseShareUrl()
    if (shared) {
      loadShareState(shared)
      window.history.replaceState({}, '', window.location.pathname)
    } else {
      if (!quarterLabel) {
        const info = getFiscalQuarterInfo('current', 1)
        setFields({ quarterLabel: info.label })
      }
    }
    recalc()

    // Auto-snapshot on Monday if not already taken for this week-in-quarter
    const today = new Date()
    if (today.getDay() === 1) {
      const fs = useForecastStore.getState()
      const qInfo = getFiscalQuarterInfo('current', fs.fyStartMonth || 1)
      const qStartDate = new Date(qInfo.qStartYear, qInfo.qStartMonth - 1, 1)
      const weekInQ = Math.floor((today - qStartDate) / (7 * 86400000)) + 1
      const wowState = useWowStore.getState()
      const alreadySnapped = wowState.snapshots.some(
        snap => snap.isAuto && snap.week === weekInQ && snap.quarterLabel === fs.quarterLabel
      )
      if (!alreadySnapped) {
        wowState.takeSnapshot(true)
      }
    }

    return () => subscription?.unsubscribe()
  }, []) // eslint-disable-line

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg2)]">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          {activeView === 'manager'   && <ManagerView />}
          {activeView === 'inspector' && <Inspector />}
          {activeView === 'dealback'  && <DealBacking />}
          {activeView === 'repview'   && <RepView />}
          {activeView === 'settings'  && <Settings />}
        </main>
      </div>
    </div>
  )
}
