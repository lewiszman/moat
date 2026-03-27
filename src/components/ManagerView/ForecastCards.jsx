import React, { useState, useRef } from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { fmt, attPct, attVar, cl } from '../../lib/fmt'

const CARDS_META = [
  { id: 'commit',  label: 'Commit forecast',   color: '#1a56db', dot: '#1a56db' },
  { id: 'prob',    label: 'Probable forecast',  color: '#0d7c3d', dot: '#0d7c3d' },
  { id: 'up',      label: 'Upside forecast',    color: '#b45309', dot: '#b45309' },
]

const CAT_SEG_COLORS = {
  closed: '#1a56db', commit: '#93c5fd',
  probable: '#6ee7b7', cnc: '#34d399', upside: '#fcd34d',
}

function QuotaBar({ quota, closed, bk_c, bk_p, cnc_rev, bk_u, fc_up }) {
  if (!quota) return null
  const cap = (v, rem) => Math.max(0, Math.min(rem, (v / quota) * 100))
  const wC   = cap(closed,  100)
  const wBkC = cap(bk_c,    100 - wC)
  const wBkP = cap(bk_p,    100 - wC - wBkC)
  const wCnc = cap(cnc_rev, 100 - wC - wBkC - wBkP)
  const wBkU = cap(bk_u,    100 - wC - wBkC - wBkP - wCnc)
  const pct  = attPct(fc_up, quota)
  const col  = attVar(fc_up, quota)

  const segs = [
    { w: wC,   bg: CAT_SEG_COLORS.closed },
    { w: wBkC, bg: CAT_SEG_COLORS.commit },
    { w: wBkP, bg: CAT_SEG_COLORS.probable },
    { w: wCnc, bg: CAT_SEG_COLORS.cnc },
    { w: wBkU, bg: CAT_SEG_COLORS.upside },
  ]
  const legends = [
    { label: 'Closed',   bg: CAT_SEG_COLORS.closed },
    { label: 'Commit',   bg: CAT_SEG_COLORS.commit },
    { label: 'C&C',      bg: CAT_SEG_COLORS.cnc },
    { label: 'Probable', bg: CAT_SEG_COLORS.probable },
    { label: 'Upside',   bg: CAT_SEG_COLORS.upside },
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

        {/* Toggle pill (probable card only) */}
        {toggleEl}

        {/* Breakdown rows */}
        <div className="flex flex-col gap-1 mt-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className={`flex justify-between text-[12px] ${r.cnc ? 'border-t border-[var(--bdr2)] pt-1 mt-0.5' : ''}`}
            >
              <span className={r.upside ? 'text-[#b45309]' : 'text-[var(--tx2)]'}>{r.l}</span>
              <span className={`font-[600] ${r.upside ? 'text-[#b45309]' : 'text-[var(--tx)]'}`}>{r.v}</span>
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

export default function ForecastCards() {
  const s = useForecastStore()
  const d = s.derived || {}
  const { quota, closed } = s
  const { bk_c, bk_p, bk_u, cnc_rev, fc_commit, fc_prob, fc_up, bk_u_in_prob } = d
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
    // Expand all temporarily
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

  // Probable toggle pill
  const ProbToggle = () => (
    <button
      onClick={e => { e.stopPropagation(); s.toggleProbUpside() }}
      className={`
        inline-flex items-center gap-1.5 text-[10px] font-[600] px-2 py-1 rounded-full
        border cursor-pointer transition-all duration-150 mt-1 mb-1
        ${s.probIncludesUpside
          ? 'bg-[#fff7ed] border-[#fed7aa] text-[#b45309]'
          : 'bg-[var(--bg)] border-[var(--bdr2)] text-[var(--tx2)] hover:border-[#d1d5db] hover:text-[var(--tx)]'
        }
      `}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-150"
        style={{ background: s.probIncludesUpside ? '#b45309' : '#d1d5db' }}
      />
      {s.probIncludesUpside ? '½ Upside included' : '+ ½ Upside?'}
    </button>
  )

  const cards = [
    {
      meta: CARDS_META[0],
      fc: fc_commit || 0,
      rows: [
        { l: 'Closed QTD',       v: fmt(closed) },
        { l: '+ Commit bookings', v: fmt(bk_c) },
      ],
      detailRows: [
        { l: 'Conversion rate',       v: `${s.r_commit}%` },
        { l: 'Open commit pipeline',  v: fmt(s.pipe_commit) },
        { l: 'Expected bookings',     v: fmt(bk_c) },
      ],
    },
    {
      meta: CARDS_META[1],
      fc: fc_prob || 0,
      rows: [
        { l: 'Commit FC',             v: fmt(fc_commit) },
        { l: '+ Probable bookings',   v: fmt(bk_p) },
        { l: '+ C&C bookings',        v: fmt(cnc_rev), cnc: true },
        ...(bk_u_in_prob > 0 ? [{ l: '+ ½ Upside bookings', v: fmt(bk_u_in_prob), upside: true }] : []),
      ],
      detailRows: [
        { l: 'Conversion rate',       v: `${s.r_prob}%` },
        { l: 'Open probable pipeline', v: fmt(s.pipe_prob) },
        { l: 'Expected bookings',     v: fmt(bk_p) },
        { l: '+ C&C bookings',        v: fmt(cnc_rev) },
        ...(bk_u_in_prob > 0 ? [{ l: '+ ½ Upside bookings', v: fmt(bk_u_in_prob) }] : []),
      ],
      toggleEl: <ProbToggle />,
    },
    {
      meta: CARDS_META[2],
      fc: fc_up || 0,
      rows: [
        { l: 'Probable FC',           v: fmt(fc_prob) },
        { l: bk_u_in_prob > 0 ? '+ remaining ½ Upside' : '+ Upside bookings', v: fmt((bk_u || 0) - (bk_u_in_prob || 0)) },
      ],
      detailRows: [
        { l: 'Conversion rate',       v: `${s.r_up}%` },
        { l: 'Open upside pipeline',  v: fmt(s.pipe_up) },
        { l: 'Expected bookings',     v: fmt(bk_u) },
        ...(bk_u_in_prob > 0 ? [{ l: '(½ already in Probable)', v: '' }] : []),
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
        bk_c={bk_c || 0}
        bk_p={bk_p || 0}
        cnc_rev={cnc_rev || 0}
        bk_u={bk_u || 0}
        fc_up={fc_up || 0}
      />
    </div>
  )
}
