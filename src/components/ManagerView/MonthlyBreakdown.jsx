import React, { useMemo } from 'react'
import { useForecastStore, useWowStore, useQuarterStore } from '../../store/forecastStore'
import { calcMonthlyBreakdown } from '../../lib/import'
import { fmt } from '../../lib/fmt'

function fmtDelta(curr, prior) {
  if (prior == null || curr == null) return '—'
  const delta = curr - prior
  if (Math.abs(delta) < 1) return '—'
  const abs = Math.abs(delta)
  const sign = delta > 0 ? '+' : '−'
  const k = Math.round(abs / 1000)
  return `${sign}$${k}k`
}

// Pipeline columns — from import data
const PIPE_COLS = [
  { key: 'closed',     label: 'Closed',    color: '#0d7c3d', showCount: true },
  { key: 'worst_case', label: 'Worst',     color: '#1a56db', showCount: true },
  { key: 'call',       label: 'Forecast',  color: '#0d7c3d', showCount: true },
  { key: 'best_case',  label: 'Best Case', color: '#b45309', showCount: true },
  { key: 'pipeline',   label: 'Pipeline',  color: '#6b7280', showCount: true },
]

// Forecast columns — derived from rates + C&C
const FC_COLS = [
  { key: 'fc_wc',   label: 'WC FC', color: '#1a56db' },
  { key: 'fc_call', label: 'FC',    color: '#0d7c3d' },
  { key: 'fc_bc',   label: 'BC FC', color: '#b45309' },
]

