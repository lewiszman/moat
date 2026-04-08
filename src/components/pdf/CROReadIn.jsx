import React from 'react'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import { useForecastStore, useWowStore, useQuarterStore } from '../../store/forecastStore'
import { useCoverageStore } from '../../store/coverageStore'
import { calcCoverageModel } from '../../lib/coverage'
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
  border: '#e5e7eb',
}

// ── Coverage stage config (Activity → Meeting → Opp → SAA → Pipeline) ──
const COV_STAGES = [
  { label: 'Pipeline needed',   key: 'pipeline_needed',   wk: 'pipeline_per_week',   color: C.blue,  isPipe: true },
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
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: -28,
    marginRight: -28,
    marginBottom: 8,
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
    marginBottom: 4,
    marginTop: 6,
  },

  // Forecast tiers
  tiersRow:   { flexDirection: 'row', marginBottom: 6 },
  tierCol:    { flex: 1, paddingRight: 8 },
  tierDvdr:   { width: 0.5, backgroundColor: C.light, marginRight: 8 },
  tierLbl:    { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 3 },
  tierAmt:    { fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  tierAtt:    { fontSize: 8 },
  tierGap:    { fontSize: 7, marginTop: 1 },
  tierChain:  { fontSize: 6, color: C.gray, marginTop: 3, lineHeight: 1.4 },

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
  qbarWrap:    { marginBottom: 4 },
  qbarTrack:   { height: 7, backgroundColor: C.light, borderRadius: 2, flexDirection: 'row', marginBottom: 2 },
  qbarPctRow:  { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  qbarPct:     { fontSize: 7, fontFamily: 'Helvetica-Bold' },
  qbarLegend:  { flexDirection: 'row', flexWrap: 'wrap' },
  qbarLegItem: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  qbarLegDot:  { width: 5, height: 5, borderRadius: 1, marginRight: 2 },
  qbarLegTxt:  { fontSize: 6, color: C.gray },

  // Tables
  table:   { width: '100%', marginBottom: 3 },
  thead:   { flexDirection: 'row', backgroundColor: C.light, paddingVertical: 3, paddingHorizontal: 4 },
  th:      { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.gray, letterSpacing: 0.5 },
  trow:    { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottom: '0.5 solid #f3f4f6' },
  trowAlt: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottom: '0.5 solid #f3f4f6', backgroundColor: C.light },
  trowTot: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, backgroundColor: C.lBlue, borderTop: '1 solid #1a56db' },
  td:      { fontSize: 8, color: '#374151' },
  tdBold:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink },
  tdR:     { fontSize: 8, color: '#374151', textAlign: 'right' },
  tdRB:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink, textAlign: 'right' },

  // Coverage allocation cells
  allocRow:  { flexDirection: 'row', marginBottom: 5 },
  allocCell: { flex: 1, backgroundColor: C.light, borderRadius: 2, paddingTop: 5, paddingBottom: 5, paddingLeft: 6, paddingRight: 6, marginRight: 4 },
  allocName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 1 },
  allocPct:  { fontSize: 7, color: C.gray, marginBottom: 2 },
  allocGap:  { fontSize: 11, fontFamily: 'Helvetica-Bold' },

  footnote: { fontSize: 6, color: C.gray, fontFamily: 'Helvetica-Oblique', marginTop: 3 },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 28,
    right: 28,
    borderTop: '0.5 solid #e5e7eb',
    paddingTop: 5,
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

