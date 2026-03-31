import React, { useMemo } from 'react'
import { useForecastStore, useInspectorStore } from '../../store/forecastStore'
import { calcRepForecast } from '../../lib/import'
import { getVocab } from '../../lib/vocab'
import { fmt } from '../../lib/fmt'

const TIER_COLORS = {
  worst_case: '#1a56db',
  call:       '#0d7c3d',
  best_case:  '#b45309',
}

function RepCard({ owner, importedData, storeState, lastResult, onNavigate }) {
  const v = getVocab()

  const repCalc = useMemo(
    () => calcRepForecast(owner, importedData, storeState),
    [owner, importedData, storeState]
  )

  // Derive flag counts from inspector lastResult.active
  const repDeals   = lastResult?.active?.filter(d => d._owner === owner) ?? []
  const hasInspected = repDeals.length > 0
  const allFlags   = repDeals.flatMap(d => d._flags || [])
  const critCount  = allFlags.filter(f => f.sev === 'critical').length
  const warnCount  = allFlags.filter(f => f.sev === 'warn').length

  const tiers = [
    { key: 'worst_case', label: v.worst_case, fc: repCalc.fc_worst_case, pipe: repCalc.pipe_wc,   bk: repCalc.bk_wc   },
    { key: 'call',       label: v.call,       fc: repCalc.fc_call,       pipe: repCalc.pipe_call, bk: repCalc.bk_call },
    { key: 'best_case',  label: v.best_case,  fc: repCalc.fc_best_case,  pipe: repCalc.pipe_bc,   bk: repCalc.bk_bc   },
  ]

  if (repCalc.dealCount === 0 && repCalc.closed === 0) {
    return (
      <div className="card p-4 flex items-center justify-center min-h-[80px]">
        <span className="text-[12px] text-[var(--tx2)]">No import data for {owner}</span>
      </div>
    )
  }

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[13px] font-[700] text-[var(--tx)]">{owner}</span>
        <span className="badge">{fmt(repCalc.totalPipeline)} pipeline</span>
        <span className="badge">{repCalc.dealCount} deal{repCalc.dealCount !== 1 ? 's' : ''}</span>
      </div>

      {/* Forecast tiers */}
      <div className="flex flex-col gap-2 mb-3">
        {tiers.map(tier => (
          <div key={tier.key} className="flex items-center gap-2">
            <span
              className="text-[10px] font-[700] uppercase tracking-wide w-20 flex-shrink-0"
              style={{ color: TIER_COLORS[tier.key] }}
            >
              {tier.label}
            </span>
            <span
              className="text-[14px] font-[700]"
              style={{ color: TIER_COLORS[tier.key] }}
            >
              {fmt(tier.fc)}
            </span>
            <span className="ml-auto text-[10px] text-[var(--tx2)] whitespace-nowrap">
              {fmt(tier.pipe)} × rate → {fmt(tier.bk)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--bdr2)] pt-2 flex flex-col gap-1.5">
        {/* Closed QTD */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--tx2)]">Closed QTD</span>
          <span className="text-[11px] font-[600] text-[var(--tx)]">{fmt(repCalc.closed)}</span>
        </div>

        {/* C&C share — informational, not included in FC arithmetic */}
        {repCalc.cnc_rep > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--tx2)]">C&amp;C (est.)</span>
            <span className="text-[11px] font-[600] text-purple-600">{fmt(repCalc.cnc_rep)}</span>
          </div>
        )}

        {/* Flag summary — only if inspector has been run for this AE */}
        {hasInspected && (critCount > 0 || warnCount > 0) ? (
          <button
            onClick={() => onNavigate(owner)}
            className="mt-1 w-full flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-md bg-[var(--bg2)] hover:bg-red-50 dark:hover:bg-red-950/20 border border-[var(--bdr2)] transition-colors text-left"
          >
            {critCount > 0 && <span className="text-red-600">🔴 {critCount} critical</span>}
            {warnCount > 0 && <span className="text-amber-600">🟡 {warnCount} warn</span>}
            <span className="ml-auto text-[var(--tx2)]">Inspector →</span>
          </button>
        ) : hasInspected ? (
          <div className="mt-1 text-[11px] text-green-600 font-[500]">✓ No flags</div>
        ) : null}
      </div>
    </div>
  )
}

export default function RepPanel({ selectedAEs, importedData }) {
  const storeState = useForecastStore(s => ({
    r_worst_case:        s.r_worst_case,
    r_call:              s.r_call,
    r_best_case:         s.r_best_case,
    r_pipe:              s.r_pipe,
    callIncludesBestCase: s.callIncludesBestCase,
    derived:             s.derived,
  }))
  const lastResult         = useInspectorStore(s => s.lastResult)
  const setPendingAEFilter = useInspectorStore(s => s.setPendingAEFilter)
  const setActiveView      = useForecastStore(s => s.setActiveView)

  const handleNavigate = (owner) => {
    setPendingAEFilter(owner)
    setActiveView('inspector')
  }

  const gridClass = selectedAEs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'

  return (
    <div className="mt-6">
      <div className="sec-hd">Rep breakdown</div>
      <div className={`grid ${gridClass} gap-4`}>
        {selectedAEs.map(owner => (
          <RepCard
            key={owner}
            owner={owner}
            importedData={importedData}
            storeState={storeState}
            lastResult={lastResult}
            onNavigate={handleNavigate}
          />
        ))}
      </div>
    </div>
  )
}
