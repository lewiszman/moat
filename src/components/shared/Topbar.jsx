import React, { useState } from 'react'
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
  manager: 'Manager Walk-Up',
  inspector: 'Pipeline Inspector',
  dealback: 'Deal-Backing',
  settings: 'Settings',
}

export default function Topbar() {
  const activeView = useForecastStore(s => s.activeView)
  const importMeta = useForecastStore(s => s.importMeta)
  const [dark, setDark] = useDarkMode()

  const user        = useSessionStore(s => s.user)
  const saveSnapshot = useSessionStore(s => s.saveSnapshot)
  const saving      = useSessionStore(s => s.saving)

  const quota               = useForecastStore(s => s.quota)
  const quarterLabel        = useForecastStore(s => s.quarterLabel)
  const fcOverrides         = useForecastStore(s => s.fcOverrides) || {}
  const clearAllFcOverrides = useForecastStore(s => s.clearAllFcOverrides)
  const anyFcOverride = fcOverrides.worst_case !== null || fcOverrides.call !== null || fcOverrides.best_case !== null

  const [promptOpen, setPromptOpen]     = useState(false)
  const [snapLabel, setSnapLabel]       = useState('')
  const [pdfLoading, setPdfLoading]     = useState(false)
  const [croPdfLoading, setCroPdfLoading] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(
    () => !!sessionStorage.getItem('moat-nudge-dismissed')
  )
  const [execPanelOpen, setExecPanelOpen] = useState(false)
  const [panelData, setPanelData]         = useState(null)

  const handleDownloadPdf = async () => {
    setPdfLoading(true)
    try {
      if (activeView === 'inspector') {
        await exportInspectionPDF()
      } else {
        await exportForecastPDF()
      }
    } finally {
      setPdfLoading(false)
    }
  }

  const handleSave = async () => {
    await saveSnapshot(snapLabel.trim() || null)
    setSnapLabel('')
    setPromptOpen(false)
  }

  const dismissNudge = () => {
    sessionStorage.setItem('moat-nudge-dismissed', '1')
    setNudgeDismissed(true)
  }

  const openExecPanel = () => {
    const fs  = useForecastStore.getState()
    const d   = fs.derived || {}
    const aq  = useQuarterStore.getState().activeQuarter
    const wow = useWowStore.getState()
    const cov = useCoverageStore.getState()
    const vocab      = getVocab()
    const fcOverrides = fs.fcOverrides || {}
    const effective   = getEffectiveFc(d, fcOverrides)

    const coverage = calcCoverageModel(
      cov.channels, fs.quota || 0, effective.fc_call || 0, d.weeks_remaining ?? 0
    )
    const ae  = coverage.channels['ae']  || null
    const sdr = coverage.channels['sdr'] || null

    const gap              = Math.max(0, (fs.quota || 0) - (effective.fc_call || 0))
    const total_saa_needed = (ae?.saas_needed || 0) + (sdr?.saas_needed || 0)

    const qSnaps = wow.snapshots
      .filter(s => (s.quarterKey ?? 'cq') === aq)
      .slice().sort((a, b) => new Date(a.date) - new Date(b.date))
    const priorSnap = qSnaps.length >= 2 ? qSnaps[qSnaps.length - 2] : null
    const wowDelta  = priorSnap !== null ? (d.fc_call || 0) - (priorSnap.fc_call || 0) : null

    const repRows = []
    if (fs.importedData?.length) {
      const grouped = {}
      fs.importedData.forEach(deal => {
        const owner = deal.f_owner || 'Unknown'
        if (!grouped[owner]) {
          grouped[owner] = { owner, closed: 0, wc: 0, call: 0, bc: 0, pipe: 0, critical: 0 }
        }
        const amt = deal.f_amount_num || 0
        const cat = deal.f_fc_cat_norm
        if      (cat === 'closed')     grouped[owner].closed += amt
        else if (cat === 'worst_case') grouped[owner].wc     += amt
        else if (cat === 'call')       grouped[owner].call   += amt
        else if (cat === 'best_case')  grouped[owner].bc     += amt
        else if (cat === 'pipeline')   grouped[owner].pipe   += amt
        grouped[owner].critical += (deal._flags || []).filter(f => f.sev === 'critical').length
      })
      Object.values(grouped)
        .sort((a, b) => (b.closed + b.wc + b.call) - (a.closed + a.wc + a.call))
        .forEach(r => repRows.push(r))
    }

    setPanelData({
      managerName:   fs.managerName   || '',
      managerTeam:   fs.managerTeam   || '',
      quarterLabel:  fs.quarterLabel  || '',
      quota:         fs.quota         || 0,
      closed:        fs.closed        || 0,
      fc_worst_case: effective.fc_worst_case,
      fc_call:       effective.fc_call,
      fc_best_case:  effective.fc_best_case,
      fc_worst_case_model: d.fc_worst_case || 0,
      fc_call_model:       d.fc_call       || 0,
      fc_best_case_model:  d.fc_best_case  || 0,
      overrideActive: effective.overrideActive,
      bk_wc:  d.bk_wc  || 0,
      bk_call: d.bk_call || 0,
      bk_bc:  d.bk_bc   || 0,
      cnc_prorated:    d.cnc_prorated   || 0,
      cnc_opps:        fs.cnc_opps      || 0,
      cnc_asp:         fs.cnc_asp       || 0,
      r_cnc:           fs.r_cnc         || 0,
      cnc_pipe:        d.cnc_pipe       || 0,
      prorationFactor: d.prorationFactor ?? 1,
      weeks_remaining: d.weeks_remaining ?? 0,
      weeks_total:     d.weeks_total     || 0,
      weeksRemaining:  d.weeks_remaining ?? 0,
      gap,
      total_saa_needed,
      ae_allocation:  cov.channels['ae']  ? cov.channels['ae'].allocation  : 50,
      ae_saa_needed:  ae  ? ae.saas_needed  : 0,
      sdr_allocation: cov.channels['sdr'] ? cov.channels['sdr'].allocation : 50,
      sdr_saa_needed: sdr ? sdr.saas_needed : 0,
      vocabWorstCase: vocab.worst_case,
      vocabCall:      vocab.call,
      vocabBestCase:  vocab.best_case,
      overridesActive: Object.values(fcOverrides).some(v => v !== null),
      priorSnap,
      wowDelta,
      importMeta: fs.importMeta,
      repRows,
      channels:  cov.channels,
      coverage,
      ae,
      sdr,
      vocab,
    })
    setExecPanelOpen(true)
  }

  const handleCroExport = async (summaryText) => {
    setExecPanelOpen(false)
    setCroPdfLoading(true)
    try {
      await exportCROPDFWithSummary(panelData, summaryText)
    } finally {
      setCroPdfLoading(false)
    }
  }

  return (
    <>
    <header className="flex items-center h-11 px-4 border-b border-[var(--bdr2)] bg-[var(--bg)] flex-shrink-0 gap-3">
      <span className="text-[12px] font-[700] tracking-widest text-[var(--coral)] uppercase">
        MOAT
      </span>
      <span className="text-[var(--tx2)] text-[11px]">·</span>
      <span className="text-[13px] font-[600] text-[var(--tx)]">
        {VIEW_LABELS[activeView] || activeView}
      </span>

      {/* Import status */}
      <div className="flex items-center gap-1.5 ml-1">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            importMeta ? 'bg-[var(--green)]' : 'bg-[var(--bg3)]'
          }`}
        />
        <span className="text-[11px] text-[var(--tx2)]">
          {importMeta
            ? `${importMeta.count} deals · ${importMeta.filename}`
            : 'No data'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {(activeView === 'manager' || activeView === 'inspector') && (
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="btn text-[11px] flex items-center gap-1"
          >
            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {pdfLoading ? 'Generating…' : activeView === 'inspector' ? 'Export PDF' : 'Download PDF'}
          </button>
        )}

        {/* CRO Read-In PDF — always visible, disabled when quota or label not set */}
        {(() => {
          const disabled = croPdfLoading || !quota || !quarterLabel
          const tooltip  = !quota ? 'Set quota in Manager Walk-Up'
            : !quarterLabel ? 'Set quarter label in Manager Walk-Up'
            : undefined
          return (
            <button
              onClick={openExecPanel}
              disabled={disabled}
              title={tooltip}
              className="btn text-[11px] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              {croPdfLoading ? 'Generating…' : 'CRO PDF'}
            </button>
          )
        })()}

        {anyFcOverride && (
          <button
            onClick={clearAllFcOverrides}
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 text-amber-700 cursor-pointer hover:bg-amber-100 transition-colors"
          >
            ⚠ Submission overrides active
          </button>
        )}

        <button
          onClick={() => setDark(!dark)}
          className="btn text-[11px]"
        >
          {dark ? 'Light mode' : 'Dark mode'}
        </button>

        {/* Sign-in nudge — unauthenticated only, dismissible for the session */}
        {!user && !nudgeDismissed && (
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[var(--blue)]">
            Sign in to save sessions across devices
            <button
              onClick={dismissNudge}
              className="ml-0.5 opacity-60 hover:opacity-100 leading-none border-none bg-transparent cursor-pointer p-0 text-[12px] text-[var(--blue)]"
              title="Dismiss"
            >✕</button>
          </span>
        )}

        {/* Supabase auth — only shown when credentials are configured */}
        <AuthButton />

        {/* Save snapshot + history — only when signed in */}
        {user && (
          <>
            <div className="relative">
              <button
                onClick={() => setPromptOpen(o => !o)}
                disabled={saving}
                className="btn text-[11px] flex items-center gap-1"
              >
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
                {saving ? 'Saving…' : 'Save snapshot'}
              </button>

              {promptOpen && (
                <div className="absolute right-0 top-9 z-50 w-64 rounded-lg border border-[var(--bdr2)] bg-[var(--bg)] shadow-xl p-3 flex flex-col gap-2">
                  <span className="text-[11px] text-[var(--tx2)]">Optional label for this snapshot:</span>
                  <input
                    autoFocus
                    value={snapLabel}
                    onChange={e => setSnapLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder="e.g. End of week 3"
                    className="w-full text-[12px] px-2 py-1.5 rounded border border-[var(--bdr2)] bg-[var(--bg2)] text-[var(--tx)] placeholder:text-[var(--tx2)] focus:outline-none focus:border-[var(--blue)]"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setPromptOpen(false)} className="btn text-[11px]">Cancel</button>
                    <button
                      onClick={handleSave}
                      className="text-[11px] px-3 py-1 rounded bg-[var(--blue)] text-white hover:opacity-80"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            <SessionHistory />
          </>
        )}
      </div>
    </header>

    {execPanelOpen && panelData && (
      <ExecSummaryPanel
        data={panelData}
        onExport={handleCroExport}
        onClose={() => setExecPanelOpen(false)}
      />
    )}
  </>
  )
}
