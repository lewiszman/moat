import React, { useMemo } from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { fmt, parseMoney, getFiscalQuarterInfo } from '../../lib/fmt'

// ── Helpers ────────────────────────────────────────────────────

function getQuarterMonths(qMode, fyStartMonth) {
  const info = getFiscalQuarterInfo(qMode, fyStartMonth)
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  return [0, 1, 2].map(offset => {
    const rawIdx = info.qStartMonth - 1 + offset          // 0-based
    const mYear  = info.qStartYear + Math.floor(rawIdx / 12)
    const mNum   = (rawIdx % 12) + 1                      // 1-based
    const lastDay = new Date(mYear, mNum, 0)               // last calendar day
    lastDay.setHours(23, 59, 59, 999)
    const isPast    = lastDay < now
    const isCurrent = now.getMonth() + 1 === mNum && now.getFullYear() === mYear
    const label     = new Date(mYear, mNum - 1, 1)
      .toLocaleString('en-US', { month: 'short' })

    return { mNum, mYear, isPast, isCurrent, label, key: `m${offset + 1}` }
  })
}

// Compact editable number cell
function MiniInput({ value, locked, onChange }) {
  const [raw, setRaw] = React.useState(null)

  if (locked) {
    return (
      <span className="text-[12px] font-[600] text-[var(--tx2)]">
        {value > 0 ? '$' + Math.round(value).toLocaleString('en-US') : '—'}
      </span>
    )
  }

  const display = raw !== null ? raw : (value > 0 ? value.toLocaleString('en-US') : '')

  return (
    <div className="flex items-center gap-px">
      <span className="text-[11px] text-[var(--tx2)]">$</span>
      <input
        type="text"
        value={display}
        onFocus={() => setRaw(value > 0 ? String(Math.round(value)) : '')}
        onChange={e => setRaw(e.target.value)}
        onBlur={() => { onChange(parseMoney(raw ?? '')); setRaw(null) }}
        className="w-20 text-[12px] font-[600] text-[var(--tx)] bg-transparent border-b border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5"
      />
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────

export default function MonthlyBreakdown() {
  const s          = useForecastStore()
  const qMode      = s.qMode
  const fyStart    = s.fyStartMonth || 1
  const unlocked   = s.monthUnlocked || { m1: false, m2: false, m3: false }

  const months = useMemo(
    () => getQuarterMonths(qMode, fyStart),
    [qMode, fyStart]
  )

  // For Q+1 no months are auto-locked; for CQ, past months are locked unless unlocked
  function isLocked(mInfo) {
    if (qMode === 'next') return false
    return mInfo.isPast && !unlocked[mInfo.key]
  }

  const ROWS = [
    { label: 'Closed',   sub: 'closed',  color: '#0d7c3d', icon: '●' },
    { label: 'Commit',   sub: 'commit',  color: '#1a56db', icon: '◆' },
    { label: 'Probable', sub: 'prob',    color: '#0d7c3d', icon: '◆' },
    { label: 'Upside',   sub: 'up',      color: '#b45309', icon: '◆' },
  ]

  // Totals per row
  const rowTotals = ROWS.map(row => {
    return months.reduce((sum, m) => sum + (s[`${m.key}_${row.sub}`] || 0), 0)
  })

  // Linearity — % of quarterly closed by month
  const qClosed      = rowTotals[0]  // Closed row total
  const monthClosed  = months.map(m => s[`${m.key}_closed`] || 0)
  const linPct       = monthClosed.map(v => qClosed > 0 ? (v / qClosed) * 100 : 0)
  const quotaPace    = (s.quota || 0) / 3                // expected per month

  return (
    <div className="card overflow-hidden">

      {/* Column headers */}
      <div
        className="grid items-center gap-0 bg-[var(--bg2)] border-b border-[var(--bdr2)]"
        style={{ gridTemplateColumns: '120px repeat(3, 1fr) 110px' }}
      >
        <div className="px-3 py-2" />
        {months.map(m => (
          <div key={m.key} className="px-3 py-2 flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-[700] text-[var(--tx)]">{m.label}</span>
              {m.isCurrent && (
                <span className="text-[8px] font-[700] uppercase tracking-wide bg-blue-100 text-blue-700 px-1 py-px rounded">
                  now
                </span>
              )}
            </div>
            {isLocked(m) ? (
              <button
                onClick={() => s.toggleMonthLock(m.key)}
                className="text-[9px] text-[var(--tx2)] hover:text-[var(--blue)] cursor-pointer flex items-center gap-0.5 border-none bg-transparent p-0"
                title="Unlock to edit"
              >
                🔒 locked
              </button>
            ) : m.isPast && qMode === 'current' ? (
              <button
                onClick={() => s.toggleMonthLock(m.key)}
                className="text-[9px] text-amber-600 hover:text-red-600 cursor-pointer flex items-center gap-0.5 border-none bg-transparent p-0"
                title="Re-lock"
              >
                🔓 unlocked
              </button>
            ) : null}
          </div>
        ))}
        <div className="px-3 py-2 text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] text-right">
          Quarter
        </div>
      </div>

      {/* Data rows */}
      {ROWS.map((row, ri) => (
        <div
          key={row.sub}
          className="grid items-center border-b border-[var(--bdr2)] last:border-0"
          style={{ gridTemplateColumns: '120px repeat(3, 1fr) 110px' }}
        >
          {/* Row label */}
          <div className="px-3 py-2.5 flex items-center gap-1.5">
            <span className="text-[10px]" style={{ color: row.color }}>{row.icon}</span>
            <span className="text-[12px] font-[600] text-[var(--tx)]">{row.label}</span>
          </div>

          {/* Month cells */}
          {months.map(m => {
            const fk  = `${m.key}_${row.sub}`
            const val = s[fk] || 0
            const locked = isLocked(m)
            return (
              <div key={m.key} className="px-3 py-2.5 flex items-center">
                <MiniInput
                  value={val}
                  locked={locked}
                  onChange={v => s.updateInput(fk, v)}
                />
              </div>
            )
          })}

          {/* Quarter total */}
          <div className="px-3 py-2.5 text-right">
            <span className="text-[12px] font-[700] text-[var(--tx)]">
              {rowTotals[ri] > 0 ? '$' + Math.round(rowTotals[ri]).toLocaleString('en-US') : '—'}
            </span>
          </div>
        </div>
      ))}

      {/* Linearity row */}
      <div
        className="grid items-center border-t-2 border-[var(--bdr2)] bg-[var(--bg2)]"
        style={{ gridTemplateColumns: '120px repeat(3, 1fr) 110px' }}
      >
        <div className="px-3 py-2 text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
          Linearity
        </div>
        {months.map((m, i) => {
          const pct     = linPct[i]
          const diff    = pct - 33.33
          const color   = Math.abs(diff) < 3 ? '#0d7c3d' : Math.abs(diff) < 8 ? '#b45309' : '#dc2626'
          return (
            <div key={m.key} className="px-3 py-2 flex flex-col items-start gap-0.5">
              <span className="text-[12px] font-[700]" style={{ color }}>
                {qClosed > 0 ? pct.toFixed(0) + '%' : '—'}
              </span>
              {qClosed > 0 && (
                <span className="text-[9px] text-[var(--tx2)]">
                  {diff >= 0 ? '+' : ''}{diff.toFixed(0)}pp vs 33%
                </span>
              )}
            </div>
          )
        })}
        <div className="px-3 py-2 text-right text-[11px] font-[700] text-[var(--tx2)]">
          {qClosed > 0 ? '100%' : '—'}
        </div>
      </div>

      {/* vs Quota pace row */}
      {s.quota > 0 && (
        <div
          className="grid items-center border-t border-[var(--bdr2)] bg-[var(--bg2)]"
          style={{ gridTemplateColumns: '120px repeat(3, 1fr) 110px' }}
        >
          <div className="px-3 py-2 text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
            vs Pace
          </div>
          {months.map((m, i) => {
            const actual = monthClosed[i]
            const diff   = actual - quotaPace
            const pct    = quotaPace > 0 ? (actual / quotaPace) * 100 : 0
            const locked = isLocked(m)
            // Only show pace for past/current months with actuals
            if (!locked && !months[i].isCurrent && qMode === 'current') {
              return <div key={m.key} className="px-3 py-2 text-[10px] text-[var(--tx2)]">—</div>
            }
            const color = pct >= 100 ? '#0d7c3d' : pct >= 80 ? '#b45309' : '#dc2626'
            return (
              <div key={m.key} className="px-3 py-2 flex flex-col items-start gap-0.5">
                <span className="text-[12px] font-[700]" style={{ color }}>
                  {pct.toFixed(0)}%
                </span>
                <span className="text-[9px] text-[var(--tx2)]">
                  {diff >= 0 ? '+' : ''}${Math.round(Math.abs(diff) / 1000)}k {diff >= 0 ? 'above' : 'below'}
                </span>
              </div>
            )
          })}
          <div className="px-3 py-2 text-right">
            <span className="text-[11px] font-[700] text-[var(--tx2)]">
              {s.quota > 0 ? `${Math.round((rowTotals[0] / s.quota) * 100)}%` : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
