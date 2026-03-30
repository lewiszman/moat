import React, { useEffect } from 'react'
import { useInspectorStore } from '../../store/forecastStore'

const STEPS = [
  {
    title: 'Pull your SFDC report',
    description: 'Click the SFDC button beside Import CSV. Filter for CQ or NQ, then export as a detailed CSV report.',
    chip: null,
    view: null,
  },
  {
    title: 'Import pipeline data',
    description: 'Drop your CSV into the import wizard. MOAT maps columns automatically and populates your pipeline inputs.',
    chip: '→ Manager Walk-Up',
    view: 'manager',
  },
  {
    title: 'Review conversion rates',
    description: 'Check that your Worst Case, Call, Best Case, and C&C rates reflect your team\'s historical close rates this quarter.',
    chip: '→ Manager Walk-Up',
    view: 'manager',
  },
  {
    title: 'Set your Create & Close inputs',
    description: 'Enter qualified opps to create, average deal size, and win rate. C&C bookings are prorated by selling weeks remaining and included in your Worst Case forecast.',
    chip: '→ Manager Walk-Up',
    view: 'manager',
  },
  {
    title: 'Read your forecast',
    description: "Review Worst Case, Call, and Best Case forecasts. Toggle '+ ½ Best Case' on the Call card if you want to include half your best case bookings in your Call forecast.",
    chip: '→ Manager Walk-Up',
    view: 'manager',
  },
  {
    title: "Capture this week's forecast",
    description: 'Take a manual snapshot in the Week-over-Week tracker to record your forecast baseline. Auto-snapshots fire every Monday.',
    chip: '→ Manager Walk-Up',
    view: 'manager',
  },
  {
    title: 'Run the Pipeline Inspector',
    description: 'Click Run to flag hygiene issues across your deals — close dates, next steps, MEDDPICC gaps. Copy flagged deals directly to Slack per rep or per forecast category.',
    chip: '→ Pipeline Inspector',
    view: 'inspector',
  },
  {
    title: 'Add your Anthropic API key',
    description: 'If you have a Claude API key, add it in Settings → Inspector. AI Flags will assess next step quality on every deal — no key needed for rules-based inspection.',
    chip: '→ Settings',
    view: 'settings',
  },
  {
    title: 'Moneyballer your forecast',
    description: 'At month or quarter end, go to Deal-Backing. Drag deals into Deal-Backed Worst Case, Call, and Best Case to build a bottoms-up path to your number. The C&C card is always available at the top of each column.',
    chip: '→ Deal-Backing',
    view: 'dealback',
  },
]

export default function GuidedTour({ onClose, onNavigate }) {
  const defaultSfdcUrl = useInspectorStore(s => s.defaultSfdcUrl) || ''

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
