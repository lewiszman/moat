import React, { useState } from 'react'
import { useInspectorStore, useForecastStore } from '../../store/forecastStore'
import { useSessionStore } from '../../store/sessionStore'
import { DEFAULT_SYSTEM_PROMPT, COST_PER_INPUT_TOKEN, COST_PER_OUTPUT_TOKEN } from '../../lib/ai'
import { fmt } from '../../lib/fmt'

const TABS = ['General', 'Defaults', 'Inspector', 'Usage', 'About']

function TabBar({ active, onChange }) {
  return (
    <div className="flex border-b border-[var(--bdr2)] mb-6">
      {TABS.map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`
            px-4 py-2.5 text-[12px] font-[600] cursor-pointer border-none bg-transparent
            transition-colors duration-100 -mb-px
            ${active === tab
              ? 'text-[var(--blue)] border-b-2 border-[var(--blue)]'
              : 'text-[var(--tx2)] hover:text-[var(--tx)]'
            }
          `}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children, danger }) {
  return (
    <div className={`card mb-4 overflow-hidden ${danger ? 'border-red-200' : ''}`}>
      <div className={`px-4 py-2.5 text-[11px] font-[700] uppercase tracking-wider border-b ${danger ? 'bg-red-50 text-red-700 border-red-200' : 'bg-[var(--bg2)] text-[var(--tx2)] border-[var(--bdr2)]'}`}>
        {title}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  )
}

function Row({ label, sub, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-[13px] font-[500] text-[var(--tx)]">{label}</div>
        {sub && <div className="text-[11px] text-[var(--tx2)] mt-0.5">{sub}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ── General tab ────────────────────────────────────────────────
function GeneralTab() {
  const s = useForecastStore()

  const handleClear = () => {
    if (!confirm('Clear all saved data? Forecast inputs will be reset.')) return
    localStorage.clear()
    window.location.reload()
  }

  return (
    <div>
      <Section title="Salesforce">
        <Row label="Report URL" sub="Used for the 'Open in Salesforce' link">
          <input
            className="w-72 text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-3 py-1.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]"
            value={s.sfdcUrl || ''}
            onChange={e => s.setField('sfdcUrl', e.target.value)}
            placeholder="https://..."
          />
        </Row>
      </Section>
      <Section title="Fiscal year">
        <Row label="FY start month" sub="Sets Q1 start. 1 = Jan, 4 = Apr, etc.">
          <select
            value={s.fyStartMonth || 1}
            onChange={e => s.setField('fyStartMonth', +e.target.value)}
            className="text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-2 py-1.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' })}
              </option>
            ))}
          </select>
        </Row>
      </Section>
      <Section title="Danger zone" danger>
        <Row label="Reset all data" sub="Clears all forecast inputs, import data, and settings.">
          <button onClick={handleClear} className="btn text-[11px] text-red-600 border-red-200 hover:bg-red-50">
            Reset &rsaquo;
          </button>
        </Row>
      </Section>
    </div>
  )
}