// ── Document component ─────────────────────────────────────────
function CROReadInDocument({ data }) {
  const {
    managerName, managerTeam, quarterLabel, quota,
    closed, fc_worst_case, fc_call, fc_best_case,
    bk_wc, bk_call, bk_bc, cnc_prorated,
    priorSnap, wowDelta,
    importMeta, repRows,
    channels, coverage,
    todayStr, timestamp,
  } = data

  const gap     = Math.max(0, quota - fc_call)
  const onTrack = fc_call >= quota

  // Quota bar segment widths (%)
  const qTotal = quota > 0 ? quota : 1
  const wClosed = Math.min((closed        / qTotal) * 100, 100)
  const wWC     = Math.min((bk_wc         / qTotal) * 100, Math.max(0, 100 - wClosed))
  const wCnc    = Math.min((cnc_prorated  / qTotal) * 100, Math.max(0, 100 - wClosed - wWC))
  const wCall   = Math.min((bk_call       / qTotal) * 100, Math.max(0, 100 - wClosed - wWC - wCnc))
  const wBC     = Math.min((bk_bc         / qTotal) * 100, Math.max(0, 100 - wClosed - wWC - wCnc - wCall))

  const callPct   = attPct(fc_call, quota)
  const pctColor  = attColor(fc_call, quota)

  const enabledKeys = Object.keys(channels).filter(k => channels[k].enabled)

  // Pipeline rep totals
  const repTotals = repRows.reduce((acc, r) => ({
    closed: acc.closed + r.closed,
    wc:     acc.wc     + r.wc,
    call:   acc.call   + r.call,
    bc:     acc.bc     + r.bc,
    pipe:   acc.pipe   + r.pipe,
    critical: acc.critical + r.critical,
  }), { closed: 0, wc: 0, call: 0, bc: 0, pipe: 0, critical: 0 })

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
            <Text style={[S.tierLbl, { color: C.blue }]}>WORST CASE</Text>
            <Text style={[S.tierAmt, { fontSize: 18, color: C.blue }]}>{fmtM(fc_worst_case)}</Text>
            <Text style={[S.tierAtt, { color: C.blue }]}>{attPct(fc_worst_case, quota)}% of quota</Text>
            <Text style={[S.tierGap, { color: fc_worst_case >= quota ? C.green : C.coral }]}>
              {fc_worst_case >= quota ? 'On track' : `${fmtM(quota - fc_worst_case)} gap`}
            </Text>
            <Text style={S.tierChain}>
              {'Closed ' + fmtM(closed) + ' + WC pipe ' + fmtM(bk_wc) + ' + C&C ' + fmtM(cnc_prorated)}
            </Text>
          </View>

          <View style={S.tierDvdr} />

          {/* Call FC — primary, with WoW badge */}
          <View style={S.tierCol}>
            <Text style={[S.tierLbl, { color: C.blue }]}>CALL</Text>
            <View style={S.wowRow}>
              <Text style={[S.tierAmt, { fontSize: 22, color: C.blue }]}>{fmtM(fc_call)}</Text>
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
              {'WC FC ' + fmtM(fc_worst_case) + ' + Call pipe ' + fmtM(bk_call)}
            </Text>
          </View>

          <View style={S.tierDvdr} />

          {/* Best Case */}
          <View style={[S.tierCol, { paddingRight: 0 }]}>
            <Text style={[S.tierLbl, { color: C.amber }]}>BEST CASE</Text>
            <Text style={[S.tierAmt, { fontSize: 18, color: C.amber }]}>{fmtM(fc_best_case)}</Text>
            <Text style={[S.tierAtt, { color: C.amber }]}>{attPct(fc_best_case, quota)}% of quota</Text>
            <Text style={[S.tierGap, { color: fc_best_case >= quota ? C.green : C.coral }]}>
              {fc_best_case >= quota ? 'On track' : `${fmtM(quota - fc_best_case)} gap`}
            </Text>
            <Text style={S.tierChain}>
              {'Call FC ' + fmtM(fc_call) + ' + BC pipe ' + fmtM(bk_bc)}
            </Text>
          </View>
        </View>

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
            <Text style={[S.qbarPct, { color: pctColor }]}>{callPct}% attainment (Call)</Text>
          </View>
          <View style={S.qbarLegend}>
            {[
              ['Closed',     C.green],
              ['WC',         '#93c5fd'],
              ['C&C',        '#34d399'],
              ['Call',       '#6ee7b7'],
              ['Best Case',  '#fcd34d'],
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
            {['Rep', 'Closed', 'WC Pipeline', 'Call Pipeline', 'BC Pipeline', 'Pipeline', '⚠ Critical'].map((h, i) => (
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

        {/* ── BAND 3: COVERAGE PLAN ─────────────────────── */}
        <Text style={S.bandLbl}>
          <Text>{'COVERAGE PLAN  \u00B7  GAP TO QUOTA: '}</Text>
          <Text style={{ color: gap > 0 ? C.coral : C.green }}>
            {gap > 0 ? fmtM(gap) : 'On track'}
          </Text>
        </Text>

        {/* Gap allocation row */}
        <View style={S.allocRow}>
          {enabledKeys.map(k => {
            const ch      = channels[k]
            const chModel = coverage.channels[k] || {}
            return (
              <View key={k} style={S.allocCell}>
                <Text style={S.allocName}>{ch.label}</Text>
                <Text style={S.allocPct}>{ch.allocation}% of gap</Text>
                <Text style={[S.allocGap, { color: gap > 0 ? C.coral : C.green }]}>
                  {fmtM(chModel.channelGap || 0)}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Coverage table */}
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, { flex: 1.8 }]}>Stage</Text>
            {enabledKeys.map(k => (
              <Text key={k} style={[S.th, { flex: 1.6, textAlign: 'right' }]}>{channels[k].label}</Text>
            ))}
            <Text style={[S.th, { flex: 1.4, textAlign: 'right' }]}>Total</Text>
            <Text style={[S.th, { flex: 1.6, textAlign: 'right' }]}>Weekly rate</Text>
          </View>

          {COV_STAGES.map((stage, i) => {
            const total   = enabledKeys.reduce((s, k) => s + ((coverage.channels[k] || {})[stage.key] || 0), 0)
            const totalWk = enabledKeys.reduce((s, k) => s + ((coverage.channels[k] || {})[stage.wk]  || 0), 0)
            const fmtVal  = (v) => stage.isPipe ? fmtM(v) : fmtN(v)
            const fmtWk   = (v) => stage.isPipe
              ? `${fmtM(Math.round(v / 1000) * 1000)}/wk`
              : `${Math.ceil(v)}/wk`
            return (
              <View key={stage.key} style={i % 2 === 1 ? S.trowAlt : S.trow}>
                <Text style={[S.tdBold, { flex: 1.8, color: stage.color }]}>{stage.label}</Text>
                {enabledKeys.map(k => (
                  <Text key={k} style={[S.tdR, { flex: 1.6 }]}>
                    {fmtVal((coverage.channels[k] || {})[stage.key] || 0)}
                  </Text>
                ))}
                <Text style={[S.tdRB, { flex: 1.4 }]}>{fmtVal(total)}</Text>
                <Text style={[S.tdRB, { flex: 1.6, color: stage.color }]}>{fmtWk(totalWk)}</Text>
              </View>
            )
          })}
        </View>

        {/* Assumptions footnote */}
        <Text style={S.footnote}>
          {'Rates: ' + enabledKeys.map(k => {
            const ch = channels[k]
            return `${ch.label} ${fmtM(ch.asp)} ASP \u00B7 ${ch.win_rate}% win \u00B7 ${ch.activity_to_meeting} act/mtg \u00B7 ${ch.meeting_to_opp}% mtg\u2192opp \u00B7 ${ch.opp_to_saa}% opp\u2192saa`
          }).join('   |   ')}
        </Text>

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

  // WoW delta — most recent prior snapshot for active quarter
  const qSnaps  = wow.snapshots
    .filter(s => (s.quarterKey ?? 'cq') === aq)
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  const priorSnap = qSnaps.length >= 2 ? qSnaps[qSnaps.length - 2] : null
  const wowDelta  = priorSnap !== null ? (d.fc_call || 0) - (priorSnap.fc_call || 0) : null

  // Coverage model
  const coverage = calcCoverageModel(
    cov.channels, fs.quota || 0, d.fc_call || 0, d.weeks_remaining ?? 0
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
    fc_worst_case: d.fc_worst_case  || 0,
    fc_call:       d.fc_call        || 0,
    fc_best_case:  d.fc_best_case   || 0,
    bk_wc:         d.bk_wc         || 0,
    bk_call:       d.bk_call        || 0,
    bk_bc:         d.bk_bc          || 0,
    cnc_prorated:  d.cnc_prorated   || 0,
    weeks_remaining: d.weeks_remaining ?? 0,
    priorSnap,
    wowDelta,
    importMeta:    fs.importMeta,
    repRows,
    channels:      cov.channels,
    coverage,
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
