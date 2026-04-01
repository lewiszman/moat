import React, { useState, useRef, useCallback, useMemo } from 'react'
import Papa from 'papaparse'
import { useForecastStore } from '../../store/forecastStore'
import { getVocab, useCatMapStore } from '../../lib/vocab'
import { normalizeRecords } from '../../lib/import'

const FIELD_DEFS = [
  { key: 'f_opp_name',    label: 'Opportunity Name', req: true  },
  { key: 'f_owner',       label: 'Owner',            req: true  },
  { key: 'f_amount',      label: 'Amount',           req: true  },
  { key: 'f_close_date',  label: 'Close Date',       req: true  },
  { key: 'f_stage',       label: 'Stage',            req: true  },
  { key: 'f_fc_cat',      label: 'Forecast Category',req: true  },
  { key: 'f_next_step',   label: 'Next Step',        req: false },
  { key: 'f_last_activity',label: 'Last Activity',   req: false },
  { key: 'f_metrics',     label: 'Metrics (M)',       req: false },
  { key: 'f_econ_buyer',  label: 'Economic Buyer (E)',req: false },
  { key: 'f_dec_criteria',label: 'Decision Criteria', req: false },
  { key: 'f_dec_process', label: 'Decision Process',  req: false },
  { key: 'f_proc_process',label: 'Procurement Process',req: false},
  { key: 'f_implicated',  label: 'Implicated Pain',   req: false },
  { key: 'f_champion',    label: 'Champion (C)',       req: false },
]

// Auto-detect column → field mapping from header names
function autoDetectMap(headers) {
  const map = {}
  headers.forEach(h => {
    const hl = h.toLowerCase().trim()
    if (/opportunity.?name|opp.?name/i.test(hl))  map[h] = 'f_opp_name'
    else if (/^owner$|account.?owner|opp.?owner|opportunity.?owner/i.test(hl)) map[h] = 'f_owner'
    else if (/^amount$|arr|acv|average.?annual.?booking(?!.*currency)/i.test(hl)) map[h] = 'f_amount'
    else if (/close.?date/i.test(hl))              map[h] = 'f_close_date'
    else if (/^stage$/i.test(hl))                  map[h] = 'f_stage'
    else if (/forecast.?cat/i.test(hl))            map[h] = 'f_fc_cat'
    else if (/next.?step/i.test(hl))               map[h] = 'f_next_step'
    else if (/last.?activity/i.test(hl))           map[h] = 'f_last_activity'
    else if (/^metrics$/i.test(hl))                map[h] = 'f_metrics'
    else if (/economic.?buyer/i.test(hl))          map[h] = 'f_econ_buyer'
    else if (/decision.?crit/i.test(hl))           map[h] = 'f_dec_criteria'
    else if (/decision.?proc/i.test(hl))           map[h] = 'f_dec_process'
    else if (/procur/i.test(hl))                   map[h] = 'f_proc_process'
    else if (/pain|implicated/i.test(hl))          map[h] = 'f_implicated'
    else if (/^champion$/i.test(hl))               map[h] = 'f_champion'
  })
  return map
}

