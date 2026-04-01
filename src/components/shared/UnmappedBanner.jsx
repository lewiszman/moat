import React, { useState } from 'react'
import { useForecastStore } from '../../store/forecastStore'

const SESSION_KEY = 'moat-unmapped-dismissed'

export default function UnmappedBanner() {
  const importedData  = useForecastStore(s => s.importedData)
  const setActiveView = useForecastStore(s => s.setActiveView)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')

  if (dismissed) return null
  const count = importedData?.filter(r => r._unmapped).length || 0
  if (!count) return null

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-[12px]">
      <span className="text-amber-800 flex-1">
        ⚠️ <strong>{count}</strong> deal{count !== 1 ? 's' : ''} {count !== 1 ? 'have' : 'has'} unrecognized
        forecast categories and defaulted to Pipeline. Update your category mapping in
        Settings → General or re-import with corrected mappings.
      </span>
      <button
        onClick={() => setActiveView('settings')}
        className="text-[11px] font-[600] text-amber-800 border border-amber-300 rounded px-2 py-1 hover:bg-amber-100 whitespace-nowrap bg-transparent cursor-pointer"
      >
        Open Settings
      </button>
      <button
        onClick={handleDismiss}
        className="text-amber-500 hover:text-amber-800 border-none bg-transparent cursor-pointer text-[15px] leading-none p-0"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
