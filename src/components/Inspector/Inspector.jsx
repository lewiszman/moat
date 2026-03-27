import React, { useState, useRef, useCallback, useMemo } from 'react'
import { useForecastStore, useInspectorStore } from '../../store/forecastStore'
import { flagDeal, groupByRep, CAT_COLORS } from '../../lib/flags'
import { fetchAISummary, fetchManagerInsights, formatForSlack, parseAIFlags, DEFAULT_SYSTEM_PROMPT, COST_PER_INPUT_TOKEN, COST_PER_OUTPUT_TOKEN } from '../../lib/ai'
import { fmt } from '../../lib/fmt'

const CAT_ORDER  = ['commit', 'probable', 'upside', 'pipeline']
const CAT_LABEL  = { commit: 'Commit', probable: 'Probable', upside: 'Upside', pipeline: 'Pipeline' }
const CAT_ACCENT = { commit: '#1a56db', probable: '#0d7c3d', upside: '#b45309', pipeline: '#6b7280' }

// ── XLSX export ──────────────────────────────────────────────────

async function exportInspectionXLSX(repsSorted) {
  const XLSX = await import('xlsx')

  const rows = [
    ['AE', 'Deal', 'Amount', 'FC Category', 'Stage', 'Close Date', 'Next Step', 'Flags', 'Severity'],
  ]

  repsSorted.forEach(([owner, deals]) => {
    deals.forEach(deal => {
      const flags    = deal._flags || []
      const flagText = flags.map(f => `[${f.sev.toUpperCase()}] ${f.text}`).join('; ')
      const severity = flags.some(f => f.sev === 'red') ? 'Critical'
        : flags.length > 0 ? 'Warning' : 'Clean'
      rows.push([
        owner,
        deal.f_opp_name   || '',
        deal.f_amount_num || 0,
        deal.f_fc_cat_norm || '',
        deal.f_stage       || '',
        deal.f_close_date  || '',
        deal.f_next_step   || '',
        flagText,
        severity,
      ])
    })
  })

  const ws = XLSX.utils.aoa_to_sheet(rows)
  // Column widths
  ws['!cols'] = [14,30,12,12,18,12,40,60,10].map(w => ({ wch: w }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inspection')
  XLSX.writeFile(wb, `moat-inspection-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── Sub-components ───────────────────────────────────────────────

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
        {aiTagged
          ? <span><strong>{deal.f_opp_name || '—'}</strong> <span className="text-[9px] text-purple-500" title="Flagged by AI">✦</span></span>
          : deal.f_opp_name || '—'}
      </td>
      <td className="px-3 py-2 font-[600] text-[12px] whitespace-nowrap">{fmt(deal.f_amount_num)}</td>
      <td className="px-3 py-2 text-[11px] text-[var(--tx2)] whitespace-nowrap">{cd}</td>
      <td className="px-3 py-2 text-[11px] text-[var(--tx2)] max-w-[200px]" title={deal.f_next_step || ''}>{ns}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {(deal._flags || []).length > 0
            ? (deal._flags || []).map((f, i) => <FlagChip key={i} flag={f} />)
            : <span className="text-[10px] text-green-600">✓ clean</span>}
        </div>
      </td>
    </tr>
  )
}

function CategorySection({ cat, deals, aiMap }) {
  const catAmt   = deals.reduce((s, d) => s + d.f_amount_num, 0)
  const catRed   = deals.flatMap(d => d._flags || []).filter(f => f.sev === 'red').length
  const catAmber = deals.flatMap(d => d._flags || []).filter(f => f.sev === 'amber').length
  const sorted   = [...deals].sort((a, b) => {
    const sa = (a._flags || []).reduce((s, f) => s + (f.sev === 'red' ? 2 : 1), 0)
    const sb = (b._flags || []).reduce((s, f) => s + (f.sev === 'red' ? 2 : 1), 0)
    return sb - sa
  })

  return (
    <div className="border-b border-[var(--bdr2)] last:border-0">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg2)]">
        <div className="w-1 h-3.5 rounded-sm flex-shrink-0" style={{ background: CAT_ACCENT[cat] }} />
        <span className="text-[10px] font-[700] uppercase tracking-wide" style={{ color: CAT_ACCENT[cat] }}>
          {CAT_LABEL[cat]}
        </span>
        <span className="text-[11px] text-[var(--tx2)]">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} · {fmt(catAmt)}
        </span>
        {catRed   > 0 && <span className="text-[10px] font-[700] text-red-600 ml-1">⚠ {catRed} critical</span>}
        {catAmber > 0 && <span className="text-[10px] font-[600] text-amber-600 ml-1">▲ {catAmber}</span>}
      </div>
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
  const allFlags  = deals.flatMap(d => d._flags || [])
  const redCount  = allFlags.filter(f => f.sev === 'red').length
  const amberCount = allFlags.filter(f => f.sev === 'amber').length
  const totalAmt  = deals.reduce((s, d) => s + d.f_amount_num, 0)
  const sevClass  = redCount > 0 ? 'border-l-red-500' : amberCount > 0 ? 'border-l-amber-500' : 'border-l-green-500'
  const aiMap     = aiResult?.text ? parseAIFlags(aiResult.text) : null

  return (
    <div className={`card mb-3 border-l-4 ${sevClass} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--bg)] hover:bg-[var(--bg2)] transition-colors cursor-pointer border-none text-left"
      >
        <span className="font-[700] text-[13px] text-[var(--tx)] flex-1">{owner}</span>
        <div className="flex items-center gap-2">
          {redCount   > 0 && <span className="text-[10px] font-[700] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠ {redCount} critical</span>}
          {amberCount > 0 && <span className="text-[10px] font-[700] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">▲ {amberCount} warning{amberCount !== 1 ? 's' : ''}</span>}
          {redCount === 0 && amberCount === 0 && <span className="text-[10px] font-[700] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Clean</span>}
          <span className="text-[11px] text-[var(--tx2)]">{deals.length} deals · {fmt(totalAmt)}</span>
        </div>
        <span className="text-[var(--tx2)] text-[11px] transition-transform duration-150" style={{ transform: open ? 'rotate(180deg)' : '' }}>▼</span>
      </button>

      {open && (
        <div>
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

// ── Insights tab ─────────────────────────────────────────────────

function InsightsTab({ repsSorted, active, apiKey, systemPrompt }) {
  const insp = useInspectorStore()
  const [insightsText,    setInsightsText]    = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError,   setInsightsError]   = useState(null)

  // Flag frequency
  const flagFreq = useMemo(() => {
    const freq = {}
    active.forEach(d => {
      (d._flags || []).forEach(f => {
        if (!freq[f.text]) freq[f.text] = { red: 0, amber: 0 }
        freq[f.text][f.sev]++
      })
    })
    return Object.entries(freq)
      .map(([text, c]) => ({ text, red: c.red || 0, amber: c.amber || 0, total: (c.red || 0) + (c.amber || 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [active])

  // AE risk scores
  const aeRisk = useMemo(() => repsSorted.map(([owner, deals]) => {
    const flags = deals.flatMap(d => d._flags || [])
    const score = flags.reduce((s, f) => s + (f.sev === 'red' ? 2 : 1), 0)
    const red   = flags.filter(f => f.sev === 'red').length
    return { owner, score, red }
  }).sort((a, b) => b.score - a.score), [repsSorted])

  const maxFreq  = flagFreq[0]?.total || 1
  const maxScore = Math.max(...aeRisk.map(r => r.score), 1)

  const fetchInsights = async () => {
    if (!apiKey || !repsSorted.length) return
    setInsightsLoading(true)
    setInsightsError(null)
    try {
      const result = await fetchManagerInsights({ repsSorted, active, apiKey, systemPrompt })
      setInsightsText(result.text)
      insp.logUsage(result.inputTokens, result.outputTokens, repsSorted.length, active.length)
    } catch (e) {
      setInsightsError(e.message)
    }
    setInsightsLoading(false)
  }

  return (
    <div>
      {/* Flag frequency */}
      <div className="card mb-4 overflow-hidden">
        <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)] text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
          Flag frequency
        </div>
        <div className="px-4 py-3 flex flex-col gap-2">
          {flagFreq.length === 0
            ? <div className="text-[12px] text-[var(--tx2)]">No flags — run inspection first.</div>
            : flagFreq.map(({ text, red, amber, total }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="text-[11px] text-[var(--tx)] w-64 flex-shrink-0 truncate" title={text}>{text}</div>
                <div className="flex-1 flex h-5 rounded overflow-hidden bg-[var(--bg2)]">
                  <div style={{ width: `${(red   / maxFreq) * 100}%`, minWidth: red   > 0 ? 2 : 0 }} className="bg-red-500 h-full" />
                  <div style={{ width: `${(amber / maxFreq) * 100}%`, minWidth: amber > 0 ? 2 : 0 }} className="bg-amber-400 h-full" />
                </div>
                <div className="text-[11px] font-[700] w-6 text-right text-[var(--tx)]">{total}</div>
                {red > 0 && <span className="text-[9px] text-red-600 w-12 text-right">{red} 🔴</span>}
              </div>
            ))
          }
        </div>
      </div>

      {/* AE risk scores */}
      <div className="card mb-4 overflow-hidden">
        <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)] text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
          AE risk scores
        </div>
        <div className="px-4 py-3 flex flex-col gap-2">
          {aeRisk.length === 0
            ? <div className="text-[12px] text-[var(--tx2)]">Run inspection to see AE scores.</div>
            : aeRisk.map(({ owner, score, red }) => (
              <div key={owner} className="flex items-center gap-3">
                <div className="text-[11px] font-[600] text-[var(--tx)] w-36 flex-shrink-0 truncate">{owner}</div>
                <div className="flex-1 h-5 rounded overflow-hidden bg-[var(--bg2)]">
                  <div
                    style={{ width: `${(score / maxScore) * 100}%` }}
                    className={`h-full transition-all ${red > 0 ? 'bg-red-500' : 'bg-amber-400'}`}
                  />
                </div>
                <div className="text-[11px] font-[700] w-6 text-right text-[var(--tx)]">{score}</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* AI team coaching themes */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)]">
          <span className="text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">Team coaching themes</span>
          <button
            onClick={fetchInsights}
            disabled={insightsLoading || !apiKey || !repsSorted.length}
            className="btn btn-primary text-[11px] flex items-center gap-1.5 disabled:opacity-50"
          >
            {insightsLoading
              ? <><span className="inline-block w-2 h-2 rounded-full bg-white/60 animate-pulse" /> Thinking…</>
              : '✨ Generate'
            }
          </button>
        </div>
        <div className="px-4 py-4 text-[12px]">
          {!apiKey && (
            <p className="text-[var(--tx2)]">Add an Anthropic API key in <strong>Settings → Inspector</strong> to generate themes.</p>
          )}
          {apiKey && !repsSorted.length && (
            <p className="text-[var(--tx2)]">Run inspection on the Reps tab first.</p>
          )}
          {insightsError && <p className="text-red-600">{insightsError}</p>}
          {insightsText && (
            <div className="text-[var(--tx)] leading-relaxed whitespace-pre-wrap">{insightsText}</div>
          )}
          {!insightsText && !insightsLoading && !insightsError && apiKey && repsSorted.length > 0 && (
            <p className="text-[var(--tx2)]">Click Generate to get AI-powered team coaching themes.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Inspector root ────────────────────────────────────────────────

export default function Inspector() {
  const importedData = useForecastStore(s => s.importedData)
  const insp         = useInspectorStore()
  const [focusOpen,  setFocusOpen]  = useState(false)
  const [flaggedOnly,setFlaggedOnly] = useState(false)
  const [stats,      setStats]      = useState(null)
  const [repsSorted, setRepsSorted] = useState([])
  const [active,     setActive]     = useState([])
  const abortRef = useRef(null)

  const coachingFocus = insp.coachingFocus
  const apiKey        = insp.apiKey
  const systemPrompt  = insp.systemPrompt || DEFAULT_SYSTEM_PROMPT
  const activeTab     = insp.activeTab

  const run = useCallback(async () => {
    if (!importedData?.length) return

    const activeDeals = importedData.filter(d => !['closed', 'omitted'].includes(d.f_fc_cat_norm))
    activeDeals.forEach(d => { d._flags = flagDeal(d) })

    const byRep  = groupByRep(activeDeals)
    const sorted = Object.entries(byRep).sort(([, a], [, b]) => {
      const sa = a.flatMap(d => d._flags).reduce((s, f) => s + (f.sev === 'red' ? 2 : 1), 0)
      const sb = b.flatMap(d => d._flags).reduce((s, f) => s + (f.sev === 'red' ? 2 : 1), 0)
      return sb - sa
    })

    const allFlags        = activeDeals.flatMap(d => d._flags)
    const redFlags        = allFlags.filter(f => f.sev === 'red').length
    const amberFlags      = allFlags.filter(f => f.sev === 'amber').length
    const aesWithCritical = sorted.filter(([, deals]) => deals.flatMap(d => d._flags || []).some(f => f.sev === 'red')).length
    const totalPipe       = activeDeals.reduce((s, d) => s + d.f_amount_num, 0)

    setStats({ aes: sorted.length, deals: activeDeals.length, pipe: totalPipe, red: redFlags, amber: amberFlags, aesWithCritical })
    setRepsSorted(sorted)
    setActive(activeDeals)

    insp.startRun(null)
    sorted.forEach(([owner]) => insp.setRepLoading(owner))

    if (!apiKey) {
      insp.finishRun({ repsSorted: sorted, active: activeDeals, runDate: new Date() })
      return
    }

    const ac = new AbortController()
    abortRef.current = ac
    insp.startRun(ac)

    let totalInput = 0, totalOutput = 0
    for (const [owner, deals] of sorted) {
      if (ac.signal.aborted) break
      try {
        const result = await fetchAISummary({ owner, deals, apiKey, systemPrompt, coachingFocus, signal: ac.signal })
        insp.setRepResult(owner, result.text)
        totalInput  += result.inputTokens
        totalOutput += result.outputTokens
      } catch (err) {
        if (err.name === 'AbortError') break
        insp.setRepError(owner, err.message)
      }
    }

    insp.finishRun({ repsSorted: sorted, active: activeDeals, runDate: new Date() })
    insp.logUsage(totalInput, totalOutput, sorted.length, activeDeals.length)
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
          <span className="text-[11px] text-[var(--tx2)]">${runCost.toFixed(3)} last run</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* XLSX export */}
          {repsSorted.length > 0 && (
            <button
              onClick={() => exportInspectionXLSX(repsSorted)}
              className="btn text-[11px] flex items-center gap-1.5"
              title="Export to Excel"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="10" height="10" rx="1.5"/>
                <line x1="4" y1="4" x2="8" y2="8"/><line x1="8" y1="4" x2="4" y2="8"/>
              </svg>
              XLSX
            </button>
          )}

          <button
            onClick={() => setFocusOpen(o => !o)}
            className={`btn text-[11px] ${focusOpen ? 'border-[var(--blue)] text-[var(--blue)]' : ''}`}
          >
            {focusOpen ? '✕ Focus' : '+ Focus'}
          </button>

          {stats && (
            <button
              onClick={() => setFlaggedOnly(o => !o)}
              className={`btn text-[11px] ${flaggedOnly ? 'bg-amber-500 text-white border-amber-500' : ''}`}
            >
              {flaggedOnly ? 'Show all' : 'Flagged only'}
            </button>
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

      {/* Tab bar — only show when there's data */}
      {repsSorted.length > 0 && (
        <div className="flex gap-0 border-b border-[var(--bdr2)] mb-4">
          {[
            { id: 'reps',     label: 'Reps' },
            { id: 'insights', label: 'Insights' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => insp.setActiveTab(tab.id)}
              className={`
                px-4 py-2 text-[12px] font-[600] cursor-pointer border-none bg-transparent
                transition-colors -mb-px
                ${activeTab === tab.id
                  ? 'text-[var(--blue)] border-b-2 border-[var(--blue)]'
                  : 'text-[var(--tx2)] hover:text-[var(--tx)]'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {(activeTab === 'reps' || repsSorted.length === 0) && (
        repsSorted.map(([owner, deals]) => (
          <RepBlock
            key={owner}
            owner={owner}
            deals={flaggedOnly ? deals.filter(d => (d._flags || []).length > 0) : deals}
            aiResult={insp.repResults[owner]}
          />
        ))
      )}

      {activeTab === 'insights' && repsSorted.length > 0 && (
        <InsightsTab
          repsSorted={repsSorted}
          active={active}
          apiKey={apiKey}
          systemPrompt={systemPrompt}
        />
      )}
    </div>
  )
}
