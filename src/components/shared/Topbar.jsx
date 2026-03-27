import React from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { useDarkMode } from '../../hooks/useDarkMode'

const VIEW_LABELS = {
  manager: 'Manager View',
  inspector: 'Pipeline Inspector',
  dealback: 'Deal-Backing',
  settings: 'Settings',
}

export default function Topbar() {
  const activeView = useForecastStore(s => s.activeView)
  const importMeta = useForecastStore(s => s.importMeta)
  const [dark, setDark] = useDarkMode()

  return (
    <header className="flex items-center h-11 px-4 border-b border-[var(--bdr2)] bg-[var(--bg)] flex-shrink-0 gap-3">
      <span className="text-[12px] font-[700] tracking-widest text-[var(--coral)] uppercase">
        MOAT
      </span>
      <span className="text-[var(--tx2)] text-[11px]">·</span>
      <span className="text-[13px] font-[600] text-[var(--tx)]">
        {VIEW_LABELS[activeView] || activeView}
      </span>

      {/* Import status */}
      <div className="flex items-center gap-1.5 ml-1">
        <span
          className={`
            w-2 h-2 rounded-full flex-shrink-0
            ${importMeta ? 'bg-[var(--green)]' : 'bg-[var(--bg3)]'}
          `}
        />
        <span className="text-[11px] text-[var(--tx2)]">
          {importMeta
            ? `${importMeta.count} deals · ${importMeta.filename}`
            : 'No data'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => setDark(!dark)}
          className="btn text-[11px]"
        >
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </header>
  )
}
