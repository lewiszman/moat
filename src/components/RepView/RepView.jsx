import React, { useState } from 'react'

const CATEGORIES = [
  {
    key: 'worst_case',
    label: 'Worst Case',
    color: '#1a56db',
    bg: '#eff6ff',
    description: 'Deals you are committing to close this quarter. High confidence. You own the outcome.',
    criteria: [
      'Verbal or written commitment from economic buyer',
      'Legal / procurement review underway or complete',
      'Close date within the quarter with a clear path',
      'Champion identified and actively engaged',
    ],
  },
  {
    key: 'call',
    label: 'Call',
    color: '#0d7c3d',
    bg: '#f0fdf4',
    description: 'Strong deals with a realistic path to closing this quarter. Not yet worst-case-ready but progressing.',
    criteria: [
      'Business case presented and validated',
      'Decision criteria and process understood',
      'Economic buyer identified (may not be engaged yet)',
      'Mutual close plan exists',
    ],
  },
  {
    key: 'best_case',
    label: 'Best Case',
    color: '#b45309',
    bg: '#fffbeb',
    description: 'Deals that could close this quarter if things go well. Treat as stretch. Do not depend on them.',
    criteria: [
      'Solution validated or POC complete',
      'Champion present, economic buyer not yet engaged',
      'Competitive or timeline risk remains',
      'Slippage would not be surprising',
    ],
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    color: '#6b7280',
    bg: '#f9fafb',
    description: 'Active opportunities not expected to close this quarter. Represent future coverage.',
    criteria: [
      'Early stage (discovery, qualification, demo)',
      'Likely Q+1 or later close',
      'Still being qualified — not yet solution-validated',
      'Included in coverage ratio calculations',
    ],
  },
  {
    key: 'cnc',
    label: 'Create & Close',
    color: '#7c3aed',
    bg: '#f5f3ff',
    description: 'Net-new deals created and closed within the same quarter. Typical for SMB or transactional motions.',
    criteria: [
      'Prospected and closed in current quarter',
      'Usually sub-enterprise, faster sales cycle',
      'Models well with ASP × expected opps',
      'Tracked separately from open pipeline',
    ],
  },
]

// Arithmetic mirrors forecastStore.js calcForecast():
//   fc_worst_case = closed + bk_wc + cnc_prorated
//   fc_call       = fc_worst_case + bk_call + bk_bc_in_call   (no C&C — it's in Worst Case)
//   fc_best_case  = fc_call + (bk_bc − bk_bc_in_call)
const ARITHMETIC = [
  { label: 'Worst Case FC', formula: 'Closed + Worst Case bookings + C&C (prorated)',          color: '#1a56db' },
  { label: 'Call FC',       formula: 'Worst Case FC + Call bookings (+ ½ Best Case if on)',    color: '#0d7c3d' },
  { label: 'Best Case FC',  formula: 'Call FC + Best Case bookings (− ½ if folded in)',        color: '#b45309' },
  { label: 'Full FC',       formula: 'Best Case FC + Pipeline bookings',                        color: '#6b7280' },
]

function CategoryCard({ cat }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="card mb-3 overflow-hidden cursor-pointer"
      style={{ borderLeft: `3px solid ${cat.color}` }}
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center mt-0.5"
          style={{ background: cat.bg }}
        >
          <span className="text-[11px] font-[800]" style={{ color: cat.color }}>
            {cat.label[0]}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-[700] text-[var(--tx)]">{cat.label}</span>
          </div>
          <p className="text-[12px] text-[var(--tx2)] leading-snug">{cat.description}</p>
        </div>
        <span className="text-[var(--tx2)] text-[11px] flex-shrink-0 mt-1" style={{ transform: open ? 'rotate(180deg)' : '' }}>▼</span>
      </div>

      {open && (
        <div className="px-4 pb-3 border-t border-[var(--bdr2)]" style={{ background: cat.bg }}>
          <div className="text-[10px] font-[700] uppercase tracking-wider text-[var(--tx2)] mb-2 mt-3">
            Criteria for inclusion
          </div>
          <ul className="flex flex-col gap-1.5">
            {cat.criteria.map((c, i) => (
              <li key={i} className="text-[12px] text-[var(--tx)] flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5" style={{ color: cat.color }}>✓</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function RollupDiagram() {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--bg2)] border-b border-[var(--bdr2)] text-[11px] font-[700] uppercase tracking-wider text-[var(--tx2)]">
        Forecast arithmetic
      </div>
      <div className="px-4 py-4 flex flex-col gap-0">
        {ARITHMETIC.map((row, i) => (
          <div key={row.label} className="relative">
            {/* Connector line */}
            {i > 0 && (
              <div className="absolute left-[22px] -top-3 w-px h-3 bg-[var(--bdr2)]" />
            )}
            <div className="flex items-start gap-3 py-2">
              {/* Dot */}
              <div
                className="w-[11px] h-[11px] rounded-full flex-shrink-0 mt-1 ring-2 ring-offset-2 ring-offset-[var(--bg)]"
                style={{ background: row.color, ringColor: row.color }}
              />
              <div className="flex-1 flex items-baseline justify-between gap-4">
                <span className="text-[13px] font-[700] text-[var(--tx)]">{row.label}</span>
                <span className="text-[11px] text-[var(--tx2)] font-mono text-right">{row.formula}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <div className="rounded-lg p-3 text-[11px] text-[var(--tx2)] leading-relaxed" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <strong className="text-[#0d7c3d]">Best Case toggle:</strong> When enabled, 50% of Best Case bookings fold into Call FC.
          Best Case FC always reflects 100% of Best Case pipeline regardless.
        </div>
      </div>
    </div>
  )
}

export default function RepView() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-[18px] font-[700] text-[var(--tx)]">Forecast Guide</h1>
            <span className="text-[9px] font-[700] uppercase tracking-wide px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">
              Beta
            </span>
          </div>
          <p className="text-[13px] text-[var(--tx2)]">
            Category definitions, filing criteria, and how the forecast rolls up.
            Share this view with your AEs to calibrate submissions.
          </p>
        </div>
      </div>

      {/* Categories */}
      <div className="sec-hd">Forecast categories</div>
      {CATEGORIES.map(cat => <CategoryCard key={cat.key} cat={cat} />)}

      {/* Rollup */}
      <div className="sec-hd mt-6">How numbers roll up</div>
      <RollupDiagram />

      {/* Filing tips */}
      <div className="sec-hd mt-6">Filing tips for AEs</div>
      <div className="card p-4">
        <ul className="flex flex-col gap-3">
          {[
            ["Be conservative with Worst Case", "If you're not sure, it's Call. Broken worst-case calls damage manager credibility upward."],
            ["Update close dates weekly", "A past close date is an automatic red flag in the Inspector. Keep dates real."],
            ["Fill MEDDPICC fields", "Thin fields in Worst Case/Call deals trigger warnings. Specificity builds trust."],
            ["Own your next step", "Next steps should be AE-owned, future-dated actions — not 'waiting on prospect.'"],
            ["Be honest about Best Case", "Best Case means it could close if things go perfectly. It's not a parking lot for slipped deals."],
          ].map(([title, desc]) => (
            <li key={title} className="flex items-start gap-3 text-[12px]">
              <span className="text-[var(--blue)] font-[700] flex-shrink-0 mt-0.5">→</span>
              <span className="text-[var(--tx)]">
                <strong>{title}.</strong>{' '}
                <span className="text-[var(--tx2)]">{desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
