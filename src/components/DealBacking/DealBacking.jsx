import React, { useMemo } from 'react'
import { useForecastStore, useDealBackStore } from '../../store/forecastStore'
import { fmt } from '../../lib/fmt'

const COLS = [
  { key: 'commit',   label: 'Commit',   accent: '#1a56db', sub: 'Counting on these to close' },
  { key: 'probable', label: 'Probable', accent: '#0d7c3d', sub: 'Strong intent — likely closes' },
  { key: 'upside',   label: 'Upside',   accent: '#b45309', sub: 'Possible if things break right' },
  { key: 'bench',    label: 'Bench',    accent: '#9ca3af', sub: 'Not counting this quarter' },
]

const CAT_PILL = {
  commit:   'bg-blue-100 text-blue-700',
  probable: 'bg-green-100 text-green-700',
  upside:   'bg-amber-100 text-amber-700',
  pipeline: 'bg-gray-100 text-gray-600',
  closed:   'bg-green-100 text-green-700',
  bench:    'bg-gray-100 text-gray-500',
}

function defaultCol(deal) {
  const map = { closed: 'closed', commit: 'commit', probable: 'probable', upside: 'upside', pipeline: 'upside' }
  return map[deal.cat] || 'upside'
}

function DealCard({ deal, onDragStart, onDragEnd, isMoved }) {
  const cd = deal.closeDate
    ? new Date(deal.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, deal.id)}
      onDragEnd={onDragEnd}
      className="
        relative bg-[var(--bg)] border border-[var(--bdr2)] rounded-[var(--rm)]
        px-3 py-2.5 cursor-grab active:cursor-grabbing select-none
        hover:shadow-sm hover:border-gray-300 transition-all duration-100
      "
    >
      {isMoved && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" title="Moved from original category" />
      )}
      <div className="text-[12px] font-[600] text-[var(--tx)] truncate mb-1" title={deal.name}>{deal.name}</div>
      <div className="text-[15px] font-[700] text-[var(--tx)] mb-1.5">{fmt(deal.acv)}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {deal.owner && <span className="text-[10px] text-[var(--tx2)]">{deal.owner}</span>}
        {cd && <span className="text-[10px] text-[var(--tx2)]">📅 {cd}</span>}
        <span className={`text-[9px] font-[700] uppercase tracking-wide px-1.5 py-px rounded-full ${CAT_PILL[deal.cat] || CAT_PILL.pipeline}`}>
          {deal.cat}
        </span>
      </div>
    </div>
  )
}

function CncCard({ onDragStart, onDragEnd, cncOverrides, setCncOverride, clearCncOverrides, localOpps, localAsp, localRate, localAcv, weeks_remaining, weeks_total }) {
  const hasOverride = cncOverrides.opps !== null || cncOverrides.asp !== null || cncOverrides.rate !== null

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, 'cnc_synthetic')}
      onDragEnd={onDragEnd}
      className="
        relative bg-[var(--bg)] border-2 rounded-[var(--rm)]
        px-3 py-2.5 cursor-grab active:cursor-grabbing select-none
        hover:shadow-sm transition-all duration-100
      "
      style={{ borderColor: 'var(--green)' }}
    >
      {/* C&C badge */}
      <span
        className="absolute top-1.5 right-1.5 text-[9px] font-[700] px-1.5 py-0.5 rounded-full text-white"
        style={{ background: 'var(--coral, #f97316)' }}
      >
        C&amp;C
      </span>

      <div className="text-[12px] font-[600] text-[var(--tx)] mb-1 pr-8">Create &amp; Close</div>
      <div className="text-[15px] font-[700] mb-0.5" style={{ color: 'var(--green)' }}>{fmt(localAcv)}</div>
      <div className="text-[10px] text-[var(--tx2)] mb-2">
        prorated · {weeks_remaining} of {weeks_total} wks
      </div>

      {/* Editable fields */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-[var(--tx2)] w-16 flex-shrink-0"># Opps</span>
          <input
            type="number"
            min={0}
            value={localOpps}
            onChange={e => setCncOverride('opps', +e.target.value)}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            className="w-12 text-right text-[11px] border border-[var(--bdr2)] rounded px-1 py-0.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--green)]"
          />
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-[var(--tx2)] w-16 flex-shrink-0">Avg size</span>
          <span className="text-[var(--tx2)] text-[10px]">$</span>
          <input
            type="number"
            min={0}
            step={500}
            value={localAsp}
            onChange={e => setCncOverride('asp', +e.target.value)}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            className="w-20 text-right text-[11px] border border-[var(--bdr2)] rounded px-1 py-0.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--green)]"
          />
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-[var(--tx2)] w-16 flex-shrink-0">Win rate</span>
          <input
            type="number"
            min={0}
            max={100}
            value={localRate}
            onChange={e => setCncOverride('rate', +e.target.value)}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            className="w-12 text-right text-[11px] border border-[var(--bdr2)] rounded px-1 py-0.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--green)]"
          />
          <span className="text-[var(--tx2)]">%</span>
        </div>
      </div>

      {hasOverride && (
        <button
          onClick={e => { e.stopPropagation(); clearCncOverrides() }}
          onMouseDown={e => e.stopPropagation()}
          className="mt-1.5 text-[10px] cursor-pointer hover:underline"
          style={{ color: 'var(--blue)' }}
        >
          ↺ use defaults
        </button>
      )}
    </div>
  )
}

