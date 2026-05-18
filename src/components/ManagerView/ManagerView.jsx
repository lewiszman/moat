import React, { useState, useMemo } from 'react'
import { useForecastStore, useQuarterStore, useInspectorStore } from '../../store/forecastStore'
import { useVocabStore } from '../../lib/vocab'
import { calcMonthlyBreakdown, getQuarterMonths } from '../../lib/import'
import { getEffectiveFc } from '../../lib/forecast'
import { fmt, attPct, attVar, parseMoney } from '../../lib/fmt'
import ImportWizard from '../shared/ImportWizard'
import ShareModal from '../shared/ShareModal'
import UnmappedBanner from '../shared/UnmappedBanner'
import WowTracker from './WowTracker'
import AEFilter from './AEFilter'
import RepPanel from './RepPanel'
import PdfRoot from './PdfRoot'

// ── Modal wrapper ──────────────────────────────────────────────
function ImportModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg)] rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--bdr2)]">
          <span className="text-[14px] font-[700] text-[var(--tx)]">Import pipeline data</span>
          <button onClick={onClose} className="text-[var(--tx2)] hover:text-[var(--tx)] text-xl leading-none border-none bg-transparent cursor-pointer">×</button>
        </div>
        <ImportWizard onClose={onClose} />
      </div>
    </div>
  )
}

// ── Shared number input ────────────────────────────────────────
function NumInput({ value, onChange, prefix, width = 'w-28' }) {
  const [raw, setRaw] = useState(null)
  const display = raw !== null ? raw : (value > 0 ? value.toLocaleString('en-US') : '')
  return (
    <div className="flex items-center gap-1">
      {prefix && <span className="text-[var(--tx2)] text-[13px]">{prefix}</span>}
      <input type="text"
        className={`${width} text-[15px] font-[700] text-[var(--tx)] bg-transparent border-b border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5`}
        value={display}
        onFocus={() => setRaw(value > 0 ? String(Math.round(value)) : '')}
        onChange={e => setRaw(e.target.value)}
        onBlur={() => { onChange(parseMoney(raw ?? '')); setRaw(null) }}
      />
    </div>
  )
}

// ── Collapsible section ────────────────────────────────────────
function Section({ title, subtitle, children, defaultOpen = false, badge }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[var(--bdr2)] rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-[var(--bg)] hover:bg-[var(--bg2)] transition-colors text-left cursor-pointer border-none">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`flex-shrink-0 text-[var(--tx2)] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
          <path d="M3 1.5l4 4-4 4"/>
        </svg>
        <span className="text-[12px] font-[700] text-[var(--tx)]">{title}</span>
        {badge && <span className="text-[9px] font-[700] uppercase tracking-wide px-1.5 py-px rounded-full bg-[var(--blue)] text-white">{badge}</span>}
        {subtitle && <span className="text-[11px] text-[var(--tx2)] ml-1">{subtitle}</span>}
      </button>
      {open && <div className="border-t border-[var(--bdr2)]">{children}</div>}
    </div>
  )
}

