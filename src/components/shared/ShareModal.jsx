import React, { useState, useEffect, useRef } from 'react'
import { useForecastStore } from '../../store/forecastStore'

// Fields encoded into the share URL
const SHARE_FIELDS = [
  'managerName', 'managerTeam', 'quarterLabel',
  'quota', 'closed', 'callIncludesBestCase',
  'r_worst_case', 'r_call', 'r_best_case', 'r_pipe', 'r_cnc',
  'pipe_worst_case', 'pipe_call', 'pipe_best_case', 'pipe_pipe',
  'cnc_opps', 'cnc_asp',
  'm1_closed', 'm1_worst_case', 'm1_call', 'm1_best_case',
  'm2_closed', 'm2_worst_case', 'm2_call', 'm2_best_case',
  'm3_closed', 'm3_worst_case', 'm3_call', 'm3_best_case',
]

const NUMERIC_FIELDS = new Set([
  'quota', 'closed',
  'r_worst_case', 'r_call', 'r_best_case', 'r_pipe', 'r_cnc',
  'pipe_worst_case', 'pipe_call', 'pipe_best_case', 'pipe_pipe',
  'cnc_opps', 'cnc_asp',
  'm1_closed', 'm1_worst_case', 'm1_call', 'm1_best_case',
  'm2_closed', 'm2_worst_case', 'm2_call', 'm2_best_case',
  'm3_closed', 'm3_worst_case', 'm3_call', 'm3_best_case',
])

export function buildShareUrl(state) {
  const params = new URLSearchParams()
  SHARE_FIELDS.forEach(k => {
    const v = state[k]
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v))
    }
  })
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`
}

export function parseShareUrl() {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('quota') && !params.has('managerName')) return null
  const state = {}
  SHARE_FIELDS.forEach(k => {
    if (params.has(k)) {
      const v = params.get(k)
      if (NUMERIC_FIELDS.has(k)) {
        state[k] = parseFloat(v) || 0
      } else if (k === 'callIncludesBestCase') {
        state[k] = v === 'true'
      } else {
        state[k] = v
      }
    }
  })
  return state
}

export default function ShareModal({ onClose }) {
  const s = useForecastStore()
  const inputRef = useRef(null)
  const [copied, setCopied] = useState(false)

  const url = buildShareUrl(s)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      inputRef.current?.select()
      document.execCommand('copy')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--bg)] rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--bdr2)]">
          <div>
            <div className="text-[14px] font-[700] text-[var(--tx)]">Save &amp; share</div>
            <div className="text-[11px] text-[var(--tx2)] mt-0.5">
              Full forecast state encoded in the URL. Bookmark or send to a colleague.
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--tx2)] hover:text-[var(--tx)] text-xl leading-none border-none bg-transparent cursor-pointer ml-4"
          >
            ×
          </button>
        </div>

        {/* URL */}
        <div className="px-5 py-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              readOnly
              value={url}
              onClick={e => e.target.select()}
              className="flex-1 text-[11px] font-mono border border-[var(--bdr2)] rounded-[var(--rm)] px-3 py-2 bg-[var(--bg2)] text-[var(--tx)] outline-none focus:border-[var(--blue)] truncate"
            />
            <button
              onClick={handleCopy}
              className={`btn text-[11px] flex-shrink-0 min-w-[70px] ${copied ? 'bg-green-500 text-white border-green-500' : 'btn-primary'}`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <div className="mt-3 text-[11px] text-[var(--tx2)] leading-relaxed">
            <strong className="text-[var(--tx)]">What's included:</strong> all input fields, conversion rates,
            pipeline amounts, monthly breakdown, C&amp;C parameters, and manager identity.
            Import data and AI results are <em>not</em> included.
          </div>
        </div>

        {/* What's included summary */}
        <div className="px-5 pb-4 flex items-center justify-between">
          <div className="flex gap-1.5 flex-wrap">
            {['Manager Walk-Up', 'CQ inputs', 'Monthly', 'Rates', 'C&C'].map(tag => (
              <span
                key={tag}
                className="text-[9px] font-[700] uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--bg2)] text-[var(--tx2)] border border-[var(--bdr2)]"
              >
                {tag}
              </span>
            ))}
          </div>
          <button onClick={onClose} className="btn text-[11px]">Done</button>
        </div>
      </div>
    </div>
  )
}
