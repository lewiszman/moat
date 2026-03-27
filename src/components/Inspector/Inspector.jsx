import React, { useState, useRef, useCallback } from 'react'
import { useForecastStore, useInspectorStore } from '../../store/forecastStore'
import { flagDeal, groupByRep, CAT_COLORS } from '../../lib/flags'
import { fetchAISummary, fetchManagerInsights, formatForSlack, parseAIFlags, DEFAULT_SYSTEM_PROMPT, COST_PER_INPUT_TOKEN, COST_PER_OUTPUT_TOKEN } from '../../lib/ai'
import { fmt } from '../../lib/fmt'

const CAT_ORDER  = ['commit', 'probable', 'upside', 'pipeline']
const CAT_LABEL  = { commit: 'Commit', probable: 'Probable', upside: 'Upside', pipeline: 'Pipeline' }
const CAT_ACCENT = { commit: '#1a56db', probable: '#0d7c3d', upside: '#b45309', pipeline: '#6b7280' }

function FlagChip({ flag }) {
  return (
    <span
      className={`inline-flex text-[10px] px-1.5 py-px rounded font-[500] whitespace-nowrap
        ${flag.sev === 'red'
          ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        }`}
    >
      {flag.text}
    </span>
  )
}

function DealRow({ deal, aiMap }) {
  const nameKey = (deal.f_opp_name || '').toLowerCase()
  const aiTagged = aiMap && [...aiMap.keys()].some(k => nameKey.includes(k) || k.includes(nameKey.substring(0, 20)))
  const hasRed = (deal._flags || []).some(f => f.sev === 'red')
  const cd = deal.f_close_date
    ? new Date(deal.f_close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—'
  const ns = (deal.f_next_step || '—').substring(0, 60) + (deal.f_next_step?.length > 60 ? '…' : '')

  return (
    <tr className={hasRed ? 'bg-red-50/40 dark:bg-red-950/20' : ''}>
      <td className="px-3 py-2 font-[600] text-[12px] max-w-[160px]">
        {aiTagged ? (
          <span><strong>{deal.f_opp_name || '—'}</strong> <span className="text-[9px] text-purple-500" title="Flagged by AI">✦</span></span>
        ) : deal.f_opp_name || '—'}
      </td>
      <td className="px-3 py-2 font-[600] text-[12px] whitespace-nowrap">{fmt(deal.f_amount_num)}</td>
      <td className="px-3 py-2 text-[11px] text-[var(--tx2)] whitespace-nowrap">{cd}</td>
      <td className="px-3 py-2 text-[11px] text-[var(--tx2)] max-w-[200px]" title={deal.f_next_step || ''}>{ns}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {(deal._flags || []).length > 0
            ? (deal._flags || []).map((f, i) => <FlagChip key={i} flag={f} />)
            : <span className="text-[10px] text-green-600">✓ clean</span>
          }
        </div>
      </td>
    </tr>
  )
}

function CategorySection({ cat, deals, aiMap }) {
  const catAmt = deals.reduce((s, d) => s + d.f_amount_num, 0)
  const catRed = deals.flatMap(d => d._flags || []).filter(f => f.sev === 'red').length
  const catAmber = deals.flatMap(d => d._flags || []).filter(f => f.sev === 'amber').length
  const sorted = [...deals].sort((a, b) => {
    const sa = (a._flags || []).reduce((s, f) => s + (f.sev === 'red' ? 2 : 1), 0)
    const sb = (b._flags || []).reduce((s, f) => s + (f.sev === 'red' ? 2 : 1), 0)
    return sb - sa
  })

  return (
    <div className="border-b border-[var(--bdr2)] last:border-0">
      {/* Category header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg2)]">
        <div className="w-1 h-3.5 rounded-sm flex-shrink-0" style={{ background: CAT_ACCENT[cat] }} />
        <span className="text-[10px] font-[700] uppercase tracking-wide" style={{ color: CAT_ACCENT[cat] }}>
          {CAT_LABEL[cat]}
        </span>
        <span className="text-[11px] text-[var(--tx2)]">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} · {fmt(catAmt)}
        </span>
        {catRed > 0 && <span className="text-[10px] font-[700] text-red-600 ml-1">⚠ {catRed} critical</span>}
        {catAmber > 0 && <span className="text-[10px] font-[600] text-amber-600 ml-1">▲ {catAmber}</span>}
      </div>
      {/* Deal table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-[var(--bg2)]">
              {['Deal', 'Amount', 'Close', 'Next step', 'Flags'].map(h => (
                <th key={h} className="px-3 py-1.5 text-left text-[10px] font-[700] uppercase tracking-wide text-[var(--tx2)] border-b border-[var(--bdr2)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((deal, i) => <DealRow key={i} deal={deal} aiMap={aiMap} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RepBlock({ owner, deals, aiResult }) {
  const [open, setOpen] = useState(false)
  const allFlags = deals.flatMap(d => d._flags || [])
  const redCount = allFlags.filter(f => f.sev === 'red').length
  const amberCount = allFlags.filter(f => f.sev === 'amber').length
  const totalAmt = deals.reduce((s, d) => s + d.f_amount_num, 0)
  const sevClass = redCount > 0 ? 'border-l-red-500' : amberCount > 0 ? 'border-l-amber-500' : 'border-l-green-500'

  const aiMap = aiResult?.text ? parseAIFlags(aiResult.text) : null

  return (
    <div className={`card mb-3 border-l-4 ${sevClass} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--bg)] hover:bg-[var(--bg2)] transition-colors cursor-pointer border-none text-left"
      >
        <span className="font-[700] text-[13px] text-[var(--tx)] flex-1">{owner}</span>
        <div className="flex items-center gap-2">
          {redCount > 0 && <span className="text-[10px] font-[700] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠ {redCount} critical</span>}
          {amberCount > 0 && <span className="text-[10px] font-[700] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">▲ {amberCount} warning{amberCount !== 1 ? 's' : ''}</span>}
          {redCount === 0 && amberCount === 0 && <span className="text-[10px] font-[700] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Clean</span>}
          <span className="text-[11px] text-[var(--tx2)]">{deals.length} deals · {fmt(totalAmt)}</span>
        </div>
        <span className="text-[var(--tx2)] text-[11px] transition-transform duration-150" style={{ transform: open ? 'rotate(180deg)' : '' }}>▼</span>
      </button>

      {open && (
        <div>
          {/* AI summary */}
          {aiResult?.loading && (
            <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--bdr2)] bg-[var(--bg2)] text-[12px] text-[var(--tx2)]">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--blue)] animate-pulse" />
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--blue)] animate-pulse [animation-delay:200ms]" />
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--blue)] animate-pulse [animation-delay:400ms]" />
              <span>Generating AI summary…</span>
            </div>
          )}
          {aiResult?.text && (
            <div className="px-4 py-3 border-t border-[var(--bdr2)] bg-[var(--bg2)]">
              <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-2">✨ AI coaching summary</div>
              <div className="text-[12px] text-[var(--tx)] leading-relaxed whitespace-pre-wrap">
                {formatForSlack(aiResult.text)}
              </div>
            </div>
          )}
          {aiResult?.error && (
            <div className="px-4 py-3 border-t border-[var(--bdr2)] text-[12px] text-red-600">
              AI summary unavailable: {aiResult.error}
            </div>
          )}

          {/* Category sections */}
          {CAT_ORDER.map(cat => {
            const catDeals = deals.filter(d => d.f_fc_cat_norm === cat)
            if (!catDeals.length) return null
            return <CategorySection key={cat} cat={cat} deals={catDeals} aiMap={aiMap} />
          })}
        </div>
      )}
    </div>
  )
}

