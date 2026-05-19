import React, { useEffect } from 'react'
import { useInspectorStore } from '../../store/forecastStore'
import { useVocabStore } from '../../lib/vocab'

export default function GuidedTour({ onClose, onNavigate }) {
  const defaultSfdcUrl = useInspectorStore(s => s.defaultSfdcUrl) || ''
  const vocab = useVocabStore(s => s.vocab)

  const STEPS = [
    {
      title: 'Export & import your SFDC opportunity report',
      description: 'In Salesforce, run your pipeline report filtered to CQ (or Q+1). Export as a detailed CSV, then click Import CSV in MOAT. The import wizard maps columns automatically and populates your pipeline inputs.',
      chip: '→ Manager Walk-Up',
      view: 'manager',
    },
    {
      title: 'Review conversion rates',
      description: `Check that your ${vocab.worst_case}, ${vocab.call}, ${vocab.best_case}, and Pipeline rates reflect your team's historical close rates this quarter. Adjust sliders until they match your actuals.`,
      chip: '→ Manager Walk-Up',
      view: 'manager',
    },
    {
      title: 'Set your In-Quarter Pipeline assumptions',
      description: 'Enter the number of SAAs (new qualified opportunities) expected for the full team across the quarter — MOAT will automatically prorate to time remaining. Set your ASP for these deals. Selling weeks are calculated as total weeks in the quarter minus 2, assuming deals created in the final 2 weeks won\'t have enough runway to close.',
      chip: '→ Manager Walk-Up',
      view: 'manager',
    },
    {
      title: 'Review your directional forecast',
      description: `Review ${vocab.worst_case}, ${vocab.call}, and ${vocab.best_case} forecasts. On the ${vocab.call} card, toggle '+ ½ ${vocab.best_case}' to include 50% of your Expected Best Case bookings in your forecast number — useful when you have high-confidence upside deals.`,
      chip: '→ Manager Walk-Up',
      view: 'manager',
    },
    {
      title: 'Inspect pipeline hygiene and executional rigor',
      description: `Use the Pipeline Inspector to ensure deals are in the right forecast category. Flag hygiene issues — stale close dates, missing next steps, MEDDPICC gaps. Copy flagged deals directly to Slack per rep or per forecast category to drive accountability.`,
      chip: '→ Pipeline Inspector',
      view: 'inspector',
    },
    {
      title: 'Deal-Back your forecast',
      description: `At month or quarter end, use Deal-Backing to visualize different paths to your forecast with actual deals. Drag deals into ${vocab.worst_case}, ${vocab.call}, and ${vocab.best_case} columns to build a bottoms-up view of how you get to your number.`,
      chip: '→ Deal-Backing',
      view: 'dealback',
    },
  ]

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function stepDescription(step, i) {
    if (i === 0 && defaultSfdcUrl) {
      return (
        <span>
          {step.description}{' '}
          <a
            href={defaultSfdcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--blue)] hover:underline"
          >
            Open SFDC report →
          </a>
        </span>
      )
    }
    return step.description
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--bg)] rounded-xl shadow-2xl w-full max-w-[560px] max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--bdr2)] flex-shrink-0">
          <div>
            <div className="text-[18px] font-[700] text-[var(--tx)]">How to use MOAT</div>
            <div className="text-[12px] text-[var(--tx2)] mt-0.5">
              Recommended workflow for a clean, confident forecast
            </div>
          </div>
          <button
            autoFocus
            onClick={onClose}
            className="text-[var(--tx2)] hover:text-[var(--tx)] text-xl leading-none border-none bg-transparent cursor-pointer ml-4 flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Steps */}
        <div className="overflow-y-auto flex-1 px-5 py-2">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="flex gap-3 items-start py-3 border-b border-[var(--bdr2)] last:border-0"
            >
              <span className="w-6 h-6 rounded-full bg-[var(--blue)] text-white text-[11px] font-[700] flex-shrink-0 flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="text-[13px] font-[700] text-[var(--tx)]">{step.title}</div>
                <div className="text-[12px] text-[var(--tx2)] leading-relaxed mt-0.5">{stepDescription(step, i)}</div>
                {step.chip && (
                  <button
                    onClick={() => { onNavigate(step.view); onClose() }}
                    className="inline-flex text-[11px] font-[600] text-[var(--blue)] hover:underline cursor-pointer mt-1 border-none bg-transparent p-0"
                  >
                    {step.chip}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--bdr2)] flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-[var(--tx2)]">
            Need help?{' '}
            <a
              href="mailto:lewiszman+moat@gmail.com"
              className="text-[var(--blue)] hover:underline"
            >
              lewiszman+moat@gmail.com
            </a>
          </span>
          <button onClick={onClose} className="btn text-[11px]">Got it</button>
        </div>
      </div>
    </div>
  )
}
