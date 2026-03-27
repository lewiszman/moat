// ── Core forecast arithmetic ───────────────────────────────────
// Commit   = Closed + Commit bookings + C&C (prorated)
// Probable = Commit FC + Probable bookings + (optionally 50% Upside)
// Upside   = Probable FC + remaining Upside bookings (always 100% total)

export function calcForecast({
  closed = 0,
  bk_c = 0,         // expected commit bookings  (pipe_commit × r_commit)
  bk_p = 0,         // expected probable bookings
  bk_u = 0,         // expected upside bookings
  bk_pp = 0,        // expected pipeline bookings
  cnc_prorated = 0, // C&C expected revenue, prorated by weeks remaining
  probIncludesUpside = false,
}) {
  const bk_u_in_prob = probIncludesUpside ? bk_u * 0.5 : 0
  const fc_commit = closed + bk_c + cnc_prorated
  const fc_prob   = fc_commit + bk_p + bk_u_in_prob
  const fc_up     = fc_prob + (bk_u - bk_u_in_prob)
  const fc_full   = fc_up + bk_pp
  return { fc_commit, fc_prob, fc_up, fc_full, bk_u_in_prob }
}

// Quota bar segment widths — order: Closed | C&C | Commit | Probable | Upside
export function calcQbarWidths({ quota, closed, bk_c, bk_p, cnc_prorated, bk_u }) {
  if (!quota || quota <= 0) return { wC:0, wBkC:0, wBkP:0, wCnc:0, wBkU:0 }
  const c = (v, rem) => Math.max(0, Math.min(rem, (v / quota) * 100))
  const wC   = c(closed,        100)
  const wCnc = c(cnc_prorated,  100 - wC)
  const wBkC = c(bk_c,          100 - wC - wCnc)
  const wBkP = c(bk_p,          100 - wC - wCnc - wBkC)
  const wBkU = c(bk_u,          100 - wC - wCnc - wBkC - wBkP)
  return { wC, wBkC, wBkP, wCnc, wBkU }
}
