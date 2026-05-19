import React, { useState, useRef, useCallback, useMemo } from 'react'
import { useForecastStore, useInspectorStore, useSectionComments } from '../../store/forecastStore'
import { useSessionStore } from '../../store/sessionStore'
import { flagDeal, groupByRep, dealWeight, FLAG_DEF_LIST } from '../../lib/flags'
import { fetchAISummary, fetchDealInspection, fetchManagerInsights, findDealAction, parseAIFlags, DEFAULT_SYSTEM_PROMPT, COST_PER_INPUT_TOKEN, COST_PER_OUTPUT_TOKEN } from '../../lib/ai'
import { formatSlackMessage } from '../../lib/slackFormatter'
import { getVocab, useVocabStore } from '../../lib/vocab'
import UnmappedBanner from '../shared/UnmappedBanner'
import { fmt } from '../../lib/fmt'

const CAT_ORDER  = ['worst_case', 'call', 'best_case', 'pipeline']
const CAT_ACCENT = { worst_case: '#1a56db', call: '#0d7c3d', best_case: '#b45309', pipeline: '#6b7280' }

// ── Grouping helpers ──────────────────────────────────────────

function buildGroups(deals, groupBy) {
  const vocab = getVocab()
  if (groupBy === 'category') {
    return CAT_ORDER
      .map(cat => ({
        key: cat, label: vocab[cat] ?? cat, accent: CAT_ACCENT[cat],
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
            key: cat, label: vocab[cat] ?? cat, accent: CAT_ACCENT[cat],
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

const AI_RISK_COLORS = {
  critical: 'text-red-700 dark:text-red-300',
  high:     'text-amber-700 dark:text-amber-300',
  medium:   'text-yellow-700 dark:text-yellow-400',
}
const AI_RISK_BG = {
  critical: 'bg-red-50 dark:bg-red-950/30',
  high:     'bg-amber-50 dark:bg-amber-950/30',
  medium:   'bg-yellow-50 dark:bg-yellow-950/30',
}

function DealRow({ deal, cols, repResult, onOpen }) {
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

  const daysInStage = deal.f_days_in_stage || 0
  const competitor  = (deal.f_competitor || '').trim()

  return (
    <tr
      onClick={() => onOpen && onOpen(deal)}
      className={`border-b border-[var(--bdr2)] last:border-0 hover:bg-[var(--bg2)] transition-colors cursor-pointer ${hasCrit ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}
    >
      {cols.ae         && <td className="px-3 py-2 text-[12px] font-[500] text-[var(--tx2)] whitespace-nowrap">{deal._owner}</td>}
      {cols.deal       && <td className="px-3 py-2 text-[12px] font-[600] text-[var(--tx)] max-w-[200px] truncate" title={deal.f_opp_name}>{deal.f_opp_name || '—'}</td>}
      {cols.amount     && <td className="px-3 py-2 text-[12px] font-[600] text-[var(--tx)] whitespace-nowrap text-right">{fmt(deal.f_amount_num)}</td>}
      {cols.close      && (
        <td className={`px-3 py-2 text-[12px] whitespace-nowrap font-[500] ${cdPast ? 'text-red-600' : cdNear ? 'text-amber-600' : 'text-[var(--tx2)]'}`}>
          {cdStr}
          {deal._slippageDays > 0 && (
            <span className="ml-1.5 text-[9px] font-[700] uppercase tracking-wide text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-700">
              +{deal._slippageDays}d
            </span>
          )}
        </td>
      )}
      {cols.stage      && <td className="px-3 py-2 text-[11px] text-[var(--tx2)] whitespace-nowrap max-w-[120px] truncate" title={deal.f_stage}>{deal.f_stage || '—'}</td>}
      {cols.fc         && (
        <td className="px-3 py-2">
          <span className="text-[10px] font-[700] uppercase tracking-wide" style={{ color: CAT_ACCENT[deal.f_fc_cat_norm] || '#6b7280' }}>
            {getVocab()[deal.f_fc_cat_norm] ?? deal.f_fc_cat_norm ?? '—'}
          </span>
        </td>
      )}
      {cols.nextstep   && (
        <td className="px-3 py-2 text-[11px] text-[var(--tx2)] max-w-[200px]" title={deal.f_next_step || ''}>
          {nsStr}
          {daysSinceActivity !== null && daysSinceActivity >= 7 && (
            <div className={`text-[9px] font-[600] mt-0.5 ${daysSinceActivity >= 14 ? 'text-red-500' : 'text-amber-500'}`}>
              {daysSinceActivity}d since activity
            </div>
          )}
        </td>
      )}
      {cols.competitor && (
        <td className="px-3 py-2 text-[11px] max-w-[100px] truncate" title={competitor || 'None identified'}>
          {competitor
            ? <span className="text-orange-700 dark:text-orange-300 font-[500]">{competitor.length > 20 ? competitor.substring(0, 20) + '…' : competitor}</span>
            : <span className="text-[var(--tx2)] opacity-50">—</span>
          }
        </td>
      )}
      {cols.map        && (
        <td className="px-3 py-2 text-center">
          {deal.f_has_map
            ? <span className="text-[11px] text-green-600 font-[600]">✓</span>
            : <span className="text-[11px] text-[var(--tx2)] opacity-40">✗</span>
          }
        </td>
      )}
      {cols.daysstage  && (
        <td className={`px-3 py-2 text-[11px] font-[500] whitespace-nowrap ${daysInStage > 30 ? 'text-red-600' : daysInStage > 14 ? 'text-amber-600' : 'text-[var(--tx2)]'}`}>
          {daysInStage > 0 ? `${daysInStage}d` : '—'}
        </td>
      )}
      {cols.flags      && (
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {(deal._flags || []).length > 0
              ? (deal._flags || []).map((f, i) => <FlagChip key={i} flag={f} />)
              : <span className="text-[10px] text-green-600">✓ clean</span>
            }
          </div>
        </td>
      )}
      {cols.aiaction   && (
        <td className="px-3 py-2 text-[11px]" onClick={e => e.stopPropagation()}>
          {repResult?.loading
            ? <span className="flex gap-1">{[0,200,400].map(d => <span key={d} className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--blue)] animate-pulse" style={{ animationDelay: `${d}ms` }} />)}</span>
            : repResult?.error
              ? <span className="text-red-500 text-[10px]" title={repResult.error}>⚠ {repResult.error.slice(0, 40)}</span>
              : aiAction
                ? (
                  <span className={`inline-flex flex-col gap-0.5`}>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-[600] px-1.5 py-0.5 rounded ${AI_RISK_BG[aiAction.risk] || AI_RISK_BG.medium} ${AI_RISK_COLORS[aiAction.risk] || AI_RISK_COLORS.medium}`}>
                      {aiAction.framework && <span className="opacity-60">{aiAction.framework} ·</span>} {aiAction.flag}
                    </span>
                    {aiAction.note && <span className="text-[10px] text-[var(--tx2)]">{aiAction.note}</span>}
                  </span>
                )
                : null
          }
        </td>
      )}
      {cols.note       && (
        <td className="px-3 py-2 min-w-[140px]" onClick={e => e.stopPropagation()}>
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

// ── Copy-for-AE text builder ──────────────────────────────────

function buildAECopyText(owner, deals, repResults) {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const lines = [`📋 Pipeline Review — ${owner} — ${today}`, '']
  const sorted = [...deals].sort((a, b) => {
    const aMax = (a._flags || []).reduce((s, f) => Math.max(s, f.sev === 'critical' ? 2 : 1), 0)
    const bMax = (b._flags || []).reduce((s, f) => Math.max(s, f.sev === 'critical' ? 2 : 1), 0)
    return bMax - aMax || (b.f_amount_num || 0) - (a.f_amount_num || 0)
  })

  const flagged = sorted.filter(d => (d._flags || []).length > 0)
  const clean   = sorted.filter(d => (d._flags || []).length === 0)

  const FLAG_SUGGESTIONS = {
    NO_NEXT_STEP:      'Add a specific next step with date and owner.',
    CLOSE_PAST:        'Close date has passed — update to reflect current timeline.',
    LAST_ACTIVITY_14D: 'No activity in 14+ days — re-engage immediately.',
    NO_MAP:            'Create a Mutual Action Plan to align on path to close.',
    STUCK_IN_STAGE:    'Diagnose the stall point and agree on a next milestone.',
    MEDDPICC_E:        'Identify and engage the Economic Buyer directly.',
    MEDDPICC_C:        'Validate a clear Champion who can influence the decision.',
    MEDDPICC_M:        'Quantify business metrics to justify the investment.',
    MEDDPICC_I:        'Document the Implicated Pain driving urgency to act.',
    LOW_LEVEL_CONTACT: 'Multi-thread to exec level — engage the Economic Buyer.',
    FC_TOO_HIGH:       'Forecast category may be overstated for current stage.',
    CLOSE_3BD:         'Close within 3 days — confirm verbal commitment and path to signature.',
  }

  flagged.forEach(d => {
    const topFlag  = [...(d._flags || [])].sort((a, b) => (b.weight || 0) - (a.weight || 0))[0]
    const aiEntry  = findDealAction(repResults[d._owner]?.aiFlags, d.f_opp_name)
    const emoji    = topFlag?.sev === 'critical' ? '🔴' : '🟡'
    const cdStr    = d.f_close_date ? new Date(d.f_close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?'
    const amtStr   = d.f_amount_num ? `$${Math.round(d.f_amount_num / 1000)}k` : ''
    lines.push(`${emoji} ${d.f_opp_name || 'Unknown'} (${amtStr} · ${cdStr})`)
    const note = aiEntry?.note || (topFlag && FLAG_SUGGESTIONS[topFlag.id]) || topFlag?.label || ''
    if (note) lines.push(`   ⚡ ${note}`)
    const action = aiEntry?.action || (topFlag && FLAG_SUGGESTIONS[topFlag.id])
    if (action && action !== note) lines.push(`   → ${action}`)
    lines.push('')
  })

  if (clean.length > 0) {
    lines.push(`✅ Clean: ${clean.map(d => d.f_opp_name || 'Unknown').join(', ')}`)
    lines.push('')
  }

  lines.push('──')
  lines.push('Generated by Moat Pipeline Inspector')
  return lines.join('\n')
}

// ── Rep scorecard ─────────────────────────────────────────────

function RepScorecard({ owner, deals, repResult, repResults }) {
  const [copied, setCopied] = useState(false)
  const pipe      = deals.reduce((s, d) => s + (d.f_amount_num || 0), 0)
  const critCount = deals.flatMap(d => d._flags || []).filter(f => f.sev === 'critical').length
  const cleanCount = deals.filter(d => (d._flags || []).length === 0).length
  const hygiene   = deals.length > 0 ? Math.round((cleanCount / deals.length) * 100) : 100
  const cats      = { worst_case: 0, call: 0, best_case: 0, pipeline: 0 }
  deals.forEach(d => { if (cats[d.f_fc_cat_norm] !== undefined) cats[d.f_fc_cat_norm]++ })

  const copyForAE = async (e) => {
    e.stopPropagation()
    const text = buildAECopyText(owner, deals, repResults || {})
    try { await navigator.clipboard.writeText(text) } catch {
      const blob = new Blob([text], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `moat-review-${owner.replace(/\s+/g, '-')}.txt`; a.click()
      URL.revokeObjectURL(url)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <tr className="bg-[var(--bg2)]/60 border-b border-[var(--bdr2)]">
      <td colSpan={99} className="px-4 py-2">
        <div className="flex items-center gap-4 flex-wrap text-[11px]">
          <span className="font-[700] text-[var(--tx)] text-[12px]">{owner}</span>
          <span className="text-[var(--tx2)]">{fmt(pipe)}</span>
          <span className="text-[var(--tx2)]">{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1.5">
            {cats.worst_case > 0 && <span className="text-[10px] font-[700] text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">{cats.worst_case}WC</span>}
            {cats.call       > 0 && <span className="text-[10px] font-[700] text-green-700 bg-green-50 dark:bg-green-950/40 px-1.5 py-0.5 rounded">{cats.call}C</span>}
            {cats.best_case  > 0 && <span className="text-[10px] font-[700] text-amber-700 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">{cats.best_case}BC</span>}
            {cats.pipeline   > 0 && <span className="text-[10px] font-[700] text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{cats.pipeline}Pp</span>}
          </div>
          {critCount > 0
            ? <span className="text-red-600 font-[700]">🔴 {critCount} critical</span>
            : <span className="text-green-600 font-[600]">✓ no criticals</span>
          }
          <span className={`font-[600] ${hygiene >= 80 ? 'text-green-600' : hygiene >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {hygiene}% hygiene
          </span>
          {repResult?.summary && (
            <span className="text-purple-700 dark:text-purple-300 italic truncate max-w-[240px]" title={repResult.summary}>
              ✨ {repResult.summary}
            </span>
          )}
          <button
            onClick={copyForAE}
            className={`ml-auto btn text-[10px] py-0.5 px-2 flex items-center gap-1 ${copied ? 'border-green-500 text-green-700' : ''}`}
            title="Copy pipeline review for this AE"
          >
            {copied ? '✓ Copied' : '📋 Copy for AE'}
          </button>
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

function InspectorTable({ groups, cols, repResults, collapsed, onToggle, groupBy, onOpenDeal }) {
  const visibleCols = Object.entries(cols).filter(([, v]) => v).map(([k]) => k)
  const colCount    = visibleCols.length

  const COL_HEADERS = {
    ae: 'AE', deal: 'Deal', amount: 'Amount', close: 'Close',
    stage: 'Stage', fc: 'FC', nextstep: 'Next Step',
    competitor: 'Competitor', map: 'MAP', daysstage: 'Days/Stage',
    flags: 'Rules Flags', aiaction: 'AI Insights', note: 'Manager Note',
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
                    repResults={repResults}
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
                              onOpen={onOpenDeal}
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
                          onOpen={onOpenDeal}
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
  const items = [
    { label: 'AEs',             val: stats.aes,          color: '' },
    { label: 'Active deals',    val: stats.deals,        color: '' },
    { label: 'Total pipeline',  val: fmt(stats.pipe),    color: '' },
    { label: 'Critical flags',  val: stats.crit,         color: 'text-red-600' },
    { label: 'Warnings',        val: stats.warn,         color: 'text-amber-600' },
    { label: 'AEs w/ critical', val: stats.aesWithCrit,  color: 'text-red-600' },
    ...(stats.withMap    !== undefined ? [{ label: 'With MAP',    val: stats.withMap,    color: 'text-green-600' }] : []),
    ...(stats.competitive !== undefined ? [{ label: 'Competitive', val: stats.competitive, color: 'text-orange-600' }] : []),
  ]
  return (
    <div className="card overflow-hidden mb-3">
      <div className={`grid grid-cols-${items.length} divide-x divide-[var(--bdr2)]`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((s, i) => (
          <div key={i} className="flex flex-col items-center justify-center py-3">
            <div className={`text-[18px] font-[700] ${s.color}`}>{s.val}</div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--tx2)] mt-0.5 text-center">{s.label}</div>
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
  { id: 'ae',         label: 'AE'          },
  { id: 'deal',       label: 'Deal'        },
  { id: 'amount',     label: 'Amount'      },
  { id: 'close',      label: 'Close'       },
  { id: 'stage',      label: 'Stage'       },
  { id: 'fc',         label: 'FC'          },
  { id: 'nextstep',   label: 'Next Step'   },
  { id: 'competitor', label: 'Competitor'  },
  { id: 'map',        label: 'MAP'         },
  { id: 'daysstage',  label: 'Days/Stage'  },
  { id: 'flags',      label: 'Rule Flags'  },
  { id: 'aiaction',   label: 'AI Insights' },
  { id: 'note',       label: 'Note'        },
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

// ── Deal Drawer ───────────────────────────────────────────────

const RATING_STYLE = {
  strong:  { bg: 'bg-green-50 dark:bg-green-950/30',  text: 'text-green-700 dark:text-green-300',  label: 'Strong'  },
  weak:    { bg: 'bg-amber-50 dark:bg-amber-950/30',  text: 'text-amber-700 dark:text-amber-300',  label: 'Weak'    },
  missing: { bg: 'bg-red-50 dark:bg-red-950/30',      text: 'text-red-700 dark:text-red-300',      label: 'Missing' },
}
const WHY_STYLE = {
  filled: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
  gap:    { bg: 'bg-red-100 dark:bg-red-900/40',     text: 'text-red-700 dark:text-red-300'     },
}
const THREAT_STYLE = {
  high:   { bg: 'bg-red-50 dark:bg-red-950/30',      text: 'text-red-700 dark:text-red-300'    },
  medium: { bg: 'bg-amber-50 dark:bg-amber-950/30',  text: 'text-amber-700 dark:text-amber-300'},
  low:    { bg: 'bg-green-50 dark:bg-green-950/30',  text: 'text-green-700 dark:text-green-300'},
  none:   { bg: 'bg-[var(--bg2)]',                   text: 'text-[var(--tx2)]'                 },
}

function DealDrawer({ deal, repResult, apiKey, onClose }) {
  const insp = useInspectorStore()
  const [activeTab, setActiveTab] = useState('overview')
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const dealKey    = (deal.f_opp_name || '').toLowerCase()
  const inspection = insp.dealInspections[dealKey]
  const abortRef   = useRef(null)

  const cd       = deal.f_close_date ? new Date(deal.f_close_date) : null
  const daysLeft  = cd ? Math.round((cd - now) / 86400000) : null
  const cdStr     = cd ? cd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
  const la        = deal.f_last_activity ? new Date(deal.f_last_activity) : null
  const daysSince = la ? Math.round((now - la) / 86400000) : null

  const runInspection = async () => {
    if (!apiKey) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    insp.setDealInspectionLoading(dealKey)
    try {
      const result = await fetchDealInspection({ deal, apiKey, signal: ac.signal })
      insp.setDealInspectionResult(dealKey, result)
      insp.logUsage(result.inputTokens, result.outputTokens, 0, 1)
    } catch (err) {
      if (err.name !== 'AbortError') insp.setDealInspectionError(dealKey, err.message)
    }
  }

  // Build at-a-glance pills: rule flags + AI risk first
  const ruleFlags = [...(deal._flags || [])]
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, 4)

  const aiAction = findDealAction(repResult?.aiFlags, deal.f_opp_name)

  const pills = []
  if (aiAction) {
    const riskLabel = aiAction.risk === 'critical' ? '🔴' : aiAction.risk === 'high' ? '🟡' : '🟠'
    pills.push({ key: 'ai', emoji: riskLabel, text: aiAction.flag?.replace(/_/g, ' '), sev: aiAction.risk, isAI: true })
  }
  ruleFlags.forEach(f => {
    if (pills.length < 4) {
      const emoji = f.sev === 'critical' ? '🔴' : '🟡'
      pills.push({ key: f.id, emoji, text: f.label, sev: f.sev })
    }
  })
  const extraCount = Math.max(0, (deal._flags || []).length - pills.filter(p => !p.isAI).length)

  const primaryAction = inspection?.result?.action

  // Copy single deal summary
  const [copied, setCopied] = useState(false)
  const copySingle = async () => {
    const text = buildAECopyText(deal._owner || 'AE', [deal], repResult ? { [deal._owner]: repResult } : {})
    try { await navigator.clipboard.writeText(text) } catch {}
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const MEDDPICC_ROWS = [
    { letter: 'M', label: 'Metrics',            key: 'f_metrics'      },
    { letter: 'E', label: 'Economic Buyer',      key: 'f_econ_buyer'   },
    { letter: 'DC', label: 'Decision Criteria',  key: 'f_dec_criteria' },
    { letter: 'DP', label: 'Decision Process',   key: 'f_dec_process'  },
    { letter: 'PP', label: 'Procurement',        key: 'f_proc_process' },
    { letter: 'I',  label: 'Implicated Pain',    key: 'f_implicated'   },
    { letter: 'C',  label: 'Champion',           key: 'f_champion'     },
  ]

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {/* Panel */}
      <div className="w-[560px] max-w-[95vw] bg-[var(--bg)] border-l border-[var(--bdr2)] flex flex-col h-full overflow-hidden shadow-2xl">

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-3 border-b border-[var(--bdr2)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-[700] text-[var(--tx)] leading-tight truncate" title={deal.f_opp_name}>
                {deal.f_opp_name || 'Unknown Deal'}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] font-[700] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: CAT_ACCENT[deal.f_fc_cat_norm] || '#6b7280', background: CAT_ACCENT[deal.f_fc_cat_norm] + '18' || '#6b728018' }}>
                  {getVocab()[deal.f_fc_cat_norm] ?? deal.f_fc_cat_norm ?? '?'}
                </span>
                <span className="text-[12px] font-[600] text-[var(--tx)]">{fmt(deal.f_amount_num)}</span>
                <span className={`text-[11px] font-[500] ${daysLeft !== null && daysLeft < 0 ? 'text-red-600' : daysLeft !== null && daysLeft <= 14 ? 'text-amber-600' : 'text-[var(--tx2)]'}`}>
                  Close {cdStr}{daysLeft !== null ? ` (${daysLeft >= 0 ? daysLeft + 'd' : Math.abs(daysLeft) + 'd past'})` : ''}
                </span>
                {deal.f_days_in_stage > 30 && (
                  <span className="text-[10px] font-[600] text-red-600 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded">
                    {deal.f_days_in_stage}d in stage
                  </span>
                )}
                {deal.f_stage && <span className="text-[11px] text-[var(--tx2)]">{deal.f_stage}</span>}
              </div>
              <div className="text-[11px] text-[var(--tx2)] mt-0.5">{deal._owner}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={copySingle} className={`btn text-[10px] py-0.5 px-2 ${copied ? 'border-green-500 text-green-700' : ''}`} title="Copy review for this deal">
                {copied ? '✓' : '📋'}
              </button>
              <button onClick={onClose} className="btn text-[12px] w-7 h-7 flex items-center justify-center p-0">✕</button>
            </div>
          </div>

          {/* ── At-a-glance risk strip ── */}
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5 items-center">
              {pills.map(p => (
                <span key={p.key} className={`inline-flex items-center gap-1 text-[10px] font-[600] px-2 py-0.5 rounded-full border ${
                  p.sev === 'critical' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
                  : p.sev === 'high'   ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'
                  :                      'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'
                }`}>
                  {p.emoji} {p.text}
                  {p.isAI && <span className="opacity-50 text-[8px]">AI</span>}
                </span>
              ))}
              {extraCount > 0 && (
                <span className="text-[10px] text-[var(--tx2)] font-[500]">+{extraCount} more</span>
              )}
              {pills.length === 0 && (
                <span className="text-[11px] text-green-600 font-[500]">✓ No flags</span>
              )}
            </div>
            {primaryAction && (
              <div className="mt-2 text-[11px] text-[var(--tx)] font-[600] italic border-l-2 border-purple-400 pl-2">
                {primaryAction}
              </div>
            )}
            {!primaryAction && apiKey && !inspection?.loading && (
              <button onClick={() => { setActiveTab('ai'); runInspection() }} className="mt-1.5 text-[10px] text-purple-600 dark:text-purple-400 hover:underline">
                ✨ Run AI for deeper analysis
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-[var(--bdr2)] px-5 bg-[var(--bg)]">
          {[{ id: 'overview', label: 'Overview' }, { id: 'meddpicc', label: 'MEDDPICC' }, { id: 'ai', label: 'AI Analysis' }].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 text-[11px] font-[600] border-none bg-transparent cursor-pointer -mb-px transition-colors ${
                activeTab === t.id
                  ? 'text-[var(--blue)] border-b-2 border-[var(--blue)]'
                  : 'text-[var(--tx2)] hover:text-[var(--tx)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-[12px]">

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-4">
              {/* Next Step */}
              <div>
                <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-1.5">Next Step</div>
                <div className="bg-[var(--bg2)] rounded-lg p-3 text-[12px] text-[var(--tx)] leading-relaxed whitespace-pre-wrap">
                  {deal.f_next_step?.trim() || <span className="text-red-500 font-[500]">Empty — no next step recorded.</span>}
                </div>
                {daysSince !== null && (
                  <div className={`text-[10px] mt-1 font-[500] ${daysSince >= 14 ? 'text-red-500' : daysSince >= 7 ? 'text-amber-500' : 'text-[var(--tx2)]'}`}>
                    Last activity: {daysSince}d ago {daysSince >= 14 ? '⚠' : ''}
                  </div>
                )}
              </div>

              {/* Key signals row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Competitor */}
                <div className="bg-[var(--bg2)] rounded-lg p-3">
                  <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-1">Competitor</div>
                  {deal.f_competitor?.trim()
                    ? <span className="text-orange-700 dark:text-orange-300 font-[600]">{deal.f_competitor}</span>
                    : <span className="text-[var(--tx2)] italic">Not identified</span>
                  }
                </div>
                {/* MAP */}
                <div className="bg-[var(--bg2)] rounded-lg p-3">
                  <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-1">Mutual Action Plan</div>
                  {deal.f_has_map
                    ? <a href={deal.f_map} target="_blank" rel="noopener noreferrer" className="text-green-600 font-[600] hover:underline" onClick={e => e.stopPropagation()}>✓ MAP exists ↗</a>
                    : <span className="text-red-500 font-[500]">✗ No MAP</span>
                  }
                </div>
                {/* Win Room */}
                <div className="bg-[var(--bg2)] rounded-lg p-3">
                  <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-1">Win Room</div>
                  {deal.f_has_win_room
                    ? <a href={deal.f_win_room} target="_blank" rel="noopener noreferrer" className="text-green-600 font-[600] hover:underline" onClick={e => e.stopPropagation()}>✓ Open ↗</a>
                    : <span className="text-[var(--tx2)] italic">Not opened</span>
                  }
                </div>
                {/* Contact */}
                <div className="bg-[var(--bg2)] rounded-lg p-3">
                  <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-1">Primary Contact</div>
                  <div className="font-[600] text-[var(--tx)] truncate">{deal.f_primary_contact || deal.f_champion || '—'}</div>
                  {deal.f_contact_title && <div className="text-[10px] text-[var(--tx2)] mt-0.5">{deal.f_contact_title}</div>}
                </div>
              </div>

              {/* Manager Notes */}
              {deal.f_manager_notes?.trim() && (
                <div>
                  <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-1.5">Manager Notes</div>
                  <div className="bg-[var(--bg2)] rounded-lg p-3 text-[11px] text-[var(--tx)] leading-relaxed whitespace-pre-wrap max-h-[180px] overflow-y-auto">
                    {deal.f_manager_notes.trim()}
                  </div>
                </div>
              )}

              {/* SDR Notes */}
              {deal.f_sdr_notes?.trim() && (
                <div>
                  <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-1.5">SDR Notes</div>
                  <div className="bg-[var(--bg2)] rounded-lg p-3 text-[11px] text-[var(--tx)] leading-relaxed whitespace-pre-wrap max-h-[140px] overflow-y-auto">
                    {deal.f_sdr_notes.trim()}
                  </div>
                </div>
              )}

              {/* Metadata row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--tx2)] border-t border-[var(--bdr2)] pt-3">
                {deal.f_lead_type    && <span>Lead: <b>{deal.f_lead_type}</b></span>}
                {deal.f_revenue_motion && <span>Motion: <b>{deal.f_revenue_motion}</b></span>}
                {deal.f_product_interest && <span>Product: <b>{deal.f_product_interest}</b></span>}
                {deal.f_days_in_stage > 0 && <span>Days in stage: <b className={deal.f_days_in_stage > 30 ? 'text-red-600' : ''}>{deal.f_days_in_stage}</b></span>}
                {deal.f_age > 0 && <span>Deal age: <b>{deal.f_age}d</b></span>}
                {deal.f_ref_partner && <span>Partner: <b>{deal.f_ref_partner}</b></span>}
              </div>
            </div>
          )}

          {/* MEDDPICC tab */}
          {activeTab === 'meddpicc' && (
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-lg border border-[var(--bdr2)]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg2)] text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
                      <th className="px-3 py-2 text-left w-8">·</th>
                      <th className="px-3 py-2 text-left w-32">Field</th>
                      <th className="px-3 py-2 text-left">Content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MEDDPICC_ROWS.map(({ letter, label, key }) => {
                      const val = (deal[key] || '').trim()
                      return (
                        <tr key={key} className="border-t border-[var(--bdr2)]">
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block w-4 h-4 rounded-full text-[8px] font-[700] flex items-center justify-center ${val ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                              {val ? '✓' : '✗'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[11px] font-[600] text-[var(--tx)] whitespace-nowrap">
                            <span className="text-[9px] font-[700] text-[var(--tx2)] mr-1">{letter}</span>{label}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-[var(--tx)] leading-relaxed">
                            {val
                              ? <span className="line-clamp-3" title={val}>{val.length > 200 ? val.substring(0, 200) + '…' : val}</span>
                              : <span className="text-[var(--tx2)] italic">Empty</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {deal.f_meddpicc_notes?.trim() && (
                <div>
                  <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-1.5">MEDDPICC Rep Notes</div>
                  <div className="bg-[var(--bg2)] rounded-lg p-3 text-[11px] text-[var(--tx)] leading-relaxed whitespace-pre-wrap max-h-[220px] overflow-y-auto">
                    {deal.f_meddpicc_notes.trim()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Analysis tab */}
          {activeTab === 'ai' && (
            <div className="flex flex-col gap-3">
              {/* Run button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={runInspection}
                  disabled={!apiKey || inspection?.loading}
                  className="btn btn-primary text-[11px] flex items-center gap-1.5 disabled:opacity-50"
                >
                  {inspection?.loading
                    ? <><span className="inline-block w-2 h-2 rounded-full bg-white/60 animate-pulse" /> Analysing…</>
                    : inspection?.result ? '↺ Re-run Analysis' : '✨ Run Deep Inspection'
                  }
                </button>
                {!apiKey && <span className="text-[11px] text-[var(--tx2)]">Add API key in Settings to enable.</span>}
              </div>

              {inspection?.error && (
                <div className="text-[11px] text-red-600 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
                  ⚠ {inspection.error}
                </div>
              )}

              {inspection?.loading && (
                <div className="flex flex-col gap-2">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-16 rounded-lg bg-[var(--bg2)] animate-pulse" />
                  ))}
                </div>
              )}

              {inspection?.result && (() => {
                const r = inspection.result
                return (
                  <div className="flex flex-col gap-3">
                    {/* Next Step */}
                    {r.nextStep && (() => {
                      const s = RATING_STYLE[r.nextStep.rating] || RATING_STYLE.weak
                      return (
                        <div className={`rounded-lg p-3 ${s.bg}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">Next Step</span>
                            <span className={`text-[10px] font-[700] px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                          </div>
                          <p className={`text-[12px] ${s.text}`}>{r.nextStep.note}</p>
                        </div>
                      )
                    })()}

                    {/* 3 Whys */}
                    {r.threeWhys && (
                      <div className="bg-[var(--bg2)] rounded-lg p-3">
                        <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-2">3 Whys (Command of Message)</div>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {[
                            { label: 'Why Change', val: r.threeWhys.whyChange },
                            { label: 'Why Now',    val: r.threeWhys.whyNow    },
                            { label: 'Why Remote', val: r.threeWhys.whyRemote },
                          ].map(({ label, val }) => {
                            const s = WHY_STYLE[val] || WHY_STYLE.gap
                            return (
                              <div key={label} className={`rounded p-2 text-center ${s.bg}`}>
                                <div className="text-[9px] font-[600] text-[var(--tx2)] mb-0.5">{label}</div>
                                <div className={`text-[11px] font-[700] capitalize ${s.text}`}>{val}</div>
                              </div>
                            )
                          })}
                        </div>
                        <p className="text-[11px] text-[var(--tx2)] italic">{r.threeWhys.note}</p>
                      </div>
                    )}

                    {/* MEDDPICC score */}
                    {r.meddpicc && (
                      <div className="bg-[var(--bg2)] rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">MEDDPICC</span>
                          <span className="text-[13px] font-[700] text-[var(--tx)]">{r.meddpicc.score}</span>
                          {r.meddpicc.gaps && r.meddpicc.gaps !== 'none' && (
                            <span className="text-[10px] text-red-600 font-[500]">Gaps: {r.meddpicc.gaps}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--tx2)]">{r.meddpicc.note}</p>
                      </div>
                    )}

                    {/* Competitive */}
                    {r.competitive && (() => {
                      const s = THREAT_STYLE[r.competitive.threat] || THREAT_STYLE.none
                      return (
                        <div className={`rounded-lg p-3 ${s.bg}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)]">Competitive</span>
                            <span className={`text-[10px] font-[700] capitalize ${s.text}`}>{r.competitive.threat} threat</span>
                            {r.competitive.competitor && r.competitive.competitor !== 'none' && (
                              <span className="text-[10px] text-orange-700 dark:text-orange-300 font-[500]">{r.competitive.competitor}</span>
                            )}
                          </div>
                          <p className={`text-[11px] ${s.text}`}>{r.competitive.note}</p>
                        </div>
                      )
                    })()}

                    {/* Primary Action */}
                    {r.action && (
                      <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                        <div className="text-[10px] font-[700] uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">Primary Action</div>
                        <p className="text-[13px] font-[600] text-purple-900 dark:text-purple-200 leading-snug">{r.action}</p>
                      </div>
                    )}
                  </div>
                )
              })()}

              {!inspection && !inspection?.loading && (
                <p className="text-[12px] text-[var(--tx2)]">Click Run to get a structured analysis using MEDDPICC, 3 Whys, and competitive positioning.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Inspector root ────────────────────────────────────────────

export default function Inspector() {
  const importedData  = useForecastStore(s => s.importedData)
  const quarterLabel  = useForecastStore(s => s.quarterLabel)
  const insp          = useInspectorStore()
  const { user }      = useSessionStore()
  useVocabStore(s => s.vocab) // subscribe for reactivity when labels change

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
    stage: true, fc: true, nextstep: true,
    competitor: true, map: true, daysstage: false,
    flags: true, aiaction: true, note: false,
  })
  const [filterCompetitors, setFilterCompetitors] = useState([])
  const [filterNoMap,  setFilterNoMap]  = useState(false)
  const [filterStuck,  setFilterStuck]  = useState(false)
  const inspectedDeal = useInspectorStore(s => s.inspectedDeal)
  const openDealDrawer  = useInspectorStore(s => s.openDealDrawer)
  const closeDealDrawer = useInspectorStore(s => s.closeDealDrawer)
  const abortRef = useRef(null)
  const slackRef = useRef(null)
  const [runError,      setRunError]      = React.useState(null)
  const [localRunning,  setLocalRunning]  = React.useState(false)
  const [lastRunDate,   setLastRunDate]   = React.useState(null)

  // Pick up pending AE filter set by RepPanel navigation
  const pendingAEFilter    = useInspectorStore(s => s.pendingAEFilter)
  const clearPendingAEFilter = useInspectorStore(s => s.clearPendingAEFilter)
  React.useEffect(() => {
    if (pendingAEFilter) {
      setFilterAEs([pendingAEFilter])
      clearPendingAEFilter()
    }
  }, [pendingAEFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore last run from localStorage with 7-day TTL
  React.useEffect(() => {
    if (allDeals.length > 0) return
    try {
      const raw = localStorage.getItem('moat-inspector-last-run')
      if (!raw) return
      const { data: lr, ts } = JSON.parse(raw)
      if (Date.now() - ts > 7 * 24 * 3600 * 1000) {
        localStorage.removeItem('moat-inspector-last-run')
        return
      }
      if (!lr?.active?.length) return
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
      const allFlags    = lr.active.flatMap(d => d._flags || [])
      const aesWithCrit = sorted.filter(([, deals]) =>
        deals.flatMap(d => d._flags || []).some(f => f.sev === 'critical')
      ).length
      const commitTierR = lr.active.filter(d => ['worst_case', 'call'].includes(d.f_fc_cat_norm))
      setStats({
        aes: sorted.length,
        deals: lr.active.length,
        pipe: lr.active.reduce((s, d) => s + d.f_amount_num, 0),
        crit: allFlags.filter(f => f.sev === 'critical').length,
        warn: allFlags.filter(f => f.sev === 'warn').length,
        aesWithCrit,
        withMap: commitTierR.filter(d => d.f_has_map).length,
        competitive: lr.active.filter(d => (d.f_competitor || '').trim()).length,
      })
      setLastRunDate(new Date(ts))
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear cached last-run when new import data arrives
  const importMetaFilename = useForecastStore(s => s.importMeta?.filename)
  const prevFilenameRef = React.useRef(importMetaFilename)
  React.useEffect(() => {
    if (prevFilenameRef.current !== undefined && prevFilenameRef.current !== importMetaFilename) {
      localStorage.removeItem('moat-inspector-last-run')
      setLastRunDate(null)
    }
    prevFilenameRef.current = importMetaFilename
  }, [importMetaFilename])

  // Effective column visibility — aiaction auto-shows when AI is on
  const effectiveCols = useMemo(() => ({
    ...colsVisible,
    aiaction: colsVisible.aiaction || aiActive,
    ae: colsVisible.ae && insp.groupBy !== 'rep', // hide AE col when grouped by rep
  }), [colsVisible, aiActive, insp.groupBy])

  // Filter options
  const allAEs   = useMemo(() => [...new Set(allDeals.map(d => d._owner))].sort(), [allDeals])
  const allCats  = CAT_ORDER
  const allComps = useMemo(() => {
    const seen = new Set()
    allDeals.forEach(d => { if (d.f_competitor?.trim()) seen.add(d.f_competitor.trim()) })
    return [...seen].sort()
  }, [allDeals])

  // Filtered + grouped + sorted deals
  const visibleDeals = useMemo(() => {
    let d = allDeals
    if (filterAEs.length)          d = d.filter(x => filterAEs.includes(x._owner))
    if (filterCats.length)         d = d.filter(x => filterCats.includes(x.f_fc_cat_norm))
    if (filterFlags.length)        d = d.filter(x => (x._flags || []).some(f => filterFlags.includes(f.id)))
    if (filterCompetitors.length)  d = d.filter(x => filterCompetitors.includes((x.f_competitor || '').trim()))
    if (filterNoMap)               d = d.filter(x => !x.f_has_map)
    if (filterStuck)               d = d.filter(x => x.f_days_in_stage > 30)
    if (insp.flaggedOnly)          d = d.filter(x => (x._flags || []).length > 0)
    return d
  }, [allDeals, filterAEs, filterCats, filterFlags, filterCompetitors, filterNoMap, filterStuck, insp.flaggedOnly])

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

      const commitTier = active.filter(d => ['worst_case', 'call'].includes(d.f_fc_cat_norm))
      const withMap    = commitTier.filter(d => d.f_has_map).length
      const competitive = active.filter(d => (d.f_competitor || '').trim()).length

      setAllDeals(active)
      setRepsSorted(sorted)
      setFilterAEs([]); setFilterCats([]); setFilterFlags([])
      setStats({
        aes: sorted.length, deals: active.length,
        pipe: active.reduce((s, d) => s + d.f_amount_num, 0),
        crit: critCount, warn: warnCount, aesWithCrit,
        withMap, competitive,
      })

      // Use getState() for actions — they are stable references regardless
      const { startRun, finishRun, stopRun: storeStop,
              setRepLoading, setRepResult, setRepError: storeRepError,
              logUsage } = useInspectorStore.getState()

      startRun(null)
      started = true
      sorted.forEach(([owner]) => setRepLoading(owner))

      if (!runAiActive) {
        const lr = { repsSorted: sorted, active, runDate: new Date() }
        finishRun(lr)
        try { localStorage.setItem('moat-inspector-last-run', JSON.stringify({ data: lr, ts: Date.now() })) } catch {}
        setLastRunDate(new Date())
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
          setRunError(err.message)
        }
      }

      const lr = { repsSorted: sorted, active, runDate: new Date() }
      finishRun(lr)
      try { localStorage.setItem('moat-inspector-last-run', JSON.stringify({ data: lr, ts: Date.now() })) } catch {}
      setLastRunDate(new Date())
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
        {lastRunDate && !localRunning && !insp.isRunning && (
          <span className="text-[11px] text-[var(--tx2)]">
            Last run: {lastRunDate.toLocaleDateString()} · Re-run to refresh
          </span>
        )}

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
          options={allCats.map(c => ({ value: c, label: getVocab()[c] ?? c }))}
          value={filterCats}
          onChange={setFilterCats}
        />
        <MultiSelect
          label="Flag"
          options={FLAG_DEF_LIST.map(f => ({ value: f.id, label: f.label }))}
          value={filterFlags}
          onChange={setFilterFlags}
        />

        {allComps.length > 0 && (
          <MultiSelect
            label="Competitor"
            options={allComps.map(c => ({ value: c, label: c }))}
            value={filterCompetitors}
            onChange={setFilterCompetitors}
          />
        )}
        <button
          onClick={() => setFilterNoMap(v => !v)}
          className={`btn text-[11px] ${filterNoMap ? 'bg-orange-500 text-white border-orange-500' : ''}`}
          title="Show only deals without a MAP"
        >
          {filterNoMap ? 'No MAP ✓' : 'No MAP'}
        </button>
        <button
          onClick={() => setFilterStuck(v => !v)}
          className={`btn text-[11px] ${filterStuck ? 'bg-amber-500 text-white border-amber-500' : ''}`}
          title="Show only deals stuck >30d in stage"
        >
          {filterStuck ? 'Stuck ✓' : 'Stuck'}
        </button>
        {/* Flagged only toggle */}
        <button
          onClick={() => insp.setFlaggedOnly(!insp.flaggedOnly)}
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

      {/* Unmapped category banner */}
      <UnmappedBanner />

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
          onOpenDeal={openDealDrawer}
        />
      )}

      {/* Deal drawer */}
      {inspectedDeal && (
        <DealDrawer
          deal={inspectedDeal}
          repResult={insp.repResults[inspectedDeal._owner]}
          apiKey={apiKey}
          onClose={closeDealDrawer}
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
