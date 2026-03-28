import React, { useState, useEffect } from 'react'
import { useWowStore, useForecastStore, useQuarterStore } from '../../store/forecastStore'
import { fmt, parseMoney } from '../../lib/fmt'

function DeltaBadge({ curr, prev }) {
  if (prev == null || curr == null) return null
  const delta = curr - prev
  if (Math.abs(delta) < 1) return <span className="text-[10px] text-[var(--tx2)]">—</span>
  const color = delta > 0 ? '#059669' : '#dc2626'
  const arrow = delta > 0 ? '↑' : '↓'
  return (
    <span style={{ color }} className="text-[10px] font-[600]">
      {arrow} {fmt(Math.abs(delta))}
    </span>
  )
}

function AccuracyBadge({ fcCommit, actual }) {
  if (!actual || !fcCommit) return null
  const p = Math.round((fcCommit / actual) * 100)
  let color = '#dc2626'
  if (p >= 90 && p <= 110) color = '#059669'
  else if ((p >= 80 && p < 90) || (p > 110 && p <= 120)) color = '#b45309'
  return (
    <span
      className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-[700]"
      style={{ background: color + '20', color }}
      title="W2/W10 forecast accuracy vs quarter-end actual"
    >
      {p}%
    </span>
  )
}

export default function WowTracker() {
  const wow = useWowStore()
  const fs  = useForecastStore()
  const aq  = useQuarterStore(s => s.activeQuarter)

  // Resolve actual closed for active quarter (supports legacy scalar + new object format)
  const resolveActual = () => {
    const raw = wow.actualClosedAtQuarterEnd
    if (raw && typeof raw === 'object') return raw[aq] ?? null
    if (typeof raw === 'number' && aq === 'cq') return raw
    return null
  }
  const actualClosed = resolveActual()

  const [actualInput, setActualInput] = useState(actualClosed != null ? String(actualClosed) : '')

  // Sync input when quarter or stored value changes
  useEffect(() => {
    const val = resolveActual()
    setActualInput(val != null ? String(val) : '')
  }, [aq, wow.actualClosedAtQuarterEnd])

  // Filter to active quarter's snapshots (no quarterKey = legacy CQ)
  const sorted = [...wow.snapshots]
    .filter(s => (s.quarterKey ?? 'cq') === aq)
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const saveActual = () => wow.setActualClosed(parseMoney(actualInput))

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--bdr2)] bg-[var(--bg2)]">
        <span className="text-[11px] font-[700] text-[var(--tx2)] uppercase tracking-wider">
          {fs.quarterLabel || 'Week-over-week'}
        </span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => wow.takeSnapshot(false)} className="btn text-[11px]">
            Take snapshot
          </button>
          {sorted.length > 0 && (
            <button onClick={wow.clearSnapshots} className="btn text-[11px] text-[var(--tx2)]">
              Clear all
            </button>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="p-8 text-center text-[var(--tx2)] text-[13px]">
          No snapshots yet. Click <strong className="text-[var(--tx)]">Take snapshot</strong> to record the current forecast.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--bdr2)] bg-[var(--bg2)]">
                  {['Week', 'Date', 'Commit FC', 'Probable FC', 'Upside FC', 'Pipeline', 'Closed QTD', ''].map((h, i) => (
                    <th key={i} className={`px-3 py-2 text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] ${i >= 2 && i <= 6 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((snap, i) => {
                  const prev      = sorted[i + 1]
                  const isW2      = snap.week === 2
                  const isW10     = snap.week === 10
                  const highlight = isW2 || isW10
                  return (
                    <tr
                      key={snap.id}
                      className="border-b border-[var(--bdr2)] last:border-0"
                      style={highlight ? { background: 'rgba(26,86,219,0.05)' } : undefined}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-[600] text-[var(--tx)]">W{snap.week}</span>
                        {isW2  && <span className="ml-1 text-[9px] font-[700] text-[#1a56db] bg-[#dbeafe] px-1 rounded">W2</span>}
                        {isW10 && <span className="ml-1 text-[9px] font-[700] text-[#1a56db] bg-[#dbeafe] px-1 rounded">W10</span>}
                        {snap.isAuto && <span className="ml-1 text-[9px] text-[var(--tx2)]">auto</span>}
                      </td>
                      <td className="px-3 py-2 text-[var(--tx2)] whitespace-nowrap">
                        {new Date(snap.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="font-[600] text-[var(--tx)]">{fmt(snap.fc_commit)}</span>
                          {(isW2 || isW10) && <AccuracyBadge fcCommit={snap.fc_commit} actual={actualClosed} />}
                        </div>
                        {prev && <DeltaBadge curr={snap.fc_commit} prev={prev.fc_commit} />}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-[600] text-[var(--tx)]">{fmt(snap.fc_probable)}</span>
                        {prev && <div><DeltaBadge curr={snap.fc_probable} prev={prev.fc_probable} /></div>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-[600] text-[var(--tx)]">{fmt(snap.fc_upside)}</span>
                        {prev && <div><DeltaBadge curr={snap.fc_upside} prev={prev.fc_upside} /></div>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-[600] text-[var(--tx)]">{fmt(snap.pipeline)}</span>
                        {prev && <div><DeltaBadge curr={snap.pipeline} prev={prev.pipeline} /></div>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-[600] text-[var(--tx)]">{fmt(snap.closed)}</span>
                        {prev && <div><DeltaBadge curr={snap.closed} prev={prev.closed} /></div>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => wow.deleteSnapshot(snap.id)}
                          className="text-[12px] text-[var(--tx2)] hover:text-[#dc2626] border-none bg-transparent cursor-pointer leading-none"
                          title="Delete snapshot"
                        >×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--bdr2)] bg-[var(--bg2)] flex-wrap">
            <span className="text-[11px] text-[var(--tx2)]">Quarter-end actual closed:</span>
            <span className="text-[var(--tx2)]">$</span>
            <input
              type="text"
              value={actualInput}
              onChange={e => setActualInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveActual()}
              placeholder="0"
              className="w-28 text-[13px] font-[600] bg-transparent border-b border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5"
            />
            <button onClick={saveActual} className="btn text-[11px]">Save</button>
            {actualClosed != null && (
              <span className="text-[11px] text-[var(--tx2)]">
                Saved: <strong className="text-[var(--tx)]">{fmt(actualClosed)}</strong>
                {' '}— W2/W10 rows show forecast accuracy
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
