import React, { useState } from 'react'
import { useInspectorStore } from '../../store/forecastStore'
import { DEFAULT_SYSTEM_PROMPT, COST_PER_INPUT_TOKEN, COST_PER_OUTPUT_TOKEN } from '../../lib/ai'

const TABS = ['General', 'Inspector', 'Usage', 'About']

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
            defaultValue="https://remote-com.lightning.force.com/lightning/r/Report/00OSh000002mFV3MAM/view"
            placeholder="https://..."
          />
        </Row>
      </Section>
      <Section title="Fiscal year">
        <Row label="FY start month" sub="Sets Q1 start. Change 1 = Jan, 4 = Apr, etc.">
          <select className="text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-2 py-1.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i+1} value={i+1}>
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

// ── Inspector tab ──────────────────────────────────────────────
function InspectorTab() {
  const { apiKey, setApiKey, systemPrompt, setSystemPrompt, coachingFocus, setCoachingFocus } = useInspectorStore()
  const [showKey, setShowKey] = useState(false)

  return (
    <div>
      <Section title="Anthropic API key">
        <Row label="API key" sub="Stored in browser localStorage only. Never transmitted except to api.anthropic.com.">
          <div className="flex items-center gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
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
        <button
          onClick={() => setSystemPrompt('')}
          className="btn text-[11px] mt-2"
        >
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

  const now = Date.now()
  const periods = {
    Today:   usageLog.filter(r => r.ts >= new Date().setHours(0,0,0,0)),
    Week:    usageLog.filter(r => r.ts >= now - 7  * 86400000),
    Month:   usageLog.filter(r => r.ts >= now - 30 * 86400000),
    Quarter: usageLog.filter(r => r.ts >= now - 90 * 86400000),
  }

  const fmtTok = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n)
  const fmtCost = c => c < 0.01 ? '<$0.01' : '$' + c.toFixed(2)
  const periodCost = runs => {
    const inp = runs.reduce((s,r) => s+r.input, 0)
    const out = runs.reduce((s,r) => s+r.output, 0)
    return { tok: inp+out, cost: inp*COST_PER_INPUT_TOKEN + out*COST_PER_OUTPUT_TOKEN }
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
                const dt = new Date(r.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                const tok = r.input + r.output
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

// ── About tab ──────────────────────────────────────────────────
const CHANGELOG = [
  {
    version: 'v2.7',
    date: 'Mar 2026',
    current: true,
    items: [
      ['Forecast arithmetic', 'Commit = Closed + Commit; Probable = Commit FC + Probable + C&C; Upside = Probable FC + Upside'],
      ['½ Upside toggle', 'Probable card pill to include 50% of Upside bookings in Probable FC; Upside FC always reflects 100% total'],
      ['Hero cards — multi-expand', 'Each card expands independently; expand all / collapse all; copy image (html2canvas, clipboard + download)'],
      ['Section comments', 'Pencil icon on key sections; free-form note persisted to localStorage'],
      ['Pipeline Inspector — redesigned flags', 'Close date (past / weekend / <3 biz days / discovery <10 biz); FC vs stage alignment; MEDDPICC field-level gaps; activity >14d'],
      ['Pipeline Inspector — AI next step', 'AI assesses whether next step is concrete, future-dated, AE-owned'],
      ['Pipeline Inspector — UX', 'Deal grouping by FC category; team stats bar; severity accent borders; AI deal bolding; toolbar controls'],
      ['PDF export — fixed', 'Consolidated @media print; data-printing attribute switching; reliable per-AE page breaks'],
      ['AE scope filter', 'Multi-select filter scoping all forecast inputs to selected reps'],
      ['Import persistence', 'Pipeline data cached in localStorage, restores on reload'],
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
            ['App', 'MOAT — Manager\'s Forecast Calculator'],
            ['Version', 'v2.7'],
            ['Stack', 'React 18 · Vite · Zustand · Tailwind'],
            ['AI', 'Claude Sonnet 4 via Anthropic API'],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-[var(--tx2)] mb-0.5">{k}</span>
              <span className="font-[500] text-[var(--tx)]">{v}</span>
            </div>
          ))}
        </div>
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
      {tab === 'Inspector' && <InspectorTab />}
      {tab === 'Usage'     && <UsageTab />}
      {tab === 'About'     && <AboutTab />}
    </div>
  )
}