// ── Defaults tab ───────────────────────────────────────────────
function DefaultsTab() {
  const s = useForecastStore()
  const d = s.forecastDefaults || {}
  const [saved, setSaved] = useState(false)

  const update = (key, value) => {
    s.setForecastDefault(key, value)
  }

  const applyNow = () => {
    s.applyForecastDefaults()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const RATE_ROWS = [
    { label: 'Commit rate',       key: 'r_commit', color: '#1a56db', min: 50, max: 100 },
    { label: 'Probable rate',     key: 'r_prob',   color: '#0d7c3d', min: 30, max: 95  },
    { label: 'Upside rate',       key: 'r_up',     color: '#b45309', min: 10, max: 80  },
    { label: 'Pipeline rate',     key: 'r_pipe',   color: '#6b7280', min: 5,  max: 50  },
    { label: 'Create & close rate', key: 'r_cnc',  color: '#6b7280', min: 5,  max: 50  },
  ]

  return (
    <div>
      <Section title="Default conversion rates">
        <div className="text-[11px] text-[var(--tx2)] mb-4">
          These values apply when you create a new quarter or reset inputs. They don't change your current inputs until you click "Apply to current quarter".
        </div>
        {RATE_ROWS.map(row => (
          <div key={row.key} className="flex items-center gap-4 py-2 border-b border-[var(--bdr2)] last:border-0">
            <span className="text-[13px] text-[var(--tx)] w-40 flex-shrink-0">{row.label}</span>
            <input
              type="range" min={row.min} max={row.max} step={1}
              value={d[row.key] ?? 0}
              onChange={e => update(row.key, +e.target.value)}
              className="flex-1 accent-[var(--blue)]"
            />
            <span className="text-[13px] font-[700] w-10 text-right" style={{ color: row.color }}>
              {d[row.key]}%
            </span>
          </div>
        ))}
      </Section>

      <Section title="Default create &amp; close parameters">
        <div className="flex flex-col gap-3">
          <Row label="Default opps per quarter" sub="Used when no import data is available">
            <input
              type="number"
              min={0} max={100} step={1}
              value={d.cnc_opps ?? 5}
              onChange={e => update('cnc_opps', +e.target.value)}
              className="w-24 text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-3 py-1.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)] text-right"
            />
          </Row>
          <Row label="Default ASP" sub="Average selling price for C&C deals">
            <div className="flex items-center gap-1">
              <span className="text-[12px] text-[var(--tx2)]">$</span>
              <input
                type="number"
                min={0} step={500}
                value={d.cnc_asp ?? 14000}
                onChange={e => update('cnc_asp', +e.target.value)}
                className="w-28 text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-3 py-1.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)] text-right"
              />
            </div>
          </Row>
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={applyNow}
          className={`btn text-[11px] ${saved ? 'bg-green-500 text-white border-green-500' : 'btn-primary'}`}
        >
          {saved ? '✓ Applied' : 'Apply to current quarter'}
        </button>
        <span className="text-[11px] text-[var(--tx2)]">
          Overrides current conversion rates and C&amp;C inputs with these defaults.
        </span>
      </div>
    </div>
  )
}

// ── Inspector tab ──────────────────────────────────────────────
function InspectorTab() {
  const { apiKey, setApiKey, systemPrompt, setSystemPrompt, coachingFocus, setCoachingFocus } = useInspectorStore()
  const user     = useSessionStore(s => s.user)
  const [showKey, setShowKey] = useState(false)

  return (
    <div>
      <Section title="Anthropic API key">
        <Row label="API key" sub="Stored in your browser only — never sent to Supabase or shared.">
          <div className="flex items-center gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value, user?.id)}
              placeholder="sk-ant-..."
              className="w-60 font-mono text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-3 py-1.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]"
            />
            <button onClick={() => setShowKey(s => !s)} className="btn text-[11px]">
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </Row>
      </Section>

      <Section title="System prompt">
        <div className="text-[11px] text-[var(--tx2)] mb-2">Leave blank to use the default prompt.</div>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder={DEFAULT_SYSTEM_PROMPT.slice(0, 120) + '…'}
          rows={6}
          className="w-full text-[12px] font-mono border border-[var(--bdr2)] rounded-[var(--rm)] px-3 py-2 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)] resize-y"
        />
        <button onClick={() => setSystemPrompt('')} className="btn text-[11px] mt-2">
          Reset to default
        </button>
      </Section>

      <Section title="Default coaching focus">
        <input
          value={coachingFocus}
          onChange={e => setCoachingFocus(e.target.value)}
          placeholder="e.g. Focus on EOQ close risk — 10 selling days left"
          className="w-full text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-3 py-2 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]"
        />
      </Section>
    </div>
  )
}

// ── Usage tab ──────────────────────────────────────────────────
function UsageTab() {
  const { usageLog, clearUsageLog } = useInspectorStore()

  const now     = Date.now()
  const periods = {
    Today:   usageLog.filter(r => r.ts >= new Date().setHours(0, 0, 0, 0)),
    Week:    usageLog.filter(r => r.ts >= now - 7  * 86400000),
    Month:   usageLog.filter(r => r.ts >= now - 30 * 86400000),
    Quarter: usageLog.filter(r => r.ts >= now - 90 * 86400000),
  }

  const fmtTok  = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
  const fmtCost = c => c < 0.01 ? '<$0.01' : '$' + c.toFixed(2)
  const periodCost = runs => {
    const inp = runs.reduce((s, r) => s + r.input, 0)
    const out = runs.reduce((s, r) => s + r.output, 0)
    return { tok: inp + out, cost: inp * COST_PER_INPUT_TOKEN + out * COST_PER_OUTPUT_TOKEN }
  }

  return (
    <div>
      <Section title="API usage">
        <div className="grid grid-cols-4 gap-3 mb-4">
          {Object.entries(periods).map(([label, runs]) => {
            const { tok, cost } = periodCost(runs)
            return (
              <div key={label} className="text-center p-3 bg-[var(--bg2)] rounded-lg">
                <div className="text-[10px] uppercase tracking-wider text-[var(--tx2)] mb-1">{label}</div>
                <div className="text-[16px] font-[700] text-[var(--tx)]">{fmtTok(tok)}</div>
                <div className="text-[11px] text-[var(--tx2)]">{fmtCost(cost)}</div>
              </div>
            )
          })}
        </div>
        {!usageLog.length
          ? <p className="text-[12px] text-[var(--tx2)]">No runs recorded yet.</p>
          : (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[1fr_auto_auto] text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] pb-1 border-b border-[var(--bdr2)]">
                <span>Run</span><span className="text-right">Tokens</span><span className="text-right ml-4">Cost</span>
              </div>
              {[...usageLog].reverse().slice(0, 15).map((r, i) => {
                const dt   = new Date(r.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                const tok  = r.input + r.output
                const cost = r.input * COST_PER_INPUT_TOKEN + r.output * COST_PER_OUTPUT_TOKEN
                return (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto] text-[12px] py-1.5 border-b border-[var(--bdr2)] last:border-0">
                    <span className="text-[var(--tx2)]">
                      {dt}
                      {r.opps ? <span className="ml-2 opacity-60">· {r.opps} opps · {r.reps} AEs</span> : ''}
                    </span>
                    <span className="font-[600] text-right">{fmtTok(tok)}</span>
                    <span className="text-[var(--tx2)] text-right ml-4">{fmtCost(cost)}</span>
                  </div>
                )
              })}
            </div>
          )
        }
        {usageLog.length > 0 && (
          <button onClick={clearUsageLog} className="btn text-[11px] mt-3">Clear history</button>
        )}
      </Section>
    </div>
  )
}

