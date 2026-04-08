import React from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { useCoverageStore } from '../../store/coverageStore'
import { calcCoverageModel } from '../../lib/coverage'
import { fmt, parseMoney } from '../../lib/fmt'
import ChannelCard from './ChannelCard'
import FunnelRates from './FunnelRates'

// ── Allocation row ─────────────────────────────────────────────
function AllocationRow({ channelKey, channel, disabled }) {
  const setChannelField = useCoverageStore(s => s.setChannelField)
  const toggleChannel   = useCoverageStore(s => s.toggleChannel)

  return (
    <div className={`flex items-center gap-3 py-2 ${disabled ? 'opacity-40' : ''}`}>
      {/* Toggle */}
      <button
        onClick={() => toggleChannel(channelKey)}
        className={`
          w-8 h-4 rounded-full relative transition-colors duration-150 flex-shrink-0
          cursor-pointer border-none
          ${channel.enabled ? 'bg-[var(--blue)]' : 'bg-[var(--bdr2)]'}
        `}
        title={channel.enabled ? 'Disable channel' : 'Enable channel'}
      >
        <span
          className={`
            absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-150
            ${channel.enabled ? 'left-4' : 'left-0.5'}
          `}
        />
      </button>

      {/* Label */}
      <span className="text-[12px] font-[500] text-[var(--tx)] w-28 flex-shrink-0">
        {channel.label}
      </span>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={100}
        value={channel.allocation}
        disabled={!channel.enabled}
        onChange={e => setChannelField(channelKey, 'allocation', Number(e.target.value))}
        className="flex-1 accent-[var(--blue)] cursor-pointer disabled:cursor-not-allowed"
      />

      {/* Number input */}
      <div className="flex items-center gap-0.5 w-16 flex-shrink-0">
        <input
          type="text"
          value={channel.allocation}
          disabled={!channel.enabled}
          onChange={e => setChannelField(channelKey, 'allocation', Math.min(100, Math.max(0, parseMoney(e.target.value))))}
          className="w-10 text-[12px] font-[700] text-right bg-transparent border-b border-[var(--bdr2)] focus:border-[var(--blue)] outline-none disabled:opacity-50"
        />
        <span className="text-[12px] text-[var(--tx2)]">%</span>
      </div>
    </div>
  )
}

// ── Gap summary bar ────────────────────────────────────────────
function GapSummaryBar({ quota, fc_call, weeksRemaining, weeks_total }) {
  const gap     = Math.max(0, quota - fc_call)
  const overage = Math.max(0, fc_call - quota)
  const onTrack = fc_call >= quota

  return (
    <div className="card overflow-hidden mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[var(--bdr2)]">
        {/* Quota */}
        <div className="px-4 py-3">
          <div className="text-[11px] text-[var(--tx2)] mb-0.5">Quota</div>
          <div className="text-[20px] font-[700] text-[var(--tx)]">{fmt(quota)}</div>
        </div>

        {/* Call FC */}
        <div className="px-4 py-3">
          <div className="text-[11px] text-[var(--tx2)] mb-0.5">Call FC</div>
          <div className="text-[20px] font-[700] text-[var(--tx)]">{fmt(fc_call)}</div>
        </div>

        {/* Gap */}
        <div className="px-4 py-3">
          <div className="text-[11px] text-[var(--tx2)] mb-0.5">Gap</div>
          {onTrack ? (
            <>
              <div className="text-[16px] font-[700] text-[#059669]">On track</div>
              <div className="text-[11px] text-[#059669]">+{fmt(overage)} above quota</div>
            </>
          ) : (
            <div className="text-[20px] font-[700] text-[#dc2626]">{fmt(gap)}</div>
          )}
        </div>

        {/* Weeks */}
        <div className="px-4 py-3">
          <div className="text-[11px] text-[var(--tx2)] mb-0.5">Weeks left</div>
          <div className="text-[20px] font-[700] text-[var(--tx)]">
            {weeksRemaining}{' '}
            <span className="text-[14px] font-[500] text-[var(--tx2)]">of {weeks_total}</span>
          </div>
        </div>
      </div>

      {/* On-track note */}
      {onTrack && (
        <div className="px-4 py-2 bg-green-50 border-t border-green-100 text-[11px] text-green-700">
          Call FC exceeds quota by <strong>{fmt(overage)}</strong> — model below shows activity needed to maintain pipeline coverage for the remainder of the quarter.
        </div>
      )}
    </div>
  )
}