// ── Forecast summary ───────────────────────────────────────────
function ForecastSummary({ monthData }) {
  const s     = useForecastStore()
  const vocab = useVocabStore(v => v.vocab)
  const d     = s.derived || {}
  const fcOv  = s.fcOverrides || {}
  const eff   = getEffectiveFc(d, fcOv)

  const closed  = monthData ? monthData.closed   : (s.closed || 0)
  const fc_wc   = monthData ? monthData.fc_wc    : (eff.fc_worst_case || 0)
  const fc_call = monthData ? monthData.fc_call  : (eff.fc_call       || 0)
  const fc_bc   = monthData ? monthData.fc_bc    : (eff.fc_best_case  || 0)
  const quota   = s.quota || 0
  const callOverride = !monthData && fcOv.call && fcOv.call > 0 ? fcOv.call : null
  const displayCall  = callOverride ?? fc_call
  const pct = attPct(displayCall, quota)
  const col = attVar(displayCall, quota)
  const gap = Math.max(0, quota - displayCall)

  const segs = quota > 0 ? (() => {
    const cap = (v, rem) => Math.max(0, Math.min(rem, (v / quota) * 100))
    const wC    = cap(closed, 100)
    const wWc   = cap(fc_wc - closed, 100 - wC)
    const wCall = cap(fc_call - fc_wc, 100 - wC - wWc)
    const wBc   = cap(fc_bc - fc_call, 100 - wC - wWc - wCall)
    return [
      { w: wC,    bg: '#059669' },
      { w: wWc,   bg: '#93c5fd' },
      { w: wCall, bg: '#6ee7b7' },
      { w: wBc,   bg: '#fcd34d' },
    ]
  })() : []

  const tiers = [
    { label: 'Closed',         val: closed,      color: '#059669' },
    { label: vocab.worst_case, val: fc_wc,        color: '#1a56db' },
    { label: vocab.call,       val: displayCall,  color: '#0d7c3d', override: callOverride },
    { label: vocab.best_case,  val: fc_bc,        color: '#b45309' },
  ]

  return (
    <div className="card overflow-hidden">
      {/* Quota + attainment */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-3">
        <div className="flex-shrink-0 flex items-center gap-2">
          <span className="text-[11px] text-[var(--tx2)]">Quota</span>
          <NumInput value={quota} onChange={v => s.updateInput('quota', v)} prefix="$" width="w-24" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-2 bg-[var(--bg3)] rounded-full overflow-hidden mb-1">
            {segs.map((seg, i) => (
              <div key={i} className="absolute top-0 h-full"
                style={{ background: seg.bg, width: `${seg.w}%`, left: `${segs.slice(0, i).reduce((a, x) => a + x.w, 0)}%` }} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--tx2)]">
              {gap > 0 ? `Gap: ${fmt(gap)}` : '✓ On track'}
            </span>
            <span className="text-[12px] font-[700]" style={{ color: col }}>{pct}% attainment</span>
          </div>
        </div>
      </div>

      {/* Tier blocks */}
      <div className="grid grid-cols-4 divide-x divide-[var(--bdr2)] border-t border-[var(--bdr2)]">
        {tiers.map(t => (
          <div key={t.label} className="px-4 py-3">
            <div className="text-[10px] font-[600] uppercase tracking-wider mb-1.5" style={{ color: t.color }}>
              {t.label}
            </div>
            <div className="text-[22px] font-[700] leading-none" style={{ color: t.color }}>
              {fmt(t.val)}
            </div>
            {quota > 0 && (
              <div className="text-[10px] text-[var(--tx2)] mt-1">{attPct(t.val, quota)}% of quota</div>
            )}
            {t.override && (
              <div className="text-[9px] text-amber-500 mt-0.5">override active</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Triangulation block ────────────────────────────────────────
function TriangulationBlock({ activeMonth, monthBreakdown }) {
  const s     = useForecastStore()
  const vocab = useVocabStore(v => v.vocab)
  const d     = s.derived || {}

  const isMonthView = activeMonth !== 'quarter'
  const monthIdx    = { m1: 0, m2: 1, m3: 2 }[activeMonth]
  const mData       = isMonthView && monthBreakdown ? monthBreakdown[monthIdx] : null

  // Bottom-up: raw open pipeline by category (from SFDC import or manual entry)
  const bu_wc   = mData ? (mData.worst_case || 0) : (s.pipe_worst_case || 0)
  const bu_call = mData ? (mData.call       || 0) : (s.pipe_call       || 0)
  const bu_bc   = mData ? (mData.best_case  || 0) : (s.pipe_best_case  || 0)
  const bu_pipe = mData ? (mData.pipeline   || 0) : (s.pipe_pipe       || 0)
  const bu_total = bu_wc + bu_call + bu_bc + bu_pipe

  // Weighted expected: apply conversion rates to each bucket
  const we_wc   = bu_wc   * (s.r_worst_case / 100)
  const we_call = bu_call * (s.r_call       / 100)
  const we_bc   = bu_bc   * (s.r_best_case  / 100)
  const we_pipe = bu_pipe * (s.r_pipe       / 100)
  const we_total = we_wc + we_call + we_bc + we_pipe

  // IQP (in-quarter pipeline / C&C)
  const iqp_pipe     = s.cnc_opps * s.cnc_asp
  const iqp_prorated = d.cnc_prorated || 0

  // Cumulative tier forecasts (match ForecastSummary exactly):
  //   WC forecast  = Closed + WC bookings + IQP
  //   Forecast     = WC forecast + Forecast bookings
  //   Best Case    = Forecast + BC bookings
  const closed       = s.closed || 0
  const fc_wc_calc   = closed + we_wc + iqp_prorated
  const fc_call_calc = fc_wc_calc + we_call
  const fc_bc_calc   = fc_call_calc + we_bc

  // Pipeline coverage: does weighted pipeline + IQP cover the remaining quota gap?
  // >1.0 = covered, <1.0 = gap
  const quota         = s.quota || 0
  const remaining_gap = Math.max(1, quota - closed)
  const coverage      = (we_total + iqp_prorated) / remaining_gap
  const coverageColor = coverage >= 1.2 ? '#059669' : coverage >= 1.0 ? '#d97706' : '#dc2626'
  const coverageLabel = coverage >= 1.2 ? 'Strong' : coverage >= 1.0 ? 'Tight' : 'Gap'

  const hasData = bu_total > 0

  const rows = [
    { key: 'worst_case', label: vocab.worst_case, bu: bu_wc,   we: we_wc,   rate: s.r_worst_case, color: '#1a56db' },
    { key: 'call',       label: vocab.call,       bu: bu_call, we: we_call, rate: s.r_call,       color: '#0d7c3d' },
    { key: 'best_case',  label: vocab.best_case,  bu: bu_bc,   we: we_bc,   rate: s.r_best_case,  color: '#b45309' },
    { key: 'pipeline',   label: vocab.pipeline,   bu: bu_pipe, we: we_pipe, rate: s.r_pipe,       color: '#6b7280' },
  ]

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--bdr2)] bg-[var(--bg2)]">
        <span className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">Triangulation</span>
        {hasData && quota > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--tx2)]">Pipeline coverage</span>
            <span className="text-[11px] font-[700]" style={{ color: coverageColor }}>
              {coverage.toFixed(2)}× — {coverageLabel}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-[var(--bdr2)]">
        {/* Column 1: Bottom-Up */}
        <div className="px-4 py-3">
          <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-0.5">Bottom-Up</div>
          <div className="text-[9px] text-[var(--tx2)] mb-3">Open pipeline by category</div>
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.key} className="flex justify-between items-center">
                <span className="text-[11px] text-[var(--tx2)]">{r.label}</span>
                <span className="text-[12px] font-[600]" style={{ color: r.bu > 0 ? r.color : 'var(--tx2)' }}>
                  {r.bu > 0 ? fmt(r.bu) : '—'}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 border-t border-[var(--bdr2)]">
              <span className="text-[11px] font-[700] text-[var(--tx)]">Total open</span>
              <span className="text-[12px] font-[700] text-[var(--tx)]">{bu_total > 0 ? fmt(bu_total) : '—'}</span>
            </div>
          </div>
        </div>

        {/* Column 2: Weighted Expected */}
        <div className="px-4 py-3">
          <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-0.5">Weighted Expected</div>
          <div className="text-[9px] text-[var(--tx2)] mb-3">Expected bookings from pipeline</div>
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.key} className="flex justify-between items-center">
                <span className="text-[11px] text-[var(--tx2)]">{r.label} · {r.rate}%</span>
                <span className="text-[12px] font-[600]" style={{ color: r.we > 0 ? r.color : 'var(--tx2)' }}>
                  {r.we > 0 ? fmt(r.we) : '—'}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 border-t border-[var(--bdr2)]">
              <span className="text-[11px] font-[700] text-[var(--tx)]">Total expected</span>
              <span className="text-[12px] font-[700] text-[var(--tx)]">{we_total > 0 ? fmt(we_total) : '—'}</span>
            </div>
          </div>
        </div>

        {/* Column 3: IQP */}
        <div className="px-4 py-3">
          <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-0.5">IQP</div>
          <div className="text-[9px] text-[var(--tx2)] mb-3">In-quarter pipeline (C&amp;C)</div>
          <div className="space-y-3">
            <div>
              <div className="text-[9px] text-[var(--tx2)] mb-0.5">{s.cnc_opps} opps × {fmt(s.cnc_asp)} ASP</div>
              <div className="text-[12px] font-[600] text-[var(--blue)]">{fmt(iqp_pipe)} pipeline</div>
            </div>
            <div>
              <div className="text-[9px] text-[var(--tx2)] mb-0.5">{s.r_cnc}% IQP rate</div>
              <div className="text-[12px] font-[600] text-[var(--tx)]">{fmt(iqp_pipe * (s.r_cnc / 100))} full-quarter</div>
            </div>
            <div className="border-t border-[var(--bdr2)] pt-2">
              <div className="text-[9px] text-[var(--tx2)] mb-0.5">
                {d.weeks_remaining ?? 0}/{d.weeks_total || 0} wks remaining · prorated
              </div>
              <div className="text-[18px] font-[700] text-[var(--green)]">{fmt(iqp_prorated)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: tier forecasts that match ForecastSummary exactly */}
      {hasData ? (
        <div className="px-4 py-3 border-t border-[var(--bdr2)] bg-[var(--bg2)]">
          <div className="grid grid-cols-3 divide-x divide-[var(--bdr2)]">
            {[
              { label: `${vocab.worst_case} forecast`, val: fc_wc_calc,   color: '#1a56db',
                sub: `Closed + WC bookings + IQP` },
              { label: `${vocab.call} forecast`,       val: fc_call_calc, color: '#0d7c3d',
                sub: `WC forecast + ${vocab.call} bookings` },
              { label: `${vocab.best_case} forecast`,  val: fc_bc_calc,   color: '#b45309',
                sub: `${vocab.call} + ${vocab.best_case} bookings` },
            ].map(t => (
              <div key={t.label} className="px-3 first:pl-0 last:pr-0">
                <div className="text-[9px] font-[600] uppercase tracking-wide mb-0.5" style={{ color: t.color }}>{t.label}</div>
                <div className="text-[15px] font-[700]" style={{ color: t.color }}>{fmt(t.val)}</div>
                {quota > 0 && (
                  <div className="text-[10px] text-[var(--tx2)]">{attPct(t.val, quota)}% of quota</div>
                )}
                <div className="text-[9px] text-[var(--tx2)] mt-0.5 opacity-70">{t.sub}</div>
              </div>
            ))}
          </div>
          {quota > 0 && coverage < 1.0 && (
            <div className="mt-2.5 text-[10px] px-2 py-1 rounded border inline-flex items-center gap-1.5"
              style={{ color: coverageColor, borderColor: coverageColor + '55', background: coverageColor + '11' }}>
              ⚠ Weighted pipeline + IQP ({fmt(we_total + iqp_prorated)}) covers only {(coverage * 100).toFixed(0)}% of the remaining quota gap ({fmt(remaining_gap)}) — need {fmt(remaining_gap - we_total - iqp_prorated)} more
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-4 text-center text-[12px] text-[var(--tx2)]">
          Import pipeline data or enter values in "Pipeline inputs" to see triangulation
        </div>
      )}
    </div>
  )
}

// ── Rate assumptions ───────────────────────────────────────────
function RateAssumptions() {
  const s     = useForecastStore()
  const vocab = useVocabStore(v => v.vocab)

  const rows = [
    { label: vocab.worst_case, key: 'r_worst_case', color: '#1a56db', pipeKey: 'pipe_worst_case', min: 70, max: 100 },
    { label: vocab.call,       key: 'r_call',       color: '#0d7c3d', pipeKey: 'pipe_call',       min: 50, max: 95  },
    { label: vocab.best_case,  key: 'r_best_case',  color: '#b45309', pipeKey: 'pipe_best_case',  min: 5,  max: 60  },
    { label: vocab.pipeline,   key: 'r_pipe',       color: '#6b7280', pipeKey: 'pipe_pipe',       min: 2,  max: 40  },
  ]

  return (
    <div className="p-4 space-y-4">
      {/* Quota + closed */}
      <div className="flex gap-8 pb-4 border-b border-[var(--bdr2)]">
        <div>
          <div className="text-[10px] text-[var(--tx2)] mb-1">Quarterly quota</div>
          <NumInput value={s.quota} onChange={v => s.updateInput('quota', v)} prefix="$" />
        </div>
        <div>
          <div className="text-[10px] text-[var(--tx2)] mb-1">Closed QTD</div>
          <NumInput value={s.closed} onChange={v => s.updateInput('closed', v)} prefix="$" />
        </div>
      </div>

      {/* Pipeline + rate table */}
      <div>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] pb-2">
          <span>Category</span>
          <span className="w-28">Pipeline</span>
          <span className="w-44">Conversion rate</span>
          <span className="w-20 text-right">Expected</span>
        </div>
        {rows.map(row => {
          const rateVal    = s[row.key] || 0
          const pipeVal    = s[row.pipeKey] || 0
          const derivedKey = { r_worst_case: 'bk_wc', r_call: 'bk_call', r_best_case: 'bk_bc', r_pipe: 'bk_pp' }[row.key]
          const expected   = s.derived?.[derivedKey] || 0
          return (
            <div key={row.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center py-2 border-b border-[var(--bdr2)] last:border-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                <span className="text-[12px] text-[var(--tx)]">{row.label}</span>
              </div>
              <div className="w-28">
                <NumInput value={pipeVal} onChange={v => s.updateInput(row.pipeKey, v)} prefix="$" width="w-20" />
              </div>
              <div className="flex items-center gap-2 w-44">
                <input type="range" min={row.min} max={row.max} step={1} value={rateVal}
                  onChange={e => s.updateInput(row.key, +e.target.value)}
                  className="w-28 accent-[var(--blue)]" />
                <span className="text-[12px] font-[600] w-10" style={{ color: row.color }}>{rateVal}%</span>
              </div>
              <span className="text-[12px] font-[600] text-right w-20">{fmt(expected)}</span>
            </div>
          )
        })}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center py-2 bg-[var(--bg2)] -mx-4 px-4 mt-1">
          <span className="text-[11px] font-[700] text-[var(--tx)]">Total</span>
          <span className="text-[12px] font-[700] w-28 text-[var(--tx)]">
            {fmt((s.pipe_worst_case||0)+(s.pipe_call||0)+(s.pipe_best_case||0)+(s.pipe_pipe||0))}
          </span>
          <span className="w-44" />
          <span className="text-[12px] font-[700] w-20 text-right">
            {fmt((s.derived?.bk_wc||0)+(s.derived?.bk_call||0)+(s.derived?.bk_bc||0)+(s.derived?.bk_pp||0))}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── IQP detail ─────────────────────────────────────────────────
function IQPDetail() {
  const s    = useForecastStore()
  const d    = s.derived || {}
  const iqp_pipe     = d.cnc_pipe        || 0
  const iqp_prorated = d.cnc_prorated    || 0
  const weeks_total     = d.weeks_total     || 1
  const weeks_remaining = d.weeks_remaining ?? weeks_total
  const prorPct = ((d.prorationFactor ?? 1) * 100).toFixed(0)

  return (
    <div className="p-4">
      <div className="flex gap-8 mb-4">
        <div>
          <label className="text-[10px] text-[var(--tx2)] mb-1 block">Qualified opps to create</label>
          <input type="text" value={s.cnc_opps}
            onChange={e => s.updateInput('cnc_opps', parseMoney(e.target.value))}
            className="w-16 text-[16px] font-[700] bg-transparent border-b-2 border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-1" />
        </div>
        <div>
          <label className="text-[10px] text-[var(--tx2)] mb-1 block">ASP</label>
          <div className="flex items-center gap-1">
            <span className="text-[var(--tx2)]">$</span>
            <input type="text"
              value={s.cnc_asp > 0 ? s.cnc_asp.toLocaleString('en-US') : ''}
              onChange={e => s.updateInput('cnc_asp', parseMoney(e.target.value))}
              className="w-28 text-[16px] font-[700] bg-transparent border-b-2 border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-1" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-[var(--tx2)] mb-1 block">IQP conversion rate</label>
          <div className="flex items-center gap-2">
            <input type="range" min={5} max={50} step={1} value={s.r_cnc}
              onChange={e => s.updateInput('r_cnc', +e.target.value)} className="w-24 accent-[var(--blue)]" />
            <span className="text-[14px] font-[700] text-[var(--tx)]">{s.r_cnc}%</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-[var(--bdr2)] border border-[var(--bdr2)] rounded-lg overflow-hidden text-center">
        <div className="px-4 py-3">
          <div className="text-[10px] text-[var(--tx2)] mb-1">Pipeline created</div>
          <div className="text-[16px] font-[700] text-[var(--blue)]">{fmt(iqp_pipe)}</div>
          <div className="text-[10px] text-[var(--tx2)]">{Math.round(s.cnc_opps)} × {fmt(s.cnc_asp)}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] text-[var(--tx2)] mb-1">Selling weeks left</div>
          <div className="text-[16px] font-[700] text-[var(--tx)]">{weeks_remaining} <span className="text-[12px] font-[400]">of {weeks_total}</span></div>
          <div className="text-[10px] text-[var(--tx2)]">{prorPct}% proration</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] text-[var(--tx2)] mb-1">IQP prorated</div>
          <div className="text-[16px] font-[700] text-[var(--green)]">{fmt(iqp_prorated)}</div>
          <div className="text-[10px] text-[var(--tx2)]">included in WC forecast</div>
        </div>
      </div>
    </div>
  )
}

// ── Manager override ───────────────────────────────────────────
function OverrideInput({ override, onSet, onClear }) {
  const [val, setVal] = useState(override != null && override > 0 ? String(override) : '')
  const hasOv = override != null && override > 0
  React.useEffect(() => { setVal(override != null && override > 0 ? String(override) : '') }, [override])
  const commit = () => {
    const v = parseMoney(val)
    if (v > 0) onSet(v)
    else { setVal(''); onClear() }
  }
  return (
    <div className="flex items-center gap-2 flex-1">
      <span className="text-[var(--tx2)] text-[12px]">$</span>
      <input type="text" value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(''); onClear() } }}
        placeholder="Enter override…"
        className={`flex-1 text-[13px] font-[600] px-2 py-1 rounded border bg-transparent text-[var(--tx)] outline-none
          ${hasOv ? 'border-amber-400 text-amber-700 dark:text-amber-400' : 'border-[var(--bdr2)] focus:border-[var(--blue)]'}`}
      />
      {hasOv && (
        <button onClick={() => { setVal(''); onClear() }}
          className="text-amber-500 hover:text-amber-700 border-none bg-transparent cursor-pointer text-[14px] leading-none">✕</button>
      )}
    </div>
  )
}

function ManagerOverride() {
  const s     = useForecastStore()
  const vocab = useVocabStore(v => v.vocab)
  const d     = s.derived || {}
  const fcOv  = s.fcOverrides || {}
  const setFcOverride       = useForecastStore(st => st.setFcOverride)
  const clearFcOverride     = useForecastStore(st => st.clearFcOverride)
  const clearAllFcOverrides = useForecastStore(st => st.clearAllFcOverrides)
  const anyOverride         = Object.values(fcOv).some(v => v !== null)

  const tiers = [
    { key: 'worst_case', label: vocab.worst_case, model: d.fc_worst_case || 0, color: '#1a56db' },
    { key: 'call',       label: vocab.call,       model: d.fc_call       || 0, color: '#0d7c3d' },
    { key: 'best_case',  label: vocab.best_case,  model: d.fc_best_case  || 0, color: '#b45309' },
  ]

  return (
    <div className="p-4">
      <p className="text-[11px] text-[var(--tx2)] mb-4">
        Override model values to submit your call to Clari. Overrides appear in amber throughout the app.
      </p>
      <div className="space-y-3">
        {tiers.map(t => (
          <div key={t.key} className="flex items-center gap-4">
            <div className="w-24 flex-shrink-0">
              <div className="text-[10px] font-[600] uppercase tracking-wide mb-0.5" style={{ color: t.color }}>{t.label}</div>
              <div className="text-[11px] text-[var(--tx2)]">Model: {fmt(t.model)}</div>
            </div>
            <OverrideInput
              override={fcOv[t.key]}
              onSet={v => setFcOverride(t.key, v)}
              onClear={() => clearFcOverride(t.key)}
            />
          </div>
        ))}
      </div>
      {anyOverride && (
        <button onClick={clearAllFcOverrides}
          className="mt-4 text-[11px] text-amber-600 underline cursor-pointer border-none bg-transparent p-0">
          Clear all overrides
        </button>
      )}
    </div>
  )
}

// ── Main ManagerView ───────────────────────────────────────────
export default function ManagerView() {
  const s                = useForecastStore()
  const qs               = useQuarterStore()
  const importedData     = useForecastStore(st => st.importedData)
  const scopeSelected    = useForecastStore(st => st.scopeSelected)
  const setScopeSelected = useForecastStore(st => st.setScopeSelected)
  const defaultSfdcUrl   = useInspectorStore(st => st.defaultSfdcUrl) || ''
  const sfdcUrl          = s.sfdcUrl || defaultSfdcUrl
  const fyStart          = s.fyStartMonth || 1
  const isNextQ          = qs.activeQuarter === 'q1'

  const [importOpen,  setImportOpen]  = useState(false)
  const [shareOpen,   setShareOpen]   = useState(false)
  const [activeMonth, setActiveMonth] = useState('quarter')

  const sfdcEnabled = (() => {
    if (!sfdcUrl) return false
    try { return new URL(sfdcUrl).protocol === 'https:' } catch { return false }
  })()

  const monthBreakdown = useMemo(
    () => importedData?.length ? calcMonthlyBreakdown(importedData, fyStart, isNextQ) : null,
    [importedData, fyStart, isNextQ]
  )

  const quarterMonths = useMemo(() => getQuarterMonths(fyStart, isNextQ), [fyStart, isNextQ])

  // Month-scoped forecast data for ForecastSummary
  const activeMonthData = useMemo(() => {
    if (activeMonth === 'quarter' || !monthBreakdown) return null
    const idx = { m1: 0, m2: 1, m3: 2 }[activeMonth]
    const m   = monthBreakdown[idx]
    if (!m) return null
    const bk_wc   = m.worst_case * (s.r_worst_case / 100)
    const bk_call = m.call       * (s.r_call       / 100)
    const bk_bc   = m.best_case  * (s.r_best_case  / 100)
    return {
      closed:   m.closed,
      fc_wc:    m.closed + bk_wc,
      fc_call:  m.closed + bk_wc + bk_call,
      fc_bc:    m.closed + bk_wc + bk_call + bk_bc,
    }
  }, [activeMonth, monthBreakdown, s.r_worst_case, s.r_call, s.r_best_case])

  const selectedAEs = scopeSelected?.size > 0 ? [...scopeSelected].sort() : []

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-[var(--bg2)] border border-[var(--bdr2)] rounded-lg p-0.5 gap-0.5">
          {[{ key: 'cq', label: 'CQ' }, { key: 'q1', label: 'Q+1' }].map(({ key, label }) => (
            <button key={key} onClick={() => qs.setActiveQuarter(key)}
              className={`text-[11px] font-[700] px-2.5 py-1 rounded-md transition-colors border-none cursor-pointer ${
                qs.activeQuarter === key ? 'bg-[var(--blue)] text-white' : 'bg-transparent text-[var(--tx2)] hover:text-[var(--tx)]'
              }`}>{label}</button>
          ))}
        </div>

        <input className="text-[13px] font-[600] bg-transparent border-b border-transparent hover:border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5 w-32"
          placeholder="Your name" value={s.managerName} onChange={e => s.setField('managerName', e.target.value)} />
        <span className="text-[var(--tx2)]">·</span>
        <input className="text-[13px] font-[600] bg-transparent border-b border-transparent hover:border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5 w-36"
          placeholder="Team / region" value={s.managerTeam} onChange={e => s.setField('managerTeam', e.target.value)} />
        <span className="text-[var(--tx2)]">·</span>
        <input className="text-[13px] font-[600] bg-transparent border-b border-transparent hover:border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5 w-20"
          placeholder="Q2 FY26" value={s.quarterLabel} onChange={e => s.setField('quarterLabel', e.target.value)} />

        <div className="ml-auto flex items-center gap-2">
          <AEFilter />
          <button onClick={() => setShareOpen(true)} className="btn text-[11px] flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9.5" cy="2.5" r="1.5"/><circle cx="2.5" cy="6" r="1.5"/><circle cx="9.5" cy="9.5" r="1.5"/>
              <line x1="4" y1="6.8" x2="8" y2="9"/><line x1="4" y1="5.2" x2="8" y2="3"/>
            </svg>
            Share
          </button>
          {sfdcEnabled && (
            <button onClick={() => window.open(sfdcUrl, '_blank', 'noopener,noreferrer')}
              className="btn text-[11px] flex items-center gap-1.5" title="Open in Salesforce">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 1H1.5A.5.5 0 0 0 1 1.5v8A.5.5 0 0 0 1.5 10h8a.5.5 0 0 0 .5-.5V6.5"/>
                <path d="M6.5 1H10v3.5"/><line x1="10" y1="1" x2="5" y2="6"/>
              </svg>
              SFDC
            </button>
          )}
          <button onClick={() => setImportOpen(true)} className="btn text-[11px] flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 1v7M3 5l3 3 3-3M1 10h10"/>
            </svg>
            {s.importMeta ? 'Re-import' : 'Import CSV'}
          </button>
        </div>
      </div>

      <UnmappedBanner />

      {/* ── Month tabs ── */}
      <div className="flex items-center gap-1.5">
        <button onClick={() => setActiveMonth('quarter')}
          className={`text-[11px] font-[700] px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
            activeMonth === 'quarter'
              ? 'bg-[var(--blue)] border-[var(--blue)] text-white'
              : 'bg-transparent border-[var(--bdr2)] text-[var(--tx2)] hover:text-[var(--tx)]'
          }`}>
          Quarter
        </button>
        {quarterMonths.map((m, i) => {
          const key = `m${i + 1}`
          return (
            <button key={key} onClick={() => setActiveMonth(key)}
              className={`text-[11px] font-[700] px-3 py-1.5 rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeMonth === key
                  ? 'bg-[var(--blue)] border-[var(--blue)] text-white'
                  : 'bg-transparent border-[var(--bdr2)] text-[var(--tx2)] hover:text-[var(--tx)]'
              }`}>
              {m.short}
              {m.isCurrent && (
                <span className={`w-1.5 h-1.5 rounded-full ${activeMonth === key ? 'bg-white/70' : 'bg-[var(--blue)]'}`} />
              )}
            </button>
          )
        })}
        {activeMonth !== 'quarter' && monthBreakdown && (
          <span className="ml-2 text-[11px] text-[var(--tx2)]">
            {quarterMonths[{ m1: 0, m2: 1, m3: 2 }[activeMonth]]?.label} view
          </span>
        )}
        {activeMonth !== 'quarter' && !importedData && (
          <span className="ml-2 text-[11px] text-amber-500">Import data to see monthly breakdown</span>
        )}
      </div>

      {/* AE filter badge */}
      {selectedAEs.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[var(--blue)] font-[500]">
            Filtered: {selectedAEs.length === 1 ? selectedAEs[0] : `${selectedAEs[0]} +${selectedAEs.length - 1} more`}
            <button onClick={() => setScopeSelected(null)}
              className="ml-0.5 opacity-60 hover:opacity-100 leading-none border-none bg-transparent cursor-pointer p-0 text-[12px]">✕</button>
          </span>
        </div>
      )}

      {/* ── Forecast summary ── */}
      <ForecastSummary monthData={activeMonthData} />

      {/* ── Triangulation ── */}
      <TriangulationBlock activeMonth={activeMonth} monthBreakdown={monthBreakdown} />

      {/* ── Collapsible drill-downs ── */}
      <Section title="Pipeline inputs & rate assumptions">
        <RateAssumptions />
      </Section>

      <Section title="Manager override" subtitle="· Clari submission">
        <ManagerOverride />
      </Section>

      <Section title="Week-over-week tracker">
        <div className="p-1"><WowTracker /></div>
      </Section>

      <Section title="IQP detail" subtitle="· in-quarter pipeline">
        <IQPDetail />
      </Section>

      {selectedAEs.length > 0 && (
        <Section
          title={`Rep detail — ${selectedAEs.length === 1 ? selectedAEs[0] : `${selectedAEs.length} AEs`}`}
          defaultOpen>
          <div className="p-4">
            <RepPanel selectedAEs={selectedAEs} importedData={importedData} />
          </div>
        </Section>
      )}

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {shareOpen  && <ShareModal  onClose={() => setShareOpen(false)} />}
      <PdfRoot />
    </div>
  )
}
