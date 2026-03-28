import React, { useState, useRef, useCallback, useMemo } from 'react'
import { useForecastStore, useInspectorStore, useSectionComments } from '../../store/forecastStore'
import { useSessionStore } from '../../store/sessionStore'
import { flagDeal, groupByRep, dealWeight, FLAG_DEF_LIST } from '../../lib/flags'
import { fetchAISummary, fetchManagerInsights, findDealAction, parseAIFlags, DEFAULT_SYSTEM_PROMPT, COST_PER_INPUT_TOKEN, COST_PER_OUTPUT_TOKEN } from '../../lib/ai'
import { formatSlackMessage } from '../../lib/slackFormatter'
import { fmt } from '../../lib/fmt'

const CAT_ORDER  = ['commit', 'probable', 'upside', 'pipeline']
const CAT_LABEL  = { commit: 'Commit', probable: 'Probable', upside: 'Upside', pipeline: 'Pipeline' }
const CAT_ACCENT = { commit: '#1a56db', probable: '#0d7c3d', upside: '#b45309', pipeline: '#6b7280' }

// ── Grouping helpers ──────────────────────────────────────────

function buildGroups(deals, groupBy) {
  if (groupBy === 'category') {
    return CAT_ORDER
      .map(cat => ({
        key: cat, label: CAT_LABEL[cat], accent: CAT_ACCENT[cat],
        deals: deals.filter(d => d.f_fc_cat_norm === cat),
      }))
      .filter(g => g.deals.length > 0)
  }
  if (groupBy === 'rep') {
    const byRep = {}
    deals.forEach(d => {
      const o = d._owner || 'Unknown'
      if (!byRep[o]) byRep[o] = []
      byRep[o].push(d)
    })
    return Object.entries(byRep)
      .map(([owner, ds]) => ({
        key: owner, label: owner, accent: '#6b7280',
        deals: ds,
        subGroups: CAT_ORDER
          .map(cat => ({
            key: cat, label: CAT_LABEL[cat], accent: CAT_ACCENT[cat],
            deals: ds.filter(d => d.f_fc_cat_norm === cat),
          }))
          .filter(sg => sg.deals.length > 0),
      }))
      .sort((a, b) =>
        b.deals.reduce((s, d) => s + dealWeight(d), 0) -
        a.deals.reduce((s, d) => s + dealWeight(d), 0)
      )
  }
  if (groupBy === 'stage') {
    const byStage = {}
    deals.forEach(d => {
      const st = d.f_stage || 'Unknown'
      if (!byStage[st]) byStage[st] = []
      byStage[st].push(d)
    })
    return Object.entries(byStage).map(([stage, ds]) => ({
      key: stage, label: stage, accent: '#6b7280', deals: ds,
    }))
  }
  return [{ key: 'all', label: null, accent: '#6b7280', deals }]
}

function sortDeals(deals, sortBy) {
  return [...deals].sort((a, b) => {
    if (sortBy === 'amount')    return (b.f_amount_num || 0) - (a.f_amount_num || 0)
    if (sortBy === 'closeDate') {
      const da = a.f_close_date ? new Date(a.f_close_date) : new Date(9999, 0)
      const db = b.f_close_date ? new Date(b.f_close_date) : new Date(9999, 0)
      return da - db
    }
    return dealWeight(b) - dealWeight(a) // default: severity
  })
}

// ── XLSX export ───────────────────────────────────────────────

