import React from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { fmt, pct, parseMoney } from '../../lib/fmt'
import SectionComment from '../shared/SectionComment'

export default function CncWhatIf() {
  const s = useForecastStore()
  const d = s.derived || {}
  const cnc_pipe = d.cnc_pipe || 0
  const cnc_rev  = d.cnc_rev  || 0

  return (
    <div className="card overflow-hidden">
      {/* Inputs */}
      <div className="flex gap-6 p-4 border-b border-[var(--bdr2)]">
        <div>
          <label className="text-[11px] text-[var(--tx2)] mb-1 block">Qualified opps to create</label>
          <input
            type="text"
            value={s.cnc_opps}
            onChange={e => s.updateInput('cnc_opps', parseMoney(e.target.value))}
            className="w-20 text-[18px] font-[700] bg-transparent border-b-2 border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-1"
          />
        </div>
        <div>
          <label className="text-[11px] text-[var(--tx2)] mb-1 block">Average selling price (ASP)</label>
          <div className="flex items-center gap-1">
            <span className="text-[var(--tx2)]">$</span>
            <input
              type="text"
              value={s.cnc_asp > 0 ? s.cnc_asp.toLocaleString('en-US') : ''}
              onChange={e => s.updateInput('cnc_asp', parseMoney(e.target.value))}
              className="w-28 text-[18px] font-[700] bg-transparent border-b-2 border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-1"
            />
          </div>
        </div>
      </div>

      {/* Chain */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[var(--bg2)] border-b border-[var(--bdr2)] flex-wrap">
        {[
          { label: 'Opps',     value: Math.round(s.cnc_opps).toLocaleString() },
          { op: '×' },
          { label: 'ASP',      value: fmt(s.cnc_asp) },
          { op: '=' },
          { label: 'Pipeline', value: fmt(cnc_pipe) },
          { op: '×' },
          { label: 'C&C rate', value: pct(s.r_cnc) },
        ].map((item, i) =>
          item.op ? (
            <span key={i} className="text-[var(--tx2)] font-[500] text-[14px]">{item.op}</span>
          ) : (
            <div key={i} className="text-center">
              <div className="text-[9px] uppercase tracking-wider text-[var(--tx2)] mb-0.5">{item.label}</div>
              <div className="text-[14px] font-[700] text-[var(--tx)]">{item.value}</div>
            </div>
          )
        )}
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 divide-x divide-[var(--bdr2)]">
        <div className="px-4 py-3">
          <div className="text-[11px] text-[var(--tx2)] mb-0.5">Qualified pipeline created</div>
          <div className="text-[18px] font-[700] text-[var(--blue)]">{fmt(cnc_pipe)}</div>
          <div className="text-[11px] text-[var(--tx2)]">{Math.round(s.cnc_opps)} opps × {fmt(s.cnc_asp)} ASP</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] text-[var(--tx2)] mb-0.5">Expected C&C bookings</div>
          <div className="text-[18px] font-[700] text-[var(--green)]">{fmt(cnc_rev)}</div>
          <div className="text-[11px] text-[var(--tx2)]">{fmt(cnc_pipe)} × {pct(s.r_cnc)} C&C rate</div>
        </div>
      </div>

      {/* Note */}
      <div className="px-4 py-2.5 bg-[var(--bg2)] border-t border-[var(--bdr2)] text-[11px] text-[var(--tx2)]">
        C&C bookings of <strong className="text-[var(--tx)]">{fmt(cnc_rev)}</strong> included in Probable forecast and above
      </div>
    </div>
  )
}
