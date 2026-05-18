// ── Anthropic API ──────────────────────────────────────────────
import { getVocab } from './vocab'
import { fmt } from './fmt'
import { useInspectorStore } from '../store/forecastStore'

export const DEFAULT_SYSTEM_PROMPT = `You are an elite sales coach reviewing B2B SaaS opportunities. Apply MEDDPICC, Command of the Message (3 Whys), and Winning by Design (MAP / next-step discipline). Produce structured output only — no prose, no headers, no intro.

For each deal with an issue, output exactly one line:
DEAL: {exact deal name} | RISK: {critical|high|medium} | FRAMEWORK: {MEDDPICC|CoTM|WbD|Execution} | FLAG: {flag type} | NOTE: {≤15 words, specific and actionable}

Flag types:
- next_step_weak: vague, no date, no named owner, or generic ("follow up", "check in", "waiting")
- next_step_stale: date in next step has passed, or last activity 14d+ ago on high-confidence deal
- meddpicc_gap: specific letter missing or too shallow — name the letter (e.g. "M gap: no quantified metric")
- no_3whys: implicated pain or urgency not clearly articulated; 3 Whys incomplete
- competitor_risk: named competitor has a pricing or feature advantage not yet addressed
- wrong_stakeholder: engaging below economic buyer level with no multi-thread plan
- no_map: Forecast/Commit deal with no mutual action plan
- stuck: deal has not advanced in stage for 30+ days
- forecast_risk: FC category is inconsistent with stage or deal signals

Only flag real issues — do not manufacture flags on clean deals. If a deal has no issues, skip it.

After all DEAL lines, always output:
SUMMARY: {1–2 sentences on the most common gap pattern across this rep's deals}`

export const DEFAULT_COACHING_FOCUS = ''