async function exportInspectionXLSX(repsSorted) {
  const XLSX = await import('xlsx')
  const rows = [['AE', 'Deal', 'Amount', 'FC Category', 'Stage', 'Close Date', 'Next Step', 'Flags', 'Severity']]
  repsSorted.forEach(([owner, deals]) => {
    deals.forEach(deal => {
      const flags    = deal._flags || []
      const flagText = flags.map(f => `[${f.sev.toUpperCase()}] ${f.label}`).join('; ')
      const severity = flags.some(f => f.sev === 'critical') ? 'Critical'
        : flags.length > 0 ? 'Warning' : 'Clean'
      rows.push([owner, deal.f_opp_name || '', deal.f_amount_num || 0,
        deal.f_fc_cat_norm || '', deal.f_stage || '', deal.f_close_date || '',
        deal.f_next_step || '', flagText, severity])
    })
  })
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [14, 30, 12, 12, 18, 12, 40, 60, 10].map(w => ({ wch: w }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inspection')
  XLSX.writeFile(wb, `moat-inspection-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── MultiSelect dropdown ──────────────────────────────────────

function MultiSelect({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (v) => {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`btn text-[11px] flex items-center gap-1 ${value.length > 0 ? 'border-[var(--blue)] text-[var(--blue)]' : ''}`}
      >
        {label}{value.length > 0 ? ` (${value.length})` : ''} <span className="opacity-50">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--bg)] border border-[var(--bdr2)] rounded-lg shadow-lg min-w-[160px] max-h-60 overflow-y-auto py-1">
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg2)] cursor-pointer">
              <input
                type="checkbox"
                checked={value.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-[var(--blue)]"
              />
              <span className="text-[12px] text-[var(--tx)]">{opt.label}</span>
            </label>
          ))}
          {value.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--tx2)] hover:bg-[var(--bg2)] border-t border-[var(--bdr2)] mt-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Flag chips ────────────────────────────────────────────────

function FlagChip({ flag }) {
  return (
    <span className={`inline-flex text-[10px] px-1.5 py-px rounded font-[500] whitespace-nowrap ${
      flag.sev === 'critical'
        ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
    }`}>
      {flag.label}
    </span>
  )
}

// ── Deal row ──────────────────────────────────────────────────

function DealRow({ deal, cols, repResult }) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const hasCrit  = (deal._flags || []).some(f => f.sev === 'critical')
  const cd       = deal.f_close_date ? new Date(deal.f_close_date) : null
  const cdPast   = cd && cd < now
  const cdNear   = cd && !cdPast && (cd - now) / 86400000 <= 14
  const cdStr    = cd ? cd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
  const nsStr    = (deal.f_next_step || '—').substring(0, 60) + (deal.f_next_step?.length > 60 ? '…' : '')
  const aiAction = findDealAction(repResult?.aiFlags, deal.f_opp_name)
  const daysSinceActivity = deal.f_last_activity
    ? Math.floor((now - new Date(deal.f_last_activity)) / 86400000)
    : null
  const noteKey  = `insp_deal_${(deal.f_opp_name || '').toLowerCase()}`
  const { comments, setComment } = useSectionComments()
  const noteVal  = comments[noteKey] || ''

  return (
    <tr className={`border-b border-[var(--bdr2)] last:border-0 hover:bg-[var(--bg2)] transition-colors ${hasCrit ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}>
      {cols.ae       && <td className="px-3 py-2 text-[12px] font-[500] text-[var(--tx2)] whitespace-nowrap">{deal._owner}</td>}
      {cols.deal     && <td className="px-3 py-2 text-[12px] font-[600] text-[var(--tx)] max-w-[200px] truncate" title={deal.f_opp_name}>{deal.f_opp_name || '—'}</td>}
      {cols.amount   && <td className="px-3 py-2 text-[12px] font-[600] text-[var(--tx)] whitespace-nowrap text-right">{fmt(deal.f_amount_num)}</td>}
      {cols.close    && (
        <td className={`px-3 py-2 text-[12px] whitespace-nowrap font-[500] ${cdPast ? 'text-red-600' : cdNear ? 'text-amber-600' : 'text-[var(--tx2)]'}`}>
          {cdStr}
          {deal._slippageDays > 0 && (
            <span className="ml-1.5 text-[9px] font-[700] uppercase tracking-wide text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-700">
              +{deal._slippageDays}d
            </span>
          )}
        </td>
      )}
      {cols.stage    && <td className="px-3 py-2 text-[11px] text-[var(--tx2)] whitespace-nowrap max-w-[120px] truncate" title={deal.f_stage}>{deal.f_stage || '—'}</td>}
      {cols.fc       && (
        <td className="px-3 py-2">
          <span className="text-[10px] font-[700] uppercase tracking-wide" style={{ color: CAT_ACCENT[deal.f_fc_cat_norm] || '#6b7280' }}>
            {CAT_LABEL[deal.f_fc_cat_norm] || deal.f_fc_cat_norm || '—'}
          </span>
        </td>
      )}
      {cols.nextstep && (
        <td className="px-3 py-2 text-[11px] text-[var(--tx2)] max-w-[200px]" title={deal.f_next_step || ''}>
          {nsStr}
          {daysSinceActivity !== null && daysSinceActivity >= 7 && (
            <div className={`text-[9px] font-[600] mt-0.5 ${daysSinceActivity >= 14 ? 'text-red-500' : 'text-amber-500'}`}>
              {daysSinceActivity}d since activity
            </div>
          )}
        </td>
      )}
      {cols.flags    && (
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {(deal._flags || []).length > 0
              ? (deal._flags || []).map((f, i) => <FlagChip key={i} flag={f} />)
              : <span className="text-[10px] text-green-600">✓ clean</span>
            }
          </div>
        </td>
      )}
      {cols.aiaction && (
        <td className="px-3 py-2 text-[11px] text-[var(--tx)]">
          {repResult?.loading
            ? <span className="flex gap-1">{[0,200,400].map(d => <span key={d} className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--blue)] animate-pulse" style={{ animationDelay: `${d}ms` }} />)}</span>
            : repResult?.error
              ? <span className="text-red-500 text-[10px]" title={repResult.error}>⚠ {repResult.error.slice(0, 40)}</span>
              : aiAction
                ? <span className="text-purple-700 dark:text-purple-300"><span className="font-[600]">{aiAction.flag}</span>{aiAction.note ? ` — ${aiAction.note}` : ''}</span>
                : null
          }
        </td>
      )}
      {cols.note && (
        <td className="px-3 py-2 min-w-[140px]">
          <input
            type="text"
            value={noteVal}
            onChange={e => setComment(noteKey, e.target.value)}
            placeholder="Add note…"
            className="w-full text-[11px] bg-transparent border-0 border-b border-dashed border-[var(--bdr2)] focus:border-[var(--blue)] outline-none text-[var(--tx)] placeholder:text-[var(--tx2)]/50 py-0.5"
          />
        </td>
      )}
    </tr>
  )
}

// ── Rep scorecard ─────────────────────────────────────────────

function RepScorecard({ owner, deals, repResult }) {
  const pipe      = deals.reduce((s, d) => s + (d.f_amount_num || 0), 0)
  const critCount = deals.flatMap(d => d._flags || []).filter(f => f.sev === 'critical').length
  const cleanCount = deals.filter(d => (d._flags || []).length === 0).length
  const hygiene   = deals.length > 0 ? Math.round((cleanCount / deals.length) * 100) : 100
  const cats      = { commit: 0, probable: 0, upside: 0, pipeline: 0 }
  deals.forEach(d => { if (cats[d.f_fc_cat_norm] !== undefined) cats[d.f_fc_cat_norm]++ })

  return (
    <tr className="bg-[var(--bg2)]/60 border-b border-[var(--bdr2)]">
      <td colSpan={99} className="px-4 py-2">
        <div className="flex items-center gap-4 flex-wrap text-[11px]">
          <span className="font-[700] text-[var(--tx)] text-[12px]">{owner}</span>
          <span className="text-[var(--tx2)]">{fmt(pipe)}</span>
          <span className="text-[var(--tx2)]">{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1.5">
            {cats.commit   > 0 && <span className="text-[10px] font-[700] text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">{cats.commit}C</span>}
            {cats.probable > 0 && <span className="text-[10px] font-[700] text-green-700 bg-green-50 dark:bg-green-950/40 px-1.5 py-0.5 rounded">{cats.probable}P</span>}
            {cats.upside   > 0 && <span className="text-[10px] font-[700] text-amber-700 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">{cats.upside}U</span>}
            {cats.pipeline > 0 && <span className="text-[10px] font-[700] text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{cats.pipeline}Pp</span>}
          </div>
          {critCount > 0
            ? <span className="text-red-600 font-[700]">🔴 {critCount} critical</span>
            : <span className="text-green-600 font-[600]">✓ no criticals</span>
          }
          <span className={`font-[600] ${hygiene >= 80 ? 'text-green-600' : hygiene >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {hygiene}% hygiene
          </span>
          {repResult?.summary && (
            <span className="text-purple-700 dark:text-purple-300 italic truncate max-w-[300px]" title={repResult.summary}>
              ✨ {repResult.summary}
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Group header row ──────────────────────────────────────────

function GroupHeader({ group, colCount, collapsed, onToggle, showAE, onCopy }) {
  const total = group.deals.reduce((s, d) => s + (d.f_amount_num || 0), 0)
  const crit  = group.deals.flatMap(d => d._flags || []).filter(f => f.sev === 'critical').length
  const warn  = group.deals.flatMap(d => d._flags || []).filter(f => f.sev === 'warn').length

  if (!group.label) return null // groupBy=none: no header

  return (
    <tr
      className="bg-[var(--bg2)] cursor-pointer hover:bg-[var(--bg2)] select-none"
      onClick={onToggle}
    >
      <td colSpan={colCount} className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] text-[var(--tx2)] transition-transform" style={{ transform: collapsed ? 'rotate(-90deg)' : '', display: 'inline-block' }}>▼</span>
          <div className="w-1.5 h-3.5 rounded-sm flex-shrink-0" style={{ background: group.accent }} />
          <span className="text-[11px] font-[700] uppercase tracking-wide" style={{ color: group.accent }}>
            {group.label}
          </span>
          <span className="text-[11px] text-[var(--tx2)]">
            {group.deals.length} deal{group.deals.length !== 1 ? 's' : ''} · {fmt(total)}
          </span>
          {crit > 0 && <span className="text-[10px] font-[700] text-red-600">🔴 {crit}</span>}
          {warn > 0 && <span className="text-[10px] font-[600] text-amber-600">🟡 {warn}</span>}
          {crit === 0 && warn === 0 && <span className="text-[10px] font-[600] text-green-600">✓ clean</span>}
          {onCopy && (
            <button
              onClick={e => { e.stopPropagation(); onCopy(group) }}
              className="ml-auto text-[10px] btn py-0.5 px-2"
              title="Copy this group to clipboard"
            >
              Copy
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Table ─────────────────────────────────────────────────────

function InspectorTable({ groups, cols, repResults, collapsed, onToggle, groupBy }) {
  const visibleCols = Object.entries(cols).filter(([, v]) => v).map(([k]) => k)
  const colCount    = visibleCols.length

  const COL_HEADERS = {
    ae: 'AE', deal: 'Deal', amount: 'Amount', close: 'Close',
    stage: 'Stage', fc: 'FC', nextstep: 'Next Step',
    flags: 'Rules Based Flags', aiaction: 'AI Flags', note: 'Manager Note',
  }

  const copyGroup = async (group) => {
    const lines = [`*${group.label}* — ${group.deals.length} deal(s)`]
    group.deals.forEach(d => {
      const flags = (d._flags || []).map(f => f.label).join(', ')
      lines.push(`• ${d.f_opp_name || 'Unknown'} — ${d.f_amount_num ? `$${Math.round(d.f_amount_num / 1000)}k` : ''} ${flags ? `[${flags}]` : ''}`.trim())
    })
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const blob = new Blob([text], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `moat-group-${group.key}.txt`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-[var(--bg2)] border-b border-[var(--bdr2)]">
              {visibleCols.map(col => (
                <th key={col} className={`px-3 py-2 text-left text-[10px] font-[700] uppercase tracking-wide text-[var(--tx2)] whitespace-nowrap ${col === 'amount' ? 'text-right' : ''}`}>
                  {COL_HEADERS[col]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <React.Fragment key={group.key}>
                <GroupHeader
                  group={group}
                  colCount={colCount}
                  collapsed={!!collapsed[group.key]}
                  onToggle={() => onToggle(group.key)}
                  showAE={cols.ae}
                  onCopy={copyGroup}
                />
                {groupBy === 'rep' && group.label && (
                  <RepScorecard
                    owner={group.key}
                    deals={group.deals}
                    repResult={repResults[group.key]}
                  />
                )}
                {!collapsed[group.key] && (
                  group.subGroups
                    ? group.subGroups.map(sg => (
                        <React.Fragment key={`${group.key}-${sg.key}`}>
                          <tr className="bg-[var(--bg2)]/50">
                            <td colSpan={colCount} className="px-5 py-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-1 h-3 rounded-sm flex-shrink-0" style={{ background: sg.accent }} />
                                <span className="text-[10px] font-[700] uppercase tracking-wide" style={{ color: sg.accent }}>{sg.label}</span>
                                <span className="text-[10px] text-[var(--tx2)]">{sg.deals.length} deal{sg.deals.length !== 1 ? 's' : ''}</span>
                              </div>
                            </td>
                          </tr>
                          {sg.deals.map((deal, i) => (
                            <DealRow
                              key={`${deal._owner}-${deal.f_opp_name}-${i}`}
                              deal={deal}
                              cols={cols}
                              repResult={repResults[deal._owner]}
                            />
                          ))}
                        </React.Fragment>
                      ))
                    : group.deals.map((deal, i) => (
                        <DealRow
                          key={`${deal._owner}-${deal.f_opp_name}-${i}`}
                          deal={deal}
                          cols={cols}
                          repResult={repResults[deal._owner]}
                        />
                      ))
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────

function StatsBar({ stats, isRunning, runningOwner, repsDone, repsTotal }) {
  return (
    <div className="card overflow-hidden mb-3">
      <div className="grid grid-cols-6 divide-x divide-[var(--bdr2)]">
        {[
          { label: 'AEs',             val: stats.aes,             color: '' },
          { label: 'Active deals',    val: stats.deals,           color: '' },
          { label: 'Total pipeline',  val: fmt(stats.pipe),       color: '' },
          { label: 'Critical flags',  val: stats.crit,            color: 'text-red-600' },
          { label: 'Warnings',        val: stats.warn,            color: 'text-amber-600' },
          { label: 'AEs w/ critical', val: stats.aesWithCrit,     color: 'text-red-600' },
        ].map((s, i) => (
          <div key={i} className="flex flex-col items-center justify-center py-3">
            <div className={`text-[18px] font-[700] ${s.color}`}>{s.val}</div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--tx2)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      {isRunning && runningOwner && (
        <div className="px-4 py-1.5 bg-[var(--bg2)] border-t border-[var(--bdr2)] flex items-center gap-2 text-[11px] text-[var(--tx2)]">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--blue)] animate-pulse" />
          Summarising {runningOwner}… {repsDone}/{repsTotal}
        </div>
      )}
    </div>
  )
}

// ── Insights tab ──────────────────────────────────────────────

function InsightsTab({ repsSorted, active, apiKey, systemPrompt }) {
  const insp = useInspectorStore()
  const [insightsText,    setInsightsText]    = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError,   setInsightsError]   = useState(null)

  const flagFreq = useMemo(() => {
    const freq = {}
    active.forEach(d => {
      (d._flags || []).forEach(f => {
        if (!freq[f.id]) freq[f.id] = { label: f.label, crit: 0, warn: 0 }
        if (f.sev === 'critical') freq[f.id].crit++
        else freq[f.id].warn++
      })
    })
    return Object.values(freq)
      .map(v => ({ ...v, total: v.crit + v.warn }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [active])

  const aeRisk = useMemo(() => repsSorted.map(([owner, deals]) => {
    const flags = deals.flatMap(d => d._flags || [])
    const score = flags.reduce((s, f) => s + (f.weight || 0), 0)
    const crit  = flags.filter(f => f.sev === 'critical').length
    return { owner, score, crit }
  }).sort((a, b) => b.score - a.score), [repsSorted])

  const maxFreq  = flagFreq[0]?.total || 1
  const maxScore = Math.max(...aeRisk.map(r => r.score), 1)

  const fetchInsights = async () => {
    if (!apiKey || !repsSorted.length) return
    setInsightsLoading(true); setInsightsError(null)
    try {
      const result = await fetchManagerInsights({ repsSorted, active, apiKey, systemPrompt })
      setInsightsText(result.text)
      insp.logUsage(result.inputTokens, result.outputTokens, repsSorted.length, active.length)
    } catch (e) { setInsightsError(e.message) }
    setInsightsLoading(false)
  }

  return (
    <div>
      <div className="card mb-4 overflow-hidden">
        <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)] text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">Flag frequency</div>
        <div className="px-4 py-3 flex flex-col gap-2">
          {flagFreq.length === 0
            ? <div className="text-[12px] text-[var(--tx2)]">No flags — run inspection first.</div>
            : flagFreq.map(({ label, crit, warn, total }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="text-[11px] text-[var(--tx)] w-64 flex-shrink-0 truncate" title={label}>{label}</div>
                <div className="flex-1 flex h-4 rounded overflow-hidden bg-[var(--bg2)]">
                  <div style={{ width: `${(crit / maxFreq) * 100}%`, minWidth: crit > 0 ? 2 : 0 }} className="bg-red-500 h-full" />
                  <div style={{ width: `${(warn / maxFreq) * 100}%`, minWidth: warn > 0 ? 2 : 0 }} className="bg-amber-400 h-full" />
                </div>
                <div className="text-[11px] font-[700] w-6 text-right text-[var(--tx)]">{total}</div>
                {crit > 0 && <span className="text-[9px] text-red-600 w-12 text-right">{crit} 🔴</span>}
              </div>
            ))
          }
        </div>
      </div>

      <div className="card mb-4 overflow-hidden">
        <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)] text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">AE risk scores</div>
        <div className="px-4 py-3 flex flex-col gap-2">
          {aeRisk.length === 0
            ? <div className="text-[12px] text-[var(--tx2)]">Run inspection to see AE scores.</div>
            : aeRisk.map(({ owner, score, crit }) => (
              <div key={owner} className="flex items-center gap-3">
                <div className="text-[11px] font-[600] text-[var(--tx)] w-36 flex-shrink-0 truncate">{owner}</div>
                <div className="flex-1 h-4 rounded overflow-hidden bg-[var(--bg2)]">
                  <div style={{ width: `${(score / maxScore) * 100}%` }} className={`h-full transition-all ${crit > 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                </div>
                <div className="text-[11px] font-[700] w-8 text-right text-[var(--tx)]">{score}</div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)]">
          <span className="text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">Team coaching themes</span>
          <button
            onClick={fetchInsights}
            disabled={insightsLoading || !apiKey || !repsSorted.length}
            className="btn btn-primary text-[11px] flex items-center gap-1.5 disabled:opacity-50"
          >
            {insightsLoading ? <><span className="inline-block w-2 h-2 rounded-full bg-white/60 animate-pulse" /> Thinking…</> : '✨ Generate'}
          </button>
        </div>
        <div className="px-4 py-4 text-[12px]">
          {!apiKey && <p className="text-[var(--tx2)]">Add your Anthropic API key in <strong>Settings → Inspector</strong> to generate themes.</p>}
          {apiKey && !repsSorted.length && <p className="text-[var(--tx2)]">Run inspection first.</p>}
          {insightsError && <p className="text-red-600">{insightsError}</p>}
          {insightsText && <div className="text-[var(--tx)] leading-relaxed whitespace-pre-wrap">{insightsText}</div>}
          {!insightsText && !insightsLoading && !insightsError && apiKey && repsSorted.length > 0 && (
            <p className="text-[var(--tx2)]">Click Generate to get AI-powered team coaching themes.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Column picker ─────────────────────────────────────────────

const ALL_COLS = [
  { id: 'ae',       label: 'AE'        },
  { id: 'deal',     label: 'Deal'      },
  { id: 'amount',   label: 'Amount'    },
  { id: 'close',    label: 'Close'     },
  { id: 'stage',    label: 'Stage'     },
  { id: 'fc',       label: 'FC'        },
  { id: 'nextstep', label: 'Next Step' },
  { id: 'flags',    label: 'Flags'     },
  { id: 'aiaction', label: 'AI Action' },
  { id: 'note',     label: 'Note'      },
]

function ColPicker({ visible, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  React.useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="btn text-[11px]" title="Column picker">⚙</button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-[var(--bg)] border border-[var(--bdr2)] rounded-lg shadow-lg py-1 min-w-[140px]">
          {ALL_COLS.map(col => (
            <label key={col.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg2)] cursor-pointer">
              <input type="checkbox" checked={!!visible[col.id]} onChange={() => onChange(col.id)} className="accent-[var(--blue)]" />
              <span className="text-[12px] text-[var(--tx)]">{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inspector root ────────────────────────────────────────────

export default function Inspector() {
  const importedData  = useForecastStore(s => s.importedData)
  const quarterLabel  = useForecastStore(s => s.quarterLabel)
  const insp          = useInspectorStore()
  const { user }      = useSessionStore()

  const apiKey       = insp.apiKey
  const aiActive     = insp.aiEnabled && !!apiKey
  const systemPrompt = insp.systemPrompt || DEFAULT_SYSTEM_PROMPT

  // Local state
  const [allDeals,    setAllDeals]    = useState([])
  const [repsSorted,  setRepsSorted]  = useState([])
  const [stats,       setStats]       = useState(null)
  const [filterAEs,   setFilterAEs]   = useState([])
  const [filterCats,  setFilterCats]  = useState([])
  const [filterFlags, setFilterFlags] = useState([])
  const [collapsed,   setCollapsed]   = useState({})
  const [copyStatus,  setCopyStatus]  = useState(null)  // null | 'exec' | 'manager'
  const [slackOpen,   setSlackOpen]   = useState(false)
  const [focusOpen,   setFocusOpen]   = useState(false)
  const [colsVisible, setColsVisible] = useState({
    ae: true, deal: true, amount: true, close: true,
    stage: true, fc: true, nextstep: true, flags: true, aiaction: false, note: false,
  })
  const abortRef = useRef(null)
  const slackRef = useRef(null)
  const [runError,      setRunError]      = React.useState(null)
  const [localRunning,  setLocalRunning]  = React.useState(false)

  // Restore from persisted lastResult on mount (so navigating away and back doesn't clear results)
  React.useEffect(() => {
    const lr = insp.lastResult
    if (!lr?.active?.length || allDeals.length > 0) return
    const byRep = {}
    lr.active.forEach(d => {
      const o = d._owner || 'Unknown'
      if (!byRep[o]) byRep[o] = []
      byRep[o].push(d)
    })
    const sorted = Object.entries(byRep).sort(([, a], [, b]) =>
      b.flatMap(d => d._flags || []).reduce((s, f) => s + f.weight, 0) -
      a.flatMap(d => d._flags || []).reduce((s, f) => s + f.weight, 0)
    )
    setAllDeals(lr.active)
    setRepsSorted(sorted)
    const allFlags  = lr.active.flatMap(d => d._flags || [])
    const aesWithCrit = sorted.filter(([, deals]) =>
      deals.flatMap(d => d._flags || []).some(f => f.sev === 'critical')
    ).length
    setStats({
      aes: sorted.length,
      deals: lr.active.length,
      pipe: lr.active.reduce((s, d) => s + d.f_amount_num, 0),
      crit: allFlags.filter(f => f.sev === 'critical').length,
      warn: allFlags.filter(f => f.sev === 'warn').length,
      aesWithCrit,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Effective column visibility — aiaction auto-shows when AI is on
  const effectiveCols = useMemo(() => ({
    ...colsVisible,
    aiaction: colsVisible.aiaction || aiActive,
    ae: colsVisible.ae && insp.groupBy !== 'rep', // hide AE col when grouped by rep
  }), [colsVisible, aiActive, insp.groupBy])

  // Filter options
  const allAEs  = useMemo(() => [...new Set(allDeals.map(d => d._owner))].sort(), [allDeals])
  const allCats = CAT_ORDER

  // Filtered + grouped + sorted deals
  const visibleDeals = useMemo(() => {
    let d = allDeals
    if (filterAEs.length)   d = d.filter(x => filterAEs.includes(x._owner))
    if (filterCats.length)  d = d.filter(x => filterCats.includes(x.f_fc_cat_norm))
    if (filterFlags.length) d = d.filter(x => (x._flags || []).some(f => filterFlags.includes(f.id)))
    if (insp.flaggedOnly)   d = d.filter(x => (x._flags || []).length > 0)
    return d
  }, [allDeals, filterAEs, filterCats, filterFlags, insp.flaggedOnly])

  const groups = useMemo(() => {
    const raw = buildGroups(visibleDeals, insp.groupBy)
    return raw.map(g => ({ ...g, deals: sortDeals(g.deals, insp.sortBy) }))
  }, [visibleDeals, insp.groupBy, insp.sortBy])

  // AI run progress
  const repResultVals  = Object.values(insp.repResults)
  const runningOwner   = Object.entries(insp.repResults).find(([, r]) => r.loading)?.[0]
  const repsDone       = repResultVals.filter(r => !r.loading).length
  const repsTotal      = repsSorted.length

  // ── Run ──
  // Uses getState() so we always read fresh store values at call-time,
  // avoiding stale-closure issues caused by `insp` being in deps.
  const run = useCallback(async () => {
    console.log('[Inspector] run called, importedData length:', importedData?.length)
    if (!importedData?.length) return

    setRunError(null)
    setLocalRunning(true)

    // Read volatile inspector state fresh at call-time
    const st = useInspectorStore.getState()
    const runApiKey    = st.apiKey
    const runAiActive  = st.aiEnabled && !!runApiKey
    const runPrompt    = st.systemPrompt || DEFAULT_SYSTEM_PROMPT
    const runFocus     = st.coachingFocus

    console.log('[Inspector] aiEnabled:', st.aiEnabled, 'apiKey set:', !!runApiKey, 'aiActive:', runAiActive)

    let started = false
    try {
      const prevSnap = useForecastStore.getState().previousImportSnapshot || {}
      const active = importedData
        .filter(d => !['closed', 'omitted'].includes(d.f_fc_cat_norm))
        .map(d => {
          const key = (d.f_opp_name || '').toLowerCase()
          const prev = prevSnap[key]
          let slippageDays = 0
          if (prev?.closeDate && d.f_close_date) {
            const delta = Math.round((new Date(d.f_close_date) - new Date(prev.closeDate)) / 86400000)
            if (delta > 0) slippageDays = delta
          }
          return { ...d, _owner: d.f_owner || 'Unknown', _flags: flagDeal(d), _slippageDays: slippageDays }
        })
      console.log('[Inspector] active deals:', active.length, 'of', importedData.length)

      const allFlags   = active.flatMap(d => d._flags)
      const critCount  = allFlags.filter(f => f.sev === 'critical').length
      const warnCount  = allFlags.filter(f => f.sev === 'warn').length
      const byRep      = groupByRep(active)
      const sorted     = Object.entries(byRep).sort(([, a], [, b]) =>
        b.flatMap(d => d._flags).reduce((s, f) => s + f.weight, 0) -
        a.flatMap(d => d._flags).reduce((s, f) => s + f.weight, 0)
      )
      const aesWithCrit = sorted.filter(([, deals]) =>
        deals.flatMap(d => d._flags).some(f => f.sev === 'critical')
      ).length

      setAllDeals(active)
      setRepsSorted(sorted)
      setFilterAEs([]); setFilterCats([]); setFilterFlags([])
      setStats({
        aes: sorted.length, deals: active.length,
        pipe: active.reduce((s, d) => s + d.f_amount_num, 0),
        crit: critCount, warn: warnCount, aesWithCrit,
      })

      // Use getState() for actions — they are stable references regardless
      const { startRun, finishRun, stopRun: storeStop,
              setRepLoading, setRepResult, setRepError: storeRepError,
              logUsage } = useInspectorStore.getState()

      startRun(null)
      started = true
      sorted.forEach(([owner]) => setRepLoading(owner))

      if (!runAiActive) {
        finishRun({ repsSorted: sorted, active, runDate: new Date() })
        return
      }

      const ac = new AbortController()
      abortRef.current = ac
      startRun(ac)

      let totalIn = 0, totalOut = 0
      for (const [owner, deals] of sorted) {
        if (ac.signal.aborted) break
        try {
          const result = await fetchAISummary({
            owner, deals, apiKey: runApiKey,
            systemPrompt: runPrompt, coachingFocus: runFocus, signal: ac.signal,
          })
          setRepResult(owner, { summary: result.summary, actions: result.actions, aiFlags: result.flags || {} })
          totalIn  += result.inputTokens
          totalOut += result.outputTokens
        } catch (err) {
          if (err.name === 'AbortError') break
          storeRepError(owner, err.message)
        }
      }

      finishRun({ repsSorted: sorted, active, runDate: new Date() })
      logUsage(totalIn, totalOut, sorted.length, active.length)
    } catch (err) {
      console.error('[Inspector] run failed:', err)
      setRunError(err.message || 'Unexpected error — check the browser console')
      if (started) useInspectorStore.getState().stopRun()
    } finally {
      setLocalRunning(false)
    }
  }, [importedData])  // importedData is the only dep that changes the logic

  const stop = () => {
    abortRef.current?.abort()
    useInspectorStore.getState().stopRun()
    setLocalRunning(false)
  }

  // ── Copy Slack ──
  const copySlack = async (mode) => {
    setSlackOpen(false)
    const { execMessage, managerMessage } = formatSlackMessage(allDeals, {
      groupBy: insp.groupBy === 'category' ? 'category' : 'rep',
      runDate: new Date(),
      quarterLabel,
      repResults: insp.repResults,
    })
    const text = mode === 'exec' ? execMessage : managerMessage
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const blob = new Blob([text], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `moat-slack-${mode}.txt`; a.click()
      URL.revokeObjectURL(url)
    }
    setCopyStatus(mode)
    setTimeout(() => setCopyStatus(null), 2000)
  }

  // Close Slack dropdown on outside click
  React.useEffect(() => {
    if (!slackOpen) return
    const h = (e) => { if (slackRef.current && !slackRef.current.contains(e.target)) setSlackOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [slackOpen])

  const runCost = insp.usageLog.length > 0
    ? (() => { const l = insp.usageLog[insp.usageLog.length - 1]; return l.input * COST_PER_INPUT_TOKEN + l.output * COST_PER_OUTPUT_TOKEN })()
    : null

  if (!importedData?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--tx2)]">
        <div className="text-4xl mb-3">🔍</div>
        <div className="text-[15px] font-[600] text-[var(--tx)] mb-1">No data</div>
        <div className="text-[13px]">Import your pipeline CSV from Manager Walk-Up first.</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">

      {/* ── Toolbar row 1: actions ── */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {/* Run / Stop */}
        <button onClick={run} disabled={localRunning || insp.isRunning} className="btn btn-primary flex items-center gap-1.5 text-[12px]">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 10,5 2,9"/></svg>
          {localRunning ? 'Running…' : 'Run'}
        </button>
        {(localRunning || insp.isRunning) && (
          <button onClick={stop} className="btn flex items-center gap-1.5 text-[12px]">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><rect x="1" y="1" width="7" height="7" rx="1"/></svg>
            Stop
          </button>
        )}
        {runCost !== null && <span className="text-[11px] text-[var(--tx2)]">${runCost.toFixed(3)} last run</span>}

        <div className="ml-auto flex items-center gap-2">
          {/* AI toggle */}
          <button
            onClick={() => insp.setAiEnabled(!insp.aiEnabled)}
            disabled={!apiKey && !insp.aiEnabled}
            title={!apiKey ? 'Add your Anthropic API key in Settings to enable AI insights' : undefined}
            className={`btn text-[11px] flex items-center gap-1.5 transition-colors ${
              aiActive
                ? 'border-purple-400 text-purple-700 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-300'
                : 'text-[var(--tx2)]'
            } ${!apiKey ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            ✨ AI {insp.aiEnabled ? 'ON' : 'OFF'}
          </button>

          {/* Copy Slack dropdown */}
          {allDeals.length > 0 && (
            <div ref={slackRef} className="relative">
              <button
                onClick={() => setSlackOpen(o => !o)}
                className={`btn text-[11px] flex items-center gap-1 ${copyStatus ? 'border-green-500 text-green-700' : ''}`}
              >
                {copyStatus ? `Copied ✓ (${copyStatus})` : '📋 Copy Slack ▾'}
              </button>
              {slackOpen && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-[var(--bg)] border border-[var(--bdr2)] rounded-lg shadow-lg py-1 min-w-[140px]">
                  <button onClick={() => copySlack('exec')}    className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--bg2)] text-[var(--tx)]">Exec view</button>
                  <button onClick={() => copySlack('manager')} className="w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--bg2)] text-[var(--tx)]">Manager view</button>
                </div>
              )}
            </div>
          )}

          {/* XLSX export */}
          {repsSorted.length > 0 && (
            <button onClick={() => exportInspectionXLSX(repsSorted)} className="btn text-[11px]" title="Export to Excel">
              XLSX
            </button>
          )}

          {/* Column picker */}
          <ColPicker visible={colsVisible} onChange={id => setColsVisible(p => ({ ...p, [id]: !p[id] }))} />
        </div>
      </div>

      {/* ── Toolbar row 2: grouping, sort, filters ── */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {/* Group by */}
        <span className="text-[11px] text-[var(--tx2)]">Group</span>
        <select
          value={insp.groupBy}
          onChange={e => insp.setGroupBy(e.target.value)}
          className="text-[11px] border border-[var(--bdr2)] rounded-[var(--rm)] px-2 py-1 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]"
        >
          <option value="category">FC Category</option>
          <option value="rep">AE</option>
          <option value="stage">Stage</option>
          <option value="none">None</option>
        </select>

        <span className="text-[11px] text-[var(--tx2)] ml-1">Sort</span>
        <select
          value={insp.sortBy}
          onChange={e => insp.setSortBy(e.target.value)}
          className="text-[11px] border border-[var(--bdr2)] rounded-[var(--rm)] px-2 py-1 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]"
        >
          <option value="severity">Severity</option>
          <option value="amount">Amount</option>
          <option value="closeDate">Close date</option>
        </select>

        <div className="h-4 w-px bg-[var(--bdr2)] mx-1" />

        {/* Filters */}
        {allAEs.length > 0 && (
          <MultiSelect
            label="AE"
            options={allAEs.map(ae => ({ value: ae, label: ae }))}
            value={filterAEs}
            onChange={setFilterAEs}
          />
        )}
        <MultiSelect
          label="Category"
          options={allCats.map(c => ({ value: c, label: CAT_LABEL[c] }))}
          value={filterCats}
          onChange={setFilterCats}
        />
        <MultiSelect
          label="Flag"
          options={FLAG_DEF_LIST.map(f => ({ value: f.id, label: f.label }))}
          value={filterFlags}
          onChange={setFilterFlags}
        />

        {/* Flagged only toggle */}
        <button
          onClick={() => insp.setFlaggedOnly(!insp.flaggedOnly)}  // Add setFlaggedOnly to store
          className={`btn text-[11px] ${insp.flaggedOnly ? 'bg-amber-500 text-white border-amber-500' : ''}`}
        >
          {insp.flaggedOnly ? 'Flagged only ✓' : 'Flagged only'}
        </button>

        {/* Coaching focus */}
        <button
          onClick={() => setFocusOpen(o => !o)}
          className={`btn text-[11px] ${focusOpen ? 'border-[var(--blue)] text-[var(--blue)]' : ''}`}
        >
          {focusOpen ? '✕ Focus' : '+ Focus'}
        </button>
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

      {/* Run error */}
      {runError && (
        <div className="mb-2 px-3 py-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <span>⚠</span>
          <span>Run failed: {runError}</span>
          <button onClick={() => setRunError(null)} className="ml-auto text-[11px] underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <StatsBar
          stats={stats}
          isRunning={insp.isRunning}
          runningOwner={runningOwner}
          repsDone={repsDone}
          repsTotal={repsTotal}
        />
      )}

      {/* Tab bar */}
      {allDeals.length > 0 && (
        <div className="flex border-b border-[var(--bdr2)] mb-3">
          {[{ id: 'reps', label: 'Reps' }, { id: 'insights', label: 'Insights' }].map(tab => (
            <button
              key={tab.id}
              onClick={() => insp.setActiveTab(tab.id)}
              className={`px-4 py-2 text-[12px] font-[600] cursor-pointer border-none bg-transparent transition-colors -mb-px ${
                insp.activeTab === tab.id
                  ? 'text-[var(--blue)] border-b-2 border-[var(--blue)]'
                  : 'text-[var(--tx2)] hover:text-[var(--tx)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Reps tab — table */}
      {insp.activeTab === 'reps' && allDeals.length > 0 && (
        <InspectorTable
          groups={groups}
          cols={effectiveCols}
          repResults={insp.repResults}
          collapsed={collapsed}
          onToggle={key => setCollapsed(p => ({ ...p, [key]: !p[key] }))}
          groupBy={insp.groupBy}
        />
      )}

      {/* Insights tab */}
      {insp.activeTab === 'insights' && allDeals.length > 0 && (
        <InsightsTab
          repsSorted={repsSorted}
          active={allDeals}
          apiKey={apiKey}
          systemPrompt={systemPrompt}
        />
      )}
    </div>
  )
}
