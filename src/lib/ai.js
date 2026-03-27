// ── Anthropic API ──────────────────────────────────────────────

export const DEFAULT_SYSTEM_PROMPT = `You are a sales pipeline inspector. Produce structured output only — no prose, no headers, no intro.

For each deal that needs action, output one line:
DEAL: {exact deal name} | ACTION: {one sentence, max 12 words, starts with a verb}

After all deal lines, output one summary line:
SUMMARY: {one sentence on this rep's overall pipeline health}

Rules:
- Only include deals that need AE action — skip clean deals
- ACTION must be specific, AE-owned, and forward-looking (not "follow up")
- Do NOT re-flag rule-based issues — add qualitative judgment only
- Start each ACTION with a verb: Confirm, Schedule, Get, Push, Clarify, Align, Close, etc.
- If all deals are clean, output only: SUMMARY: Pipeline is well-maintained with no critical issues.`

export const DEFAULT_COACHING_FOCUS = ''

// ── Structured AI output parser ────────────────────────────────
// Parses lines of the form:
//   DEAL: {name} | ACTION: {action}
//   SUMMARY: {text}
export function parseStructuredAI(text) {
  const actions = {}   // { [dealNameLower]: actionString }
  let summary   = ''
  if (!text) return { actions, summary }

  text.split('\n').forEach(line => {
    const dealMatch = line.match(/^DEAL:\s*(.+?)\s*\|\s*ACTION:\s*(.+)$/)
    if (dealMatch) {
      actions[dealMatch[1].trim().toLowerCase()] = dealMatch[2].trim()
      return
    }
    const summaryMatch = line.match(/^SUMMARY:\s*(.+)$/)
    if (summaryMatch) summary = summaryMatch[1].trim()
  })
  return { actions, summary }
}

// Fuzzy deal name lookup — exact first, then prefix partial
export function findDealAction(actions, dealName) {
  if (!dealName || !actions) return null
  const key = dealName.toLowerCase()
  if (actions[key]) return actions[key]
  const match = Object.keys(actions).find(k =>
    key.includes(k) || k.includes(key.substring(0, 20))
  )
  return match ? actions[match] : null
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
  const focusLine = coachingFocus ? `\n\nAdditional focus: ${coachingFocus}` : ''
  const dealLines = deals.map(d => {
    const flags = (d._flags || []).map(f => `[${f.sev.toUpperCase()}] ${f.label}`).join(', ')
    return `- ${d.f_opp_name || 'Unknown'} | ${d.f_fc_cat_norm || ''} | $${Math.round(d.f_amount_num || 0).toLocaleString()} | Stage: ${d.f_stage || '—'} | Next step: ${d.f_next_step || '—'} | Flags: ${flags || 'none'}`
  }).join('\n')

  const userMsg = `AE: ${owner}\nDeals (${deals.length}):\n${dealLines}${focusLine}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${response.status}`)
  }

  const data         = await response.json()
  const text         = data.content?.[0]?.text || ''
  const inputTokens  = data.usage?.input_tokens  || 0
  const outputTokens = data.usage?.output_tokens || 0
  const { actions, summary } = parseStructuredAI(text)
  return { text, actions, summary, inputTokens, outputTokens }
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
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
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

// Token cost constants (claude-sonnet-4)
export const COST_PER_INPUT_TOKEN  = 3  / 1_000_000
export const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000
