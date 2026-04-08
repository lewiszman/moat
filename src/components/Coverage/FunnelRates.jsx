import React, { useState } from 'react'
import { useCoverageStore } from '../../store/coverageStore'
import { parseMoney } from '../../lib/fmt'

const RATE_ROWS = [
  { label: 'Activities per meeting', field: 'activity_to_meeting', isRatio: true, max: 100 },
  { label: 'Meeting → Opp %',        field: 'meeting_to_opp',      isRatio: false, max: 100 },
  { label: 'Opp → SAA %',            field: 'opp_to_saa',          isRatio: false, max: 100 },
]

export default function FunnelRates() {
  const [open, setOpen] = useState(false)
  const channels        = useCoverageStore(s => s.channels)
  const setChannelField = useCoverageStore(s => s.setChannelField)
  const resetAllChannels = useCoverageStore(s => s.resetAllChannels)

  const channelKeys = Object.keys(channels)

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
          <p className="text-[11px] text-[var(--tx2)] mb-4">
            These rates drive the activity model. Update them to reflect your team's historical conversion data.
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
                          <input
                            type="text"
                            value={channels[k][row.field]}
                            onChange={e => {
                              const v = parseMoney(e.target.value)
                              const clamped = row.isRatio
                                ? Math.max(1, Math.round(v))
                                : Math.min(100, Math.max(0, v))
                              setChannelField(k, row.field, clamped)
                            }}
                            className="w-14 text-[13px] font-[600] text-center bg-transparent border border-[var(--bdr2)] rounded px-1.5 py-1 focus:border-[var(--blue)] outline-none"
                          />
                          {!row.isRatio && <span className="text-[var(--tx2)]">%</span>}
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