export default function Inspector() {
  const importedData = useForecastStore(s => s.importedData)
  const insp = useInspectorStore()
  const [focusOpen, setFocusOpen] = useState(false)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [stats, setStats] = useState(null)
  const [repsSorted, setRepsSorted] = useState([])
  const abortRef = useRef(null)

  const coachingFocus = insp.coachingFocus
  const apiKey = insp.apiKey
  const systemPrompt = insp.systemPrompt || DEFAULT_SYSTEM_PROMPT

  const run = useCallback(async () => {
    if (!importedData?.length) return

    const active = importedData.filter(d => !['closed', 'omitted'].includes(d.f_fc_cat_norm))
    active.forEach(d => { d._flags = flagDeal(d) })

    const byRep = groupByRep(active)
    const sorted = Object.entries(byRep).sort(([, a], [, b]) => {
      const sa = a.flatMap(d => d._flags).reduce((s, f) => s + (f.sev === 'red' ? 2 : 1), 0)
      const sb = b.flatMap(d => d._flags).reduce((s, f) => s + (f.sev === 'red' ? 2 : 1), 0)
      return sb - sa
    })

    const allFlags = active.flatMap(d => d._flags)
    const redFlags = allFlags.filter(f => f.sev === 'red').length
    const amberFlags = allFlags.filter(f => f.sev === 'amber').length
    const aesWithCritical = sorted.filter(([, deals]) => deals.flatMap(d => d._flags || []).some(f => f.sev === 'red')).length
    const totalPipe = active.reduce((s, d) => s + d.f_amount_num, 0)

    setStats({ aes: sorted.length, deals: active.length, pipe: totalPipe, red: redFlags, amber: amberFlags, aesWithCritical })
    setRepsSorted(sorted)

    // Init rep results
    insp.startRun(null)
    sorted.forEach(([owner]) => insp.setRepLoading(owner))

    if (!apiKey) return

    const ac = new AbortController()
    abortRef.current = ac
    insp.startRun(ac)

    let totalInput = 0, totalOutput = 0
    for (const [owner, deals] of sorted) {
      if (ac.signal.aborted) break
      try {
        const result = await fetchAISummary({ owner, deals, apiKey, systemPrompt, coachingFocus, signal: ac.signal })
        insp.setRepResult(owner, result.text)
        totalInput += result.inputTokens
        totalOutput += result.outputTokens
      } catch (err) {
        if (err.name === 'AbortError') break
        insp.setRepError(owner, err.message)
      }
    }

    insp.finishRun({ repsSorted: sorted, active, runDate: new Date() })
    insp.logUsage(totalInput, totalOutput, sorted.length, active.length)
  }, [importedData, apiKey, systemPrompt, coachingFocus])

  const stop = () => {
    abortRef.current?.abort()
    insp.stopRun()
  }

  if (!importedData?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--tx2)]">
        <div className="text-4xl mb-3">🔍</div>
        <div className="text-[15px] font-[600] text-[var(--tx)] mb-1">No data</div>
        <div className="text-[13px]">Import your pipeline CSV from Manager View first.</div>
      </div>
    )
  }

  const runCost = insp.usageLog.length
    ? (() => {
        const last = insp.usageLog[insp.usageLog.length - 1]
        return last.input * COST_PER_INPUT_TOKEN + last.output * COST_PER_OUTPUT_TOKEN
      })()
    : null

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button
          onClick={run}
          disabled={insp.isRunning}
          className="btn btn-primary flex items-center gap-2"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="3,2 11,7 3,12"/></svg>
          Run inspection
        </button>
        {insp.isRunning && (
          <button onClick={stop} className="btn flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1.5" width="7" height="7" rx="1"/></svg>
            Stop
          </button>
        )}
        {runCost !== null && (
          <span className="text-[11px] text-[var(--tx2)]">
            ${runCost.toFixed(3)} last run
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setFocusOpen(o => !o)}
            className={`btn text-[11px] ${focusOpen ? 'border-[var(--blue)] text-[var(--blue)]' : ''}`}
          >
            {focusOpen ? '✕ Focus' : '+ Focus'}
          </button>
          {stats && (
            <>
              <button
                onClick={() => setFlaggedOnly(o => !o)}
                className={`btn text-[11px] ${flaggedOnly ? 'bg-amber-500 text-white border-amber-500' : ''}`}
              >
                {flaggedOnly ? 'Show all' : 'Flagged only'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Focus input */}
      {focusOpen && (
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-3 py-2 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]"
            placeholder="e.g. Focus on EOQ close risk — 10 selling days left"
            value={insp.coachingFocus}
            onChange={e => insp.setCoachingFocus(e.target.value)}
          />
          <button onClick={() => setFocusOpen(false)} className="btn text-[11px]">Done</button>
        </div>
      )}

      {/* Team stats bar */}
      {stats && (
        <div className="grid grid-cols-6 border border-[var(--bdr2)] rounded-xl overflow-hidden mb-4 bg-[var(--bg)]">
          {[
            { label: 'AEs',             val: stats.aes,             color: '' },
            { label: 'Active deals',    val: stats.deals,           color: '' },
            { label: 'Total pipeline',  val: fmt(stats.pipe),       color: '' },
            { label: 'Critical flags',  val: stats.red,             color: 'text-red-600' },
            { label: 'Warnings',        val: stats.amber,           color: 'text-amber-600' },
            { label: 'AEs w/ critical', val: stats.aesWithCritical, color: 'text-red-600' },
          ].map((s, i) => (
            <div key={i} className="flex flex-col items-center justify-center py-3 border-r border-[var(--bdr2)] last:border-r-0">
              <div className={`text-[18px] font-[700] ${s.color}`}>{s.val}</div>
              <div className="text-[9px] uppercase tracking-wider text-[var(--tx2)] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Rep blocks */}
      {repsSorted.map(([owner, deals]) => (
        <RepBlock
          key={owner}
          owner={owner}
          deals={flaggedOnly ? deals.filter(d => (d._flags || []).length > 0) : deals}
          aiResult={insp.repResults[owner]}
        />
      ))}
    </div>
  )
}
