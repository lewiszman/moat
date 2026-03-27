import React, { useMemo } from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { getFiscalQuarterInfo, sellDaysRemaining, getWeekNumber } from '../../lib/fmt'

export default function QuarterStatusBar() {
  const qMode      = useForecastStore(s => s.qMode)
  const fyStart    = useForecastStore(s => s.fyStartMonth) || 1
  const quota      = useForecastStore(s => s.quota) || 0

  const info = useMemo(() => {
    const now     = new Date()
    const qInfo   = getFiscalQuarterInfo(qMode, fyStart)
    const weekNum = getWeekNumber(now)

    const daysLeft = qMode === 'current'
      ? sellDaysRemaining(now, qInfo.qEndDate)
      : null

    // Q end date formatted
    const qEndStr = qInfo.qEndDate
      ? qInfo.qEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null

    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })

    // Elapsed selling days as a % (approximate: assume 65 total selling days in a quarter)
    const TOTAL_SELL_DAYS = 65
    const elapsed = daysLeft !== null ? Math.max(0, TOTAL_SELL_DAYS - daysLeft) : null
    const elapsedPct = elapsed !== null ? Math.min(100, Math.round((elapsed / TOTAL_SELL_DAYS) * 100)) : null

    return { ...qInfo, weekNum, daysLeft, qEndStr, dateStr, elapsedPct }
  }, [qMode, fyStart])

  const urgency = info.daysLeft !== null
    ? info.daysLeft <= 5  ? 'critical'
    : info.daysLeft <= 15 ? 'warn'
    : 'ok'
    : null

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
        {qMode === 'next' && (
          <span className="text-[9px] font-[700] uppercase tracking-wide px-1.5 py-px rounded bg-purple-100 text-purple-600">
            Planning
          </span>
        )}
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
      {info.daysLeft !== null && (
        <>
          <span className="text-[var(--bdr2)] select-none">·</span>
          <span className={`text-[11px] font-[700] ${urgencyColor[urgency]}`}>
            {urgency === 'critical' && '🔥 '}
            {info.daysLeft} selling day{info.daysLeft !== 1 ? 's' : ''} left
          </span>
        </>
      )}

      {/* Progress bar */}
      {info.elapsedPct !== null && (
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
      )}
    </div>
  )
}