// ── Total summary ──────────────────────────────────────────────
function TotalSummary({ model }) {
  if (!model) return null
  const { totalPipelineNeeded, totalActivitiesNeeded, totalPipelinePerWeek, totalActivitiesPerWeek } = model

  return (
    <div className="card overflow-hidden mt-4">
      <div className="px-4 py-2.5 text-[11px] font-[700] uppercase tracking-wider bg-[var(--bg2)] text-[var(--tx2)] border-b border-[var(--bdr2)]">
        Total across all channels
      </div>
      <div className="grid grid-cols-2 divide-x divide-[var(--bdr2)]">
        <div className="px-4 py-3">
          <div className="text-[11px] text-[var(--tx2)] mb-0.5">Total pipeline needed</div>
          <div className="text-[20px] font-[700] text-[var(--blue)]">
            {fmt(Math.round(totalPipelineNeeded / 1000) * 1000)}
          </div>
          <div className="text-[11px] text-[var(--tx2)] mt-0.5">
            {fmt(Math.round(totalPipelinePerWeek / 1000) * 1000)}/wk
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] text-[var(--tx2)] mb-0.5">Activities needed (total)</div>
          <div className="text-[20px] font-[700] text-[#dc2626]">
            {totalActivitiesNeeded.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--tx2)] mt-0.5">
            {totalActivitiesPerWeek.toLocaleString()}/wk
          </div>
        </div>
      </div>
      <div className="px-4 py-2 bg-[var(--bg2)] border-t border-[var(--bdr2)] text-[11px] text-[var(--tx2)]">
        Weekly run rate needed across all channels:{' '}
        <strong className="text-[var(--tx)]">Pipeline: {fmt(Math.round(totalPipelinePerWeek / 1000) * 1000)}/wk</strong>
        {' · '}
        <strong className="text-[var(--tx)]">Activities: {totalActivitiesPerWeek.toLocaleString()}/wk</strong>
      </div>
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────
export default function CoverageView() {
  const quota          = useForecastStore(s => s.quota)
  const derived        = useForecastStore(s => s.derived) || {}
  const fc_call        = derived.fc_call        || 0
  const weeksRemaining = derived.weeks_remaining ?? 0
  const weeks_total    = derived.weeks_total    || 0

  const channels        = useCoverageStore(s => s.channels)
  const setChannelField = useCoverageStore(s => s.setChannelField)

  const channelKeys = Object.keys(channels)

  // Compute model
  const model = calcCoverageModel(channels, quota, fc_call, weeksRemaining)

  // Allocation validation
  const enabledKeys = channelKeys.filter(k => channels[k].enabled)
  const totalAlloc  = enabledKeys.reduce((s, k) => s + channels[k].allocation, 0)
  const allocValid  = totalAlloc === 100

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-[18px] font-[800] text-[var(--tx)] tracking-tight">Pipeline Coverage Model</h1>
        <p className="text-[12px] text-[var(--tx2)] mt-0.5">
          How much pipeline and activity is needed to close the gap to quota
        </p>
      </div>

      {/* Gap summary */}
      <GapSummaryBar
        quota={quota}
        fc_call={fc_call}
        weeksRemaining={weeksRemaining}
        weeks_total={weeks_total}
      />

      {/* Allocation controls */}
      <div className="card overflow-hidden mb-4">
        <div className="px-4 py-2.5 text-[11px] font-[700] uppercase tracking-wider bg-[var(--bg2)] text-[var(--tx2)] border-b border-[var(--bdr2)]">
          Gap allocation by channel
        </div>
        <div className="px-4 py-3">
          {channelKeys.map(k => (
            <AllocationRow
              key={k}
              channelKey={k}
              channel={channels[k]}
              disabled={!channels[k].enabled}
            />
          ))}

          {/* Total + validation */}
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-[var(--bdr2)]">
            <span className="text-[12px] text-[var(--tx2)]">Total</span>
            <span className={`text-[13px] font-[700] ${allocValid ? 'text-[#059669]' : 'text-[#dc2626]'}`}>
              {totalAlloc}%{' '}
              {allocValid
                ? '✓'
                : `— ⚠ must total 100% (currently ${totalAlloc}%)`}
            </span>
          </div>

          {!allocValid && (
            <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Allocations must total 100%. Model will not calculate until balanced.
            </div>
          )}
        </div>
      </div>

      {/* Channel cards */}
      {allocValid ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {enabledKeys.map(k => (
              <ChannelCard
                key={k}
                channelKey={k}
                channel={channels[k]}
                model={model.channels[k] || {}}
                weeksRemaining={weeksRemaining}
              />
            ))}
          </div>

          <TotalSummary model={model} />
        </>
      ) : (
        <div className="card px-4 py-8 text-center text-[13px] text-[var(--tx2)]">
          Fix channel allocations above to see the coverage model.
        </div>
      )}

      {/* Funnel assumptions */}
      <div className="mt-4">
        <FunnelRates />
      </div>
    </div>
  )
}
