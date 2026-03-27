// ── Core forecast arithmetic ───────────────────────────────────
// Commit   = Closed + Commit bookings
// Probable = Commit FC + Probable bookings + C&C + (optionally 50% Upside)
// Upside   = Probable FC + remaining Upside bookings (always 100% total)

export function calcForecast({
  closed = 0,
  bk_c = 0,   // expected commit bookings  (pipe_commit × r_commit)
  bk_p = 0,   // expected probable bookings
  bk_u = 0,   // expected upside bookings
  bk_pp = 0,  // expected pipeline bookings
  cnc_rev = 0,            // C&C expected revenue
  probIncludesUpside = false,
}) {
  const bk_u_in_prob = probIncludesUpside ? bk_u * 0.5 : 0
  const fc_commit = closed + bk_c
  const fc_prob   = fc_commit + bk_p + cnc_rev + bk_u_in_prob
  const fc_up     = fc_prob + (bk_u - bk_u_in_prob)
  const fc_full   = fc_up + bk_pp
  return { fc_commit, fc_prob, fc_up, fc_full, bk_u_in_prob }
}

// Quota bar segment widths — order: Closed | Commit | Probable | C&C | Upside
export function calcQbarWidths({ quota, closed, bk_c, bk_p, cnc_rev, bk_u }) {
  if (!quota || quota <= 0) return { wC:0, wBkC:0, wBkP:0, wCnc:0, wBkU:0 }
  const c = (v, rem) => Math.max(0, Math.min(rem, (v / quota) * 100))
  const wC   = c(closed,  100)
  const wBkC = c(bk_c,    100 - wC)
  const wBkP = c(bk_p,    100 - wC - wBkC)
  const wCnc = c(cnc_rev, 100 - wC - wBkC - wBkP)
  const wBkU = c(bk_u,    100 - wC - wBkC - wBkP - wCnc)
  return { wC, wBkC, wBkP, wCnc, wBkU }
}
