import React, { useState } from 'react'
import { useCoverageStore } from '../../store/coverageStore'
import { parseMoney } from '../../lib/fmt'

// Row type key:
//   'acts_per_mtg' — stored as ratio (0.002), displayed as integer (500)
//   'pct'          — stored & displayed as 0–100 integer
//   'money'        — stored & displayed as integer, $ prefix
//   'int'          — stored & displayed as plain integer

const RATE_ROWS = [
  { label: 'Activities per meeting', field: 'activity_to_meeting', type: 'acts_per_mtg', min: 1,    max: 10000 },
  { label: 'Meeting → Opp %',        field: 'meeting_to_opp',      type: 'pct',          min: 0,    max: 100   },
  { label: 'Opp → SAA %',            field: 'opp_to_saa',          type: 'pct',          min: 0,    max: 100   },
  { label: 'Win rate %',             field: 'win_rate',             type: 'pct',          min: 0,    max: 100   },
  { label: 'ASP',                    field: 'asp',                  type: 'money',        min: 0             },
  { label: 'Headcount (AEs/SDRs)',   field: 'headcount',            type: 'int',          min: 1,    max: 999   },
]

// Convert stored ratio → display integer (e.g. 0.002 → 500)
function ratioToDisplay(stored) {
  return stored > 0 ? Math.round(1 / stored) : ''
}
// Convert display integer → stored ratio (e.g. 500 → 0.002)
function displayToRatio(display) {
  const n = Math.max(1, Math.round(display))
  return 1 / n
}

export default function FunnelRates() {
  const [open, setOpen] = useState(false)
  const channels         = useCoverageStore(s => s.channels)
  const setChannelField  = useCoverageStore(s => s.setChannelField)
  const resetAllChannels = useCoverageStore(s => s.resetAllChannels)

  const channelKeys = Object.keys(channels)

  function getDisplayValue(ch, row) {
    const stored = ch[row.field]
    if (row.type === 'acts_per_mtg') return ratioToDisplay(stored)
    if (row.type === 'money') return stored > 0 ? stored.toLocaleString('en-US') : ''
    return stored ?? ''
  }

  function handleChange(channelKey, row, rawInput) {
    const v = parseMoney(rawInput)
    if (isNaN(v)) return
    switch (row.type) {
      case 'acts_per_mtg': {
        const clamped = Math.min(row.max, Math.max(row.min, Math.round(v)))
        setChannelField(channelKey, row.field, displayToRatio(clamped))
        break
      }
      case 'pct': {
        const clamped = Math.min(row.max, Math.max(row.min, Math.round(v)))
        setChannelField(channelKey, row.field, clamped)
        break
      }
      case 'money': {
        const clamped = Math.max(row.min ?? 0, Math.round(v))
        setChannelField(channelKey, row.field, clamped)
        break
      }
      case 'int': {
        const clamped = Math.min(row.max ?? 9999, Math.max(row.min ?? 1, Math.round(v)))
        setChannelField(channelKey, row.field, clamped)
        break
      }
      default:
        setChannelField(channelKey, row.field, v)
    }
  }

  function getSuffix(row) {
    if (row.type === 'pct') return '%'
    return ''
  }

  function getPrefix(row) {
    if (row.type === 'money') return '$'
    return ''
  }

  return (
    <div className="card overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left bg-[var(--bg2)] border-b border-[var(--bdr2)] cursor-pointer border-none hover:bg-[var(--bg3)] transition-colors"
      >
        <span
          className="text-[var(--tx2)] text-[10px] transition-transform duration-150"
          style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : '' }}
        >
          ▶
        </span>
        <span className="text-[12px] font-[700] text-[var(--tx)]">Funnel assumptions</span>
        {!open && (
          <span className="text-[11px] text-[var(--tx2)] ml-1">— click to edit conversion rates</span>
        )}
      </button>

      {open && (
        <div className="px-4 py-4">
          <p className="text-[11px] text-[var(--tx2)] mb-1">
            These rates drive the activity model. Update them to reflect your team's historical conversion data.
          </p>
          <p className="text-[11px] text-[var(--tx2)] mb-4">
            <strong>Activities per meeting</strong> = activities required to generate 1 meeting (e.g. 500 means 1 meeting per 500 activities).
          </p>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--bdr2)]">
                  <th className="text-left text-[11px] font-[600] text-[var(--tx2)] pb-2 pr-4 whitespace-nowrap">
                    Rate
                  </th>
                  {channelKeys.map(k => (
                    <th key={k} className="text-center text-[11px] font-[600] text-[var(--tx2)] pb-2 px-3 whitespace-nowrap">
                      {channels[k].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bdr2)]">
                {RATE_ROWS.map(row => (
                  <tr key={row.field}>
                    <td className="py-2 pr-4 text-[var(--tx)] whitespace-nowrap font-[500]">
                      {row.label}
                    </td>
                    {channelKeys.map(k => (
                      <td key={k} className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          {getPrefix(row) && (
                            <span className="text-[var(--tx2)] text-[12px]">{getPrefix(row)}</span>
                          )}
                          <input
                            type="text"
                            value={getDisplayValue(channels[k], row)}
                            onChange={e => handleChange(k, row, e.target.value)}
                            className="w-16 text-[13px] font-[600] text-center bg-transparent border border-[var(--bdr2)] rounded px-1.5 py-1 focus:border-[var(--blue)] outline-none"
                          />
                          {getSuffix(row) && (
                            <span className="text-[var(--tx2)]">{getSuffix(row)}</span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Reset link */}
          <div className="mt-4 pt-3 border-t border-[var(--bdr2)]">
            <button
              onClick={resetAllChannels}
              className="text-[11px] text-[var(--tx2)] hover:text-[var(--tx)] underline cursor-pointer bg-transparent border-none"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