// ── Feedback form ──────────────────────────────────────────────
function FeedbackForm() {
  const [type, setType]       = React.useState('Bug report')
  const [message, setMessage] = React.useState('')
  const [sent, setSent]       = React.useState(false)

  const handleSend = () => {
    if (!message.trim()) return
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    const body  = `${message}\n\n---\nVersion: v2.8 | ${today}`
    const href  = `mailto:lewiszman+moat@gmail.com?subject=${encodeURIComponent(`[MOAT Feedback] ${type}`)}&body=${encodeURIComponent(body)}`
    window.location.href = href
    setSent(true)
    setTimeout(() => setSent(false), 2000)
  }

  return (
    <div className="mt-4 pt-4 border-t border-[var(--bdr2)]">
      <div className="text-[12px] font-[600] text-[var(--tx)] mb-3">Send feedback</div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <label className="text-[12px] text-[var(--tx2)] w-12 flex-shrink-0">Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-2 py-1.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]"
          >
            <option>Bug report</option>
            <option>Feature request</option>
            <option>Other</option>
          </select>
        </div>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Describe the bug or feature request…"
          rows={4}
          className="w-full text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-3 py-2 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)] resize-y"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={!message.trim()}
            className={`btn text-[11px] ${!message.trim() ? 'opacity-40 cursor-not-allowed' : 'btn-primary'}`}
          >
            Send feedback
          </button>
          {sent && <span className="text-[11px] text-[var(--tx2)]">Opening email client…</span>}
        </div>
      </div>
    </div>
  )
}

