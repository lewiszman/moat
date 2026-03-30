// ── Slack message formatter ────────────────────────────────────
// Pure function — no side effects, no imports from React

const CAT_ORDER = ['worst_case', 'call', 'best_case', 'pipeline']
const CAT_LABEL = { worst_case: 'Worst Case', call: 'Call', best_case: 'Best Case', pipeline: 'Pipeline' }

function fmtAmt(n) {
  if (!n || isNaN(n)) return '$0'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '$' + Math.round(n / 1_000) + 'k'
  return '$' + Math.round(n)
}

function fmtDate(d) {
  if (!d) return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function groupForSlack(deals, groupBy) {
  if (groupBy === 'rep') {
    const byRep = {}
    deals.forEach(d => {
      const owner = d._owner || 'Unknown'
      if (!byRep[owner]) byRep[owner] = []
      byRep[owner].push(d)
    })
    return Object.entries(byRep).map(([owner, repDeals]) => ({
      key: owner,
      label: owner,
      deals: repDeals,
    }))
  }
  // default: by FC category
  return CAT_ORDER
    .map(cat => ({
      key: cat,
      label: CAT_LABEL[cat],
      deals: deals.filter(d => d.f_fc_cat_norm === cat),
    }))
    .filter(g => g.deals.length > 0)
}

/**
 * formatSlackMessage — generate exec and manager Slack messages from inspected deals.
 *
 * @param {Array}  deals        - flat array of deal objects with _flags, _owner, aiAction
 * @param {Object} options
 *   @param {'category'|'rep'} groupBy
 *   @param {Date}   runDate
 *   @param {string} quarterLabel
 *   @param {Object} repResults  - { [owner]: { actions: { [nameLower]: actionString }, summary } }
 * @returns {{ execMessage: string, managerMessage: string }}
 */
export function formatSlackMessage(deals, { groupBy = 'category', runDate, quarterLabel, repResults = {} }) {
  const flaggedDeals = (deals || []).filter(d => (d._flags || []).length > 0)
  const header = `*Pipeline Inspection — ${quarterLabel || 'Current Quarter'} · ${fmtDate(runDate)}*`

  const groups = groupForSlack(flaggedDeals, groupBy)

  const buildGroupLines = (group, mode) => {
    const lines = []
    const total = group.deals.reduce((s, d) => s + (d.f_amount_num || 0), 0)
    const crit  = group.deals.filter(d => (d._flags || []).some(f => f.sev === 'critical')).length
    lines.push(`\n*${group.label}* — ${group.deals.length} deal${group.deals.length !== 1 ? 's' : ''} · \`${fmtAmt(total)}\`${crit > 0 ? ` · 🔴 ${crit}` : ''}`)

    group.deals.forEach(d => {
      const hasCrit  = (d._flags || []).some(f => f.sev === 'critical')
      const emoji    = hasCrit ? '🔴' : '🟡'
      const flagText = (d._flags || []).map(f => f.label).join(', ')
      // AI action: look up from repResults or deal.aiAction
      const repResult = repResults[d._owner]
      const nameLower = (d.f_opp_name || '').toLowerCase()
      const aiAction  = d.aiAction
        || repResult?.actions?.[nameLower]
        || (repResult?.actions && Object.entries(repResult.actions).find(([k]) =>
            nameLower.includes(k) || k.includes(nameLower.substring(0, 20))
          )?.[1])
        || null
      const aiPart = aiAction ? ` → *${aiAction}*` : ''

      if (mode === 'manager') {
        lines.push(`${emoji} *${d._owner}* / ${d.f_opp_name || 'Unknown'} (\`${fmtAmt(d.f_amount_num)}\`): ${flagText}${aiPart}`)
      } else {
        // exec: omit AE name
        lines.push(`${emoji} ${d.f_opp_name || 'Unknown'} (\`${fmtAmt(d.f_amount_num)}\`): ${flagText}${aiPart}`)
      }
    })
    return lines
  }

  const execLines    = [header]
  const managerLines = [header]

  if (groups.length === 0) {
    execLines.push('\n_No flagged deals — pipeline is clean._')
    managerLines.push('\n_No flagged deals — pipeline is clean._')
  } else {
    groups.forEach(group => {
      execLines.push(...buildGroupLines(group, 'exec'))
      managerLines.push(...buildGroupLines(group, 'manager'))
    })
  }

  return {
    execMessage:    execLines.join('\n'),
    managerMessage: managerLines.join('\n'),
  }
}
