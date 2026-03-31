import React, { useState, useRef } from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { useVocabStore } from '../../lib/vocab'
import { fmt, attPct, attVar, cl } from '../../lib/fmt'

const CARDS_META = [
  { id: 'worst_case', color: '#1a56db', dot: '#1a56db' },
  { id: 'call',       color: '#0d7c3d', dot: '#0d7c3d' },
  { id: 'best_case',  color: '#b45309', dot: '#b45309' },
]

const CAT_SEG_COLORS = {
  closed:     '#1a56db', worst_case: '#93c5fd',
  call:       '#6ee7b7', cnc: '#34d399', best_case: '#fcd34d',
}

function QuotaBar({ quota, closed, bk_wc, bk_call, cnc_prorated, bk_bc, fc_best_case }) {
  const vocab = useVocabStore(s => s.vocab)
  if (!quota) return null
  const cap = (v, rem) => Math.max(0, Math.min(rem, (v / quota) * 100))
  const wC      = cap(closed,        100)
  const wCnc    = cap(cnc_prorated,  100 - wC)
  const wBkWc   = cap(bk_wc,         100 - wC - wCnc)
  const wBkCall = cap(bk_call,        100 - wC - wCnc - wBkWc)
  const wBkBc   = cap(bk_bc,          100 - wC - wCnc - wBkWc - wBkCall)
  const pct  = attPct(fc_best_case, quota)
  const col  = attVar(fc_best_case, quota)

  const segs = [
    { w: wC,      bg: CAT_SEG_COLORS.closed },
    { w: wCnc,    bg: CAT_SEG_COLORS.cnc },
    { w: wBkWc,   bg: CAT_SEG_COLORS.worst_case },
    { w: wBkCall, bg: CAT_SEG_COLORS.call },
    { w: wBkBc,   bg: CAT_SEG_COLORS.best_case },
  ]
  const legends = [
    { label: vocab.closed,     bg: CAT_SEG_COLORS.closed },
    { label: 'C&C',            bg: CAT_SEG_COLORS.cnc },
    { label: vocab.worst_case, bg: CAT_SEG_COLORS.worst_case },
    { label: vocab.call,       bg: CAT_SEG_COLORS.call },
    { label: vocab.best_case,  bg: CAT_SEG_COLORS.best_case },
  ]

  return (
    <div className="px-5 pb-3 pt-2 border-t border-[var(--bdr2)] bg-[var(--bg)]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] text-[var(--tx2)]">Quota: {fmt(quota)}</span>
        <div className="flex-1 relative h-2.5 bg-[var(--bg3)] rounded-full overflow-hidden">
          {segs.map((s, i) => (
            <div
              key={i}
              className="absolute top-0 h-full rounded-full transition-all duration-300"
              style={{
                background: s.bg,
                width: `${s.w}%`,
                left: `${segs.slice(0, i).reduce((a, x) => a + x.w, 0)}%`,
              }}
            />
          ))}
        </div>
        <span className="text-[12px] font-[600]" style={{ color: col }}>{pct}%</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {legends.map(l => (
          <span key={l.label} className="flex items-center gap-1 text-[10px] text-[var(--tx2)]">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: l.bg }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function FcCard({ meta, fc, quota, rows, detailRows, expanded, onToggle, toggleEl }) {
  const ap = attPct(fc, quota)
  const ac = attVar(fc, quota)
  const prevFcRef = useRef(fc)
  const [flash, setFlash] = useState(false)

  React.useEffect(() => {
    if (prevFcRef.current !== fc && prevFcRef.current !== 0) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 400)
      return () => clearTimeout(t)
    }
    prevFcRef.current = fc
  }, [fc])

  return (
    <div
      className={`
        flex-1 min-w-0 border-r border-[var(--bdr2)] last:border-r-0
        cursor-pointer select-none transition-colors duration-100
        hover:bg-[var(--bg2)] bg-[var(--bg)]
      `}
      onClick={onToggle}
    >
      <div className="px-5 pt-5 pb-4">
        {/* Tier label */}
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.dot }} />
          <span className="text-[10px] font-[700] uppercase tracking-widest" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </div>

        {/* Amount */}
        <div
          className={`text-[28px] font-[700] leading-none mb-1 ${flash ? 'fc-amount-updated' : ''}`}
          style={{ color: ac }}
        >
          {fmt(fc)}
        </div>

        {/* Attainment */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[20px] font-[600]" style={{ color: ac }}>{ap}%</span>
          <span className="text-[11px] text-[var(--tx2)]">
            {fc >= quota ? 'on track' : `gap: ${fmt(quota - fc)}`}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-[3px] bg-[var(--bg3)] rounded-full mb-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${cl(ap, 0, 100)}%`, background: meta.dot }}
          />
        </div>

        {/* Toggle pill (call card only) */}
        {toggleEl}

        {/* Breakdown rows */}
        <div className="flex flex-col gap-1 mt-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className={`flex justify-between text-[12px] ${r.cnc ? 'border-t border-[var(--bdr2)] pt-1 mt-0.5' : ''}`}
            >
              <span className={r.best_case ? 'text-[#b45309]' : 'text-[var(--tx2)]'}>{r.l}</span>
              <span className={`font-[600] ${r.best_case ? 'text-[#b45309]' : 'text-[var(--tx)]'}`}>{r.v}</span>
            </div>
          ))}
        </div>

        {/* Expand hint */}
        <div className="text-[10px] text-[var(--tx2)] opacity-50 mt-3 flex items-center gap-1">
          {expanded ? '▲ less' : '▼ breakdown'}
        </div>
      </div>

      {/* Detail panel */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-[var(--bdr2)]">
          {detailRows.map((r, i) => (
            <div key={i} className="flex justify-between text-[11px] py-0.5">
              <span className="text-[var(--tx2)]">{r.l}</span>
              <span className="font-[600] text-[var(--tx)]">{r.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ForecastCards({ override = null }) {
  const s = useForecastStore()
  const vocab = useVocabStore(s => s.vocab)
  const d = s.derived || {}
  const { quota } = s

  // When a filter override is active, use its values; otherwise fall back to derived store values
  const eff           = override ?? d
  const closed        = override?.closed        ?? s.closed
  const bk_wc         = eff.bk_wc         ?? 0
  const bk_call       = eff.bk_call       ?? 0
  const bk_bc         = eff.bk_bc         ?? 0
  const cnc_prorated  = eff.cnc_prorated  ?? d.cnc_prorated  ?? 0
  const bk_bc_in_call = eff.bk_bc_in_call ?? d.bk_bc_in_call ?? 0
  const fc_worst_case = eff.fc_worst_case ?? 0
  const fc_call       = eff.fc_call       ?? 0
  const fc_best_case  = eff.fc_best_case  ?? 0
  const pipe_wc       = override?.pipe_worst_case ?? s.pipe_worst_case ?? 0
  const pipe_call_val = override?.pipe_call       ?? s.pipe_call       ?? 0
  const pipe_bc       = override?.pipe_best_case  ?? s.pipe_best_case  ?? 0
  const [expanded, setExpanded] = useState({})

  const toggleCard = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  const allExpanded = CARDS_META.every(m => expanded[m.id])
  const toggleAll = () => {
    const next = !allExpanded
    setExpanded(CARDS_META.reduce((a, m) => ({ ...a, [m.id]: next }), {}))
  }

  const copyImage = async () => {
    const el = document.getElementById('fc-cards-container')
    if (!el) return
    const prev = { ...expanded }
    setExpanded(CARDS_META.reduce((a, m) => ({ ...a, [m.id]: true }), {}))
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, logging: false })
      canvas.toBlob(async blob => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        } catch {
          const a = document.createElement('a')
          a.href = canvas.toDataURL('image/png')
          a.download = `forecast-${s.quarterLabel || 'cards'}.png`
          a.click()
        }
      }, 'image/png')
    } finally {
      setExpanded(prev)
    }
  }

  // Call toggle pill
  const CallToggle = () => (
    <button
      onClick={e => { e.stopPropagation(); s.toggleCallIncludesBestCase() }}
      className={`
        inline-flex items-center gap-1.5 text-[10px] font-[600] px-2 py-1 rounded-full
        border cursor-pointer transition-all duration-150 mt-1 mb-1
        ${s.callIncludesBestCase
          ? 'bg-[#fff7ed] border-[#fed7aa] text-[#b45309]'
          : 'bg-[var(--bg)] border-[var(--bdr2)] text-[var(--tx2)] hover:border-[#d1d5db] hover:text-[var(--tx)]'
        }
      `}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-150"
        style={{ background: s.callIncludesBestCase ? '#b45309' : '#d1d5db' }}
      />
      {s.callIncludesBestCase ? `½ ${vocab.best_case} included` : `+ ½ ${vocab.best_case}?`}
    </button>
  )

  const cardsMeta = CARDS_META.map(m => ({ ...m, label: `${vocab[m.id]} forecast` }))

  const cards = [
    {
      meta: cardsMeta[0],
      fc: fc_worst_case || 0,
      rows: [
        { l: 'Closed QTD',                          v: fmt(closed) },
        { l: `+ ${vocab.worst_case} bookings`,       v: fmt(bk_wc) },
        { l: '+ C&C (prorated)',                     v: fmt(cnc_prorated), cnc: true },
      ],
      detailRows: [
        { l: 'Conversion rate',                      v: `${s.r_worst_case}%` },
        { l: `Open ${vocab.worst_case} pipeline`,    v: fmt(pipe_wc) },
        { l: 'Expected bookings',                    v: fmt(bk_wc) },
        { l: 'C&C prorated',                         v: fmt(cnc_prorated) },
      ],
    },
    {
      meta: cardsMeta[1],
      fc: fc_call || 0,
      rows: [
        { l: `${vocab.worst_case} FC`,               v: fmt(fc_worst_case) },
        { l: `+ ${vocab.call} bookings`,             v: fmt(bk_call) },
        ...(bk_bc_in_call > 0 ? [{ l: `+ ½ ${vocab.best_case} bookings`, v: fmt(bk_bc_in_call), best_case: true }] : []),
      ],
      detailRows: [
        { l: 'Conversion rate',                      v: `${s.r_call}%` },
        { l: `Open ${vocab.call} pipeline`,          v: fmt(pipe_call_val) },
        { l: 'Expected bookings',                    v: fmt(bk_call) },
        ...(bk_bc_in_call > 0 ? [{ l: `+ ½ ${vocab.best_case} bookings`, v: fmt(bk_bc_in_call) }] : []),
      ],
      toggleEl: <CallToggle />,
    },
    {
      meta: cardsMeta[2],
      fc: fc_best_case || 0,
      rows: [
        { l: `${vocab.call} FC`,                                                                                    v: fmt(fc_call) },
        { l: bk_bc_in_call > 0 ? `+ remaining ½ ${vocab.best_case}` : `+ ${vocab.best_case} bookings`,            v: fmt((bk_bc || 0) - (bk_bc_in_call || 0)) },
      ],
      detailRows: [
        { l: 'Conversion rate',                      v: `${s.r_best_case}%` },
        { l: `Open ${vocab.best_case} pipeline`,     v: fmt(pipe_bc) },
        { l: 'Expected bookings',                    v: fmt(bk_bc) },
        ...(bk_bc_in_call > 0 ? [{ l: `(½ already in ${vocab.call})`, v: '' }] : []),
      ],
    },
  ]

  return (
    <div>
      {/* Cards row */}
      <div
        id="fc-cards-container"
        className="flex border border-[var(--bdr2)] rounded-xl overflow-hidden bg-[var(--bg)]"
      >
        {cards.map((card) => (
          <FcCard
            key={card.meta.id}
            meta={card.meta}
            fc={card.fc}
            quota={quota}
            rows={card.rows}
            detailRows={card.detailRows}
            expanded={!!expanded[card.meta.id]}
            onToggle={() => toggleCard(card.meta.id)}
            toggleEl={card.toggleEl}
          />
        ))}
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 px-4 py-2 border border-t-0 border-[var(--bdr2)] rounded-b-xl bg-[var(--bg)]">
        <button onClick={copyImage} className="btn text-[11px]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="7" height="7" rx="1"/>
            <path d="M1 8V2a1 1 0 0 1 1-1h6"/>
          </svg>
          Copy image
        </button>
        <button onClick={toggleAll} className="text-[11px] text-[var(--tx2)] hover:text-[var(--tx)] cursor-pointer border-none bg-transparent p-1">
          {allExpanded ? '▲ collapse all' : '▼ expand all'}
        </button>
        <span className="ml-auto text-[10px] text-[var(--tx2)] opacity-50">
          Click a card to expand · click again to collapse
        </span>
      </div>

      {/* Quota bar */}
      <QuotaBar
        quota={quota}
        closed={closed}
        bk_wc={bk_wc || 0}
        bk_call={bk_call || 0}
        cnc_prorated={cnc_prorated || 0}
        bk_bc={bk_bc || 0}
        fc_best_case={fc_best_case || 0}
      />
    </div>
  )
}
