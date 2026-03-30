import React from 'react'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import { useForecastStore, useInspectorStore, useQuarterStore, useSectionComments } from '../store/forecastStore'
import { getFiscalQuarterInfo, fmt, attPct } from './fmt'

// ── Colors ────────────────────────────────────────────────────────
const NAVY   = '#1a1a2e'
const CORAL  = '#E85D3A'
const BLUE   = '#1a56db'
const GREEN  = '#0d7c3d'
const AMBER  = '#b45309'
const GRAY   = '#6b7280'
const LGRAY  = '#f3f4f6'
const BORDER = '#e5e7eb'

// ── Shared styles ─────────────────────────────────────────────────
const base = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#111827',
    backgroundColor: '#fff',
    paddingBottom: 36,
  },
  header: {
    backgroundColor: NAVY,
    padding: '16 24',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  headerLeft: { flexDirection: 'column' },
  moatLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: CORAL, letterSpacing: 1.5, marginBottom: 3, textTransform: 'uppercase' },
  headerName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#fff' },
  headerSub: { fontSize: 9, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  quotaLabel: { fontSize: 8, color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
  quotaVal: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: CORAL },

  section: { paddingHorizontal: 24, marginBottom: 18 },
  sectionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },

  row3: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, border: `1 solid ${BORDER}`, borderRadius: 6, padding: '10 12' },
  cardCat: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 },
  cardVal: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 2 },
  cardPct: { fontSize: 9, color: GRAY },

  table: { width: '100%' },
  thead: { flexDirection: 'row', backgroundColor: LGRAY, borderBottom: `1 solid ${BORDER}`, paddingVertical: 4, paddingHorizontal: 8 },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY, letterSpacing: 0.6, textTransform: 'uppercase' },
  trow: { flexDirection: 'row', borderBottom: `1 solid ${LGRAY}`, paddingVertical: 5, paddingHorizontal: 8 },
  td: { fontSize: 9, color: '#374151' },
  tdBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },

  footer: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    borderTop: `1 solid ${BORDER}`,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerTxt: { fontSize: 7, color: '#9ca3af' },
})

// ── Helper ────────────────────────────────────────────────────────
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

const today = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// ══════════════════════════════════════════════════════════════════
// PAGE CONTENT HELPERS (return arrays of <Page> elements)
// ══════════════════════════════════════════════════════════════════