function KanbanCol({ col, deals, totals, closed, onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, positions, cncCard, cncPos, cncBenchAcv }) {
  const colDealAmt  = deals.reduce((s, d) => s + d.acv, 0)
  const cncInThisCol = cncCard && cncPos === col.key
  const colAmt = colDealAmt + (cncInThisCol ? cncCard.acv : 0)

  const cumTotals = {
    commit:   closed + totals.commit,
    probable: closed + totals.commit + totals.probable,
    upside:   closed + totals.commit + totals.probable + totals.upside,
  }

  const wfBands = {
    commit:   [{ label: 'Closed won', amt: closed, color: '#059669' }, { label: '+ Commit deals', amt: totals.commit, color: '#1a56db' }],
    probable: [{ label: 'Closed won', amt: closed, color: '#059669' }, { label: '+ Commit deals', amt: totals.commit, color: '#1a56db' }, { label: '+ Probable deals', amt: totals.probable, color: '#0d7c3d' }],
    upside:   [{ label: 'Closed won', amt: closed, color: '#059669' }, { label: '+ Commit deals', amt: totals.commit, color: '#1a56db' }, { label: '+ Probable deals', amt: totals.probable, color: '#0d7c3d' }, { label: '+ Upside deals', amt: totals.upside, color: '#b45309' }],
  }

  const bands    = wfBands[col.key]
  const cumTotal = cumTotals[col.key]
  const dealCount = deals.length + (cncInThisCol ? 1 : 0)

  return (
    <div className="flex flex-col min-w-0">
      <div
        className={`flex flex-col h-full bg-[var(--bg)] border border-[var(--bdr2)] rounded-xl overflow-hidden ${col.key === 'bench' ? 'border-dashed' : ''}`}
        onDragOver={e => { e.preventDefault(); onDragOver(col.key) }}
        onDragLeave={onDragLeave}
        onDrop={e => onDrop(e, col.key)}
      >
        {/* Accent bar */}
        <div className="h-1 flex-shrink-0" style={{ background: col.accent }} />

        {/* Header */}
        <div className="px-4 pt-3 pb-2.5 border-b border-[var(--bdr2)]">
          <div className="text-[10px] font-[700] uppercase tracking-widest mb-1" style={{ color: col.accent }}>
            {col.key === 'bench' ? col.label : `${col.label} Forecast`}
          </div>
          <div className="text-[22px] font-[700] leading-none mb-1" style={{ color: col.key === 'bench' ? 'var(--tx2)' : col.accent }}>
            {col.key === 'bench' ? fmt(colAmt) : fmt(cumTotal)}
          </div>
          <div className="text-[11px] text-[var(--tx2)]">
            {dealCount} deal{dealCount !== 1 ? 's' : ''}
            {col.key !== 'bench' && <> · <span className="opacity-70">{fmt(colAmt)}</span></>}
          </div>
        </div>

        {/* Waterfall bands */}
        {bands && (
          <div className="px-3 py-2 border-b border-[var(--bdr2)] bg-[var(--bg2)] flex flex-col gap-1">
            {bands.map((b, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: b.color }} />
                <span className="text-[var(--tx2)] flex-1 truncate">{b.label}</span>
                <span className="font-[600] text-[var(--tx)]">{fmt(b.amt)}</span>
              </div>
            ))}
            {/* C&C bench footnote */}
            {cncPos === 'bench' && col.key !== 'bench' && (
              <div className="text-[10px] text-[var(--tx2)] italic pt-0.5" style={{ borderTop: '1px dashed var(--bdr2)', marginTop: '2px', paddingTop: '4px' }}>
                C&amp;C ({fmt(cncBenchAcv)}) in Bench — drag to include
              </div>
            )}
          </div>
        )}

        {/* Cards */}
        <div className="flex-1 p-2 flex flex-col gap-1.5 min-h-[120px]">
          {deals.length === 0 && !cncInThisCol && (
            <div className="text-[11px] text-[var(--tx2)] italic text-center pt-4 opacity-60">
              {col.key === 'bench' ? 'Drag deals here to park them' : 'Drop deals here'}
            </div>
          )}
          {deals.map(deal => (
            <DealCard
              key={deal.id}
              deal={deal}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isMoved={positions[deal.id] && positions[deal.id] !== defaultCol(deal)}
            />
          ))}
          {cncInThisCol && (
            <CncCard
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              cncOverrides={cncCard.cncOverrides}
              setCncOverride={cncCard.setCncOverride}
              clearCncOverrides={cncCard.clearCncOverrides}
              localOpps={cncCard.localOpps}
              localAsp={cncCard.localAsp}
              localRate={cncCard.localRate}
              localAcv={cncCard.acv}
              weeks_remaining={cncCard.weeks_remaining}
              weeks_total={cncCard.weeks_total}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default function DealBacking() {
  const importedData    = useForecastStore(s => s.importedData)
  const quota           = useForecastStore(s => s.quota)
  const derived         = useForecastStore(s => s.derived)
  const cnc_opps        = useForecastStore(s => s.cnc_opps)
  const cnc_asp         = useForecastStore(s => s.cnc_asp)
  const r_cnc           = useForecastStore(s => s.r_cnc)

  const { positions, move, reset, cncOverrides, setCncOverride, clearCncOverrides } = useDealBackStore()
  const [dragId, setDragId]     = React.useState(null)
  const [dragOver, setDragOver] = React.useState(null)

  // C&C synthetic card values
  const weeks_remaining = derived.weeks_remaining ?? 0
  const weeks_total     = derived.weeks_total     ?? 1
  const localOpps  = cncOverrides.opps ?? cnc_opps
  const localAsp   = cncOverrides.asp  ?? cnc_asp
  const localRate  = cncOverrides.rate ?? r_cnc
  const cncAcv     = localOpps * localAsp * (localRate / 100) * (weeks_total > 0 ? weeks_remaining / weeks_total : 0)
  const cncPos     = positions['cnc_synthetic'] || 'bench'

  const cncCardData = {
    acv: cncAcv,
    localOpps, localAsp, localRate,
    weeks_remaining, weeks_total,
    cncOverrides, setCncOverride, clearCncOverrides,
  }

  const deals = useMemo(() => {
    if (!importedData?.length) return []
    return importedData
      .filter(d => d.f_fc_cat_norm !== 'omitted')
      .map((d, i) => ({
        id: `db_${i}`,
        name: d.f_opp_name || 'Unknown',
        acv: d.f_amount_num || 0,
        owner: d.f_owner || '',
        cat: d.f_fc_cat_norm || 'pipeline',
        closeDate: d.f_close_date || '',
        closed: d.f_fc_cat_norm === 'closed',
      }))
  }, [importedData])

  // Ensure all deals have a position
  const effectivePositions = useMemo(() => {
    const pos = { ...positions }
    deals.forEach(d => { if (!pos[d.id]) pos[d.id] = defaultCol(d) })
    return pos
  }, [deals, positions])

  const closedAmt = deals.filter(d => d.closed).reduce((s, d) => s + d.acv, 0)

  // Totals include C&C card
  const totals = { commit: 0, probable: 0, upside: 0, bench: 0 }
  deals.filter(d => !d.closed).forEach(d => {
    const col = effectivePositions[d.id] || 'upside'
    totals[col] = (totals[col] || 0) + d.acv
  })
  totals[cncPos] = (totals[cncPos] || 0) + cncAcv

  const dealsByCol = (colKey) =>
    deals
      .filter(d => !d.closed && effectivePositions[d.id] === colKey)
      .sort((a, b) => b.acv - a.acv)

  const handleDragStart = (e, id) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragEnd  = () => { setDragId(null); setDragOver(null) }
  const handleDragOver = (col) => setDragOver(col)
  const handleDragLeave = () => setDragOver(null)
  const handleDrop = (e, col) => {
    e.preventDefault()
    if (dragId) { move(dragId, col); setDragId(null); setDragOver(null) }
  }

  if (!importedData?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--tx2)]">
        <div className="text-4xl mb-3">📊</div>
        <div className="text-[15px] font-[600] text-[var(--tx)] mb-1">Deal-Backing</div>
        <div className="text-[13px]">Import your pipeline CSV to build a deal-backed path to your forecast.</div>
      </div>
    )
  }

  const cumC = closedAmt + totals.commit
  const cumP = cumC + totals.probable
  const cumU = cumP + totals.upside

  return (
    <div className="px-4 py-6">
      {/* Toolbar stat bar */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-3 flex-wrap flex-1">
          {[
            { label: 'Quota',       val: fmt(quota),       color: '' },
            { label: 'Closed Won',  val: fmt(closedAmt),   color: 'text-green-600' },
            { label: 'Commit FC',   val: fmt(cumC),        color: 'text-blue-600' },
            { label: 'Probable FC', val: fmt(cumP),        color: 'text-green-700' },
            { label: 'Upside FC',   val: fmt(cumU),        color: 'text-amber-700' },
            { label: 'Benched',     val: fmt(totals.bench), color: 'text-gray-500' },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <div className="w-px self-stretch bg-[var(--bdr2)]" />}
              <div>
                <div className="text-[9px] uppercase tracking-wider text-[var(--tx2)]">{s.label}</div>
                <div className={`text-[15px] font-[700] ${s.color || 'text-[var(--tx)]'}`}>{s.val}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
        <button onClick={reset} className="btn text-[11px]">Reset</button>
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-4 gap-3" style={{ minHeight: '400px' }}>
        {COLS.map(col => (
          <KanbanCol
            key={col.key}
            col={col}
            deals={dealsByCol(col.key)}
            totals={totals}
            closed={closedAmt}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            positions={effectivePositions}
            cncCard={cncCardData}
            cncPos={cncPos}
            cncBenchAcv={cncAcv}
          />
        ))}
      </div>
    </div>
  )
}
