// ── Number formatting ──────────────────────────────────────────
export const fmt = (n) =>
  typeof n === 'number' && !isNaN(n)
    ? '$' + Math.round(n).toLocaleString('en-US')
    : '$0'

export const pct = (n) => (typeof n === 'number' ? n + '%' : '0%')

export const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export const attPct = (fc, quota) =>
  quota > 0 ? Math.round((fc / quota) * 100) : 0

export const attVar = (fc, quota) => {
  if (quota <= 0) return 'var(--tx)'
  const p = fc / quota
  if (p >= 1) return '#059669'
  if (p >= 0.9) return '#b45309'
  return '#dc2626'
}

export const attHex = attVar

// Parse a currency/number string from an input field
export const parseMoney = (s) =>
  parseFloat(String(s).replace(/[$,]/g, '')) || 0

// ── Fiscal quarter helpers ─────────────────────────────────────
export const US_HOLIDAYS = [
  '2026-01-01','2026-01-19','2026-02-16','2026-05-25',
  '2026-07-03','2026-07-04','2026-09-07','2026-11-26',
  '2026-11-27','2026-12-24','2026-12-25',
  '2025-01-01','2025-01-20','2025-02-17','2025-05-26',
  '2025-07-04','2025-09-01','2025-11-27','2025-11-28',
  '2025-12-24','2025-12-25',
]

export const isHoliday = (d) => {
  const s = d.toISOString().slice(0, 10)
  return US_HOLIDAYS.includes(s)
}

export const isWeekday = (d) => {
  const day = d.getDay()
  return day !== 0 && day !== 6
}

// Counts selling days from 'from' inclusive through 'to' (for total quarter sell days).
// Unlike sellDaysRemaining, starts counting on 'from' itself, not the day after.
export const sellDaysInQuarter = (from, to) => {
  let count = 0
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)
  while (d <= end) {
    if (isWeekday(d) && !isHoliday(d)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

export const sellDaysRemaining = (from, qEnd) => {
  let count = 0
  const d = new Date(from)
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  const end = new Date(qEnd)
  end.setHours(23, 59, 59, 999)
  while (d <= end) {
    if (isWeekday(d) && !isHoliday(d)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

export const bizDaysFrom = (from, to) => {
  let count = 0
  const d = new Date(from)
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)
  while (d <= end) {
    if (isWeekday(d) && !isHoliday(d)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

// FY quarter derivation
export const getFiscalQuarterInfo = (mode = 'current', fyStartMonth = 1) => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-based

  const fyStart = parseInt(fyStartMonth) || 1
  const monthsIntoFY = ((month - fyStart + 12) % 12)
  const currentQ = Math.floor(monthsIntoFY / 3) + 1
  const qStartMonthOffset = (currentQ - 1) * 3
  const qStartMonth = ((fyStart - 1 + qStartMonthOffset) % 12) + 1

  let qStartYear = year
  if (qStartMonth > month) qStartYear--

  const targetQ = mode === 'next' ? (currentQ % 4) + 1 : currentQ
  const isNextYear = mode === 'next' && currentQ === 4

  const qEndMonth = ((qStartMonth + 2 - 1) % 12) + 1
  const qEndYear = qEndMonth < qStartMonth ? qStartYear + 1 : qStartYear

  const fyYear = qStartYear + (fyStart > 1 ? 1 : 0)
  const label = `Q${mode === 'next' ? targetQ : currentQ} FY${String(fyYear).slice(2)}`

  const qEndDate = new Date(qEndYear, qEndMonth - 1 + 1, 0) // last day of qEndMonth

  return {
    label,
    currentQ: mode === 'next' ? targetQ : currentQ,
    qEndDate,
    isFuture: mode === 'next',
    qStartYear,
    qStartMonth,
  }
}

export const getWeekNumber = (d) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
}
