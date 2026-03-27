import React, { useState } from 'react'
import { useForecastStore } from '../../store/forecastStore'
import ForecastCards from './ForecastCards'
import QuarterlyInputs from './QuarterlyInputs'
import CncWhatIf from './CncWhatIf'
import SectionComment from '../shared/SectionComment'
import ImportWizard from '../shared/ImportWizard'

function ImportModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--bg)] rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--bdr2)]">
          <span className="text-[14px] font-[700] text-[var(--tx)]">Import pipeline data</span>
          <button onClick={onClose} className="text-[var(--tx2)] hover:text-[var(--tx)] text-xl leading-none border-none bg-transparent cursor-pointer">×</button>
        </div>
        <ImportWizard onClose={onClose} />
      </div>
    </div>
  )
}

export default function ManagerView() {
  const s = useForecastStore()
  const [importOpen, setImportOpen] = useState(false)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">

      {/* Hero header */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px] font-[700] uppercase tracking-widest text-[var(--tx2)]">Forecast</span>
        <span className="text-[var(--tx2)]">·</span>
        <input
          className="text-[13px] font-[600] bg-transparent border-b border-transparent hover:border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5 w-32"
          placeholder="Your name"
          value={s.managerName}
          onChange={e => s.setField('managerName', e.target.value)}
        />
        <span className="text-[var(--tx2)]">·</span>
        <input
          className="text-[13px] font-[600] bg-transparent border-b border-transparent hover:border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5 w-36"
          placeholder="Team / region"
          value={s.managerTeam}
          onChange={e => s.setField('managerTeam', e.target.value)}
        />
        <span className="text-[var(--tx2)]">·</span>
        <input
          className="text-[13px] font-[600] bg-transparent border-b border-transparent hover:border-[var(--bdr2)] focus:border-[var(--blue)] outline-none py-0.5 w-20"
          placeholder="Q1 FY26"
          value={s.quarterLabel}
          onChange={e => s.setField('quarterLabel', e.target.value)}
        />
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setImportOpen(true)} className="btn text-[11px] flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 1v7M3 5l3 3 3-3M1 10h10"/></svg>
            {s.importMeta ? 'Re-import' : 'Import CSV'}
          </button>
          <div className="flex rounded-lg overflow-hidden border border-[var(--bdr2)]">
            {['current', 'next'].map(mode => (
              <button key={mode} onClick={() => s.setQMode(mode)}
                className={`px-3 py-1 text-[11px] font-[700] cursor-pointer border-none transition-colors ${s.qMode === mode ? 'bg-[var(--blue)] text-white' : 'bg-[var(--bg)] text-[var(--tx2)] hover:bg-[var(--bg2)]'}`}>
                {mode === 'current' ? 'CQ' : 'Q+1'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ForecastCards />

      <div className="sec-hd mt-6">Quarterly inputs<SectionComment sectionKey="qi" placeholder="e.g. Q3 FY26 — team at 70% of quota pace, 2 AEs ramping" /></div>
      <QuarterlyInputs />

      <div className="sec-hd">Conversion rate assumptions<SectionComment sectionKey="cr" placeholder="e.g. Commit rate lowered to 75% — two deals slipped last quarter" /></div>
      <div className="card p-4">
        {[
          { label: 'Commit',         key: 'r_commit', color: '#1a56db', min: 50, max: 100 },
          { label: 'Probable',       key: 'r_prob',   color: '#0d7c3d', min: 30, max: 95  },
          { label: 'Upside',         key: 'r_up',     color: '#b45309', min: 10, max: 80  },
          { label: 'Pipeline',       key: 'r_pipe',   color: '#6b7280', min: 5,  max: 50  },
          { label: 'Create & close', key: 'r_cnc',    color: '#6b7280', min: 5,  max: 50  },
        ].map(row => (
          <div key={row.key} className="flex items-center gap-4 py-2 border-b border-[var(--bdr2)] last:border-0">
            <span className="text-[13px] text-[var(--tx)] w-32 flex-shrink-0">{row.label}</span>
            <input type="range" min={row.min} max={row.max} step={1} value={s[row.key] || 0}
              onChange={e => s.updateInput(row.key, +e.target.value)} className="flex-1 accent-[var(--blue)]" />
            <span className="text-[13px] font-[700] w-10 text-right" style={{ color: row.color }}>{s[row.key]}%</span>
          </div>
        ))}
      </div>

      <div className="sec-hd">Create &amp; close what-if<SectionComment sectionKey="cnc" placeholder="e.g. ASP reflects SMB segment only — mid-market deals excluded" /></div>
      <CncWhatIf />

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  )
}
