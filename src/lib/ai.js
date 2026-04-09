// ── Anthropic API ──────────────────────────────────────────────
import { getVocab } from './vocab'
import { fmt } from './fmt'
import { useInspectorStore } from '../store/forecastStore'

export const DEFAULT_SYSTEM_PROMPT = `You are a sales coach reviewing open opportunities. Produce structured output only — no prose, no headers, no intro.

For each deal where you find an issue, output one line:
DEAL: {exact deal name} | FLAG: {one of: missing date, past date, not tangible, weak next step, stale activity, close date risk, no meddpicc} | NOTE: {one sentence max 12 words}

Issues to flag:
1. missing date — next step has no specific date
2. past date — the date in the next step has already passed
3. not tangible — vague or generic (e.g. "follow up", "check in", "waiting to hear back")
4. weak next step — lacks specificity about who, what, or when
5. stale activity — last activity was 14+ days ago on a high-confidence deal
6. close date risk — close date is within 30 days but the next step lacks a concrete commitment action
7. no meddpicc — high-confidence deal with $50k+ value but zero MEDDPICC fields filled

Only output lines for deals with issues. If all are strong, output nothing except:
SUMMARY: Next steps are well-maintained and specific.`

export const DEFAULT_COACHING_FOCUS = ''

// ── AI flag output parser ──────────────────────────────────────
// Parses lines of the form:
//   DEAL: {name} | FLAG: {flag} | NOTE: {note}
export function parseAIFlags(text) {
  const flags   = {}   // { [dealNameLower]: { flag, note } }
  let   summary = ''
  if (!text) return { flags, summary }

  text.split('\n').forEach(line => {
    const dealMatch = line.match(/^DEAL:\s*(.+?)\s*\|\s*FLAG:\s*(.+?)\s*\|\s*NOTE:\s*(.+)$/)
    if (dealMatch) {
      flags[dealMatch[1].trim().toLowerCase()] = {
        flag: dealMatch[2].trim(),
        note: dealMatch[3].trim(),
      }
      return
    }
    const summaryMatch = line.match(/^SUMMARY:\s*(.+)$/)
    if (summaryMatch) summary = summaryMatch[1].trim()
  })
  return { flags, summary }
}

// Legacy parser kept for backwards compat with manager insights
export function parseStructuredAI(text) {
  const actions = {}
  let   summary = ''
  if (!text) return { actions, summary }
  text.split('\n').forEach(line => {
    const dealMatch = line.match(/^DEAL:\s*(.+?)\s*\|\s*ACTION:\s*(.+)$/)
    if (dealMatch) { actions[dealMatch[1].trim().toLowerCase()] = dealMatch[2].trim(); return }
    const summaryMatch = line.match(/^SUMMARY:\s*(.+)$/)
    if (summaryMatch) summary = summaryMatch[1].trim()
  })
  return { actions, summary }
}

// Fuzzy deal name lookup
export function findDealAction(actionsOrFlags, dealName) {
  if (!dealName || !actionsOrFlags) return null
  const key   = dealName.toLowerCase()
  const store = actionsOrFlags
  if (store[key]) return store[key]
  const match = Object.keys(store).find(k =>
    key.includes(k) || k.includes(key.substring(0, 20))
  )
  return match ? store[match] : null
}

