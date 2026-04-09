import React from 'react'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import { useForecastStore, useWowStore, useQuarterStore } from '../../store/forecastStore'
import { useCoverageStore } from '../../store/coverageStore'
import { calcCoverageModel } from '../../lib/coverage'
import { getEffectiveFc } from '../../lib/forecast'
import { getVocab } from '../../lib/vocab'
import { fmt, attPct } from '../../lib/fmt'

// ── Brand colors ───────────────────────────────────────────────
const C = {
  navy:   '#0f2d6b',
  blue:   '#1a56db',
  coral:  '#f05252',
  green:  '#057a55',
  amber:  '#b45309',
  gray:   '#6b7280',
  light:  '#f3f4f6',
  white:  '#ffffff',
  ink:    '#111827',
  lBlue:  '#e8f0fe',
  lBlue2: '#93c5fd',
  border: '#e5e7eb',
}

// ── Coverage stage config — standard 5 rows ───────────────────
// Activities per AE / per SDR are rendered as explicit rows after these.
const COV_STAGES = [
  { label: 'Pipeline needed',   key: 'pipeline_needed',   wk: 'pipeline_per_week',   color: C.blue,    isPipe: true },
  { label: 'SAAs needed',       key: 'saas_needed',       wk: 'saas_per_week',       color: C.blue },
  { label: 'Opps needed',       key: 'opps_needed',       wk: 'opps_per_week',       color: '#0d7c3d' },
  { label: 'Meetings needed',   key: 'meetings_needed',   wk: 'meetings_per_week',   color: C.amber },
  { label: 'Activities needed', key: 'activities_needed', wk: 'activities_per_week', color: C.coral },
]

