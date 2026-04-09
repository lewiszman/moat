import React from 'react'
import { useCoverageStore } from '../../store/coverageStore'
import { fmt, parseMoney } from '../../lib/fmt'

// Funnel stage config — Activities → Meetings → Opps → SAAs → Pipeline → Bookings
const STAGES = [
  { label: 'Pipeline needed',   key: 'pipeline_needed',   weekKey: 'pipeline_per_week',          color: '#1a56db', isPipeline: true },
  { label: 'SAAs needed',       key: 'saas_needed',       weekKey: 'saas_per_week',              color: '#1a56db' },
  { label: 'Opps needed',       key: 'opps_needed',       weekKey: 'opps_per_week',              color: '#0d7c3d' },
  { label: 'Meetings needed',   key: 'meetings_needed',   weekKey: 'meetings_per_week',          color: '#0d7c3d' },
  { label: 'Activities needed', key: 'activities_needed', weekKey: 'activities_per_week',        color: '#f05252' },
  { label: null,                key: 'activities_per_ae', weekKey: 'activities_per_ae_per_week', color: '#f05252', isPerAE: true },
]

function NumInput({ value, onChange, prefix, suffix, className = '' }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {prefix && <span className="text-[var(--tx2)] text-[12px]">{prefix}</span>}
      <input
        type="text"
        value={value}
        onChange={onChange}
        className="w-20 text-[13px] font-[700] bg-transparent border-b border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5 text-right"
      />
      {suffix && <span className="text-[var(--tx2)] text-[12px]">{suffix}</span>}
    </div>
  )
}

export default function ChannelCard({ channelKey, channel, model, weeksRemaining }) {
  const setChannelField = useCoverageStore(s => s.setChannelField)
  const set = (field, val) => setChannelField(channelKey, field, val)

  const fmtWeekly = (v) => {
    if (!v || v <= 0) return '—'
    const r = Math.ceil(v)
    return r >= 1000 ? `${(r / 1000).toFixed(1)}k/wk` : `${r}/wk`
  }
  const fmtPipeWeekly = (v) => {
    if (!v || v <= 0) return '—'
    return `${fmt(Math.round(v / 1000) * 1000)}/wk`
  }

  return (
    <div className="card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--bdr2)] bg-[var(--bg2)]">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[13px] font-[700] text-[var(--tx)]">{channel.label}</span>
          <span className="text-[11px] font-[600] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {channel.allocation}% of gap
          </span>
        </div>
        <div className="text-[18px] font-[700] text-[var(--blue)]">
          {fmt(model.channelGap)}
        </div>
      </div>

      {/* ASP + Win Rate inputs */}
      <div className="flex gap-4 px-4 py-3 border-b border-[var(--bdr2)]">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--tx2)] mb-1">ASP</div>
          <NumInput
            value={channel.asp > 0 ? channel.asp.toLocaleString('en-US') : ''}
            onChange={e => set('asp', parseMoney(e.target.value))}
            prefix="$"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--tx2)] mb-1">Win rate</div>
          <NumInput
            value={channel.win_rate}
            onChange={e => set('win_rate', parseMoney(e.target.value))}
            suffix="%"
          />
        </div>
      </div>

      {/* Funnel chain */}
      <div className="flex-1 px-4 py-3 relative">
        <div className="flex flex-col gap-0">
          {STAGES.map((stage, i) => {
            const raw = model[stage.key]

            // "Activities per AE" — indented derivative row
            if (stage.isPerAE) {
              const actsPerAe   = (model.activities_per_ae || 0).toLocaleString()
              const actsPerAeWk = fmtWeekly(model.activities_per_ae_per_week)
              return (
                <div key={stage.key} className="relative flex items-stretch">
                  <div className="flex flex-col items-center mr-3" style={{ width: 16 }}>
                    <div className="w-px flex-1 mt-0" style={{ backgroundColor: '#f05252', opacity: 0.3, minHeight: 8 }} />
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#f05252', opacity: 0.5 }} />
                  </div>
                  <div className="flex items-start justify-between flex-1 py-1.5 pl-1 min-h-[32px]">
                    <span className="text-[11px] text-[var(--tx2)] italic pt-0.5">
                      ↳ per {channelKey === 'sdr' ? 'SDR' : 'AE'} ({channel.headcount} {channelKey === 'sdr' ? 'SDRs' : 'AEs'})
                    </span>
                    <div className="text-right">
                      <div className="text-[13px] font-[600]" style={{ color: '#f05252' }}>
                        {actsPerAe}
                      </div>
                      <div className="text-[10px] text-[var(--tx2)]">{actsPerAeWk} per {channelKey === 'sdr' ? 'SDR' : 'AE'}</div>
                    </div>
                  </div>
                </div>
              )
            }

            const display = stage.isPipeline
              ? fmt(Math.round((raw || 0) / 1000) * 1000)
              : (raw || 0).toLocaleString()
            const weekly = stage.isPipeline
              ? fmtPipeWeekly(model[stage.weekKey])
              : fmtWeekly(model[stage.weekKey])

            return (
              <div key={stage.key} className="relative flex items-stretch">
                {/* Vertical connector line */}
                <div className="flex flex-col items-center mr-3" style={{ width: 16 }}>
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-3"
                    style={{ backgroundColor: stage.color }}
                  />
                  {i < STAGES.length - 1 && (
                    <div
                      className="w-px flex-1 mt-0.5"
                      style={{ backgroundColor: stage.color, opacity: 0.3, minHeight: 16 }}
                    />
                  )}
                </div>

                {/* Row content */}
                <div className="flex items-start justify-between flex-1 py-2 min-h-[36px]">
                  <span className="text-[12px] text-[var(--tx2)] pt-0.5">{stage.label}</span>
                  <div className="text-right">
                    <div className="text-[14px] font-[700]" style={{ color: stage.color }}>
                      {display}
                    </div>
                    <div className="text-[10px] text-[var(--tx2)]">{weekly}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-[var(--bg2)] border-t border-[var(--bdr2)] text-[10px] text-[var(--tx2)]">
        Based on {weeksRemaining} selling weeks remaining
      </div>
    </div>
  )
}
