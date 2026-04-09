import React, { useState, useEffect, useCallback } from 'react'
import { useInspectorStore } from '../../store/forecastStore'
import { fetchExecSummary } from '../../lib/ai'
import { fmt } from '../../lib/fmt'

function buildFallback(data) {
  return `${data.managerTeam || 'The team'} is tracking a ${fmt(data.fc_call)} ${data.vocabCall} forecast against a ${fmt(data.quota)} quota for ${data.quarterLabel}, with a ${data.vocabWorstCase} of ${fmt(data.fc_worst_case)} and a ${data.vocabBestCase} of ${fmt(data.fc_best_case)}. With ${data.weeksRemaining} selling weeks remaining, the team expects ${fmt(data.cnc_prorated)} in prorated IQP bookings from ${data.cnc_opps} qualified opportunities at ${fmt(data.cnc_asp)} ASP. This leaves a ${fmt(data.gap)} gap between the ${data.vocabCall} forecast and quota, requiring ${data.total_saa_needed} additional SAAs to close — AE sourcing ${data.ae_allocation}% (${data.ae_saa_needed} SAAs) and SDR outbound sourcing ${data.sdr_allocation}% (${data.sdr_saa_needed} SAAs).`
}

export default function ExecSummaryPanel({ data, onExport, onClose }) {
  const [text, setText]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [noKey, setNoKey]     = useState(false)

  const runAI = useCallback(async () => {
    const apiKey = useInspectorStore.getState().apiKey
    if (!apiKey) {
      setNoKey(true)
      setText(buildFallback(data))
      setLoading(false)
      return
    }
    setNoKey(false)
    setLoading(true)
    setError(null)
    setText('')
    try {
      const result = await fetchExecSummary(data, apiKey)
      setText(result.text)
    } catch (err) {
      setError(err.message || 'Unknown error')
      setText('')
    } finally {
      setLoading(false)
    }
  }, [data])

  useEffect(() => { runAI() }, [runAI])

  const handleRegenerate = () => { runAI() }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-[var(--bg)] rounded-lg border border-[var(--bdr2)] shadow-2xl w-full max-w-[600px] mx-4 p-5 flex flex-col gap-4">

        {/* Header */}
        <div>
          <div className="text-[14px] font-[600] text-[var(--tx)]">
            CRO Read-In — Executive Summary
          </div>
          <div className="text-[11px] text-[var(--tx2)] mt-0.5">
            Review and edit before export. This summary appears at the top of the PDF.
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="text-[11px] text-[var(--coral)] bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">
            AI summary unavailable — {error}
            <div className="mt-1 text-[var(--tx2)]">You can write your own summary above.</div>
          </div>
        )}

        {/* No API key note */}
        {noKey && (
          <div className="text-[11px] text-[var(--tx2)] bg-[var(--bg2)] border border-[var(--bdr2)] rounded px-3 py-2">
            Add your Anthropic API key in Settings to generate AI-written summaries.
          </div>
        )}

        {/* Textarea */}
        <div className="flex flex-col gap-1">
          {loading && (
            <div className="text-[11px] text-[var(--tx2)] flex items-center gap-1.5">
              <span>Generating executive summary</span>
              <span className="inline-flex gap-0.5">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
              </span>
            </div>
          )}
          <textarea
            value={loading ? '' : text}
            onChange={e => setText(e.target.value)}
            readOnly={loading}
            placeholder={loading ? 'Generating executive summary…' : 'Write your summary here…'}
            rows={5}
            className={`w-full resize-y text-[13px] leading-relaxed px-3 py-2.5 rounded border border-[var(--bdr2)] bg-[var(--bg2)] text-[var(--tx)] placeholder:text-[var(--tx2)] focus:outline-none focus:border-[var(--blue)] transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
          <div className="text-[10px] text-[var(--tx2)] text-right">{loading ? 0 : text.length} chars</div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="btn text-[11px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↺ Regenerate
          </button>
          <button
            onClick={() => onExport(text)}
            disabled={loading}
            className="text-[11px] px-3 py-1 rounded bg-[var(--blue)] text-white hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Export PDF
          </button>
          <button
            onClick={onClose}
            className="btn text-[11px]"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  )
}