// ── Styles ─────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: C.ink,
    backgroundColor: C.white,
    paddingLeft: 28,
    paddingRight: 28,
    paddingBottom: 34,
  },

  // Header
  hdr: {
    backgroundColor: C.navy,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 14,
    paddingRight: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: -28,
    marginRight: -28,
    marginBottom: 6,
  },
  hdrEyebrow: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 2, marginBottom: 2 },
  hdrName:    { fontSize: 9,  fontFamily: 'Helvetica-Bold', color: C.white },
  hdrRight:   { alignItems: 'flex-end' },
  hdrMeta:    { fontSize: 7,  color: 'rgba(255,255,255,0.8)', marginBottom: 2 },
  hdrQuota:   { fontSize: 9,  fontFamily: 'Helvetica-Bold', color: C.white },

  // Band labels
  bandLbl: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: C.gray,
    letterSpacing: 1,
    marginBottom: 3,
    marginTop: 4,
  },

  // Forecast tiers
  tiersRow:   { flexDirection: 'row', marginBottom: 3 },
  tierCol:    { flex: 1, paddingRight: 8 },
  tierDvdr:   { width: 0.5, backgroundColor: C.light, marginRight: 8 },
  tierLbl:    { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 2 },
  tierAmt:    { fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  tierAtt:    { fontSize: 8 },
  tierGap:    { fontSize: 7, marginTop: 1 },
  tierChain:  { fontSize: 6, color: C.gray, marginTop: 2, lineHeight: 1.4 },

  // WoW badge
  wowRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 1 },
  wowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    border: '1 solid #e5e7eb',
    backgroundColor: C.light,
    borderRadius: 3,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 5,
    paddingRight: 5,
    marginLeft: 8,
  },
  wowDelta: { fontSize: 7, fontFamily: 'Helvetica-Bold' },
  wowWeek:  { fontSize: 6, color: C.gray, marginLeft: 3 },

  // Quota bar
  qbarWrap:    { marginBottom: 3 },
  qbarTrack:   { height: 6, backgroundColor: C.light, borderRadius: 2, flexDirection: 'row', marginBottom: 2 },
  qbarPctRow:  { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 1 },
  qbarPct:     { fontSize: 7, fontFamily: 'Helvetica-Bold' },
  qbarLegend:  { flexDirection: 'row', flexWrap: 'wrap' },
  qbarLegItem: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  qbarLegDot:  { width: 5, height: 5, borderRadius: 1, marginRight: 2 },
  qbarLegTxt:  { fontSize: 6, color: C.gray },

  // Tables
  table:   { width: '100%', marginBottom: 2 },
  thead:   { flexDirection: 'row', backgroundColor: C.light, paddingVertical: 2, paddingHorizontal: 4 },
  th:      { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.gray, letterSpacing: 0.5 },
  trow:    { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 4, borderBottom: '0.5 solid #f3f4f6' },
  trowAlt: { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 4, borderBottom: '0.5 solid #f3f4f6', backgroundColor: C.light },
  trowTot: { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 4, backgroundColor: C.lBlue, borderTop: '1 solid #1a56db' },
  td:      { fontSize: 8, color: '#374151' },
  tdBold:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink },
  tdR:     { fontSize: 8, color: '#374151', textAlign: 'right' },
  tdRB:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink, textAlign: 'right' },

  // Coverage allocation cells
  allocRow:  { flexDirection: 'row', marginBottom: 3 },
  allocCell: { flex: 1, backgroundColor: C.light, borderRadius: 2, paddingTop: 4, paddingBottom: 4, paddingLeft: 6, paddingRight: 6, marginRight: 4 },
  allocName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 1 },
  allocPct:  { fontSize: 7, color: C.gray, marginBottom: 1 },
  allocGap:  { fontSize: 10, fontFamily: 'Helvetica-Bold' },

  footnote: { fontSize: 6, color: C.gray, fontFamily: 'Helvetica-Oblique', marginTop: 2 },

  // ── IQP Band ──────────────────────────────────────────────────
  iqpSubLbl: { fontSize: 6, color: C.gray, fontFamily: 'Helvetica-Oblique', marginBottom: 4, lineHeight: 1.4 },
  iqpEmpty:  { fontSize: 7, color: C.gray, fontFamily: 'Helvetica-Oblique', textAlign: 'center', paddingVertical: 8 },
  iqpBody:   { flexDirection: 'row', marginBottom: 3 },
  iqpLeft:   { flex: 55, paddingRight: 8 },
  iqpDvdr:   { width: 0.5, backgroundColor: C.light, marginRight: 8 },
  iqpRight:  { flex: 45 },

  // IQP chain rows
  chainWrap:  { borderLeft: `1 solid ${C.lBlue2}`, paddingLeft: 8 },
  chainRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  chainDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.blue, marginRight: 5, marginTop: 2, flexShrink: 0 },
  chainContent: { flex: 1 },
  chainLbl:   { fontSize: 6, color: C.gray, letterSpacing: 0.3, marginBottom: 1 },
  chainVal:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy },
  chainValHero: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.blue },
  chainSub:   { fontSize: 6, color: C.gray, marginTop: 1 },
  chainSubGreen: { fontSize: 6, color: C.green, marginTop: 1 },

  // IQP stat cards
  statCard:  { backgroundColor: C.light, borderRadius: 2, paddingVertical: 4, paddingLeft: 6, paddingRight: 4, marginBottom: 3 },
  statLbl:   { fontSize: 6, color: C.gray, letterSpacing: 0.5, marginBottom: 2 },
  statVal:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 1 },
  statSub:   { fontSize: 6, color: C.gray },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 28,
    right: 28,
    borderTop: '0.5 solid #e5e7eb',
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerTxt: { fontSize: 6, color: '#9ca3af' },
})

