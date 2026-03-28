import React, { useMemo } from 'react'
import { useForecastStore, useQuarterStore } from '../../store/forecastStore'
import { parseMoney, getFiscalQuarterInfo } from '../../lib/fmt'

// ── Month metadata ──────────────────────────────────────────────

function getQuarterMonths(fyStartMonth, isNextQuarter) {
  // Always derive from current quarter, then advance 3 months for Q+1.
  // getFiscalQuarterInfo('next') computes the right label but doesn't advance
  // qStartMonth/qStartYear, so we do it manually here.
  const info = getFiscalQuarterInfo('current', fyStartMonth)
  const now  = new Date()
  now.setHours(0, 0, 0, 0)

  let startMonth = info.qStartMonth
  let startYear  = info.qStartYear
  if (isNextQuarter) {
    const next = ((info.qStartMonth - 1 + 3) % 12) + 1
    if (next <= info.qStartMonth) startYear++ // crossed a year boundary
    startMonth = next
  }

  return [0, 1, 2].map(offset => {
    const rawIdx  = startMonth - 1 + offset
    const mYear   = startYear + Math.floor(rawIdx / 12)
    const mNum    = (rawIdx % 12) + 1
    const lastDay = new Date(mYear, mNum, 0)
    lastDay.setHours(23, 59, 59, 999)
    const isPast    = lastDay < now
    const isCurrent = now.getMonth() + 1 === mNum && now.getFullYear() === mYear
    const key       = `m${offset + 1}`
    return { mNum, mYear, isPast, isCurrent, key, label: `Month ${offset + 1}` }
  })
}

// ── Editable cell ───────────────────────────────────────────────

function Cell({ value, locked, onChange }) {
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

// ── Component ───────────────────────────────────────────────────

const ROWS = [
  { label: 'Closed',   sub: 'closed', color: 'var(--green)' },
  { label: 'Commit',   sub: 'commit', color: 'var(--blue)'  },
  { label: 'Probable', sub: 'prob',   color: 'var(--green)' },
  { label: 'Upside',   sub: 'up',     color: 'var(--amber)' },
]

const COL = '120px repeat(3, 1fr) 100px'

export default function MonthlyBreakdown() {
  const s        = useForecastStore()
  const fyStart  = s.fyStartMonth || 1
  const unlocked     = s.monthUnlocked || { m1: false, m2: false, m3: false }
  const activeQuarter = useQuarterStore(s => s.activeQuarter)
  const isNextQuarter = activeQuarter === 'q1'

  const months = useMemo(() => getQuarterMonths(fyStart, isNextQuarter), [fyStart, isNextQuarter])

  // Past months lock ALL rows to actuals (only closed matters once month ends).
  function isPastLocked(m) {
    return m.isPast && !unlocked[m.key]
  }

  // Per-row totals across months
  const rowTotals = ROWS.map(row =>
    months.reduce((sum, m) => {
      // For locked months, every category counts as closed
      const val = isPastLocked(m)
        ? (s[`${m.key}_closed`] || 0)
        : (s[`${m.key}_${row.sub}`] || 0)
      return sum + val
    }, 0)
  )

  // Linearity: monthly closed as % of quarterly closed total
  const qClosed     = months.reduce((sum, m) => sum + (s[`${m.key}_closed`] || 0), 0)
  const monthClosed = months.map(m => s[`${m.key}_closed`] || 0)
  const linPct      = monthClosed.map(v => qClosed > 0 ? (v / qClosed) * 100 : 0)
  const quotaPace   = (s.quota || 0) / 3

  return (
    <div className="card overflow-hidden">

      {/* ── Column headers ── */}
      <div className="grid items-center bg-[var(--bg2)] border-b border-[var(--bdr2)]"
           style={{ gridTemplateColumns: COL }}>
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
            {/* Lock / unlock toggle — only relevant for CQ past months */}
            {m.isPast && (
              isPastLocked(m) ? (
                <button
                  onClick={() => s.toggleMonthLock(m.key)}
                  className="text-[9px] text-[var(--tx2)] hover:text-[var(--blue)] flex items-center gap-0.5 bg-transparent border-none p-0 cursor-pointer"
                  title="Unlock to edit"
                >
                  🔒 locked
                </button>
              ) : (
                <button
                  onClick={() => s.toggleMonthLock(m.key)}
                  className="text-[9px] text-amber-600 hover:text-red-600 flex items-center gap-0.5 bg-transparent border-none p-0 cursor-pointer"
                  title="Re-lock"
                >
                  🔓 unlocked
                </button>
              )
            )}
          </div>
        ))}
        <div className="px-3 py-2 text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] text-right">
          Quarter
        </div>
      </div>

      {/* ── Data rows ── */}
      {ROWS.map((row, ri) => (
        <div key={row.sub}
             className="grid items-center border-b border-[var(--bdr2)]"
             style={{ gridTemplateColumns: COL }}>

          <div className="px-3 py-2.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
            <span className="text-[12px] font-[600] text-[var(--tx)]">{row.label}</span>
          </div>

          {months.map(m => {
            const locked = isPastLocked(m)
            // Locked months: all categories display closed amount
            const displayVal = locked
              ? (s[`${m.key}_closed`] || 0)
              : (s[`${m.key}_${row.sub}`] || 0)
            const fk = `${m.key}_${row.sub}`

            return (
              <div key={m.key} className="px-3 py-2.5 flex items-center">
                <Cell
                  value={displayVal}
                  locked={locked}
                  onChange={v => s.updateInput(fk, v)}
                />
              </div>
            )
          })}

          <div className="px-3 py-2.5 text-right">
            <span className="text-[12px] font-[700] text-[var(--tx)]">
              {rowTotals[ri] > 0 ? '$' + Math.round(rowTotals[ri]).toLocaleString('en-US') : '—'}
            </span>
          </div>
        </div>
      ))}

      {/* ── Linearity row ── */}
      <div className="grid items-center border-t-2 border-[var(--bdr2)] bg-[var(--bg2)]"
           style={{ gridTemplateColumns: COL }}>
        <div className="px-3 py-2 text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
          Linearity
        </div>
        {months.map((m, i) => {
          const pct  = linPct[i]
          const diff = pct - 33.33
          const color = Math.abs(diff) < 3 ? 'var(--green)' : Math.abs(diff) < 8 ? 'var(--amber)' : 'var(--coral)'
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

      {/* ── vs Quota pace row ── */}
      {s.quota > 0 && (
        <div className="grid items-center border-t border-[var(--bdr2)] bg-[var(--bg2)]"
             style={{ gridTemplateColumns: COL }}>
          <div className="px-3 py-2 text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
            vs Pace
          </div>
          {months.map((m, i) => {
            const actual  = monthClosed[i]
            const diff    = actual - quotaPace
            const pct     = quotaPace > 0 ? (actual / quotaPace) * 100 : 0
            const locked  = isPastLocked(m)
            // Only show pace for past months with actuals, or current month
            if (!locked && !m.isCurrent) {
              return <div key={m.key} className="px-3 py-2 text-[10px] text-[var(--tx2)]">—</div>
            }
            const color = pct >= 100 ? 'var(--green)' : pct >= 80 ? 'var(--amber)' : 'var(--coral)'
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
              {s.quota > 0 ? `${Math.round((qClosed / s.quota) * 100)}%` : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
