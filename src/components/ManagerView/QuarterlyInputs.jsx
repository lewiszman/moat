import React from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { useVocabStore } from '../../lib/vocab'
import { fmt, parseMoney } from '../../lib/fmt'
import SectionComment from '../shared/SectionComment'

function NumInput({ id, value, onChange, prefix, width = 'w-36', size = 'text-xl' }) {
  const [raw, setRaw] = React.useState(null)

  const display = raw !== null ? raw : (value > 0 ? value.toLocaleString('en-US') : '')

  return (
    <div className="flex items-center">
      {prefix && <span className="text-[var(--tx2)] text-[15px] mr-1">{prefix}</span>}
      <input
        type="text"
        className={`${width} ${size} font-[700] text-[var(--tx)] bg-transparent border-b-2 border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-1 transition-colors`}
        value={display}
        onFocus={() => setRaw(value > 0 ? String(Math.round(value)) : '')}
        onChange={e => setRaw(e.target.value)}
        onBlur={() => {
          onChange(parseMoney(raw ?? ''))
          setRaw(null)
        }}
      />
    </div>
  )
}

function PipelineRow({ label, pipeKey, rateKey, expId, pill, pillColor }) {
  const s = useForecastStore()
  const pipeVal = s[pipeKey] || 0
  const rateVal = s[rateKey] || 0
  const expected = s.derived?.[expId] || 0

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-2.5 border-b border-[var(--bdr2)] last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-[var(--tx)]">{label}</span>
        <span
          className="text-[9px] font-[700] uppercase tracking-wide px-1.5 py-px rounded-full"
          style={{ background: pillColor + '22', color: pillColor }}
        >
          {pill}
        </span>
      </div>
      <NumInput
        value={pipeVal}
        onChange={v => s.updateInput(pipeKey, v)}
        prefix="$"
        width="w-28"
        size="text-[13px]"
      />
      <div className="flex items-center gap-1">
        <input
          type="range"
          min={5} max={100} step={1}
          value={rateVal}
          onChange={e => s.updateInput(rateKey, +e.target.value)}
          className="w-24 accent-[var(--blue)]"
        />
        <span className="text-[12px] font-[600] w-10 text-right text-[var(--tx2)]">{rateVal}%</span>
      </div>
      <span className="text-[13px] font-[600] text-[var(--tx)] w-24 text-right">{fmt(expected)}</span>
    </div>
  )
}

export default function QuarterlyInputs() {
  const s = useForecastStore()
  const vocab = useVocabStore(s => s.vocab)
  const d = s.derived || {}

  const ROWS = [
    { label: vocab.worst_case, pipeKey: 'pipe_worst_case', rateKey: 'r_worst_case', expId: 'bk_wc',   pill: vocab.worst_case.toLowerCase(), pillColor: '#1a56db' },
    { label: vocab.call,       pipeKey: 'pipe_call',       rateKey: 'r_call',       expId: 'bk_call', pill: vocab.call.toLowerCase(),       pillColor: '#0d7c3d' },
    { label: vocab.best_case,  pipeKey: 'pipe_best_case',  rateKey: 'r_best_case',  expId: 'bk_bc',   pill: vocab.best_case.toLowerCase(),  pillColor: '#b45309' },
    { label: vocab.pipeline,   pipeKey: 'pipe_pipe',       rateKey: 'r_pipe',       expId: 'bk_pp',   pill: vocab.pipeline.toLowerCase(),   pillColor: '#6b7280' },
  ]

  return (
    <div>
      {/* Quota + Closed */}
      <div className="flex gap-8 mb-4">
        <div>
          <div className="text-[11px] text-[var(--tx2)] mb-1">Quarterly quota</div>
          <NumInput value={s.quota} onChange={v => s.updateInput('quota', v)} prefix="$" />
        </div>
        <div>
          <div className="text-[11px] text-[var(--tx2)] mb-1">Closed QTD</div>
          <NumInput value={s.closed} onChange={v => s.updateInput('closed', v)} prefix="$" />
        </div>
      </div>

      {/* Pipeline table */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 bg-[var(--bg2)] border-b border-[var(--bdr2)]">
          <span className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">Category</span>
          <span className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] w-28">Open pipeline</span>
          <span className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] w-36">Conv rate</span>
          <span className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] w-24 text-right">Expected</span>
        </div>
        <div className="px-4">
          {ROWS.map(row => <PipelineRow key={row.pipeKey} {...row} />)}
        </div>
        {/* Totals */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 bg-[var(--bg2)] border-t border-[var(--bdr2)]">
          <span className="text-[12px] font-[700] text-[var(--tx)]">Total</span>
          <span className="text-[13px] font-[700] w-28 text-[var(--tx)]">
            {fmt((s.pipe_worst_case||0)+(s.pipe_call||0)+(s.pipe_best_case||0)+(s.pipe_pipe||0))}
          </span>
          <span className="w-36" />
          <span className="text-[13px] font-[700] w-24 text-right text-[var(--tx)]">
            {fmt((d.bk_wc||0)+(d.bk_call||0)+(d.bk_bc||0)+(d.bk_pp||0))}
          </span>
        </div>
      </div>
    </div>
  )
}