// ── Helpers ────────────────────────────────────────────────────
function fmtM(n) { return fmt(n || 0) }
function fmtN(n) { return Math.round(n || 0).toLocaleString('en-US') }
function attColor(fc, quota) {
  if (!quota) return C.gray
  const p = fc / quota
  if (p >= 1)   return C.green
  if (p >= 0.9) return C.amber
  return C.coral
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── IQP Chain Row ──────────────────────────────────────────────
function ChainRow({ label, value, sub, subColor, valueStyle }) {
  return (
    <View style={S.chainRow}>
      <View style={S.chainDot} />
      <View style={S.chainContent}>
        <Text style={S.chainLbl}>{label.toUpperCase()}</Text>
        <Text style={valueStyle || S.chainVal}>{value}</Text>
        {sub ? <Text style={subColor === 'green' ? S.chainSubGreen : S.chainSub}>{sub}</Text> : null}
      </View>
    </View>
  )
}

// ── IQP Stat Card ──────────────────────────────────────────────
function StatCard({ label, value, sub, borderColor }) {
  return (
    <View style={[S.statCard, { borderLeft: `3 solid ${borderColor}` }]}>
      <Text style={S.statLbl}>{label.toUpperCase()}</Text>
      <Text style={S.statVal}>{value}</Text>
      <Text style={S.statSub}>{sub}</Text>
    </View>
  )
}

// ── Document component ─────────────────────────────────────────
function CROReadInDocument({ data }) {
  const {
    managerName, managerTeam, quarterLabel, quota,
    closed, fc_worst_case, fc_call, fc_best_case,
    fc_worst_case_model, fc_call_model, fc_best_case_model,
    overrideActive,
    bk_wc, bk_call, bk_bc, cnc_prorated,
    cnc_opps, cnc_asp, r_cnc, cnc_pipe,
    prorationFactor, weeks_remaining, weeks_total,
    priorSnap, wowDelta,
    importMeta, repRows,
    channels, coverage,
    ae, sdr,
    todayStr, timestamp,
    vocab,
  } = data

  const v = vocab || {}

  const gap     = Math.max(0, quota - fc_call)
  const onTrack = fc_call >= quota

  // Quota bar segment widths (%)
  const qTotal = quota > 0 ? quota : 1
  const wClosed = Math.min((closed        / qTotal) * 100, 100)
  const wWC     = Math.min((bk_wc         / qTotal) * 100, Math.max(0, 100 - wClosed))
  const wCnc    = Math.min((cnc_prorated  / qTotal) * 100, Math.max(0, 100 - wClosed - wWC))
  const wCall   = Math.min((bk_call       / qTotal) * 100, Math.max(0, 100 - wClosed - wWC - wCnc))
  const wBC     = Math.min((bk_bc         / qTotal) * 100, Math.max(0, 100 - wClosed - wWC - wCnc - wCall))

  const callPct  = attPct(fc_call, quota)
  const pctColor = attColor(fc_call, quota)

  // Pipeline rep totals
  const repTotals = repRows.reduce((acc, r) => ({
    closed: acc.closed + r.closed,
    wc:     acc.wc     + r.wc,
    call:   acc.call   + r.call,
    bc:     acc.bc     + r.bc,
    pipe:   acc.pipe   + r.pipe,
    critical: acc.critical + r.critical,
  }), { closed: 0, wc: 0, call: 0, bc: 0, pipe: 0, critical: 0 })

  // Override footnote
  const overrideFootnoteLines = [
    overrideActive?.worst_case && `${v.worst_case || 'Worst Case'}: ${fmtM(fc_worst_case_model)} model`,
    overrideActive?.call       && `${v.call       || 'Call'}: ${fmtM(fc_call_model)} model`,
    overrideActive?.best_case  && `${v.best_case  || 'Best Case'}: ${fmtM(fc_best_case_model)} model`,
  ].filter(Boolean)
  const anyOverride = overrideFootnoteLines.length > 0

  // IQP derived
  const noInputs    = !cnc_opps || !cnc_asp
  const noWeeks     = weeks_remaining === 0
  const fullQuarter = prorationFactor >= 1
  const prorPct     = Math.round((prorationFactor || 0) * 100)
  const iqpPctOfWc  = fc_worst_case > 0 ? Math.round((cnc_prorated / fc_worst_case) * 100) : null

  return (
    <Document>
      <Page size="LETTER" style={S.page}>

        {/* ── PAGE HEADER ───────────────────────────────── */}
        <View style={S.hdr}>
          <View>
            <Text style={S.hdrEyebrow}>FORECAST READ-IN</Text>
            <Text style={S.hdrName}>
              {managerName || 'Manager'}{managerTeam ? ` · ${managerTeam}` : ''}
            </Text>
          </View>
          <View style={S.hdrRight}>
            <Text style={S.hdrMeta}>{quarterLabel}  ·  {todayStr}</Text>
            <Text style={S.hdrQuota}>Quota: {fmtM(quota)}</Text>
          </View>
        </View>

        {/* ── BAND 1: FORECAST WALK-UP ──────────────────── */}
        <View style={S.tiersRow}>

          {/* Worst Case */}
          <View style={S.tierCol}>
            <Text style={[S.tierLbl, { color: C.blue }]}>
              {(v.worst_case || 'Worst Case').toUpperCase()}{overrideActive?.worst_case ? ' †' : ''}
            </Text>
            <Text style={[S.tierAmt, { fontSize: 17, color: C.blue }]}>{fmtM(fc_worst_case)}</Text>
            <Text style={[S.tierAtt, { color: C.blue }]}>{attPct(fc_worst_case, quota)}% of quota</Text>
            <Text style={[S.tierGap, { color: fc_worst_case >= quota ? C.green : C.coral }]}>
              {fc_worst_case >= quota ? 'On track' : `${fmtM(quota - fc_worst_case)} gap`}
            </Text>
            <Text style={S.tierChain}>
              {overrideActive?.worst_case
                ? '† Submitted forecast'
                : 'Closed ' + fmtM(closed) + ' + WC pipe ' + fmtM(bk_wc) + ' + C&C ' + fmtM(cnc_prorated)
              }
            </Text>
          </View>

          <View style={S.tierDvdr} />

          {/* Call FC */}
          <View style={S.tierCol}>
            <Text style={[S.tierLbl, { color: C.blue }]}>
              {(v.call || 'Call').toUpperCase()}{overrideActive?.call ? ' †' : ''}
            </Text>
            <View style={S.wowRow}>
              <Text style={[S.tierAmt, { fontSize: 20, color: C.blue }]}>{fmtM(fc_call)}</Text>
              {wowDelta !== null && (
                <View style={S.wowBadge}>
                  <Text style={[S.wowDelta, { color: wowDelta >= 0 ? C.green : C.coral }]}>
                    {wowDelta >= 0 ? '+' : '\u2212'}{fmtM(Math.abs(wowDelta))}
                  </Text>
                  <Text style={S.wowWeek}>vs W{priorSnap?.week}</Text>
                </View>
              )}
            </View>
            <Text style={[S.tierAtt, { color: C.blue }]}>{callPct}% of quota</Text>
            <Text style={[S.tierGap, { color: onTrack ? C.green : C.coral }]}>
              {onTrack ? 'On track' : `${fmtM(gap)} gap`}
            </Text>
            <Text style={S.tierChain}>
              {overrideActive?.call
                ? '† Submitted forecast'
                : (v.worst_case || 'WC') + ' FC ' + fmtM(fc_worst_case) + ' + ' + (v.call || 'Call') + ' pipe ' + fmtM(bk_call)
              }
            </Text>
          </View>

          <View style={S.tierDvdr} />

          {/* Best Case */}
          <View style={[S.tierCol, { paddingRight: 0 }]}>
            <Text style={[S.tierLbl, { color: C.amber }]}>
              {(v.best_case || 'Best Case').toUpperCase()}{overrideActive?.best_case ? ' †' : ''}
            </Text>
            <Text style={[S.tierAmt, { fontSize: 17, color: C.amber }]}>{fmtM(fc_best_case)}</Text>
            <Text style={[S.tierAtt, { color: C.amber }]}>{attPct(fc_best_case, quota)}% of quota</Text>
            <Text style={[S.tierGap, { color: fc_best_case >= quota ? C.green : C.coral }]}>
              {fc_best_case >= quota ? 'On track' : `${fmtM(quota - fc_best_case)} gap`}
            </Text>
            <Text style={S.tierChain}>
              {overrideActive?.best_case
                ? '† Submitted forecast'
                : (v.call || 'Call') + ' FC ' + fmtM(fc_call) + ' + BC pipe ' + fmtM(bk_bc)
              }
            </Text>
          </View>
        </View>

        {/* Override footnote */}
        {anyOverride && (
          <Text style={[S.footnote, { marginBottom: 2 }]}>
            {'† Submitted forecast — adjusted from model output · ' + overrideFootnoteLines.join(' · ')}
          </Text>
        )}

        {/* Quota bar */}
        <View style={S.qbarWrap}>
          <View style={S.qbarTrack}>
            {wClosed > 0 && <View style={{ width: `${wClosed}%`, backgroundColor: C.green }} />}
            {wWC     > 0 && <View style={{ width: `${wWC}%`,     backgroundColor: '#93c5fd' }} />}
            {wCnc    > 0 && <View style={{ width: `${wCnc}%`,    backgroundColor: '#34d399' }} />}
            {wCall   > 0 && <View style={{ width: `${wCall}%`,   backgroundColor: '#6ee7b7' }} />}
            {wBC     > 0 && <View style={{ width: `${wBC}%`,     backgroundColor: '#fcd34d' }} />}
          </View>
          <View style={S.qbarPctRow}>
            <Text style={[S.qbarPct, { color: pctColor }]}>{callPct}% attainment ({v.call || 'Call'})</Text>
          </View>
          <View style={S.qbarLegend}>
            {[
              ['Closed',                  C.green],
              [v.worst_case || 'WC',      '#93c5fd'],
              ['C&C',                     '#34d399'],
              [v.call || 'Call',          '#6ee7b7'],
              [v.best_case || 'Best Case','#fcd34d'],
            ].map(([lbl, clr]) => (
              <View key={lbl} style={S.qbarLegItem}>
                <View style={[S.qbarLegDot, { backgroundColor: clr }]} />
                <Text style={S.qbarLegTxt}>{lbl}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── BAND 2: PIPELINE HEALTH ───────────────────── */}
        <Text style={S.bandLbl}>
          {'PIPELINE' + (importMeta ? `  \u00B7  ${importMeta.count} DEALS  \u00B7  ${importMeta.filename}` : '')}
        </Text>

        <View style={S.table}>
          <View style={S.thead}>
            {[
              'Rep',
              'Closed',
              `${v.worst_case || 'WC'} Pipe`,
              `${v.call || 'Call'} Pipe`,
              `${v.best_case || 'BC'} Pipe`,
              v.pipeline || 'Pipeline',
              '\u26A0 Critical',
            ].map((h, i) => (
              <Text key={h} style={[S.th, { flex: i === 0 ? 1.8 : 1, textAlign: i > 0 ? 'right' : 'left' }]}>{h}</Text>
            ))}
          </View>

          {repRows.length > 0 ? repRows.map((rep, i) => (
            <View key={rep.owner} style={i % 2 === 1 ? S.trowAlt : S.trow}>
              <Text style={[S.tdBold, { flex: 1.8, color: C.navy }]}>{rep.owner}</Text>
              <Text style={[S.tdR,    { flex: 1, color: C.green }]}>{fmtM(rep.closed)}</Text>
              <Text style={[S.tdR,    { flex: 1, color: C.blue  }]}>{fmtM(rep.wc)}</Text>
              <Text style={[S.tdR,    { flex: 1, color: '#0d7c3d' }]}>{fmtM(rep.call)}</Text>
              <Text style={[S.tdR,    { flex: 1, color: C.amber }]}>{fmtM(rep.bc)}</Text>
              <Text style={[S.tdR,    { flex: 1, color: C.gray  }]}>{fmtM(rep.pipe)}</Text>
              <Text style={[S.tdRB,   { flex: 1, color: rep.critical > 0 ? C.coral : C.gray }]}>
                {rep.critical > 0 ? `${rep.critical} \u26A0` : '\u2014'}
              </Text>
            </View>
          )) : (
            <View style={S.trow}>
              <Text style={[S.td, { flex: 7, color: C.gray, fontFamily: 'Helvetica-Oblique' }]}>
                Import pipeline data to see rep breakdown
              </Text>
            </View>
          )}

          {repRows.length > 0 && (
            <View style={S.trowTot}>
              <Text style={[S.tdBold, { flex: 1.8 }]}>TEAM TOTAL</Text>
              <Text style={[S.tdRB, { flex: 1, color: C.green   }]}>{fmtM(repTotals.closed)}</Text>
              <Text style={[S.tdRB, { flex: 1, color: C.blue    }]}>{fmtM(repTotals.wc)}</Text>
              <Text style={[S.tdRB, { flex: 1, color: '#0d7c3d' }]}>{fmtM(repTotals.call)}</Text>
              <Text style={[S.tdRB, { flex: 1, color: C.amber   }]}>{fmtM(repTotals.bc)}</Text>
              <Text style={[S.tdRB, { flex: 1, color: C.gray    }]}>{fmtM(repTotals.pipe)}</Text>
              <Text style={[S.tdRB, { flex: 1, color: repTotals.critical > 0 ? C.coral : C.gray }]}>
                {repTotals.critical > 0 ? `${repTotals.critical} \u26A0` : '\u2014'}
              </Text>
            </View>
          )}
        </View>

        {/* ── BAND 3: EXPECTED IQP ─────────────────────── */}
        <Text style={S.bandLbl}>EXPECTED IQP  {'\u00B7'}  IN-QUARTER PIPELINE</Text>
        <Text style={S.iqpSubLbl}>
          {'Create & close opportunities expected to be sourced and closed within ' + (quarterLabel || 'this quarter') + '.  Prorated for ' + weeks_remaining + ' of ' + weeks_total + ' selling weeks. IQP bookings are embedded in the ' + (v.worst_case || 'Worst Case') + ' forecast above — the Coverage Plan below closes any remaining gap independently.'}
        </Text>

        {noInputs ? (
          <Text style={S.iqpEmpty}>
            No C&amp;C inputs configured. Set Create &amp; Close assumptions in Manager Walk-Up.
          </Text>
        ) : (
          <View style={S.iqpBody}>
            {/* LEFT — arithmetic chain */}
            <View style={S.iqpLeft}>
              <View style={S.chainWrap}>
                <ChainRow
                  label="Qualified opps to create"
                  value={String(cnc_opps) + ' opps'}
                />
                <ChainRow
                  label="Average deal size (ASP)"
                  value={fmtM(cnc_asp)}
                />
                <ChainRow
                  label="Full-quarter pipeline"
                  value={fmtM(cnc_pipe)}
                  valueStyle={[S.chainVal, { color: C.blue }]}
                  sub={cnc_opps + ' \u00D7 ' + fmtM(cnc_asp)}
                />
                {fullQuarter ? (
                  <ChainRow
                    label="Win rate"
                    value={String(r_cnc) + '%'}
                    sub="Full-quarter value — no proration applied"
                  />
                ) : (
                  <ChainRow
                    label={'Win rate  \u00B7  Proration factor'}
                    value={String(r_cnc) + '%  \u00B7  ' + prorPct + '%'}
                    sub={weeks_remaining + ' of ' + weeks_total + ' selling weeks'}
                  />
                )}
                <ChainRow
                  label="Expected IQP bookings"
                  value={noWeeks ? '$0' : fmtM(cnc_prorated)}
                  valueStyle={S.chainValHero}
                  sub={noWeeks
                    ? 'No selling weeks remaining — C&C contribution exhausted.'
                    : 'Included in ' + (v.worst_case || 'Worst Case') + ' forecast'
                  }
                  subColor={noWeeks ? undefined : 'green'}
                />
              </View>
            </View>

            {/* Divider */}
            <View style={S.iqpDvdr} />

            {/* RIGHT — stat cards */}
            <View style={S.iqpRight}>
              <StatCard
                label={'Embedded in ' + (v.worst_case || 'Worst Case') + ' FC'}
                value={fmtM(cnc_prorated)}
                sub={iqpPctOfWc !== null ? String(iqpPctOfWc) + '% of ' + (v.worst_case || 'Worst Case') + ' forecast' : '\u2014'}
                borderColor={C.blue}
              />
              <StatCard
                label="Selling weeks remaining"
                value={weeks_remaining + ' of ' + weeks_total}
                sub={prorPct + '% of full-quarter value'}
                borderColor={C.amber}
              />
              <StatCard
                label={'In ' + (v.worst_case || 'Worst Case') + ' FC'}
                value={fmtM(cnc_prorated)}
                sub={'of ' + fmtM(fc_worst_case) + ' ' + (v.worst_case || 'Worst Case') + ' FC \u00B7 flows into ' + (v.call || 'Call') + ' submission'}
                borderColor={C.green}
              />
            </View>
          </View>
        )}

        {/* ── BAND 4: COVERAGE PLAN ─────────────────────── */}
        <Text style={S.bandLbl}>
          <Text>{'COVERAGE PLAN  \u00B7  INCREMENTAL GAP: '}</Text>
          <Text style={{ color: gap > 0 ? C.coral : C.green }}>
            {gap > 0 ? fmtM(gap) : 'On track'}
          </Text>
        </Text>
        <Text style={[S.iqpSubLbl, { marginTop: -2 }]}>
          {'Pipeline and activities needed in addition to IQP to close ' + fmtM(gap) + ' gap between ' + (v.call || 'Call') + ' FC and quota. IQP already reflected in forecast.'}
        </Text>

        {/* Gap allocation row — AE | SDR */}
        <View style={S.allocRow}>
          {[['ae', ae], ['sdr', sdr]].map(([k, chModel]) => {
            const ch = channels[k] || {}
            return (
              <View key={k} style={S.allocCell}>
                <Text style={S.allocName}>{ch.label || k.toUpperCase()}</Text>
                <Text style={S.allocPct}>{ch.allocation || 0}% of gap</Text>
                <Text style={[S.allocGap, { color: gap > 0 ? C.coral : C.green }]}>
                  {fmtM(chModel?.channelGap || 0)}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Coverage table — Stage | AE | SDR | Total | Weekly Rate */}
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, { flex: 2.2 }]}>Stage</Text>
            <Text style={[S.th, { flex: 1.8, textAlign: 'right' }]}>AE</Text>
            <Text style={[S.th, { flex: 1.8, textAlign: 'right' }]}>SDR</Text>
            <Text style={[S.th, { flex: 1.6, textAlign: 'right' }]}>Total</Text>
            <Text style={[S.th, { flex: 2.6, textAlign: 'right' }]}>Weekly rate</Text>
          </View>

          {COV_STAGES.map((stage, i) => {
            const aeVal   = ae  ? (ae[stage.key]  || 0) : 0
            const sdrVal  = sdr ? (sdr[stage.key] || 0) : 0
            const total   = aeVal + sdrVal
            const aeWk    = ae  ? (ae[stage.wk]   || 0) : 0
            const sdrWk   = sdr ? (sdr[stage.wk]  || 0) : 0
            const totalWk = aeWk + sdrWk
            const fmtVal  = (v) => stage.isPipe ? fmtM(v) : fmtN(v)
            const fmtWk   = (v) => stage.isPipe
              ? `${fmtM(Math.round(v / 1000) * 1000)}/wk`
              : `${Math.ceil(v)}/wk`
            return (
              <View key={stage.key} style={i % 2 === 1 ? S.trowAlt : S.trow}>
                <Text style={[S.tdBold, { flex: 2.2, color: stage.color }]}>{stage.label}</Text>
                <Text style={[S.tdR, { flex: 1.8 }]}>{fmtVal(aeVal)}</Text>
                <Text style={[S.tdR, { flex: 1.8 }]}>{fmtVal(sdrVal)}</Text>
                <Text style={[S.tdRB, { flex: 1.6 }]}>{fmtVal(total)}</Text>
                <Text style={[S.tdRB, { flex: 2.6, color: stage.color }]}>{fmtWk(totalWk)}</Text>
              </View>
            )
          })}

          {/* Activities per AE — AE column only, SDR shows — */}
          <View style={S.trowAlt}>
            <Text style={[S.tdBold, { flex: 2.2, color: C.coral, fontFamily: 'Helvetica-Oblique', paddingLeft: 10 }]}>Activities per AE</Text>
            <Text style={[S.tdR, { flex: 1.8, color: C.coral }]}>{ae ? fmtN(ae.activities_per_ae) : '\u2014'}</Text>
            <Text style={[S.tdR, { flex: 1.8, color: C.gray }]}>{'\u2014'}</Text>
            <Text style={[S.tdRB, { flex: 1.6 }]}>{ae ? fmtN(ae.activities_per_ae) : '\u2014'}</Text>
            <Text style={[S.tdRB, { flex: 2.6, color: C.coral }]}>{ae ? `${Math.ceil(ae.activities_per_ae_per_week)}/wk per AE` : '\u2014'}</Text>
          </View>

          {/* Activities per SDR — SDR column only, AE shows — */}
          <View style={S.trow}>
            <Text style={[S.tdBold, { flex: 2.2, color: C.coral, fontFamily: 'Helvetica-Oblique', paddingLeft: 10 }]}>Activities per SDR</Text>
            <Text style={[S.tdR, { flex: 1.8, color: C.gray }]}>{'\u2014'}</Text>
            <Text style={[S.tdR, { flex: 1.8, color: C.coral }]}>{sdr ? fmtN(sdr.activities_per_ae) : '\u2014'}</Text>
            <Text style={[S.tdRB, { flex: 1.6 }]}>{sdr ? fmtN(sdr.activities_per_ae) : '\u2014'}</Text>
            <Text style={[S.tdRB, { flex: 2.6, color: C.coral }]}>{sdr ? `${Math.ceil(sdr.activities_per_ae_per_week)}/wk per SDR` : '\u2014'}</Text>
          </View>
        </View>

        {/* Assumptions footnote */}
        {(() => {
          const aeConf  = channels['ae']  || {}
          const sdrConf = channels['sdr'] || {}
          const actsAe  = aeConf.activity_to_meeting  > 0 ? Math.round(1 / aeConf.activity_to_meeting)  : 0
          const actsSdr = sdrConf.activity_to_meeting > 0 ? Math.round(1 / sdrConf.activity_to_meeting) : 0
          const aeStr  = `AE: ${fmtM(aeConf.asp)} ASP \u00B7 ${aeConf.win_rate}% win \u00B7 ${actsAe} acts/mtg \u00B7 ${aeConf.meeting_to_opp}% mtg\u2192opp \u00B7 ${aeConf.opp_to_saa}% opp\u2192SAA \u00B7 ${aeConf.headcount || 1} AEs`
          const sdrStr = `SDR: ${fmtM(sdrConf.asp)} ASP \u00B7 ${sdrConf.win_rate}% win \u00B7 ${actsSdr} acts/mtg \u00B7 ${sdrConf.meeting_to_opp}% mtg\u2192opp \u00B7 ${sdrConf.opp_to_saa}% opp\u2192SAA \u00B7 ${sdrConf.headcount || 1} SDRs`
          return <Text style={S.footnote}>{aeStr + '   |   ' + sdrStr}</Text>
        })()}

        {/* ── FOOTER ────────────────────────────────────── */}
        <View style={S.footer}>
          <Text style={S.footerTxt}>Generated by MOAT · {timestamp}</Text>
          <Text style={S.footerTxt}>Confidential — for internal use only</Text>
          <Text style={S.footerTxt}>Data as of {importMeta?.date || todayStr}</Text>
        </View>
      </Page>
    </Document>
  )
}

// ── Export function ────────────────────────────────────────────
export async function exportCROPDF() {
  const fs  = useForecastStore.getState()
  const d   = fs.derived || {}
  const aq  = useQuarterStore.getState().activeQuarter
  const wow = useWowStore.getState()
  const cov = useCoverageStore.getState()

  // Vocab — read at export time
  const vocab = getVocab()

  // Effective FC — applies any active submission overrides
  const fcOverrides = fs.fcOverrides || {}
  const effective   = getEffectiveFc(d, fcOverrides)

  // WoW delta — most recent prior snapshot for active quarter (model values)
  const qSnaps  = wow.snapshots
    .filter(s => (s.quarterKey ?? 'cq') === aq)
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  const priorSnap = qSnaps.length >= 2 ? qSnaps[qSnaps.length - 2] : null
  const wowDelta  = priorSnap !== null ? (d.fc_call || 0) - (priorSnap.fc_call || 0) : null

  // Coverage model — uses effective fc_call as the gap basis
  const coverage = calcCoverageModel(
    cov.channels, fs.quota || 0, effective.fc_call || 0, d.weeks_remaining ?? 0
  )

  // Rep breakdown from importedData
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

  const now       = new Date()
  const todayStr  = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const timestamp = now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

  const data = {
    managerName:   fs.managerName   || '',
    managerTeam:   fs.managerTeam   || '',
    quarterLabel:  fs.quarterLabel  || '',
    quota:         fs.quota         || 0,
    closed:        fs.closed        || 0,
    // Effective (override-aware) FC values
    fc_worst_case: effective.fc_worst_case,
    fc_call:       effective.fc_call,
    fc_best_case:  effective.fc_best_case,
    // Model FC values — shown in override footnote as reference
    fc_worst_case_model: d.fc_worst_case || 0,
    fc_call_model:       d.fc_call       || 0,
    fc_best_case_model:  d.fc_best_case  || 0,
    overrideActive: effective.overrideActive,
    bk_wc:         d.bk_wc         || 0,
    bk_call:       d.bk_call        || 0,
    bk_bc:         d.bk_bc          || 0,
    cnc_prorated:  d.cnc_prorated   || 0,
    // IQP inputs
    cnc_opps:        fs.cnc_opps          || 0,
    cnc_asp:         fs.cnc_asp           || 0,
    r_cnc:           fs.r_cnc             || 0,
    cnc_pipe:        d.cnc_pipe           || 0,
    prorationFactor: d.prorationFactor    ?? 1,
    weeks_remaining: d.weeks_remaining    ?? 0,
    weeks_total:     d.weeks_total        || 0,
    priorSnap,
    wowDelta,
    importMeta:    fs.importMeta,
    repRows,
    channels:      cov.channels,
    coverage,
    ae:  coverage.channels['ae']  || null,
    sdr: coverage.channels['sdr'] || null,
    vocab,
    todayStr,
    timestamp,
  }

  const blob = await pdf(<CROReadInDocument data={data} />).toBlob()
  const name = [
    (fs.managerName  || 'Manager').replace(/\s+/g, '_'),
    (fs.quarterLabel || 'Q').replace(/\s+/g, '_'),
    'ReadIn.pdf',
  ].join('_')
  triggerDownload(blob, name)
}