function forecastPages(s, d, qInfo, comments, todayStr) {
  const cards = [
    { label: 'Worst Case', value: d.fc_worst_case || 0, color: BLUE },
    { label: 'Call',       value: d.fc_call       || 0, color: GREEN },
    { label: 'Best Case',  value: d.fc_best_case  || 0, color: AMBER },
  ]

  const pipeRows = [
    { label: 'Worst Case', pipe: s.pipe_worst_case, rate: s.r_worst_case, exp: d.bk_wc,   color: BLUE },
    { label: 'Call',       pipe: s.pipe_call,       rate: s.r_call,       exp: d.bk_call, color: GREEN },
    { label: 'Best Case',  pipe: s.pipe_best_case,  rate: s.r_best_case,  exp: d.bk_bc,   color: AMBER },
    { label: 'Pipeline',   pipe: s.pipe_pipe,       rate: s.r_pipe,       exp: d.bk_pp,   color: GRAY },
  ]

  const monthRows = [
    { label: 'Closed',     keys: ['m1_closed','m2_closed','m3_closed'] },
    { label: 'Worst Case', keys: ['m1_worst_case','m2_worst_case','m3_worst_case'] },
    { label: 'Call',       keys: ['m1_call','m2_call','m3_call'] },
    { label: 'Best Case',  keys: ['m1_best_case','m2_best_case','m3_best_case'] },
  ]

  const commentEntries = Object.entries(comments || {})
    .filter(([k, v]) => !k.startsWith('insp_deal_') && v?.trim())

  return [
    /* ── Page 1: Header + Cards + Pipeline table ── */
    <Page key="fc-p1" size="A4" style={base.page}>
      <View style={base.header}>
        <View style={base.headerLeft}>
          <Text style={base.moatLabel}>MOAT</Text>
          <Text style={base.headerName}>
            {s.managerName || 'Manager'}{s.managerTeam ? ` · ${s.managerTeam}` : ''}
          </Text>
          <Text style={base.headerSub}>{qInfo.label} Forecast · as of {todayStr}</Text>
        </View>
        <View style={base.headerRight}>
          <Text style={base.quotaLabel}>Quota</Text>
          <Text style={base.quotaVal}>{fmt(s.quota)}</Text>
        </View>
      </View>

      <View style={base.section}>
        <Text style={base.sectionLabel}>Forecast summary</Text>
        <View style={base.row3}>
          {cards.map(c => (
            <View key={c.label} style={[base.card, { borderTopWidth: 3, borderTopColor: c.color }]}>
              <Text style={[base.cardCat, { color: c.color }]}>{c.label} forecast</Text>
              <Text style={base.cardVal}>{fmt(c.value)}</Text>
              <Text style={base.cardPct}>{attPct(c.value, s.quota)}% of quota</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={base.section}>
        <Text style={base.sectionLabel}>Pipeline inputs</Text>
        <View style={base.table}>
          <View style={base.thead}>
            {['Category','Open pipeline','Conv. rate','Expected'].map((h, i) => (
              <Text key={h} style={[base.th, { flex: i === 0 ? 2 : 1, textAlign: i > 0 ? 'right' : 'left' }]}>{h}</Text>
            ))}
          </View>
          {pipeRows.map(row => (
            <View key={row.label} style={base.trow}>
              <Text style={[base.tdBold, { flex: 2, color: row.color }]}>{row.label}</Text>
              <Text style={[base.td, { flex: 1, textAlign: 'right' }]}>{fmt(row.pipe)}</Text>
              <Text style={[base.td, { flex: 1, textAlign: 'right', color: GRAY }]}>{row.rate}%</Text>
              <Text style={[base.tdBold, { flex: 1, textAlign: 'right' }]}>{fmt(row.exp)}</Text>
            </View>
          ))}
        </View>
      </View>

      {(s.cnc_opps > 0 || d.cnc_prorated > 0) && (
        <View style={base.section}>
          <Text style={base.sectionLabel}>Create &amp; Close</Text>
          <View style={[base.trow, { backgroundColor: '#f5f3ff' }]}>
            <Text style={[base.tdBold, { flex: 2, color: '#7c3aed' }]}>C&amp;C (prorated)</Text>
            <Text style={[base.td, { flex: 1, textAlign: 'right' }]}>{s.cnc_opps} opps × {fmt(s.cnc_asp)}</Text>
            <Text style={[base.td, { flex: 1, textAlign: 'right', color: GRAY }]}>{s.r_cnc}% win rate</Text>
            <Text style={[base.tdBold, { flex: 1, textAlign: 'right', color: '#7c3aed' }]}>{fmt(d.cnc_prorated)}</Text>
          </View>
        </View>
      )}

      <View style={base.footer}>
        <Text style={base.footerTxt}>Generated by MOAT · {todayStr}</Text>
        <Text style={base.footerTxt}>Confidential — not for external distribution</Text>
      </View>
    </Page>,

    /* ── Page 2: Monthly breakdown + Comments ── */
    <Page key="fc-p2" size="A4" style={base.page}>
      <View style={base.header}>
        <View style={base.headerLeft}>
          <Text style={base.moatLabel}>MOAT</Text>
          <Text style={base.headerName}>{qInfo.label} · Monthly Breakdown</Text>
        </View>
      </View>

      <View style={base.section}>
        <Text style={base.sectionLabel}>Monthly breakdown</Text>
        <View style={base.table}>
          <View style={base.thead}>
            {['','M1','M2','M3','Quarter'].map((h, i) => (
              <Text key={i} style={[base.th, { flex: i === 0 ? 2 : 1, textAlign: i > 0 ? 'right' : 'left' }]}>{h}</Text>
            ))}
          </View>
          {monthRows.map(row => {
            const vals = row.keys.map(k => s[k] || 0)
            const total = vals.reduce((a, b) => a + b, 0)
            return (
              <View key={row.label} style={base.trow}>
                <Text style={[base.tdBold, { flex: 2 }]}>{row.label}</Text>
                {vals.map((v, i) => (
                  <Text key={i} style={[base.td, { flex: 1, textAlign: 'right' }]}>{v > 0 ? fmt(v) : '—'}</Text>
                ))}
                <Text style={[base.tdBold, { flex: 1, textAlign: 'right' }]}>{total > 0 ? fmt(total) : '—'}</Text>
              </View>
            )
          })}
        </View>
      </View>

      {commentEntries.length > 0 && (
        <View style={base.section}>
          <Text style={base.sectionLabel}>Notes</Text>
          {commentEntries.map(([key, value]) => (
            <View key={key} style={{ marginBottom: 8, padding: '6 8', backgroundColor: LGRAY, borderRadius: 4 }}>
              <Text style={[base.td, { color: GRAY, marginBottom: 2, fontSize: 8 }]}>{key.replace(/_/g, ' ')}</Text>
              <Text style={[base.td, { lineHeight: 1.4 }]}>{value}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={base.footer}>
        <Text style={base.footerTxt}>Generated by MOAT · {todayStr}</Text>
        <Text style={base.footerTxt}>Confidential — not for external distribution</Text>
      </View>
    </Page>,
  ]
}

function inspectionPages(repsSorted, repResults, qLabel, todayStr) {
  return (repsSorted || []).map((rep, repIdx) => {
    const { owner, deals, stats } = rep
    const aiResult = repResults[owner]
    const hygienePct = stats?.total > 0
      ? Math.round(((stats.total - (stats.critical || 0) - (stats.warn || 0)) / stats.total) * 100)
      : 100

    return (
      <Page key={`insp-${owner}-${repIdx}`} size="A4" style={base.page}>
        <View style={base.header}>
          <View style={base.headerLeft}>
            <Text style={base.moatLabel}>MOAT · Pipeline Inspection</Text>
            <Text style={base.headerName}>{owner}</Text>
            <Text style={base.headerSub}>{qLabel} · {todayStr}</Text>
          </View>
          <View style={base.headerRight}>
            <Text style={base.quotaLabel}>Hygiene</Text>
            <Text style={[base.quotaVal, { color: hygienePct >= 80 ? '#10b981' : hygienePct >= 60 ? AMBER : CORAL }]}>
              {hygienePct}%
            </Text>
          </View>
        </View>

        <View style={base.section}>
          <Text style={base.sectionLabel}>{deals?.length || 0} deals</Text>
          <View style={base.table}>
            <View style={base.thead}>
              <Text style={[base.th, { flex: 3 }]}>Deal</Text>
              <Text style={[base.th, { flex: 1 }]}>Stage</Text>
              <Text style={[base.th, { flex: 1, textAlign: 'right' }]}>Amount</Text>
              <Text style={[base.th, { flex: 1, textAlign: 'right' }]}>Close</Text>
              <Text style={[base.th, { flex: 2 }]}>Flags</Text>
            </View>
            {(deals || []).map((deal, i) => {
              const flags = (deal._flags || []).map(f => f.label || f.id).join(', ')
              const closeStr = deal.f_close_date
                ? new Date(deal.f_close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—'
              const hasCrit = (deal._flags || []).some(f => f.sev === 'critical')
              const hasWarn = (deal._flags || []).some(f => f.sev === 'warn')
              const rowBg = hasCrit ? '#fff5f5' : hasWarn ? '#fffbeb' : '#fff'
              return (
                <View key={i} style={[base.trow, { backgroundColor: rowBg }]}>
                  <Text style={[base.tdBold, { flex: 3 }]} numberOfLines={1}>{deal.f_opp_name || '—'}</Text>
                  <Text style={[base.td, { flex: 1, color: GRAY }]} numberOfLines={1}>{deal.f_stage || '—'}</Text>
                  <Text style={[base.tdBold, { flex: 1, textAlign: 'right' }]}>{fmt(deal.f_amount_num)}</Text>
                  <Text style={[base.td, { flex: 1, textAlign: 'right', color: GRAY }]}>{closeStr}</Text>
                  <Text style={[base.td, { flex: 2, color: hasCrit ? '#dc2626' : hasWarn ? AMBER : GRAY, fontSize: 8 }]} numberOfLines={2}>
                    {flags || '—'}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        {aiResult?.summary && (
          <View style={[base.section]}>
            <Text style={base.sectionLabel}>AI summary</Text>
            <View style={{ backgroundColor: LGRAY, borderRadius: 4, padding: '8 10' }}>
              <Text style={[base.td, { lineHeight: 1.5 }]}>{aiResult.summary}</Text>
            </View>
          </View>
        )}

        <View style={base.footer}>
          <Text style={base.footerTxt}>Generated by MOAT · {todayStr}</Text>
          <Text style={base.footerTxt}>Confidential — not for external distribution</Text>
        </View>
      </Page>
    )
  })
}

// ══════════════════════════════════════════════════════════════════
// DOCUMENT COMPONENTS
// ══════════════════════════════════════════════════════════════════

function ForecastDocument({ s, d, qInfo, comments }) {
  const todayStr = today()
  return (
    <Document title={`${s.managerName || 'Manager'} — ${qInfo.label} Forecast`}>
      {forecastPages(s, d, qInfo, comments, todayStr)}
    </Document>
  )
}

function InspectionDocument({ repsSorted, repResults, managerName, qLabel }) {
  const todayStr = today()
  return (
    <Document title={`${managerName || 'Manager'} — ${qLabel} Pipeline Inspection`}>
      {inspectionPages(repsSorted, repResults, qLabel, todayStr)}
    </Document>
  )
}

function CombinedDocument({ s, d, qInfo, comments, repsSorted, repResults }) {
  const todayStr = today()
  return (
    <Document title={`${s.managerName || 'Manager'} — ${qInfo.label} Forecast + Inspection`}>
      {forecastPages(s, d, qInfo, comments, todayStr)}
      {inspectionPages(repsSorted, repResults, qInfo.label, todayStr)}
    </Document>
  )
}

// ══════════════════════════════════════════════════════════════════
// EXPORT FUNCTIONS
// ══════════════════════════════════════════════════════════════════

export async function exportForecastPDF() {
  const s        = useForecastStore.getState()
  const d        = s.derived || {}
  const aq       = useQuarterStore.getState().activeQuarter
  const mode     = aq === 'q1' ? 'next' : 'current'
  const qInfo    = getFiscalQuarterInfo(mode, s.fyStartMonth || 1)
  const comments = useSectionComments.getState().comments || {}

  const insp          = useInspectorStore.getState()
  const hasInspection = (insp.lastResult?.repsSorted?.length ?? 0) > 0

  const name   = s.managerName?.replace(/\s+/g, '_') || 'Manager'
  const qLabel = qInfo.label.replace(/\s/g, '_')

  if (hasInspection) {
    const blob = await pdf(
      <CombinedDocument
        s={s} d={d} qInfo={qInfo} comments={comments}
        repsSorted={insp.lastResult.repsSorted}
        repResults={insp.repResults || {}}
      />
    ).toBlob()
    triggerDownload(blob, `${name}_${qLabel}_Forecast+Inspection.pdf`)
  } else {
    const blob = await pdf(
      <ForecastDocument s={s} d={d} qInfo={qInfo} comments={comments} />
    ).toBlob()
    triggerDownload(blob, `${name}_${qLabel}_Forecast.pdf`)
  }
}

export async function exportInspectionPDF() {
  const insp       = useInspectorStore.getState()
  const lastResult = insp.lastResult
  if (!lastResult?.repsSorted?.length) {
    alert('Run the inspection first before exporting.')
    return
  }

  const s      = useForecastStore.getState()
  const aq     = useQuarterStore.getState().activeQuarter
  const mode   = aq === 'q1' ? 'next' : 'current'
  const qInfo  = getFiscalQuarterInfo(mode, s.fyStartMonth || 1)

  const blob = await pdf(
    <InspectionDocument
      repsSorted={lastResult.repsSorted}
      repResults={insp.repResults || {}}
      managerName={s.managerName || 'Manager'}
      qLabel={qInfo.label}
    />
  ).toBlob()

  const name = s.managerName?.replace(/\s+/g, '_') || 'Manager'
  triggerDownload(blob, `${name}_${qInfo.label.replace(/\s/g, '_')}_Inspection.pdf`)
}