// ── AI flag output parser ──────────────────────────────────────
// Parses lines of the form:
//   DEAL: {name} | RISK: {risk} | FRAMEWORK: {fw} | FLAG: {flag} | NOTE: {note}
// Also handles legacy format without RISK/FRAMEWORK fields.
export function parseAIFlags(text) {
  const flags   = {}   // { [dealNameLower]: { flag, risk, framework, note } }
  let   summary = ''
  if (!text) return { flags, summary }

  text.split('\n').forEach(line => {
    // New format with RISK + FRAMEWORK
    const fullMatch = line.match(/^DEAL:\s*(.+?)\s*\|\s*RISK:\s*(.+?)\s*\|\s*FRAMEWORK:\s*(.+?)\s*\|\s*FLAG:\s*(.+?)\s*\|\s*NOTE:\s*(.+)$/)
    if (fullMatch) {
      flags[fullMatch[1].trim().toLowerCase()] = {
        flag:      fullMatch[4].trim(),
        risk:      fullMatch[2].trim(),
        framework: fullMatch[3].trim(),
        note:      fullMatch[5].trim(),
      }
      return
    }
    // Legacy format: DEAL | FLAG | NOTE
    const legacyMatch = line.match(/^DEAL:\s*(.+?)\s*\|\s*FLAG:\s*(.+?)\s*\|\s*NOTE:\s*(.+)$/)
    if (legacyMatch) {
      flags[legacyMatch[1].trim().toLowerCase()] = {
        flag: legacyMatch[2].trim(),
        risk: 'medium',
        framework: 'Execution',
        note: legacyMatch[3].trim(),
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
    const meddpiccDetail = [
      d.f_metrics      ? `M: "${(d.f_metrics).substring(0, 80)}"` : 'M: empty',
      d.f_econ_buyer   ? `E: "${(d.f_econ_buyer).substring(0, 60)}"` : 'E: empty',
      d.f_dec_criteria ? 'DC: filled' : 'DC: empty',
      d.f_dec_process  ? 'DP: filled' : 'DP: empty',
      d.f_implicated   ? `I: "${(d.f_implicated).substring(0, 80)}"` : 'I: empty',
      d.f_champion     ? `C: "${(d.f_champion).substring(0, 40)}"` : 'C: empty',
    ].join(' | ')
    const topFlags = (d._flags || []).slice(0, 4).map(f => f.label).join(', ')
    return [
      `- ${d.f_opp_name || 'Unknown'} | ${d.f_fc_cat_norm || '?'} | ${d.f_stage || '?'} | $${Math.round((d.f_amount_num || 0) / 1000)}k`,
      `  close: ${closeDate} | last_activity: ${lastAct} | days_in_stage: ${d.f_days_in_stage || 'unknown'}`,
      `  competitor: ${(d.f_competitor || '').trim() || 'none identified'} | MAP: ${d.f_has_map ? 'yes' : 'no'} | contact_title: ${d.f_contact_title || 'unknown'} | lead_type: ${d.f_lead_type || '?'}`,
      `  MEDDPICC: ${meddpiccDetail}`,
      `  rule_flags: ${topFlags || 'none'}`,
      `  next_step: ${d.f_next_step?.trim() || '(none)'}`,
    ].join('\n')
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
      max_tokens: 1200,
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

// ── Single-deal deep inspection ───────────────────────────────
export async function fetchDealInspection({ deal, apiKey, signal }) {
  const systemPrompt = `You are an elite sales coach. Analyse this single opportunity and return exactly 5 labelled lines — no prose, no headers, nothing else.

Line format:
NEXT_STEP: rating={strong|weak|missing} | {specific gap or confirmation in ≤15 words}
3WHYS: why_change={filled|gap} | why_now={filled|gap} | why_remote={filled|gap} | {≤15 words on weakest why}
MEDDPICC: score={N}/7 | gaps={comma-separated missing letters or "none"} | {≤15 words on highest-risk gap}
COMPETITIVE: threat={high|medium|low|none} | competitor={name or "none"} | {≤15 words on positioning gap or strength}
ACTION: {single most important next action for the AE in ≤20 words}`

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const cd = deal.f_close_date ? new Date(deal.f_close_date) : null
  const daysLeft = cd ? Math.round((cd - now) / 86400000) : null
  const la = deal.f_last_activity ? new Date(deal.f_last_activity) : null
  const daysSinceActivity = la ? Math.round((now - la) / 86400000) : null

  const userMsg = [
    `Deal: ${deal.f_opp_name || 'Unknown'}`,
    `AE: ${deal.f_owner || deal._owner || '?'} | FC: ${deal.f_fc_cat_norm || '?'} | Stage: ${deal.f_stage || '?'}`,
    `Amount: $${Math.round((deal.f_amount_num || 0) / 1000)}k | Close: ${deal.f_close_date || 'none'}${daysLeft !== null ? ` (${daysLeft >= 0 ? daysLeft + 'd left' : Math.abs(daysLeft) + 'd past'})` : ''}`,
    `Days in stage: ${deal.f_days_in_stage || 'unknown'} | Deal age: ${deal.f_age || 'unknown'}d | Last activity: ${daysSinceActivity !== null ? daysSinceActivity + 'd ago' : 'unknown'}`,
    `Lead type: ${deal.f_lead_type || '?'} | Product: ${deal.f_product_interest || '?'} | Revenue motion: ${deal.f_revenue_motion || '?'}`,
    `Competitor: ${(deal.f_competitor || '').trim() || 'none identified'}`,
    `MAP: ${deal.f_has_map ? `yes — ${deal.f_map}` : 'no'} | Win Room: ${deal.f_has_win_room ? 'yes' : 'no'}`,
    `Contact: ${deal.f_primary_contact || deal.f_champion || '?'} (${deal.f_contact_title || 'title unknown'})`,
    ``,
    `NEXT STEP:`,
    deal.f_next_step?.trim() || '(none)',
    ``,
    `MEDDPICC:`,
    `  M (Metrics): ${deal.f_metrics?.trim() || '(empty)'}`,
    `  E (Economic Buyer): ${deal.f_econ_buyer?.trim() || '(empty)'}`,
    `  DC (Decision Criteria): ${deal.f_dec_criteria?.trim() || '(empty)'}`,
    `  DP (Decision Process): ${deal.f_dec_process?.trim() || '(empty)'}`,
    `  PP (Procurement): ${deal.f_proc_process?.trim() || '(empty)'}`,
    `  I (Implicated Pain): ${deal.f_implicated?.trim() || '(empty)'}`,
    `  C (Champion): ${deal.f_champion?.trim() || '(empty)'}`,
    deal.f_meddpicc_notes?.trim() ? `\nMEDDPICC Rep Notes: ${deal.f_meddpicc_notes.trim()}` : '',
    deal.f_manager_notes?.trim()  ? `\nManager Notes: ${deal.f_manager_notes.substring(0, 400).trim()}` : '',
    deal.f_sdr_notes?.trim()      ? `\nSDR Notes: ${deal.f_sdr_notes.substring(0, 200).trim()}` : '',
  ].filter(Boolean).join('\n')

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
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${response.status}`)
  }

  const data         = await response.json()
  const raw          = data.content?.[0]?.text || ''
  const inputTokens  = data.usage?.input_tokens  || 0
  const outputTokens = data.usage?.output_tokens || 0

  // Parse the 5 structured lines
  const result = { nextStep: null, threeWhys: null, meddpicc: null, competitive: null, action: null, raw }
  raw.split('\n').forEach(line => {
    const nsMatch   = line.match(/^NEXT_STEP:\s*rating=(\S+)\s*\|\s*(.+)$/)
    const wyMatch   = line.match(/^3WHYS:\s*why_change=(\S+)\s*\|\s*why_now=(\S+)\s*\|\s*why_remote=(\S+)\s*\|\s*(.+)$/)
    const mdMatch   = line.match(/^MEDDPICC:\s*score=(\S+)\s*\|\s*gaps=(.+?)\s*\|\s*(.+)$/)
    const compMatch = line.match(/^COMPETITIVE:\s*threat=(\S+)\s*\|\s*competitor=(.+?)\s*\|\s*(.+)$/)
    const actMatch  = line.match(/^ACTION:\s*(.+)$/)
    if (nsMatch)   result.nextStep    = { rating: nsMatch[1],   note: nsMatch[2].trim() }
    if (wyMatch)   result.threeWhys   = { whyChange: wyMatch[1], whyNow: wyMatch[2], whyRemote: wyMatch[3], note: wyMatch[4].trim() }
    if (mdMatch)   result.meddpicc    = { score: mdMatch[1],    gaps: mdMatch[2].trim(), note: mdMatch[3].trim() }
    if (compMatch) result.competitive = { threat: compMatch[1], competitor: compMatch[2].trim(), note: compMatch[3].trim() }
    if (actMatch)  result.action      = actMatch[1].trim()
  })

  return { ...result, inputTokens, outputTokens }
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