// ── About tab ──────────────────────────────────────────────────
const CHANGELOG = [
  {
    version: 'v2.9',
    date: 'Mar 2026',
    current: true,
    items: [
      ['Q+1 mode removed', 'Forecast inputs, snapshots, and tracker are current quarter only; quarter label remains manually editable'],
      ['Deal-Backing columns renamed', 'Deal-Backed Commit, Deal-Backed Probable, Deal-Backed Upside for clearer distinction from Manager View tiers'],
      ['Pipeline deals default to Bench', 'Newly loaded pipeline-category deals start in Bench in Deal-Backing; drag to include in forecast'],
      ['Weekly snapshots with monthly data', 'M1/M2/M3 breakdown by tier (closed/commit/probable/upside) saved in each snapshot for future drill-down and export'],
      ['SFDC quick-link', 'External link button beside Import CSV opens the configured pipeline report URL in Salesforce'],
    ],
  },
  {
    version: 'v2.8',
    date: 'Mar 2026',
    current: false,
    items: [
      ['Forecast arithmetic', 'C&C moves to Commit FC; C&C bookings prorated by weeks remaining in quarter (denominator: quarter weeks − 2)'],
      ['Week-over-week tracker', 'Auto-snapshot every Monday + manual snapshots; variance deltas per forecast tier; Week 2 and Week 10 accuracy badges resolve at quarter end when actual closed is entered'],
      ['Pipeline Inspector overhaul', 'Full-width table view; standardized flag library with typed IDs, consistent labels, severity weights; AI toggle (rules-only mode is first-class); exec and manager Slack copy'],
      ['Deal-Backing C&C card', 'Persistent synthetic card defaulting from Manager View; editable overrides; prorated value; draggable to any column'],
      ['Supabase session persistence', 'GitHub OAuth; auto-save + named snapshots; session history with restore; API key scoped per user, never leaves device'],
      ['Author and feedback', 'About section updated; in-app feedback form'],
    ],
  },
  {
    version: 'v2.7',
    date: 'Mar 2026',
    current: false,
    items: [
      ['Monthly breakdown', 'M1/M2/M3 input table with past-month locking, linearity row, variance vs quota pace'],
      ['CQ/Q+1 isolated state', 'Switching between CQ and Q+1 saves and restores completely separate input sets'],
      ['Quarter status bar', 'Date strip with week number, selling days remaining, Q-end date, progress bar'],
      ['Rep View', 'Coaching/explainer view with forecast category definitions and rollup diagram'],
      ['Save & share URL', 'Full forecast state encoded as URL parameters for bookmarking and sharing'],
      ['Manager Insights tab', 'Flag frequency chart, AE risk score chart, AI team coaching themes'],
      ['Inspector XLSX export', 'One-click export of full inspection results to Excel'],
      ['Manager View PDF', 'Branded navy/coral print layout triggered from PDF button'],
      ['Settings Forecast Defaults', 'Configurable default conversion rates and C&C parameters'],
      ['QE easter egg', 'Q-End Mode with ticker tape and flames (low priority but fun)'],
      ['Forecast arithmetic', 'Commit = Closed + Commit; Probable = Commit FC + Probable + C&C; Upside = Probable FC + Upside'],
      ['Hero cards — multi-expand', 'Each card expands independently; copy image (html2canvas)'],
      ['Pipeline Inspector — AI next step', 'AI assesses whether next step is concrete, future-dated, AE-owned'],
      ['Deal-Backing module', 'Drag-and-drop Kanban; waterfall bands; cumulative FC headlines'],
      ['React migration', 'Migrated to React 18 + Vite + Zustand + Tailwind (v2.7)'],
    ],
  },
  {
    version: 'v2.4 – 2.6',
    date: 'Mar 2026',
    items: [
      ['Pipeline Inspector', 'Per-rep hygiene flags, deal table, AI coaching summaries via Anthropic API'],
      ['This / Next quarter toggle', 'Switch between CQ and Q+1 with isolated state'],
      ['API usage dashboard', 'Token and cost tracking by period'],
      ['Dark mode', 'Full dark theme, persisted'],
    ],
  },
  {
    version: 'v2.0 – 2.3',
    date: 'Feb 2026',
    items: [
      ['App shell', 'Topbar, sidebar, multi-view architecture'],
      ['CSV import', 'SFDC CSV import with column mapping wizard and auto-populate'],
      ['PDF & Excel export', 'Branded print layout and xlsx export'],
      ['Save & share URL', 'Full state encoded as URL parameters'],
    ],
  },
  {
    version: 'v1.0 – 1.3',
    date: 'Jan 2026',
    items: [
      ['Core forecast calculator', 'Quota, closed QTD, pipeline by category, conversion rates'],
      ['Create & close what-if', 'Opps × ASP model'],
      ['Monthly breakdown', 'M1/M2/M3 inputs with linearity and variance'],
    ],
  },
]

function AboutTab() {
  return (
    <div>
      <Section title="About">
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          {[
            ['App',     "MOAT — Manager's Forecast Calculator"],
            ['Version', 'v2.8'],
            ['Author',  'Lewis Man'],
            ['Stack',   'React 18 · Vite · Zustand · Tailwind'],
            ['AI',      'Claude Sonnet 4 via Anthropic API'],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-[var(--tx2)] mb-0.5">{k}</span>
              <span className="font-[500] text-[var(--tx)]">{v}</span>
            </div>
          ))}
        </div>
        <FeedbackForm />
      </Section>

      <Section title="Version history">
        <div className="flex flex-col divide-y divide-[var(--bdr2)]">
          {CHANGELOG.map(entry => (
            <div key={entry.version} className="py-4 first:pt-0">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[11px] font-[700] px-2 py-0.5 rounded-full border ${entry.current ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-[var(--bg2)] text-[var(--tx2)] border-[var(--bdr2)]'}`}>
                  {entry.version}
                </span>
                <span className="text-[11px] text-[var(--tx2)]">{entry.date}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {entry.items.map(([title, desc]) => (
                  <li key={title} className="text-[12px] text-[var(--tx2)] pl-3 relative before:absolute before:left-0 before:content-['—'] before:opacity-40">
                    <strong className="text-[var(--tx)] font-[600]">{title}</strong> — {desc}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Settings root ──────────────────────────────────────────────
export default function Settings() {
  const [tab, setTab] = useState('General')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-[18px] font-[700] text-[var(--tx)] mb-5">Settings</h1>
      <TabBar active={tab} onChange={setTab} />
      {tab === 'General'   && <GeneralTab />}
      {tab === 'Defaults'  && <DefaultsTab />}
      {tab === 'Inspector' && <InspectorTab />}
      {tab === 'Usage'     && <UsageTab />}
      {tab === 'About'     && <AboutTab />}
    </div>
  )
}
