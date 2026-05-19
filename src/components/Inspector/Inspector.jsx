import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useForecastStore, useInspectorStore, useSectionComments } from '../../store/forecastStore'
import { flagDeal, dealWeight } from '../../lib/flags'
import { fetchAISummary, fetchManagerInsights, DEFAULT_SYSTEM_PROMPT } from '../../lib/ai'
import { formatSlackMessage } from '../../lib/slackFormatter'
import { getVocab, useVocabStore } from '../../lib/vocab'
import { fmt } from '../../lib/fmt'
import UnmappedBanner from '../shared/UnmappedBanner'

// ── Risk dimension definitions ─────────────────────────────────
const CAT_ORDER  = ['worst_case', 'call', 'best_case', 'pipeline']
const CAT_ACCENT = { worst_case: '#1a56db', call: '#0d7c3d', best_case: '#b45309', pipeline: '#6b7280' }

const RISK_DIMS = [
  {
    id: 'execution',
    label: 'Execution',
    desc: 'Champion, next steps, close date, and deal activity',
    flagIds: new Set(['CLOSE_PAST','CLOSE_3BD','CLOSE_WEEKEND','CLOSE_10BD_DISC',
      'NO_NEXT_STEP','LAST_ACTIVITY_14D','NO_ACTIVITY_DATA','AMOUNT_ZERO',
      'FC_TOO_HIGH','FC_TOO_LOW','MEDDPICC_C']),
    fields: [
      { key: 'f_champion',  label: 'Champion (C)' },
      { key: 'f_next_step', label: 'Next Step' },
    ],
  },
  {
    id: 'econ_buyer',
    label: 'Economic Buyer',
    desc: 'EB identified and documented',
    flagIds: new Set(['MEDDPICC_E']),
    fields: [{ key: 'f_econ_buyer', label: 'Economic Buyer (E)' }],
  },
  {
    id: 'competitive',
    label: 'Competitive',
    desc: 'Differentiation and decision criteria captured',
    flagIds: new Set(['MEDDPICC_DC']),
    fields: [
      { key: 'f_dec_criteria', label: 'Decision Criteria (DC)' },
      { key: 'f_competitor',   label: 'Competitor / Do Nothing Risk' },
    ],
  },
  {
    id: 'procurement',
    label: 'Procurement / Process',
    desc: 'Decision and procurement path mapped',
    flagIds: new Set(['MEDDPICC_DP', 'MEDDPICC_PP']),
    fields: [
      { key: 'f_dec_process',  label: 'Decision Process (DP)' },
      { key: 'f_proc_process', label: 'Procurement Process (PP)' },
    ],
  },
  {
    id: 'justification',
    label: 'Deal Justification',
    desc: 'Why Change, Why Now, Why Remote',
    flagIds: new Set(['MEDDPICC_M', 'MEDDPICC_I']),
    fields: [
      { key: 'f_metrics',    label: 'Metrics / Impact (M)' },
      { key: 'f_implicated', label: 'Implicated Pain (I)' },
      { key: 'f_why_change', label: 'Why Change' },
      { key: 'f_why_now',    label: 'Why Now' },
      { key: 'f_why_remote', label: 'Why Remote / Why Us' },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────
function dimRisk(deal, dim) {
  const flags = (deal._flags || []).filter(f => dim.flagIds.has(f.id))
  if (flags.some(f => f.sev === 'critical')) return 'critical'
  if (flags.length > 0) return 'warn'
  return 'ok'
}

function riskScore(deal) {
  return (deal._flags || []).reduce((s, f) => s + (f.weight || 0), 0)
}

// ── XLSX export ────────────────────────────────────────────────
async function exportXLSX(deals) {
  const XLSX  = await import('xlsx')
  const vocab = getVocab()
  const rows  = [[
    'Deal','Account','AE','Amount','FC Category','Stage','Close Date',
    'Next Step','Champion','Economic Buyer','Decision Criteria',
    'Decision Process','Procurement','Metrics','Implicated Pain',
    'Competitor','AE Notes','Flags','Risk Score',
  ]]
  deals.forEach(d => {
    const flags = (d._flags || []).map(f => `[${f.sev.toUpperCase()}] ${f.label}`).join('; ')
    const score = (d._flags || []).reduce((s, f) => s + (f.weight || 0), 0)
    rows.push([
      d.f_opp_name || '', d.f_account || '', d.f_owner || '', d.f_amount_num || 0,
      vocab[d.f_fc_cat_norm] || d.f_fc_cat_norm || '', d.f_stage || '', d.f_close_date || '',
      d.f_next_step || '', d.f_champion || '', d.f_econ_buyer || '', d.f_dec_criteria || '',
      d.f_dec_process || '', d.f_proc_process || '', d.f_metrics || '', d.f_implicated || '',
      d.f_competitor || '', d.f_ae_notes || '', flags, score,
    ])
  })
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [28,18,14,12,14,18,12,38,22,22,28,28,22,38,38,22,40,60,8].map(w => ({ wch: w }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inspection')
  XLSX.writeFile(wb, `moat-inspection-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── Risk dot strip ─────────────────────────────────────────────
function RiskDots({ deal }) {
  return (
    <div className="flex gap-0.5 flex-shrink-0 pt-0.5">
      {RISK_DIMS.map(dim => {
        const r = dimRisk(deal, dim)
        return (
          <span key={dim.id} title={`${dim.label}: ${r}`}
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: r === 'critical' ? '#ef4444' : r === 'warn' ? '#f59e0b' : '#22c55e' }}
          />
        )
      })}
    </div>
  )
}

// ── Deal list row (left panel) ─────────────────────────────────
function DealListRow({ deal, isSelected, onClick, isWhale }) {
  const vocab   = getVocab()
  const hasCrit = (deal._flags || []).some(f => f.sev === 'critical')

  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-[var(--bdr2)] transition-colors cursor-pointer border-none
        ${isSelected
          ? 'bg-[var(--blue)]/5 !border-l-[3px] !border-l-[var(--blue)]'
          : `hover:bg-[var(--bg2)] border-l-[3px] border-l-transparent ${hasCrit && !isSelected ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`
        }
      `}
    >
      <div className="flex items-start gap-2">
        <RiskDots deal={deal} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-[600] text-[var(--tx)] truncate">{deal.f_opp_name || '—'}</span>
            {isWhale && <span className="text-[9px] font-[700] bg-orange-100 dark:bg-orange-900/30 text-orange-600 px-1 py-px rounded flex-shrink-0">🐋</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[11px] font-[600] text-[var(--tx2)]">{fmt(deal.f_amount_num)}</span>
            <span className="text-[9px] font-[700] uppercase tracking-wide flex-shrink-0"
              style={{ color: CAT_ACCENT[deal.f_fc_cat_norm] || '#6b7280' }}>
              {vocab[deal.f_fc_cat_norm] ?? deal.f_fc_cat_norm ?? '—'}
            </span>
            {deal.f_owner && (
              <span className="text-[10px] text-[var(--tx2)] truncate">{deal.f_owner.split(' ')[0]}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Dimension card (right panel) ──────────────────────────────
function DimCard({ dim, deal }) {
  const [expanded, setExpanded] = useState(true)
  const flags     = (deal._flags || []).filter(f => dim.flagIds.has(f.id))
  const risk      = dimRisk(deal, dim)
  const isHighCat = ['worst_case', 'call'].includes(deal.f_fc_cat_norm)

  // Only show fields that either have a value OR are relevant for this category
  const relevantFields = dim.fields.filter(field => {
    const val = (deal[field.key] || '').trim()
    // Always show if there's a value; show empties only for high-cat or MEDDPICC core
    const isCoreField = ['f_champion','f_next_step','f_econ_buyer','f_dec_criteria',
                         'f_dec_process','f_proc_process','f_metrics','f_implicated'].includes(field.key)
    return val || (isHighCat && isCoreField) || (!isHighCat && isCoreField) || val
  })

  return (
    <div className={`rounded-lg border overflow-hidden ${
      risk === 'critical' ? 'border-red-200 dark:border-red-800'
      : risk === 'warn'   ? 'border-amber-200 dark:border-amber-800'
      : 'border-[var(--bdr2)]'
    }`}>
      <button onClick={() => setExpanded(e => !e)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer border-none ${
          risk === 'critical' ? 'bg-red-50/50 dark:bg-red-950/20'
          : risk === 'warn'   ? 'bg-amber-50/50 dark:bg-amber-950/20'
          : 'bg-[var(--bg2)]'
        }`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          risk === 'critical' ? 'bg-red-500' : risk === 'warn' ? 'bg-amber-400' : 'bg-green-500'
        }`} />
        <span className="text-[12px] font-[700] text-[var(--tx)] flex-1">{dim.label}</span>
        <span className={`text-[10px] font-[600] ${
          risk === 'critical' ? 'text-red-600' : risk === 'warn' ? 'text-amber-600' : 'text-green-600'
        }`}>
          {risk === 'critical' ? 'Critical' : risk === 'warn' ? 'Warning' : 'Clean'}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
          className={`text-[var(--tx2)] transition-transform flex-shrink-0 ${expanded ? '' : '-rotate-90'}`}>
          <path d="M5 7L1 3h8z" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 py-2.5 flex flex-col gap-2 bg-[var(--bg)]">
          {relevantFields.map(field => {
            const val = (deal[field.key] || '').trim()
            const isEmpty = !val
            const isRed   = isEmpty && isHighCat
            return (
              <div key={field.key}>
                <div className="text-[10px] font-[600] uppercase tracking-wide text-[var(--tx2)] mb-1">
                  {field.label}
                </div>
                <div className={`text-[12px] leading-snug rounded px-2.5 py-1.5 ${
                  isEmpty
                    ? isRed
                      ? 'bg-red-50 dark:bg-red-950/20 text-red-600 italic'
                      : 'bg-[var(--bg2)] text-[var(--tx2)] italic'
                    : 'bg-[var(--bg2)] text-[var(--tx)]'
                }`}>
                  {val || 'Not captured'}
                </div>
              </div>
            )
          })}

          {/* Execution extras: close date + last activity */}
          {dim.id === 'execution' && (
            <div className="flex gap-3 flex-wrap mt-0.5">
              {deal.f_close_date && (
                <div>
                  <div className="text-[10px] font-[600] uppercase tracking-wide text-[var(--tx2)] mb-1">Close Date</div>
                  <div className="text-[12px] text-[var(--tx)] bg-[var(--bg2)] rounded px-2.5 py-1.5">
                    {new Date(deal.f_close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {deal._slippageDays > 0 && (
                      <span className="ml-2 text-[9px] font-[700] uppercase text-amber-600 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                        +{deal._slippageDays}d slip
                      </span>
                    )}
                  </div>
                </div>
              )}
              {deal.f_last_activity && (
                <div>
                  <div className="text-[10px] font-[600] uppercase tracking-wide text-[var(--tx2)] mb-1">Last Activity</div>
                  <div className="text-[12px] text-[var(--tx)] bg-[var(--bg2)] rounded px-2.5 py-1.5">
                    {new Date(deal.f_last_activity).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              )}
            </div>
          )}

          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {flags.map((f, i) => (
                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-[500] ${
                  f.sev === 'critical'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                }`}>
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Inspection workspace (right panel, deal selected) ──────────
function InspectionWorkspace({ deal, onClose, totalPipe }) {
  const vocab                      = getVocab()
  const { comments, setComment }   = useSectionComments()
  const insp                       = useInspectorStore()
  const noteKey                    = `insp_deal_${(deal.f_opp_name || '').toLowerCase().replace(/\W+/g, '_')}`
  const noteVal                    = comments[noteKey] || ''
  const [aiLoading, setAiLoading]  = useState(false)
  const [aiText, setAiText]        = useState(null)
  const [aiError, setAiError]      = useState(null)
  const apiKey                     = insp.apiKey

  const whalePct   = totalPipe > 0 ? Math.round((deal.f_amount_num || 0) / totalPipe * 100) : 0
  const isWhale    = whalePct >= 20
  const now        = new Date(); now.setHours(0, 0, 0, 0)
  const cd         = deal.f_close_date ? new Date(deal.f_close_date) : null
  const cdPast     = cd && cd < now
  const calDays    = cd ? Math.floor((cd - now) / 86400000) : null
  const totalFlags = deal._flags || []
  const critCount  = totalFlags.filter(f => f.sev === 'critical').length
  const warnCount  = totalFlags.filter(f => f.sev === 'warn').length

  const generateAI = async () => {
    if (!apiKey) return
    setAiLoading(true); setAiError(null); setAiText(null)
    try {
      const res = await fetchAISummary({
        owner: deal.f_owner || 'Unknown',
        deals: [deal],
        apiKey,
        systemPrompt: insp.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        coachingFocus: insp.coachingFocus,
      })
      setAiText(res.summary)
    } catch (e) { setAiError(e.message) }
    setAiLoading(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Deal header */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-[var(--bdr2)] bg-[var(--bg)] flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-[700] text-[var(--tx)] break-words">{deal.f_opp_name || 'Unnamed Deal'}</h2>
            {isWhale && (
              <span className="text-[10px] font-[700] bg-orange-100 dark:bg-orange-900/30 text-orange-600 px-1.5 py-0.5 rounded flex-shrink-0">
                🐋 {whalePct}% of pipe
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[12px] text-[var(--tx2)]">
            {deal.f_account && <span className="truncate">{deal.f_account}</span>}
            {deal.f_owner   && <span className="flex-shrink-0">· {deal.f_owner}</span>}
            {deal.f_stage   && <span className="flex-shrink-0">· {deal.f_stage}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[20px] font-[800] text-[var(--tx)] leading-none">{fmt(deal.f_amount_num)}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-[700] uppercase tracking-wide"
              style={{ color: CAT_ACCENT[deal.f_fc_cat_norm] || '#6b7280' }}>
              {vocab[deal.f_fc_cat_norm] ?? deal.f_fc_cat_norm ?? '—'}
            </span>
            {cd && (
              <span className={`text-[11px] font-[600] flex-shrink-0 ${
                cdPast ? 'text-red-600' : calDays !== null && calDays <= 14 ? 'text-amber-600' : 'text-[var(--tx2)]'
              }`}>
                {cdPast ? 'Overdue' : calDays === 0 ? 'Today' : `${calDays}d`}
              </span>
            )}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg2)] text-[var(--tx2)] cursor-pointer border-none bg-transparent flex-shrink-0 mt-0.5">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="12" y2="12" /><line x1="12" y1="1" x2="1" y2="12" />
            </svg>
          </button>
        )}
      </div>

      {/* Risk strip */}
      {(critCount > 0 || warnCount > 0) && (
        <div className={`px-4 py-1.5 border-b border-[var(--bdr2)] text-[11px] flex items-center gap-3 flex-shrink-0 ${
          critCount > 0 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-amber-50 dark:bg-amber-950/20'
        }`}>
          {critCount > 0 && <span className="font-[700] text-red-700 dark:text-red-400">🔴 {critCount} critical</span>}
          {warnCount > 0 && <span className="font-[600] text-amber-700 dark:text-amber-400">🟡 {warnCount} warning{warnCount !== 1 ? 's' : ''}</span>}
          {critCount === 0 && warnCount === 0 && <span className="font-[600] text-green-600">✓ Clean deal</span>}
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {/* 5 risk dimension cards */}
        {RISK_DIMS.map(dim => <DimCard key={dim.id} dim={dim} deal={deal} />)}

        {/* AI insight — always shown; generate disabled when no API key */}
        <div className="rounded-lg border border-[var(--bdr2)] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg2)] border-b border-[var(--bdr2)]">
            <span className="text-[12px] font-[700] text-[var(--tx)]">✨ AI Deal Insight</span>
            <button onClick={generateAI} disabled={aiLoading || !apiKey}
              className="text-[11px] px-2.5 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:opacity-80 border-none cursor-pointer disabled:opacity-50">
              {aiLoading ? 'Thinking…' : aiText ? 'Regenerate' : 'Generate'}
            </button>
          </div>
          <div className="px-3 py-2.5 text-[12px]">
            {aiError  && <div className="text-red-600">{aiError}</div>}
            {aiText   && <div className="text-[var(--tx)] leading-relaxed whitespace-pre-wrap">{aiText}</div>}
            {!aiText && !aiLoading && !aiError && (
              <div className="text-[var(--tx2)]">
                {apiKey ? 'Generate AI coaching insight for this deal.' : 'Add your Anthropic API key in Settings → Inspector to enable AI insights.'}
              </div>
            )}
          </div>
        </div>

        {/* Manager notes */}
        <div className="rounded-lg border border-[var(--bdr2)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--bg2)] border-b border-[var(--bdr2)]">
            <span className="text-[12px] font-[700] text-[var(--tx)]">Manager Notes</span>
          </div>
          <div className="p-3">
            <textarea
              value={noteVal}
              onChange={e => setComment(noteKey, e.target.value)}
              placeholder="Coaching notes, action items, observations…"
              rows={3}
              className="w-full text-[12px] bg-transparent border-none outline-none text-[var(--tx)] placeholder:text-[var(--tx2)]/60 resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* AE / SDR notes from import (read-only) */}
        {(deal.f_ae_notes || deal.f_sdr_notes || deal.f_manager_notes) && (
          <div className="rounded-lg border border-[var(--bdr2)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--bg2)] border-b border-[var(--bdr2)]">
              <span className="text-[12px] font-[700] text-[var(--tx)]">Import Notes</span>
            </div>
            <div className="flex flex-col gap-0 divide-y divide-[var(--bdr2)]">
              {deal.f_ae_notes && (
                <div className="px-3 py-2.5">
                  <div className="text-[10px] font-[600] uppercase tracking-wide text-[var(--tx2)] mb-1">AE Notes</div>
                  <div className="text-[12px] text-[var(--tx)] leading-relaxed whitespace-pre-wrap">{deal.f_ae_notes}</div>
                </div>
              )}
              {deal.f_sdr_notes && (
                <div className="px-3 py-2.5">
                  <div className="text-[10px] font-[600] uppercase tracking-wide text-[var(--tx2)] mb-1">SDR Notes</div>
                  <div className="text-[12px] text-[var(--tx)] leading-relaxed whitespace-pre-wrap">{deal.f_sdr_notes}</div>
                </div>
              )}
              {deal.f_manager_notes && (
                <div className="px-3 py-2.5">
                  <div className="text-[10px] font-[600] uppercase tracking-wide text-[var(--tx2)] mb-1">Manager Notes (Import)</div>
                  <div className="text-[12px] text-[var(--tx)] leading-relaxed whitespace-pre-wrap">{deal.f_manager_notes}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Overview panel (right panel, no deal selected) ────────────
function OverviewPanel({ deals, onSelectDeal, insp, quarterLabel }) {
  const vocab = getVocab()
  const [insightsText,    setInsightsText]    = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError,   setInsightsError]   = useState(null)

  if (!deals.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--tx2)] gap-2 px-6 text-center">
        <div className="text-3xl">🔍</div>
        <div className="text-[14px] font-[700] text-[var(--tx)]">Pipeline Inspector</div>
        <div className="text-[12px] leading-relaxed">
          Click <strong>Run</strong> to process your pipeline through the 5-dimension risk framework.
          Then click any deal to inspect it.
        </div>
        <div className="mt-3 flex flex-wrap gap-2 justify-center text-[11px]">
          {RISK_DIMS.map(d => (
            <span key={d.id} className="px-2 py-1 bg-[var(--bg)] border border-[var(--bdr2)] rounded text-[var(--tx2)]">
              {d.label}
            </span>
          ))}
        </div>
      </div>
    )
  }

  // Category breakdown
  const bycat = CAT_ORDER.map(cat => ({
    cat, label: vocab[cat] ?? cat, color: CAT_ACCENT[cat],
    amount: deals.filter(d => d.f_fc_cat_norm === cat).reduce((s, d) => s + (d.f_amount_num || 0), 0),
    count:  deals.filter(d => d.f_fc_cat_norm === cat).length,
  })).filter(c => c.count > 0)
  const maxAmt = Math.max(...bycat.map(c => c.amount), 1)

  // Top at-risk deals
  const topRisk = [...deals]
    .sort((a, b) => riskScore(b) - riskScore(a))
    .slice(0, 6)

  // Flag frequency
  const flagFreq = {}
  deals.forEach(d => (d._flags || []).forEach(f => {
    if (!flagFreq[f.id]) flagFreq[f.id] = { label: f.label, crit: 0, warn: 0 }
    if (f.sev === 'critical') flagFreq[f.id].crit++
    else flagFreq[f.id].warn++
  }))
  const topFlags  = Object.values(flagFreq)
    .map(v => ({ ...v, total: v.crit + v.warn }))
    .sort((a, b) => b.total - a.total).slice(0, 8)
  const maxFreq = topFlags[0]?.total || 1

  // AE risk scores
  const aeRisk = useMemo(() => {
    const byAE = {}
    deals.forEach(d => {
      const ae = d.f_owner || 'Unknown'
      if (!byAE[ae]) byAE[ae] = { ae, score: 0, crit: 0, pipe: 0 }
      byAE[ae].score += riskScore(d)
      byAE[ae].crit  += (d._flags || []).filter(f => f.sev === 'critical').length
      byAE[ae].pipe  += d.f_amount_num || 0
    })
    return Object.values(byAE).sort((a, b) => b.score - a.score)
  }, [deals])
  const maxScore = Math.max(...aeRisk.map(r => r.score), 1)

  const fetchInsights = async () => {
    if (!insp.apiKey) return
    setInsightsLoading(true); setInsightsError(null)
    try {
      const byRep = {}
      deals.forEach(d => {
        const o = d.f_owner || 'Unknown'
        if (!byRep[o]) byRep[o] = []
        byRep[o].push(d)
      })
      const repsSorted = Object.entries(byRep).sort(([, a], [, b]) => riskScore(b[0]) - riskScore(a[0]))
      const res = await fetchManagerInsights({
        repsSorted, active: deals,
        apiKey: insp.apiKey,
        systemPrompt: insp.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      })
      setInsightsText(res.text)
    } catch (e) { setInsightsError(e.message) }
    setInsightsLoading(false)
  }

  return (
    <div className="overflow-y-auto h-full px-4 py-4 flex flex-col gap-4">
      {/* Pipeline by category */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)] text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
          Pipeline breakdown
        </div>
        <div className="px-4 py-3 flex flex-col gap-2">
          {bycat.map(c => (
            <div key={c.cat} className="flex items-center gap-3">
              <div className="text-[11px] font-[600] w-24 flex-shrink-0" style={{ color: c.color }}>{c.label}</div>
              <div className="flex-1 h-5 rounded overflow-hidden bg-[var(--bg2)]">
                <div className="h-full rounded transition-all"
                  style={{ width: `${(c.amount / maxAmt) * 100}%`, background: c.color, opacity: 0.65 }} />
              </div>
              <div className="text-[11px] font-[600] text-[var(--tx)] w-24 text-right">{fmt(c.amount)}</div>
              <div className="text-[10px] text-[var(--tx2)] w-6 text-right">{c.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top at-risk deals */}
      {topRisk.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)] text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
            Top risk deals
          </div>
          <div>
            {topRisk.map((d, i) => (
              <button key={i} onClick={() => onSelectDeal(d)}
                className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-[var(--bdr2)] last:border-0 hover:bg-[var(--bg2)] cursor-pointer border-none bg-transparent text-left transition-colors">
                <RiskDots deal={d} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-[600] text-[var(--tx)] truncate">{d.f_opp_name || '—'}</div>
                  <div className="text-[10px] text-[var(--tx2)] mt-0.5">
                    {d.f_owner} · <span style={{ color: CAT_ACCENT[d.f_fc_cat_norm] }}>{vocab[d.f_fc_cat_norm]}</span>
                  </div>
                </div>
                <div className="text-[12px] font-[600] text-[var(--tx)] flex-shrink-0">{fmt(d.f_amount_num)}</div>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
                  className="text-[var(--tx2)] flex-shrink-0 -rotate-90">
                  <path d="M5 7L1 3h8z" fill="currentColor" stroke="none" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AE risk scores */}
      {aeRisk.length > 1 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)] text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
            AE risk scores
          </div>
          <div className="px-4 py-3 flex flex-col gap-2">
            {aeRisk.map(({ ae, score, crit, pipe }) => (
              <div key={ae} className="flex items-center gap-3">
                <div className="text-[11px] font-[600] text-[var(--tx)] w-28 flex-shrink-0 truncate" title={ae}>{ae}</div>
                <div className="flex-1 h-4 rounded overflow-hidden bg-[var(--bg2)]">
                  <div className={`h-full transition-all ${crit > 0 ? 'bg-red-500' : 'bg-amber-400'}`}
                    style={{ width: `${(score / maxScore) * 100}%` }} />
                </div>
                <div className="text-[11px] text-[var(--tx2)] w-20 text-right">{fmt(pipe)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flag frequency */}
      {topFlags.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)] text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
            Flag frequency
          </div>
          <div className="px-4 py-3 flex flex-col gap-2">
            {topFlags.map(({ label, crit, warn, total }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="text-[11px] text-[var(--tx)] w-48 flex-shrink-0 truncate" title={label}>{label}</div>
                <div className="flex-1 flex h-4 rounded overflow-hidden bg-[var(--bg2)]">
                  <div style={{ width: `${(crit / maxFreq) * 100}%`, minWidth: crit > 0 ? 2 : 0 }} className="bg-red-500 h-full" />
                  <div style={{ width: `${(warn / maxFreq) * 100}%`, minWidth: warn > 0 ? 2 : 0 }} className="bg-amber-400 h-full" />
                </div>
                <div className="text-[11px] font-[700] w-5 text-right text-[var(--tx)]">{total}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team coaching themes */}
      {insp.apiKey && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)]">
            <span className="text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">Team coaching themes</span>
            <button onClick={fetchInsights} disabled={insightsLoading || !deals.length}
              className="btn btn-primary text-[11px] disabled:opacity-50">
              {insightsLoading ? 'Thinking…' : insightsText ? 'Regenerate' : '✨ Generate'}
            </button>
          </div>
          <div className="px-4 py-3 text-[12px]">
            {insightsError && <div className="text-red-600">{insightsError}</div>}
            {insightsText  && <div className="text-[var(--tx)] leading-relaxed whitespace-pre-wrap">{insightsText}</div>}
            {!insightsText && !insightsLoading && !insightsError && (
              <div className="text-[var(--tx2)]">Generate AI-powered team coaching themes from your pipeline.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Inspector ─────────────────────────────────────────────
export default function Inspector() {
  const importedData = useForecastStore(s => s.importedData)
  const quarterLabel = useForecastStore(s => s.quarterLabel)
  const insp         = useInspectorStore()
  useVocabStore(s => s.vocab) // subscribe for reactivity

  // State
  const [allDeals,     setAllDeals]     = useState([])
  const [filterCats,   setFilterCats]   = useState([])
  const [filterAE,     setFilterAE]     = useState('')
  const [filterDim,    setFilterDim]    = useState('')
  const [flaggedOnly,  setFlaggedOnly]  = useState(false)
  const [sortBy,       setSortBy]       = useState('risk')
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [localRunning, setLocalRunning] = useState(false)
  const [runError,     setRunError]     = useState(null)
  const [lastRunDate,  setLastRunDate]  = useState(null)
  const [slackOpen,    setSlackOpen]    = useState(false)
  const [copyStatus,   setCopyStatus]   = useState(null)
  const slackRef = useRef(null)

  const vocab  = getVocab()
  const allAEs = useMemo(() => [...new Set(allDeals.map(d => d.f_owner || 'Unknown'))].sort(), [allDeals])

  // Total active pipeline for whale calculation
  const totalPipe      = useMemo(() => allDeals.reduce((s, d) => s + (d.f_amount_num || 0), 0), [allDeals])
  const whaleThreshold = totalPipe * 0.2

  // Filtered + sorted deals
  const visibleDeals = useMemo(() => {
    let d = allDeals
    if (filterCats.length) d = d.filter(x => filterCats.includes(x.f_fc_cat_norm))
    if (filterAE)          d = d.filter(x => (x.f_owner || 'Unknown') === filterAE)
    if (flaggedOnly)       d = d.filter(x => (x._flags || []).length > 0)
    if (filterDim) {
      const dim = RISK_DIMS.find(x => x.id === filterDim)
      if (dim) d = d.filter(x => (x._flags || []).some(f => dim.flagIds.has(f.id)))
    }
    return [...d].sort((a, b) => {
      if (sortBy === 'amount')    return (b.f_amount_num || 0) - (a.f_amount_num || 0)
      if (sortBy === 'closeDate') {
        const da = a.f_close_date ? new Date(a.f_close_date) : new Date(9999, 0)
        const db = b.f_close_date ? new Date(b.f_close_date) : new Date(9999, 0)
        return da - db
      }
      return riskScore(b) - riskScore(a)
    })
  }, [allDeals, filterCats, filterAE, flaggedOnly, filterDim, sortBy])

  // Whale deals
  const whaleDeals = useMemo(
    () => whaleThreshold > 0 ? allDeals.filter(d => (d.f_amount_num || 0) >= whaleThreshold) : [],
    [allDeals, whaleThreshold]
  )

  // Non-whale visible deals (for main list when whales are pinned separately)
  const nonWhaleVisible = useMemo(
    () => whaleDeals.length > 0 ? visibleDeals.filter(d => (d.f_amount_num || 0) < whaleThreshold) : visibleDeals,
    [visibleDeals, whaleDeals, whaleThreshold]
  )

  // Stats
  const stats = useMemo(() => {
    if (!allDeals.length) return null
    const flags = allDeals.flatMap(d => d._flags || [])
    return {
      deals: allDeals.length,
      pipe:  allDeals.reduce((s, d) => s + (d.f_amount_num || 0), 0),
      crit:  flags.filter(f => f.sev === 'critical').length,
      clean: allDeals.filter(d => (d._flags || []).length === 0).length,
    }
  }, [allDeals])

  // Restore from localStorage (7-day TTL)
  useEffect(() => {
    if (allDeals.length > 0) return
    try {
      const raw = localStorage.getItem('moat-inspector-last-run')
      if (!raw) return
      const { data: lr, ts } = JSON.parse(raw)
      if (Date.now() - ts > 7 * 24 * 3600 * 1000) {
        localStorage.removeItem('moat-inspector-last-run'); return
      }
      if (!lr?.active?.length) return
      setAllDeals(lr.active)
      setLastRunDate(new Date(ts))
    } catch {}
  }, []) // eslint-disable-line

  // Clear cache on new import
  const importMetaFilename = useForecastStore(s => s.importMeta?.filename)
  const prevFilenameRef = useRef(importMetaFilename)
  useEffect(() => {
    if (prevFilenameRef.current !== undefined && prevFilenameRef.current !== importMetaFilename) {
      localStorage.removeItem('moat-inspector-last-run')
      setLastRunDate(null); setAllDeals([]); setSelectedDeal(null)
    }
    prevFilenameRef.current = importMetaFilename
  }, [importMetaFilename])

  // Handle pending AE filter from other views
  const pendingAEFilter      = useInspectorStore(s => s.pendingAEFilter)
  const clearPendingAEFilter = useInspectorStore(s => s.clearPendingAEFilter)
  useEffect(() => {
    if (pendingAEFilter) { setFilterAE(pendingAEFilter); clearPendingAEFilter() }
  }, [pendingAEFilter]) // eslint-disable-line

  // Close Slack dropdown on outside click
  useEffect(() => {
    if (!slackOpen) return
    const h = (e) => { if (slackRef.current && !slackRef.current.contains(e.target)) setSlackOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [slackOpen])

  // Run
  const run = useCallback(async () => {
    if (!importedData?.length) return
    setRunError(null); setLocalRunning(true); setSelectedDeal(null)
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
      setAllDeals(active)
      try {
        localStorage.setItem('moat-inspector-last-run', JSON.stringify({ data: { active }, ts: Date.now() }))
      } catch {}
      setLastRunDate(new Date())
    } catch (e) {
      console.error('[Inspector] run failed:', e)
      setRunError(e.message || 'Unexpected error')
    } finally { setLocalRunning(false) }
  }, [importedData])

  // Slack copy
  const copySlack = async (mode) => {
    setSlackOpen(false)
    const byRep = {}
    allDeals.forEach(d => {
      const o = d.f_owner || 'Unknown'
      if (!byRep[o]) byRep[o] = []
      byRep[o].push(d)
    })
    const repsSorted = Object.entries(byRep).sort(([, a], [, b]) =>
      b.flatMap(x => x._flags || []).reduce((s, f) => s + f.weight, 0) -
      a.flatMap(x => x._flags || []).reduce((s, f) => s + f.weight, 0)
    )
    const { execMessage, managerMessage } = formatSlackMessage(allDeals, {
      groupBy: 'category',
      runDate: new Date(),
      quarterLabel,
      repResults: {},
    })
    const text = mode === 'exec' ? execMessage : managerMessage
    try { await navigator.clipboard.writeText(text) }
    catch {
      const blob = new Blob([text], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `moat-slack-${mode}.txt`; a.click()
      URL.revokeObjectURL(url)
    }
    setCopyStatus(mode)
    setTimeout(() => setCopyStatus(null), 2000)
  }

  if (!importedData?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--tx2)]">
        <div className="text-4xl mb-3">🔍</div>
        <div className="text-[15px] font-[600] text-[var(--tx)] mb-1">No pipeline data</div>
        <div className="text-[13px]">Import your pipeline CSV from Manager Walk-Up first.</div>
      </div>
    )
  }

  const hasFilters = filterCats.length > 0 || filterAE || filterDim || flaggedOnly

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 40px)' }}>
      {/* ── Left panel: deal list ── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-[var(--bdr2)] bg-[var(--bg)] overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--bdr2)] flex-shrink-0">
          <button onClick={run} disabled={localRunning}
            className="btn btn-primary text-[11px] flex items-center gap-1.5 flex-shrink-0">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <polygon points="1,0 8,4 1,8" />
            </svg>
            {localRunning ? 'Running…' : allDeals.length > 0 ? 'Re-run' : 'Run'}
          </button>

          {stats && (
            <div className="flex items-center gap-1 text-[10px] text-[var(--tx2)] flex-1 min-w-0">
              <span>{stats.deals}</span>
              <span className="opacity-50">·</span>
              {stats.crit > 0
                ? <span className="text-red-600 font-[700]">{stats.crit}🔴</span>
                : <span className="text-green-600 font-[600]">✓</span>
              }
            </div>
          )}

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Slack copy */}
            {allDeals.length > 0 && (
              <div ref={slackRef} className="relative">
                <button onClick={() => setSlackOpen(o => !o)}
                  className={`btn text-[10px] py-0.5 px-1.5 ${copyStatus ? 'border-green-500 text-green-700' : ''}`}
                  title="Copy Slack">
                  {copyStatus ? '✓' : '📋'}
                </button>
                {slackOpen && (
                  <div className="absolute top-full right-0 mt-1 z-50 bg-[var(--bg)] border border-[var(--bdr2)] rounded-lg shadow-lg py-1 min-w-[120px]">
                    <button onClick={() => copySlack('exec')}    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--bg2)] text-[var(--tx)] cursor-pointer border-none bg-transparent">Exec view</button>
                    <button onClick={() => copySlack('manager')} className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--bg2)] text-[var(--tx)] cursor-pointer border-none bg-transparent">Manager view</button>
                  </div>
                )}
              </div>
            )}
            {/* XLSX */}
            {allDeals.length > 0 && (
              <button onClick={() => exportXLSX(allDeals)} className="btn text-[10px] py-0.5 px-1.5" title="Export XLSX">
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="px-2 py-2 border-b border-[var(--bdr2)] flex flex-col gap-1.5 flex-shrink-0 bg-[var(--bg2)]/50">
          {/* Category filter chips */}
          <div className="flex flex-wrap gap-1">
            {CAT_ORDER.map(cat => {
              const active = filterCats.includes(cat)
              return (
                <button key={cat}
                  onClick={() => setFilterCats(p => active ? p.filter(x => x !== cat) : [...p, cat])}
                  className="text-[9px] font-[700] uppercase tracking-wide px-1.5 py-0.5 rounded border cursor-pointer transition-all"
                  style={active
                    ? { color: CAT_ACCENT[cat], borderColor: CAT_ACCENT[cat], background: CAT_ACCENT[cat] + '18' }
                    : { color: CAT_ACCENT[cat], borderColor: 'transparent', background: 'var(--bg3)' }
                  }>
                  {vocab[cat] ?? cat}
                </button>
              )
            })}
            {hasFilters && (
              <button onClick={() => { setFilterCats([]); setFilterAE(''); setFilterDim(''); setFlaggedOnly(false) }}
                className="text-[9px] text-[var(--tx2)] cursor-pointer border-none bg-transparent hover:text-red-500 transition-colors">
                ✕ clear
              </button>
            )}
          </div>

          {/* AE + Sort */}
          <div className="flex items-center gap-1.5">
            <select value={filterAE} onChange={e => setFilterAE(e.target.value)}
              className="text-[10px] border border-[var(--bdr2)] rounded px-1.5 py-0.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)] flex-1 min-w-0">
              <option value="">All AEs</option>
              {allAEs.map(ae => <option key={ae} value={ae}>{ae}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="text-[10px] border border-[var(--bdr2)] rounded px-1.5 py-0.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)] flex-1 min-w-0">
              <option value="risk">Risk ↓</option>
              <option value="amount">Amount ↓</option>
              <option value="closeDate">Close date</option>
            </select>
          </div>

          {/* Risk dimension filter */}
          <select value={filterDim} onChange={e => setFilterDim(e.target.value)}
            className={`text-[10px] border rounded px-1.5 py-0.5 bg-[var(--bg)] text-[var(--tx)] outline-none w-full ${
              filterDim ? 'border-amber-400' : 'border-[var(--bdr2)] focus:border-[var(--blue)]'
            }`}>
            <option value="">All risk dimensions</option>
            {RISK_DIMS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>

          {/* Flagged only */}
          <button onClick={() => setFlaggedOnly(p => !p)}
            className={`text-[10px] px-2 py-0.5 rounded border cursor-pointer transition-colors text-left ${
              flaggedOnly
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-amber-700'
                : 'border-[var(--bdr2)] bg-transparent text-[var(--tx2)] hover:border-[var(--blue)]'
            }`}>
            {flaggedOnly ? '✓ Flagged only' : 'Flagged only'}
          </button>
        </div>

        {/* Deal list */}
        <div className="flex-1 overflow-y-auto">
          {allDeals.length === 0 ? (
            <div className="text-center text-[12px] text-[var(--tx2)] px-4 py-6">
              {localRunning ? 'Processing…' : 'Click Run to inspect pipeline'}
            </div>
          ) : (
            <>
              {/* Whale section */}
              {whaleDeals.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[9px] font-[700] uppercase tracking-widest text-orange-600 bg-orange-50/80 dark:bg-orange-950/20 border-b border-[var(--bdr2)] sticky top-0 z-10">
                    🐋 Whale deals (&gt;20% of pipe)
                  </div>
                  {whaleDeals.map((deal, i) => (
                    <DealListRow key={`w-${i}`} deal={deal}
                      isSelected={selectedDeal?.f_opp_name === deal.f_opp_name}
                      onClick={() => setSelectedDeal(deal)}
                      isWhale={true}
                    />
                  ))}
                  {nonWhaleVisible.length > 0 && (
                    <div className="px-3 py-1.5 text-[9px] font-[700] uppercase tracking-widest text-[var(--tx2)] bg-[var(--bg2)] border-b border-[var(--bdr2)] sticky top-0 z-10">
                      All deals ({nonWhaleVisible.length})
                    </div>
                  )}
                </>
              )}

              {nonWhaleVisible.map((deal, i) => (
                <DealListRow key={i} deal={deal}
                  isSelected={selectedDeal?.f_opp_name === deal.f_opp_name}
                  onClick={() => setSelectedDeal(deal)}
                  isWhale={false}
                />
              ))}

              {visibleDeals.length === 0 && allDeals.length > 0 && (
                <div className="text-center text-[12px] text-[var(--tx2)] px-4 py-6">
                  No deals match current filters
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {lastRunDate && !localRunning && (
          <div className="px-3 py-1.5 border-t border-[var(--bdr2)] text-[10px] text-[var(--tx2)] flex-shrink-0">
            Last run: {lastRunDate.toLocaleDateString()}
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-hidden bg-[var(--bg2)] flex flex-col">
        {runError && (
          <div className="mx-4 mt-3 px-3 py-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 flex-shrink-0">
            <span>⚠</span>
            <span>Run failed: {runError}</span>
            <button onClick={() => setRunError(null)} className="ml-auto text-[11px] underline cursor-pointer border-none bg-transparent">Dismiss</button>
          </div>
        )}
        <UnmappedBanner />
        <div className="flex-1 overflow-hidden">
          {selectedDeal
            ? <InspectionWorkspace
                key={selectedDeal.f_opp_name}
                deal={selectedDeal}
                onClose={() => setSelectedDeal(null)}
                totalPipe={totalPipe}
              />
            : <OverviewPanel
                deals={allDeals}
                onSelectDeal={setSelectedDeal}
                insp={insp}
                quarterLabel={quarterLabel}
              />
          }
        </div>
      </div>
    </div>
  )
}
