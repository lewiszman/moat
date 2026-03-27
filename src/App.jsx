import React, { useEffect } from 'react'
import { useForecastStore } from './store/forecastStore'
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
  const [dark] = useDarkMode()

  // Activate debounced auto-save (no-ops when not signed in)
  useAutoSave()

  // On mount: initialise Supabase auth listener + share URL + quarter label
  useEffect(() => {
    // Supabase auth — sync current session and listen for changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

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

    return () => subscription.unsubscribe()
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
