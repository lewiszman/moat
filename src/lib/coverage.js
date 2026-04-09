// ── Coverage Model Arithmetic ──────────────────────────────────
// Pure functions — no side effects, no imports.

/**
 * Model a single channel's pipeline and activity requirements.
 *
 * @param {object} channel   Channel config from coverageStore
 * @param {number} channelGap  Dollar gap allocated to this channel
 * @param {number} weeksRemaining  Selling weeks left in the quarter
 * @returns {object}
 */
export function calcChannelModel(channel, channelGap, weeksRemaining) {
  const safeDiv = (n, d) => (d > 0 ? n / d : 0)
  const wks = Math.max(1, weeksRemaining)

  // Activity → Meeting → Opp → SAA (qualified opp) → Pipeline
  const pipeline_needed   = safeDiv(channelGap, channel.win_rate / 100)
  const saas_needed       = safeDiv(pipeline_needed, channel.asp)
  const opps_needed       = safeDiv(saas_needed, channel.opp_to_saa / 100)
  const meetings_needed   = safeDiv(opps_needed, channel.meeting_to_opp / 100)
  // activity_to_meeting is a ratio (1/activitiesPerMeeting), e.g. 0.002 = 1/500
  // activities = meetings / ratio  →  meetings / 0.002 = meetings × 500
  const activities_needed = channel.activity_to_meeting > 0
    ? meetings_needed / channel.activity_to_meeting
    : 0

  // Per-AE breakdown (headcount-adjusted)
  const hc                         = Math.max(1, channel.headcount || 1)
  const activities_per_ae          = activities_needed / hc
  const activities_per_ae_per_week = activities_per_ae / wks

  return {
    channelGap,
    pipeline_needed,
    saas_needed:              Math.round(saas_needed),
    opps_needed:              Math.round(opps_needed),
    meetings_needed:          Math.round(meetings_needed),
    activities_needed:        Math.round(activities_needed),
    activities_per_ae:        Math.round(activities_per_ae),

    pipeline_per_week:            pipeline_needed / wks,
    saas_per_week:                saas_needed / wks,
    opps_per_week:                opps_needed / wks,
    meetings_per_week:            meetings_needed / wks,
    activities_per_week:          activities_needed / wks,
    activities_per_ae_per_week,
  }
}

/**
 * Model all enabled channels for a given gap and weeks remaining.
 *
 * @param {object} channels      Channel map from coverageStore
 * @param {number} quota         Manager quota
 * @param {number} fc_call       Call-level forecast
 * @param {number} weeksRemaining  Selling weeks left
 * @returns {object}
 */
export function calcCoverageModel(channels, quota, fc_call, weeksRemaining, gapOverride = null) {
  const rawGap = Math.max(0, quota - fc_call)
  const gap = gapOverride !== null ? Math.max(0, gapOverride) : rawGap

  // Both channels (ae, sdr) are always active — no enabled filter needed
  const enabledKeys = Object.keys(channels)
  const totalAllocation = enabledKeys.reduce((s, k) => s + channels[k].allocation, 0)
  const allocationValid = totalAllocation === 100

  const channelResults = {}
  let totalPipelineNeeded    = 0
  let totalActivitiesNeeded  = 0
  let totalPipelinePerWeek   = 0
  let totalActivitiesPerWeek = 0

  enabledKeys.forEach(k => {
    const ch = channels[k]
    const channelGap = gap * (ch.allocation / 100)
    const model = calcChannelModel(ch, channelGap, weeksRemaining)
    channelResults[k] = model
    totalPipelineNeeded    += model.pipeline_needed
    totalActivitiesNeeded  += model.activities_needed
    totalPipelinePerWeek   += model.pipeline_per_week
    totalActivitiesPerWeek += model.activities_per_week
  })

  return {
    gap,
    rawGap,
    totalPipelineNeeded,
    totalActivitiesNeeded:  Math.round(totalActivitiesNeeded),
    totalPipelinePerWeek,
    totalActivitiesPerWeek: Math.round(totalActivitiesPerWeek),
    channels: channelResults,
    allocationValid,
    totalAllocation,
  }
}
