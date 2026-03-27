// ── Anthropic API ──────────────────────────────────────────────

export const DEFAULT_SYSTEM_PROMPT = `You are a sales manager assistant. Review opportunity data and produce a structured, Slack-ready inspection summary grouped by forecast category.

Rule-based flags are pre-computed. Your job adds qualitative judgment:
1. Assess next step quality: is it a concrete, future-dated action to be taken by the AE? Flag if vague, reactive, or missing a date.
2. For Commit and Probable deals, assess MEDDPICC content quality — flag fields that are thin, generic, or inconsistent.
3. Identify deals needing executive attention.
4. Do NOT re-flag rule-based issues already listed. Focus on qualitative judgment only.

Output format — mirror this structure exactly:

One sentence observation about this AE pipeline health.

[Pipeline action items for M/DD]

*Commit*
🔴 *Acme Corp*: next step vague (no date, waiting on prospect), champion thin
🟡 *Beta Inc*: metrics generic (no quantified impact)

*Probable*
🟡 *Gamma Ltd*: next step not AE-owned (waiting on legal team)

Rules: bold category header per group, one line per flagged deal, opp name in *asterisks*, 🔴 for exec-attention only (past close, broken commit, missing champion or EB on commit), 🟡 for all other flags. Only include categories with flagged deals. No other prose or headers.`

export const DEFAULT_COACHING_FOCUS = ''

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
    const flags = (d._flags || []).map(f => `[${f.sev.toUpperCase()}] ${f.text}`).join(', ')
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
      max_tokens: 1000,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${response.status}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || ''
  const inputTokens = data.usage?.input_tokens || 0
  const outputTokens = data.usage?.output_tokens || 0
  return { text, inputTokens, outputTokens }
}

export async function fetchManagerInsights({ repsSorted, active, apiKey, systemPrompt }) {
  const aeSummary = repsSorted.map(([owner, deals]) => {
    const flags = deals.flatMap(d => d._flags || [])
    const red = flags.filter(f => f.sev === 'red').length
    const amber = flags.filter(f => f.sev === 'amber').length
    const pipe = deals.reduce((s, d) => s + d.f_amount_num, 0)
    return `${owner}: ${deals.length} deals, $${Math.round(pipe / 1000)}k pipeline, ${red} critical, ${amber} warnings`
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
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })

  if (!response.ok) throw new Error(`API error ${response.status}`)
  const data = await response.json()
  return {
    text: data.content?.[0]?.text || '',
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  }
}

// ── Text processing ────────────────────────────────────────────

export function formatForSlack(text) {
  if (!text) return ''
  const isCategoryHeader = l =>
    /^\*?(Commit|Probable|Upside|Pipeline)\*?[:\s]*$/i.test(l.trim())
  return text.split('\n').map(line => {
    const cp = line.codePointAt(0)
    const hasEmoji = cp === 0x1F534 || cp === 0x1F7E1
    const hasBullet = line.startsWith('* ')
    if (!hasEmoji && !hasBullet) return line
    if (isCategoryHeader(line)) return line
    let prefix = '•'
    let rest = line
    if (hasEmoji) { prefix = line.slice(0, 2); rest = line.slice(2).trim() }
    else if (hasBullet) { rest = line.slice(2).trim() }
    const colon = rest.indexOf(':')
    if (colon < 0) return `${prefix} ${rest}`
    const rawName = rest.slice(0, colon).replace(/\*/g, '').trim()
    const flags = rest.slice(colon + 1).trim()
    return `${prefix} *${rawName}*: ${flags}`
  }).join('\n')
}

export function parseAIFlags(text) {
  const map = new Map()
  if (!text) return map
  const lines = text.split('\n')
  lines.forEach(line => {
    const m = line.match(/[🔴🟡]\s*\*([^*]+)\*/)
    if (m) {
      const name = m[1].trim().toLowerCase()
      map.set(name, line)
    }
  })
  return map
}

// Token cost constants (claude-sonnet-4)
export const COST_PER_INPUT_TOKEN  = 3 / 1_000_000
export const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000
