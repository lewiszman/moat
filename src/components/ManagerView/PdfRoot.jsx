import React from 'react'
import { createPortal } from 'react-dom'
import { useForecastStore } from '../../store/forecastStore'
import { fmt, attPct, getFiscalQuarterInfo } from '../../lib/fmt'

/**
 * Hidden div that becomes the branded PDF layout during window.print().
 * Visible only when body[data-printing="forecast"] (set by ManagerView).
 * CSS in index.css handles the show/hide.
 */
export default function PdfRoot() {
  const s = useForecastStore()
  const d = s.derived || {}

  const NAVY  = '#1a1a2e'
  const CORAL = '#E85D3A'

  const cards = [
    { label: 'Commit forecast',  value: d.fc_commit || 0,  color: '#1a56db' },
    { label: 'Probable forecast',value: d.fc_prob   || 0,  color: '#0d7c3d' },
    { label: 'Upside forecast',  value: d.fc_up     || 0,  color: '#b45309' },
  ]

  const qInfo = getFiscalQuarterInfo('current', s.fyStartMonth || 1)
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const ROWS = [
    { label: 'Commit',   pipeKey: 'pipe_commit', rateKey: 'r_commit', expKey: 'bk_c',  color: '#1a56db' },
    { label: 'Probable', pipeKey: 'pipe_prob',   rateKey: 'r_prob',   expKey: 'bk_p',  color: '#0d7c3d' },
    { label: 'Upside',   pipeKey: 'pipe_up',     rateKey: 'r_up',     expKey: 'bk_u',  color: '#b45309' },
    { label: 'Pipeline', pipeKey: 'pipe_pipe',   rateKey: 'r_pipe',   expKey: 'bk_pp', color: '#6b7280' },
  ]

  const content = (
    <div
      id="pdf-root"
      style={{
        display: 'none',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: '#111827',
        background: '#fff',
        padding: '0',
      }}
    >
      {/* Header band */}
      <div style={{ background: NAVY, color: '#fff', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: CORAL, marginBottom: 4 }}>MOAT</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {s.managerName || 'Manager'}{s.managerTeam ? ` · ${s.managerTeam}` : ''}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
            {qInfo.label} Forecast · as of {today}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Quota</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: CORAL }}>{fmt(s.quota)}</div>
        </div>
      </div>

      {/* Forecast cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24, padding: '0 28px' }}>
        {cards.map(card => (
          <div key={card.label} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px', borderTop: `3px solid ${card.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: card.color, marginBottom: 8 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
              {fmt(card.value)}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {attPct(card.value, s.quota)}% of quota
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline table */}
      <div style={{ margin: '0 28px 24px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: 8 }}>
          Pipeline inputs
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Category', 'Open pipeline', 'Conv. rate', 'Expected'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.label}>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, color: row.color }}>{row.label}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #f3f4f6' }}>{fmt(s[row.pipeKey])}</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>{s[row.rateKey]}%</td>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>{fmt(d[row.expKey])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Monthly breakdown table */}
      <div style={{ margin: '0 28px 24px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7280', marginBottom: 8 }}>
          Monthly breakdown
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['', 'M1', 'M2', 'M3', 'Quarter'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: h ? 'right' : 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Closed',   keys: ['m1_closed','m2_closed','m3_closed'] },
              { label: 'Commit',   keys: ['m1_commit','m2_commit','m3_commit'] },
              { label: 'Probable', keys: ['m1_prob','m2_prob','m3_prob'] },
              { label: 'Upside',   keys: ['m1_up','m2_up','m3_up'] },
            ].map(row => {
              const vals = row.keys.map(k => s[k] || 0)
              const total = vals.reduce((a, b) => a + b, 0)
              return (
                <tr key={row.label}>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>{row.label}</td>
                  {vals.map((v, i) => (
                    <td key={i} style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{v > 0 ? fmt(v) : '—'}</td>
                  ))}
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid #f3f4f6' }}>{total > 0 ? fmt(total) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ margin: '0 28px', paddingTop: 12, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af' }}>
        <span>Generated by MOAT v2.7 · {today}</span>
        <span>Confidential — not for external distribution</span>
      </div>
    </div>
  )

  // Portal to document.body so #pdf-root is a sibling of #root,
  // not nested inside it — this lets @media print hide #root while
  // showing #pdf-root independently.
  return createPortal(content, document.body)
}