// ── Per-rep AI summary ─────────────────────────────────────────
export async function fetchAISummary({
  owner,
  deals,
  apiKey,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  coachingFocus = '',
  signal,
}) {
  const focusLine = coachingFocus ? `\n\nAdditional coaching focus: ${coachingFocus}` : ''
  const v = getVocab()
  const categoryContext = `Forecast categories in this app: ${v.worst_case} (highest confidence, committing to close), ${v.call} (strong intent, likely closes), ${v.best_case} (possible if things go well), ${v.pipeline} (early stage, future quarter). "High-confidence" means ${v.worst_case} or ${v.call}.`
  const fullPrompt = categoryContext + '\n\n' + (systemPrompt || DEFAULT_SYSTEM_PROMPT)

  // Only worst_case/call/best_case — pipeline too early for meaningful next steps
  const actionableDeals = deals.filter(d => ['worst_case', 'call', 'best_case'].includes(d.f_fc_cat_norm))

  if (actionableDeals.length === 0) {
    return { text: '', flags: {}, summary: '', actions: {}, inputTokens: 0, outputTokens: 0 }
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const dealLines = actionableDeals.map(d => {
    const closeDate = d.f_close_date
      ? (() => {
          const cd = new Date(d.f_close_date)
          const daysLeft = Math.round((cd - now) / 86400000)
          return `${d.f_close_date} (${daysLeft >= 0 ? daysLeft + 'd left' : Math.abs(daysLeft) + 'd past'})`
        })()
      : '(no close date)'
    const lastAct = d.f_last_activity
      ? (() => {
          const la = new Date(d.f_last_activity)
          const daysSince = Math.round((now - la) / 86400000)
          return `${d.f_last_activity} (${daysSince}d ago)`
        })()
      : '(none)'
    const meddpiccFields = ['f_metrics', 'f_econ_buyer', 'f_dec_criteria', 'f_dec_process', 'f_proc_process', 'f_implicated', 'f_champion']
    const meddpiccFilled = meddpiccFields.filter(k => (d[k] || '').trim()).length
    const topFlags = (d._flags || []).slice(0, 3).map(f => f.label).join(', ')
    return `- ${d.f_opp_name || 'Unknown'} | ${d.f_fc_cat_norm || '?'} | ${d.f_stage || '?'} | $${Math.round((d.f_amount_num || 0) / 1000)}k | close: ${closeDate} | last activity: ${lastAct} | MEDDPICC: ${meddpiccFilled}/7 | flags: ${topFlags || 'none'} | next step: ${d.f_next_step?.trim() || '(none)'}`
  }).join('\n')

  const userMsg = `AE: ${owner}\nOpportunities (${actionableDeals.length}):\n${dealLines}${focusLine}`

  console.log('[AI] fetchAISummary for', owner, '— deals:', actionableDeals.length)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: [{ type: 'text', text: fullPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const msg = err?.error?.message || `API error ${response.status}`
    console.error('[AI] fetchAISummary error:', msg)
    throw new Error(msg)
  }

  const data         = await response.json()
  const text         = data.content?.[0]?.text || ''
  const inputTokens  = data.usage?.input_tokens  || 0
  const outputTokens = data.usage?.output_tokens || 0
  console.log('[AI] response text:', text.slice(0, 200))

  const { flags, summary } = parseAIFlags(text)
  // Keep actions empty — no longer used
  return { text, flags, summary, actions: {}, inputTokens, outputTokens }
}

// ── Manager-level team insights ────────────────────────────────
export async function fetchManagerInsights({ repsSorted, active, apiKey, systemPrompt }) {
  const aeSummary = repsSorted.map(([owner, deals]) => {
    const flags = deals.flatMap(d => d._flags || [])
    const crit  = flags.filter(f => f.sev === 'critical').length
    const warn  = flags.filter(f => f.sev === 'warn').length
    const pipe  = deals.reduce((s, d) => s + d.f_amount_num, 0)
    return `${owner}: ${deals.length} deals, $${Math.round(pipe / 1000)}k pipeline, ${crit} critical, ${warn} warnings`
  }).join('\n')

  const userMsg = `Team pipeline inspection summary. ${active.length} active deals across ${repsSorted.length} AEs.\n\n${aeSummary}\n\nProvide 3-5 coaching themes and team-level risks in plain paragraphs.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt || DEFAULT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })

  if (!response.ok) throw new Error(`API error ${response.status}`)
  const data = await response.json()
  return {
    text:         data.content?.[0]?.text || '',
    inputTokens:  data.usage?.input_tokens  || 0,
    outputTokens: data.usage?.output_tokens || 0,
  }
}

// ── Exec Summary for CRO PDF ───────────────────────────────────
export async function fetchExecSummary(data, apiKey) {
  const {
    managerName, managerTeam, quarterLabel,
    quota, fc_worst_case, fc_call, fc_best_case,
    closed, weeksRemaining, weeks_total,
    cnc_opps, cnc_asp, cnc_prorated,
    gap, total_saa_needed,
    ae_allocation, ae_saa_needed,
    sdr_allocation, sdr_saa_needed,
    vocabWorstCase, vocabCall, vocabBestCase,
    overridesActive,
  } = data

  const systemPrompt = `You are writing a brief executive summary for a sales forecast read-in document. Write in plain, confident business prose. No bullet points. No headers. No markdown. 3–4 sentences maximum. Be specific with numbers — do not round or approximate. Write in third person (refer to 'the team' not 'I' or 'we'). Tone: direct, data-driven, no filler words.`

  const userMsg = `Write an executive summary for the following forecast read-in. Use these exact figures:

Manager: ${managerName} · Team: ${managerTeam}
Quarter: ${quarterLabel}
Quota: ${fmt(quota)}
${vocabWorstCase} forecast: ${fmt(fc_worst_case)}
${vocabCall} forecast (submission): ${fmt(fc_call)}
${vocabBestCase} forecast: ${fmt(fc_best_case)}
Closed QTD: ${fmt(closed)}
Selling weeks remaining: ${weeksRemaining} of ${weeks_total}
IQP (prorated C&C): ${cnc_opps} opps × ${fmt(cnc_asp)} ASP = ${fmt(cnc_prorated)} expected bookings
Gap to quota: ${fmt(gap)}
Total SAAs needed to close gap: ${total_saa_needed}
AE channel: ${ae_allocation}% of gap = ${ae_saa_needed} SAAs required
SDR channel: ${sdr_allocation}% of gap = ${sdr_saa_needed} SAAs required
${overridesActive ? 'Note: submitted forecast reflects manager adjustments to model output.' : ''}

Cover in this order:
1. Team forecast position (${vocabCall} vs quota) and range (${vocabWorstCase} to ${vocabBestCase})
2. IQP contribution and expected bookings
3. Pipeline gap between ${vocabCall} FC and quota
4. SAAs required split by AE and SDR`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${response.status}`)
  }

  const res          = await response.json()
  const raw          = res.content?.[0]?.text || ''
  const text         = raw.replace(/[*#>`]/g, '').trim()
  const inputTokens  = res.usage?.input_tokens  || 0
  const outputTokens = res.usage?.output_tokens || 0

  useInspectorStore.getState().logUsage(inputTokens, outputTokens, 1, 0)

  return { text, inputTokens, outputTokens }
}

// Token cost constants (claude-sonnet-4)
export const COST_PER_INPUT_TOKEN  = 3  / 1_000_000
export const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000
