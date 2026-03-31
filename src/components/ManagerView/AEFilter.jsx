import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useForecastStore } from '../../store/forecastStore'

export default function AEFilter() {
  const importedData     = useForecastStore(s => s.importedData)
  const scopeSelected    = useForecastStore(s => s.scopeSelected)
  const setScopeSelected = useForecastStore(s => s.setScopeSelected)

  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const aeNames = useMemo(() => {
    if (!importedData?.length) return []
    return [...new Set(importedData.map(d => d.f_owner || 'Unknown'))].sort()
  }, [importedData])

  const selected      = scopeSelected // Set<string> | null
  const selectedCount = selected?.size ?? 0
  const disabled      = !importedData?.length

  const chipLabel =
    selectedCount === 0 ? 'All AEs ▾' :
    selectedCount === 1 ? `${[...selected][0]} ▾` :
    `${selectedCount} AEs ▾`

  const toggle = (name) => {
    const next = new Set(selected ?? [])
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setScopeSelected(next.size > 0 ? next : null)
  }

  const selectAll = () => setScopeSelected(new Set(aeNames))
  const clearAll  = () => { setScopeSelected(null); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        title={disabled ? 'Import pipeline data to filter by AE' : undefined}
        className={`btn text-[11px] flex items-center gap-1.5 ${
          selectedCount > 0 ? 'border-[var(--blue)] text-[var(--blue)]' : ''
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4.5" cy="3.5" r="2"/><path d="M1 11c0-2.5 1.6-3.5 3.5-3.5s3.5 1 3.5 3.5"/>
          <path d="M8.5 1.5l3 3-3 3" />
        </svg>
        {chipLabel}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--bg)] border border-[var(--bdr2)] rounded-lg shadow-lg py-1 min-w-[190px] max-h-72 overflow-y-auto">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--bdr2)]">
            <button onClick={selectAll} className="text-[11px] text-[var(--blue)] hover:underline">Select all</button>
            <span className="text-[var(--tx2)]">·</span>
            <button onClick={clearAll}  className="text-[11px] text-[var(--tx2)] hover:underline">Clear</button>
          </div>
          {aeNames.map(name => (
            <label key={name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg2)] cursor-pointer">
              <input
                type="checkbox"
                checked={selected?.has(name) ?? false}
                onChange={() => toggle(name)}
                className="accent-[var(--blue)]"
              />
              <span className="text-[12px] text-[var(--tx)]">{name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
