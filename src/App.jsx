import React, { useEffect } from 'react'
import { useForecastStore } from './store/forecastStore'
import { useDarkMode } from './hooks/useDarkMode'
import { getFiscalQuarterInfo } from './lib/fmt'
import Sidebar from './components/shared/Sidebar'
import Topbar from './components/shared/Topbar'
import ManagerView from './components/ManagerView/ManagerView'
import Inspector from './components/Inspector/Inspector'
import DealBacking from './components/DealBacking/DealBacking'
import Settings from './components/Settings/Settings'

const VIEWS = ['manager', 'inspector', 'dealback', 'settings']

export default function App() {
  const activeView = useForecastStore(s => s.activeView)
  const quarterLabel = useForecastStore(s => s.quarterLabel)
  const setFields = useForecastStore(s => s.setFields)
  const recalc = useForecastStore(s => s.recalc)
  const [dark] = useDarkMode()

  // On mount: auto-fill quarter label if blank, run initial recalc
  useEffect(() => {
    if (!quarterLabel) {
      const info = getFiscalQuarterInfo('current', 1)
      setFields({ quarterLabel: info.label })
    }
    recalc()
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
          {activeView === 'settings'  && <Settings />}
        </main>
      </div>
    </div>
  )
}