export default function MonthlyBreakdown() {
  const importedData         = useForecastStore(s => s.importedData)
  const scopeSelected        = useForecastStore(s => s.scopeSelected)
  const r_wc                 = useForecastStore(s => s.r_worst_case)
  const r_call               = useForecastStore(s => s.r_call)
  const r_bc                 = useForecastStore(s => s.r_best_case)
  const callIncludesBestCase = useForecastStore(s => s.callIncludesBestCase)
  const derived              = useForecastStore(s => s.derived)
  const fyStart              = useForecastStore(s => s.fyStartMonth) || 1
  const aq                   = useQuarterStore(s => s.activeQuarter)
  const wow                  = useWowStore()

  const isNextQuarter = aq === 'q1'
  const isFiltered    = scopeSelected?.size > 0

  // Scope data to selected AEs when filter is active
  const scopedData = useMemo(() => {
    if (!importedData?.length) return importedData
    if (!isFiltered) return importedData
    return importedData.filter(d => scopeSelected.has(d.f_owner))
  }, [importedData, scopeSelected, isFiltered])

  // Prorate C&C by the selected AEs' share of total active deals (matches calcRepForecast)
  const cnc_prorated = useMemo(() => {
    const base = derived?.cnc_prorated || 0
    if (!isFiltered || !importedData?.length) return base
    const totalActive    = importedData.filter(d => !['closed','omitted'].includes(d.f_fc_cat_norm)).length
    const selectedActive = (scopedData || []).filter(d => !['closed','omitted'].includes(d.f_fc_cat_norm)).length
    const aeShare = totalActive > 0 ? selectedActive / totalActive : 0
    return base * aeShare
  }, [derived, isFiltered, importedData, scopedData])

  const breakdown = useMemo(
    () => calcMonthlyBreakdown(scopedData, fyStart, isNextQuarter),
    [scopedData, fyStart, isNextQuarter]
  )

  // Per-month FC calculation
  // C&C is split equally only among future months (not current, not past)
  const monthlyFC = useMemo(() => {
    if (!breakdown) return null
    const futureCount = breakdown.filter(m => !m.isPast && !m.isCurrent).length
    const cncPerFuture = futureCount > 0 ? cnc_prorated / futureCount : 0

    return breakdown.map(m => {
      const isFuture = !m.isPast && !m.isCurrent
      const m_cnc    = isFuture ? cncPerFuture : 0

      const bk_wc   = m.worst_case * (r_wc   / 100)
      const bk_call = m.call       * (r_call  / 100)
      const bk_bc   = m.best_case  * (r_bc    / 100)
      const bk_bc_in_call = callIncludesBestCase ? bk_bc * 0.5 : 0

      const fc_wc   = m.closed + m_cnc + bk_wc
      const fc_call = fc_wc + bk_call + bk_bc_in_call
      const fc_bc   = fc_call + (bk_bc - bk_bc_in_call)

      return { fc_wc, fc_call, fc_bc, m_cnc }
    })
  }, [breakdown, cnc_prorated, r_wc, r_call, r_bc, callIncludesBestCase])

  // WoW variance — only for pipeline cols, only if prior snapshot has array monthly
  const wowSnapshots = useMemo(
    () => [...wow.snapshots]
      .filter(s => (s.quarterKey ?? 'cq') === aq)
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [wow.snapshots, aq]
  )
  const priorMonthly = wowSnapshots.length >= 2 && Array.isArray(wowSnapshots[1]?.monthly)
    ? wowSnapshots[1].monthly
    : null

  if (!importedData?.length || !breakdown || !monthlyFC) {
    return (
      <div className="card p-6 text-center text-[13px] text-[var(--tx2)]">
        Import pipeline data to see monthly breakdown by forecast category
      </div>
    )
  }

  // Quarter totals
  const pipeTotals = PIPE_COLS.reduce((acc, c) => {
    acc[c.key]           = breakdown.reduce((s, m) => s + (m[c.key] || 0), 0)
    acc[`${c.key}_count`] = breakdown.reduce((s, m) => s + (m[`${c.key}_count`] || 0), 0)
    return acc
  }, {})
  const fcTotals = FC_COLS.reduce((acc, c) => {
    acc[c.key] = monthlyFC.reduce((s, mfc) => s + (mfc[c.key] || 0), 0)
    return acc
  }, {})

  return (
    <div className="card overflow-hidden">
      <div className="text-[11px] text-[var(--tx2)] px-4 pt-3 pb-1">
        Based on deal close dates from imported pipeline · deals outside this quarter excluded
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--bdr2)] bg-[var(--bg2)]">
              <th className="px-3 py-2 text-left text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] whitespace-nowrap">
                Month
              </th>
              {/* Pipeline column group */}
              {PIPE_COLS.map(c => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-right text-[10px] font-[700] uppercase tracking-wider whitespace-nowrap"
                  style={{ color: c.color }}
                >
                  {c.label}
                </th>
              ))}
              {/* Divider */}
              <th className="w-px bg-[var(--bdr2)]" />
              {/* FC column group */}
              {FC_COLS.map(c => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-right text-[10px] font-[700] uppercase tracking-wider whitespace-nowrap"
                  style={{ color: c.color }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakdown.map((m, mi) => {
              const mfc = monthlyFC[mi]
              return (
                <tr
                  key={mi}
                  className="border-b border-[var(--bdr2)]"
                  style={mi % 2 === 1 ? { background: 'var(--bg2)' } : undefined}
                >
                  {/* Month cell */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-[700] text-[var(--tx)]">{m.label}</span>
                      {m.isCurrent && (
                        <span className="text-[8px] font-[700] uppercase tracking-wide bg-blue-100 text-blue-700 px-1.5 py-px rounded-full">
                          current
                        </span>
                      )}
                      {m.isPast && (
                        <span className="text-[8px] font-[700] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-px rounded-full">
                          past
                        </span>
                      )}
                    </div>
                    {/* C&C footnote for future months */}
                    {mfc.m_cnc > 0 && (
                      <div className="text-[9px] text-[var(--tx2)] mt-0.5">
                        +{fmt(mfc.m_cnc)} C&amp;C
                      </div>
                    )}
                  </td>

                  {/* Pipeline cells */}
                  {PIPE_COLS.map(c => {
                    const amt   = m[c.key] || 0
                    const count = m[`${c.key}_count`] || 0
                    return (
                      <td key={c.key} className="px-3 py-2.5 text-right">
                        <div className="font-[600]" style={{ color: c.color }}>
                          {amt > 0 ? fmt(amt) : '—'}
                        </div>
                        {c.showCount && count > 0 && (
                          <div className="text-[9px] text-[var(--tx2)]">{count}d</div>
                        )}
                      </td>
                    )
                  })}

                  {/* Group divider */}
                  <td className="w-px bg-[var(--bdr2)] p-0" />

                  {/* FC cells */}
                  {FC_COLS.map(c => {
                    const amt = mfc[c.key] || 0
                    return (
                      <td key={c.key} className="px-3 py-2.5 text-right">
                        <div className="font-[700]" style={{ color: c.color }}>
                          {amt > 0 ? fmt(amt) : '—'}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {/* Quarter totals row */}
            <tr className="border-t-2 border-[var(--bdr2)]" style={{ background: 'var(--bg2)' }}>
              <td className="px-3 py-2.5 text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] whitespace-nowrap">
                Quarter
              </td>
              {PIPE_COLS.map(c => {
                const amt   = pipeTotals[c.key] || 0
                const count = pipeTotals[`${c.key}_count`] || 0
                return (
                  <td key={c.key} className="px-3 py-2.5 text-right">
                    <div className="font-[700]" style={{ color: c.color }}>
                      {amt > 0 ? fmt(amt) : '—'}
                    </div>
                    {c.showCount && count > 0 && (
                      <div className="text-[9px] text-[var(--tx2)]">{count}d</div>
                    )}
                  </td>
                )
              })}
              <td className="w-px bg-[var(--bdr2)] p-0" />
              {FC_COLS.map(c => (
                <td key={c.key} className="px-3 py-2.5 text-right">
                  <div className="font-[700]" style={{ color: c.color }}>
                    {(fcTotals[c.key] || 0) > 0 ? fmt(fcTotals[c.key]) : '—'}
                  </div>
                </td>
              ))}
            </tr>

            {/* Variance row — pipeline cols only; FC cols show — */}
            {priorMonthly && (
              <tr className="border-t border-[var(--bdr2)]">
                <td className="px-3 py-2 text-[9px] font-[700] uppercase tracking-wider text-[var(--tx2)] whitespace-nowrap">
                  vs prior snap
                </td>
                {PIPE_COLS.map(c => {
                  return (
                    <td key={c.key} className="px-3 py-2 text-right">
                      {breakdown.map((m, mi) => {
                        const curr  = m[c.key] || 0
                        const prior = priorMonthly[mi]?.[c.key] ?? null
                        const str   = fmtDelta(curr, prior)
                        if (str === '—') return <div key={mi} className="text-[9px] text-[var(--tx2)]">—</div>
                        const isPos = str.startsWith('+')
                        return (
                          <div key={mi} className="text-[9px] font-[600]" style={{ color: isPos ? '#059669' : '#dc2626' }}>
                            {str}
                          </div>
                        )
                      })}
                    </td>
                  )
                })}
                <td className="w-px bg-[var(--bdr2)] p-0" />
                {FC_COLS.map(c => (
                  <td key={c.key} className="px-3 py-2 text-right text-[9px] text-[var(--tx2)]">—</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
