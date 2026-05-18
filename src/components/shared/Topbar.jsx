import React, { useState, useRef, useEffect } from 'react'
import { useForecastStore, useWowStore, useQuarterStore } from '../../store/forecastStore'
import { useSessionStore } from '../../store/sessionStore'
import { useCoverageStore } from '../../store/coverageStore'
import { useDarkMode } from '../../hooks/useDarkMode'
import AuthButton from './AuthButton'
import SessionHistory from './SessionHistory'
import { exportForecastPDF, exportInspectionPDF } from '../../lib/exportPdf.jsx'
import { exportCROPDFWithSummary } from '../pdf/CROReadIn.jsx'
import { calcCoverageModel } from '../../lib/coverage'
import { getEffectiveFc } from '../../lib/forecast'
import { getVocab } from '../../lib/vocab'
import ExecSummaryPanel from '../pdf/ExecSummaryPanel.jsx'

const VIEW_LABELS = {
  manager:   'Manager Walk-Up',
  inspector: 'Pipeline Inspector',
  dealback:  'Deal-Backing',
  coverage:  'Coverage',
  settings:  'Settings',
}

// ── Overflow menu ──────────────────────────────────────────────
function OverflowMenu({ activeView }) {
  const [open, setOpen]               = useState(false)
  const [pdfLoading, setPdfLoading]   = useState(false)
  const [croPdfLoading, setCroPdfLoading] = useState(false)
  const [promptOpen, setPromptOpen]   = useState(false)
  const [snapLabel, setSnapLabel]     = useState('')
  const [execPanelOpen, setExecPanelOpen] = useState(false)
  const [panelData, setPanelData]     = useState(null)
  const ref = useRef(null)

  const quota        = useForecastStore(s => s.quota)
  const quarterLabel = useForecastStore(s => s.quarterLabel)
  const user         = useSessionStore(s => s.user)
  const saving       = useSessionStore(s => s.saving)
  const saveSnapshot = useSessionStore(s => s.saveSnapshot)
  const fcOverrides  = useForecastStore(s => s.fcOverrides) || {}
  const clearAllFcOverrides = useForecastStore(s => s.clearAllFcOverrides)
  const anyFcOverride = Object.values(fcOverrides).some(v => v !== null)
  const [dark, setDark] = useDarkMode()

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handlePdf = async () => {
    setOpen(false); setPdfLoading(true)
    try {
      if (activeView === 'inspector') await exportInspectionPDF()
      else await exportForecastPDF()
    } finally { setPdfLoading(false) }
  }

  const handleSave = async () => {
    await saveSnapshot(snapLabel.trim() || null)
    setSnapLabel(''); setPromptOpen(false)
  }

  const openExecPanel = () => {
    setOpen(false)
    const fs  = useForecastStore.getState()
    const d   = fs.derived || {}
    const aq  = useQuarterStore.getState().activeQuarter
    const wow = useWowStore.getState()
    const cov = useCoverageStore.getState()
    const vocab     = getVocab()
    const fcOv      = fs.fcOverrides || {}
    const effective = getEffectiveFc(d, fcOv)
    const coverage  = calcCoverageModel(cov.channels, fs.quota || 0, effective.fc_call || 0, d.weeks_remaining ?? 0)
    const ae        = coverage.channels['ae']  || null
    const sdr       = coverage.channels['sdr'] || null
    const gap       = Math.max(0, (fs.quota || 0) - (effective.fc_call || 0))
    const total_saa = (ae?.saas_needed || 0) + (sdr?.saas_needed || 0)
    const qSnaps    = wow.snapshots.filter(s => (s.quarterKey ?? 'cq') === aq)
      .slice().sort((a, b) => new Date(a.date) - new Date(b.date))
    const priorSnap = qSnaps.length >= 2 ? qSnaps[qSnaps.length - 2] : null
    const wowDelta  = priorSnap !== null ? (d.fc_call || 0) - (priorSnap.fc_call || 0) : null
    const repRows   = []
    if (fs.importedData?.length) {
      const grouped = {}
      fs.importedData.forEach(deal => {
        const owner = deal.f_owner || 'Unknown'
        if (!grouped[owner]) grouped[owner] = { owner, closed: 0, wc: 0, call: 0, bc: 0, pipe: 0, critical: 0 }
        const amt = deal.f_amount_num || 0; const cat = deal.f_fc_cat_norm
        if (cat === 'closed')     grouped[owner].closed += amt
        else if (cat === 'worst_case') grouped[owner].wc   += amt
        else if (cat === 'call')       grouped[owner].call += amt
        else if (cat === 'best_case')  grouped[owner].bc   += amt
        else if (cat === 'pipeline')   grouped[owner].pipe += amt
        grouped[owner].critical += (deal._flags || []).filter(f => f.sev === 'critical').length
      })
      Object.values(grouped).sort((a, b) => (b.closed + b.wc + b.call) - (a.closed + a.wc + a.call)).forEach(r => repRows.push(r))
    }
    setPanelData({
      managerName: fs.managerName || '', managerTeam: fs.managerTeam || '',
      quarterLabel: fs.quarterLabel || '', quota: fs.quota || 0, closed: fs.closed || 0,
      fc_worst_case: effective.fc_worst_case, fc_call: effective.fc_call, fc_best_case: effective.fc_best_case,
      fc_worst_case_model: d.fc_worst_case || 0, fc_call_model: d.fc_call || 0, fc_best_case_model: d.fc_best_case || 0,
      overrideActive: effective.overrideActive,
      bk_wc: d.bk_wc || 0, bk_call: d.bk_call || 0, bk_bc: d.bk_bc || 0,
      cnc_prorated: d.cnc_prorated || 0, cnc_opps: fs.cnc_opps || 0, cnc_asp: fs.cnc_asp || 0,
      r_cnc: fs.r_cnc || 0, cnc_pipe: d.cnc_pipe || 0, prorationFactor: d.prorationFactor ?? 1,
      weeks_remaining: d.weeks_remaining ?? 0, weeks_total: d.weeks_total || 0, weeksRemaining: d.weeks_remaining ?? 0,
      gap, total_saa_needed: total_saa,
      ae_allocation: cov.channels['ae']?.allocation ?? 50, ae_saa_needed: ae?.saas_needed ?? 0,
      sdr_allocation: cov.channels['sdr']?.allocation ?? 50, sdr_saa_needed: sdr?.saas_needed ?? 0,
      vocabWorstCase: vocab.worst_case, vocabCall: vocab.call, vocabBestCase: vocab.best_case,
      overridesActive: Object.values(fcOv).some(v => v !== null),
      priorSnap, wowDelta, importMeta: fs.importMeta, repRows,
      channels: cov.channels, coverage, ae, sdr, vocab,
    })
    setExecPanelOpen(true)
  }

  const handleCroExport = async (summaryText) => {
    setExecPanelOpen(false); setCroPdfLoading(true)
    try { await exportCROPDFWithSummary(panelData, summaryText) }
    finally { setCroPdfLoading(false) }
  }

  const canPdf = activeView === 'manager' || activeView === 'inspector'
  const canCro = !!quota && !!quarterLabel

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          className={`btn text-[11px] flex items-center gap-1.5 ${anyFcOverride ? 'border-amber-300 text-amber-600' : ''}`}
          title="More actions"
        >
          {anyFcOverride && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
          <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
            <circle cx="1.5" cy="6.5" r="1.5"/><circle cx="6.5" cy="6.5" r="1.5"/><circle cx="11.5" cy="6.5" r="1.5"/>
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-9 z-50 w-52 rounded-lg border border-[var(--bdr2)] bg-[var(--bg)] shadow-xl py-1">
            {canPdf && (
              <button onClick={handlePdf} disabled={pdfLoading}
                className="w-full text-left px-3 py-2 text-[12px] text-[var(--tx)] hover:bg-[var(--bg2)] flex items-center gap-2 cursor-pointer border-none bg-transparent">
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                {pdfLoading ? 'Generating…' : 'Download PDF'}
              </button>
            )}
            <button onClick={openExecPanel} disabled={!canCro || croPdfLoading}
              title={!canCro ? 'Set quota and quarter label first' : undefined}
              className="w-full text-left px-3 py-2 text-[12px] text-[var(--tx)] hover:bg-[var(--bg2)] flex items-center gap-2 cursor-pointer border-none bg-transparent disabled:opacity-40 disabled:cursor-not-allowed">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              {croPdfLoading ? 'Generating…' : 'CRO Read-In PDF'}
            </button>

            <div className="border-t border-[var(--bdr2)] my-1" />

            <button onClick={() => { setDark(!dark); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-[12px] text-[var(--tx)] hover:bg-[var(--bg2)] flex items-center gap-2 cursor-pointer border-none bg-transparent">
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                {dark
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z"/>
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
                }
              </svg>
              {dark ? 'Light mode' : 'Dark mode'}
            </button>

            {anyFcOverride && (
              <>
                <div className="border-t border-[var(--bdr2)] my-1" />
                <button onClick={() => { clearAllFcOverrides(); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-[12px] text-amber-600 hover:bg-[var(--bg2)] flex items-center gap-2 cursor-pointer border-none bg-transparent">
                  <span>⚠</span> Clear submission overrides
                </button>
              </>
            )}

            {user && (
              <>
                <div className="border-t border-[var(--bdr2)] my-1" />
                <button onClick={() => { setOpen(false); setPromptOpen(o => !o) }} disabled={saving}
                  className="w-full text-left px-3 py-2 text-[12px] text-[var(--tx)] hover:bg-[var(--bg2)] flex items-center gap-2 cursor-pointer border-none bg-transparent">
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                  {saving ? 'Saving…' : 'Save snapshot'}
                </button>
              </>
            )}
          </div>
        )}

        {promptOpen && (
          <div className="absolute right-0 top-9 z-[60] w-64 rounded-lg border border-[var(--bdr2)] bg-[var(--bg)] shadow-xl p-3 flex flex-col gap-2">
            <span className="text-[11px] text-[var(--tx2)]">Optional label for this snapshot:</span>
            <input autoFocus value={snapLabel} onChange={e => setSnapLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="e.g. End of week 3"
              className="w-full text-[12px] px-2 py-1.5 rounded border border-[var(--bdr2)] bg-[var(--bg2)] text-[var(--tx)] placeholder:text-[var(--tx2)] focus:outline-none focus:border-[var(--blue)]" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPromptOpen(false)} className="btn text-[11px]">Cancel</button>
              <button onClick={handleSave} className="text-[11px] px-3 py-1 rounded bg-[var(--blue)] text-white hover:opacity-80 cursor-pointer border-none">Save</button>
            </div>
          </div>
        )}
      </div>

      {execPanelOpen && panelData && (
        <ExecSummaryPanel data={panelData} onExport={handleCroExport} onClose={() => setExecPanelOpen(false)} />
      )}
    </>
  )
}

// ── Main Topbar ────────────────────────────────────────────────
export default function Topbar() {
  const activeView = useForecastStore(s => s.activeView)
  const importMeta = useForecastStore(s => s.importMeta)
  const user       = useSessionStore(s => s.user)
  const [nudgeDismissed, setNudgeDismissed] = useState(
    () => !!sessionStorage.getItem('moat-nudge-dismissed')
  )

  return (
    <header className="flex items-center h-10 px-4 border-b border-[var(--bdr2)] bg-[var(--bg)] flex-shrink-0 gap-3">
      <span className="text-[11px] font-[800] tracking-widest text-[var(--coral)] uppercase select-none">MOAT</span>
      <span className="text-[var(--bdr2)] select-none">|</span>
      <span className="text-[12px] font-[600] text-[var(--tx)]">{VIEW_LABELS[activeView] || activeView}</span>

      <div className="flex items-center gap-1.5 ml-1">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${importMeta ? 'bg-[var(--green)]' : 'bg-[var(--bg3)]'}`} />
        <span className="text-[11px] text-[var(--tx2)]">
          {importMeta ? `${importMeta.count} deals · ${importMeta.filename}` : 'No data'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {!user && !nudgeDismissed && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[var(--blue)]">
            Sign in to save across devices
            <button onClick={() => { sessionStorage.setItem('moat-nudge-dismissed', '1'); setNudgeDismissed(true) }}
              className="ml-0.5 opacity-60 hover:opacity-100 leading-none border-none bg-transparent cursor-pointer p-0 text-[12px] text-[var(--blue)]">✕</button>
          </span>
        )}
        {user && <SessionHistory />}
        <AuthButton />
        <OverflowMenu activeView={activeView} />
      </div>
    </header>
  )
}