export default function ImportWizard({ onClose }) {
  const setImportData = useForecastStore(s => s.setImportData)
  const clearImport   = useForecastStore(s => s.clearImport)
  const importMeta    = useForecastStore(s => s.importMeta)
  const catMap        = useCatMapStore(s => s.catMap)
  const setCatMap     = useCatMapStore(s => s.setCatMap)

  const [step,            setStep]            = useState(0) // 0=drop, 1=map, 2=preview
  const [parsed,          setParsed]          = useState(null)
  const [colMap,          setColMap]          = useState({})
  const [isDragging,      setIsDragging]      = useState(false)
  const [importOverrides, setImportOverrides] = useState({}) // { rawVal: internalKey }
  const [saveOverrides,   setSaveOverrides]   = useState({}) // { rawVal: true }
  const fileRef = useRef(null)

  // Compute normalized records + unmapped detection for step 2
  const step2Data = useMemo(() => {
    if (step !== 2 || !parsed) return null
    const headerToField = Object.fromEntries(Object.entries(colMap).filter(([, f]) => f))
    const all = normalizeRecords(parsed.rows, headerToField, catMap)
    const unmappedMap = new Map()
    all.forEach(r => {
      if (r._unmapped) unmappedMap.set(r._rawFcCat, (unmappedMap.get(r._rawFcCat) || 0) + 1)
    })
    return {
      all,
      preview:  all.slice(0, 8),
      unmapped: [...unmappedMap.entries()], // [[rawVal, count], ...]
    }
  }, [step, parsed, colMap, catMap])

  const processFile = useCallback((file) => {
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers  = results.meta.fields || []
        const rows     = results.data
        const detected = autoDetectMap(headers)
        setParsed({ filename: file.name, headers, rows })
        setColMap(detected)
        setImportOverrides({})
        setSaveOverrides({})
        setStep(1)
      },
    })
  }, [])

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false)
    processFile(e.dataTransfer.files[0])
  }

  // Build catMap augmented with per-import overrides (not persisted unless saveOverrides checked)
  const buildAugmentedCatMap = (overrides) => {
    const aug = {}
    Object.entries(catMap).forEach(([k, vs]) => { aug[k] = [...vs] })
    Object.entries(overrides).forEach(([rawVal, internalKey]) => {
      if (!aug[internalKey]) aug[internalKey] = []
      const lower = rawVal.toLowerCase()
      if (!aug[internalKey].some(v => v.toLowerCase() === lower)) aug[internalKey].push(rawVal)
    })
    return aug
  }

  const handleImport = (useOverrides = false) => {
    if (!parsed) return
    const headerToField  = Object.fromEntries(Object.entries(colMap).filter(([, f]) => f))
    const effectiveCatMap = useOverrides ? buildAugmentedCatMap(importOverrides) : catMap
    const records        = normalizeRecords(parsed.rows, headerToField, effectiveCatMap)

    // Persist any checked "Save this mapping" overrides to catMapStore
    if (useOverrides) {
      Object.entries(importOverrides).forEach(([rawVal, internalKey]) => {
        if (!saveOverrides[rawVal]) return
        const current = catMap[internalKey] || []
        const lower   = rawVal.toLowerCase()
        if (!current.some(v => v.toLowerCase() === lower)) {
          setCatMap(internalKey, [...current, rawVal])
        }
      })
    }

    setImportData(records, { filename: parsed.filename, count: records.length, date: new Date().toISOString() })
    onClose?.()
  }

  // ── Step 0: Drop zone ──
  if (step === 0) return (
    <div className="p-6">
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-[var(--blue)] bg-blue-50' : 'border-[var(--bdr2)] hover:border-[var(--blue)] hover:bg-[var(--bg2)]'}
        `}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => processFile(e.target.files[0])} />
        <div className="text-3xl mb-3">📂</div>
        <div className="text-[14px] font-[600] text-[var(--tx)] mb-1">Drop CSV or click to browse</div>
        <div className="text-[12px] text-[var(--tx2)]">Salesforce pipeline report (.csv)</div>
      </div>
      {importMeta && (
        <div className="mt-4 flex items-center justify-between text-[12px] text-[var(--tx2)] bg-[var(--bg2)] rounded-lg px-3 py-2.5">
          <span>Current import: <strong className="text-[var(--tx)]">{importMeta.filename}</strong> · {importMeta.count} deals</span>
          <button onClick={() => { clearImport(); onClose?.() }} className="btn text-[11px] text-red-600 border-red-200 hover:bg-red-50">Clear</button>
        </div>
      )}
    </div>
  )

  // ── Step 1: Column mapping ──
  if (step === 1) return (
    <div className="p-6">
      <h3 className="text-[14px] font-[700] text-[var(--tx)] mb-1">Map columns</h3>
      <p className="text-[12px] text-[var(--tx2)] mb-4">{parsed.filename} · {parsed.rows.length} rows · Fields marked * are required</p>
      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
        {FIELD_DEFS.map(field => {
          const mappedHeader = Object.entries(colMap).find(([, v]) => v === field.key)?.[0] || ''
          return (
            <div key={field.key} className="flex items-center gap-3">
              <span className="text-[12px] font-[500] text-[var(--tx)] w-44 flex-shrink-0">
                {field.label}{field.req ? ' *' : ''}
              </span>
              <select
                value={mappedHeader}
                onChange={e => {
                  const header = e.target.value
                  setColMap(prev => {
                    const next = { ...prev }
                    Object.keys(next).forEach(k => { if (next[k] === field.key) delete next[k] })
                    if (header) next[header] = field.key
                    return next
                  })
                }}
                className="flex-1 text-[12px] border border-[var(--bdr2)] rounded-[var(--rm)] px-2 py-1.5 bg-[var(--bg)] text-[var(--tx)] outline-none focus:border-[var(--blue)]"
              >
                <option value="">— skip —</option>
                {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--bdr2)]">
        <button onClick={() => setStep(0)} className="btn">Back</button>
        <button onClick={() => setStep(2)} className="btn btn-primary ml-auto">Preview →</button>
      </div>
    </div>
  )

  // ── Step 2: Preview ──
  if (step === 2) {
    const vocab      = getVocab()
    const { preview, unmapped } = step2Data || { preview: [], unmapped: [] }
    const hasUnmapped = unmapped.length > 0

    const CAT_OPTIONS = [
      { value: 'worst_case', label: vocab.worst_case || 'Worst Case' },
      { value: 'call',       label: vocab.call       || 'Call'       },
      { value: 'best_case',  label: vocab.best_case  || 'Best Case'  },
      { value: 'pipeline',   label: vocab.pipeline   || 'Pipeline'   },
      { value: 'closed',     label: 'Closed Won' },
      { value: 'omitted',    label: 'Omitted'    },
    ]

    return (
      <div className="p-6">
        <h3 className="text-[14px] font-[700] text-[var(--tx)] mb-1">Preview</h3>
        <p className="text-[12px] text-[var(--tx2)] mb-3">Showing first 8 rows of {parsed.rows.length}</p>

        <div className="overflow-x-auto rounded-lg border border-[var(--bdr2)] mb-4">
          <table className="text-[11px] w-full border-collapse">
            <thead className="bg-[var(--bg2)]">
              <tr>
                {['Name', 'Owner', 'Amount', 'Close', 'Stage', 'FC Cat'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-[700] uppercase tracking-wider text-[var(--tx2)] border-b border-[var(--bdr2)] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-b border-[var(--bdr2)] last:border-0 hover:bg-[var(--bg2)]">
                  <td className="px-2 py-2 max-w-[140px] truncate font-[500]">{row.f_opp_name || '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.f_owner || '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap font-[600]">${Math.round(row.f_amount_num || 0).toLocaleString()}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{row.f_close_date || '—'}</td>
                  <td className="px-2 py-2 max-w-[100px] truncate">{row.f_stage || '—'}</td>
                  <td className="px-2 py-2">
                    <span className={`text-[9px] font-[700] uppercase px-1.5 py-0.5 rounded-full border ${row._unmapped ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-[var(--bg2)] border-[var(--bdr2)]'}`}>
                      {vocab[row.f_fc_cat_norm] ?? row.f_fc_cat_norm ?? '—'}
                      {row._unmapped && ' ⚠'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Unmapped category warning */}
        {hasUnmapped && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
            <div className="px-4 py-2.5 flex items-center gap-2 border-b border-amber-200 bg-amber-100">
              <span className="text-[12px] font-[700] text-amber-800">
                ⚠️ {unmapped.length} unrecognized forecast category value{unmapped.length !== 1 ? 's' : ''} detected
              </span>
              <span className="text-[11px] text-amber-700 ml-auto">These will default to Pipeline unless mapped below</span>
            </div>
            <div className="overflow-x-auto">
              <table className="text-[11px] w-full border-collapse">
                <thead>
                  <tr className="border-b border-amber-200">
                    <th className="px-3 py-2 text-left font-[700] uppercase tracking-wider text-amber-700 text-[10px]">Raw value</th>
                    <th className="px-3 py-2 text-left font-[700] uppercase tracking-wider text-amber-700 text-[10px]">Deals</th>
                    <th className="px-3 py-2 text-left font-[700] uppercase tracking-wider text-amber-700 text-[10px]">Map to</th>
                    <th className="px-3 py-2 text-left font-[700] uppercase tracking-wider text-amber-700 text-[10px]">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {unmapped.map(([rawVal, count]) => (
                    <tr key={rawVal} className="border-b border-amber-100 last:border-0">
                      <td className="px-3 py-2 font-[600] text-amber-900">{rawVal || '(blank)'}</td>
                      <td className="px-3 py-2 text-amber-700">{count}</td>
                      <td className="px-3 py-2">
                        <select
                          value={importOverrides[rawVal] ?? 'pipeline'}
                          onChange={e => setImportOverrides(prev => ({ ...prev, [rawVal]: e.target.value }))}
                          className="text-[11px] border border-amber-300 rounded px-1.5 py-1 bg-white text-amber-900 outline-none focus:border-amber-500"
                        >
                          {CAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!saveOverrides[rawVal]}
                            onChange={e => setSaveOverrides(prev => ({ ...prev, [rawVal]: e.target.checked }))}
                            className="accent-amber-600"
                          />
                          <span className="text-amber-700">Save mapping</span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-[var(--bdr2)]">
          <button onClick={() => setStep(1)} className="btn">Back</button>
          {hasUnmapped ? (
            <>
              <button onClick={() => handleImport(false)} className="btn ml-auto">
                Import anyway
              </button>
              <button onClick={() => handleImport(true)} className="btn btn-primary">
                Fix and import
              </button>
            </>
          ) : (
            <button onClick={() => handleImport(false)} className="btn btn-primary ml-auto">
              Import {parsed.rows.length} deals
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}
