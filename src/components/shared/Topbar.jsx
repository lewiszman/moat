import React, { useState } from 'react'
import { useForecastStore } from '../../store/forecastStore'
import { useSessionStore } from '../../store/sessionStore'
import { useDarkMode } from '../../hooks/useDarkMode'
import AuthButton from './AuthButton'
import SessionHistory from './SessionHistory'
import { exportForecastPDF, exportInspectionPDF } from '../../lib/exportPdf.jsx'

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

  const [promptOpen, setPromptOpen]   = useState(false)
  const [snapLabel, setSnapLabel]     = useState('')
  const [pdfLoading, setPdfLoading]   = useState(false)

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

  return (
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

        <button
          onClick={() => setDark(!dark)}
          className="btn text-[11px]"
        >
          {dark ? 'Light mode' : 'Dark mode'}
        </button>

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
  )
}
