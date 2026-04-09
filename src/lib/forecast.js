// ── Core forecast arithmetic ───────────────────────────────────
// Worst Case = Closed + Worst Case bookings + C&C (prorated)
// Call       = Worst Case FC + Call bookings + (optionally 50% Best Case)
// Best Case  = Call FC + remaining Best Case bookings (always 100% total)

export function calcForecast({
  closed = 0,
  bk_wc = 0,         // expected worst case bookings  (pipe_worst_case × r_worst_case)
  bk_call = 0,       // expected call bookings
  bk_bc = 0,         // expected best case bookings
  bk_pp = 0,         // expected pipeline bookings
  cnc_prorated = 0,  // C&C expected revenue, prorated by weeks remaining
  callIncludesBestCase = false,
}) {
  const bk_bc_in_call = callIncludesBestCase ? bk_bc * 0.5 : 0
  const fc_worst_case = closed + bk_wc + cnc_prorated
  const fc_call       = fc_worst_case + bk_call + bk_bc_in_call
  const fc_best_case  = fc_call + (bk_bc - bk_bc_in_call)
  const fc_full       = fc_best_case + bk_pp
  return { fc_worst_case, fc_call, fc_best_case, fc_full, bk_bc_in_call }
}

// ── Effective FC resolver (override-aware) ─────────────────────
// Resolves whether to use model output or a submitted override for each tier.
// overrides: { worst_case: number|null, call: number|null, best_case: number|null }
export function getEffectiveFc(derived, overrides) {
  const ov = overrides || {}
  const wc = (ov.worst_case && ov.worst_case > 0) ? ov.worst_case : null
  const cl = (ov.call       && ov.call       > 0) ? ov.call       : null
  const bc = (ov.best_case  && ov.best_case  > 0) ? ov.best_case  : null
  return {
    fc_worst_case: wc ?? (derived.fc_worst_case || 0),
    fc_call:       cl ?? (derived.fc_call       || 0),
    fc_best_case:  bc ?? (derived.fc_best_case  || 0),
    overrideActive: {
      worst_case: wc !== null,
      call:       cl !== null,
      best_case:  bc !== null,
    },
    anyOverrideActive: wc !== null || cl !== null || bc !== null,
  }
}

// Quota bar segment widths — order: Closed | C&C | Worst Case | Call | Best Case
export function calcQbarWidths({ quota, closed, bk_wc, bk_call, cnc_prorated, bk_bc }) {
  if (!quota || quota <= 0) return { wC:0, wBkWc:0, wBkCall:0, wCnc:0, wBkBc:0 }
  const c = (v, rem) => Math.max(0, Math.min(rem, (v / quota) * 100))
  const wC      = c(closed,        100)
  const wCnc    = c(cnc_prorated,  100 - wC)
  const wBkWc   = c(bk_wc,         100 - wC - wCnc)
  const wBkCall = c(bk_call,        100 - wC - wCnc - wBkWc)
  const wBkBc   = c(bk_bc,          100 - wC - wCnc - wBkWc - wBkCall)
  return { wC, wBkWc, wBkCall, wCnc, wBkBc }
}
