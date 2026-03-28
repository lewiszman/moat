import React, { useMemo } from 'react'
import { useForecastStore, useQuarterStore } from '../../store/forecastStore'
import { getFiscalQuarterInfo, sellDaysRemaining, getWeekNumber } from '../../lib/fmt'

export default function QuarterStatusBar() {
  const fyStart       = useForecastStore(s => s.fyStartMonth) || 1
  const activeQuarter = useQuarterStore(s => s.activeQuarter)

  const info = useMemo(() => {
    const now     = new Date()
    const weekNum = getWeekNumber(now)
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

    // Always compute current quarter first — Q+1 dates derive from its end
    const cqInfo = getFiscalQuarterInfo('current', fyStart)

    let label, qEndDate, daysLeft, elapsedPct

    if (activeQuarter === 'q1') {
      // Next quarter starts the day after CQ ends
      const nextQStart = new Date(cqInfo.qEndDate)
      nextQStart.setDate(nextQStart.getDate() + 1)
      // Next quarter ends 3 months later (last day of that month)
      const nextQEnd = new Date(nextQStart.getFullYear(), nextQStart.getMonth() + 3, 0)

      label    = getFiscalQuarterInfo('next', fyStart).label
      qEndDate = nextQEnd
      // Full quarter selling days: from one day before Q+1 day-1 through Q+1 last day
      daysLeft = sellDaysRemaining(new Date(nextQStart.getTime() - 1), nextQEnd)
      elapsedPct = 0
    } else {
      label    = cqInfo.label
      qEndDate = cqInfo.qEndDate
      daysLeft = sellDaysRemaining(now, qEndDate)
      const TOTAL_SELL_DAYS = 65
      const elapsed = Math.max(0, TOTAL_SELL_DAYS - daysLeft)
      elapsedPct = Math.min(100, Math.round((elapsed / TOTAL_SELL_DAYS) * 100))
    }

    const qEndStr = qEndDate
      ? qEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null

    return { label, weekNum, daysLeft, qEndStr, dateStr, elapsedPct }
  }, [fyStart, activeQuarter])

  // Urgency coloring only applies to current quarter
  const urgency = activeQuarter === 'q1' ? 'ok'
                : info.daysLeft <= 5     ? 'critical'
                : info.daysLeft <= 15    ? 'warn'
                : 'ok'

  const urgencyColor = {
    critical: 'text-red-600',
    warn:     'text-amber-600',
    ok:       'text-[var(--tx)]',
  }

  return (
    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 px-0 py-2 mb-3">

      {/* Quarter chip */}
      <div className="flex items-center gap-1.5">
        <div
          className="text-[10px] font-[800] uppercase tracking-widest px-2 py-0.5 rounded-md"
          style={{ background: '#1a56db22', color: '#1a56db' }}
        >
          {info.label}
        </div>
      </div>

      <span className="text-[var(--bdr2)] select-none">·</span>

      {/* Date */}
      <span className="text-[11px] text-[var(--tx2)]">{info.dateStr}</span>

      <span className="text-[var(--bdr2)] select-none">·</span>

      {/* Week */}
      <span className="text-[11px] text-[var(--tx2)]">Wk {info.weekNum}</span>

      {/* Quarter end date */}
      {info.qEndStr && (
        <>
          <span className="text-[var(--bdr2)] select-none">·</span>
          <span className="text-[11px] text-[var(--tx2)]">Q-end {info.qEndStr}</span>
        </>
      )}

      {/* Selling days */}
      <>
        <span className="text-[var(--bdr2)] select-none">·</span>
        <span className={`text-[11px] font-[700] ${urgencyColor[urgency]}`}>
          {urgency === 'critical' && '🔥 '}
          {info.daysLeft} selling day{info.daysLeft !== 1 ? 's' : ''} left
        </span>
      </>

      {/* Progress bar */}
      <div className="flex items-center gap-1.5 ml-auto">
        <div className="w-24 h-1.5 bg-[var(--bg3)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${info.elapsedPct}%`,
              background: urgency === 'critical' ? '#dc2626' : urgency === 'warn' ? '#b45309' : '#1a56db',
            }}
          />
        </div>
        <span className="text-[9px] text-[var(--tx2)]">{info.elapsedPct}% elapsed</span>
      </div>
    </div>
  )
}
