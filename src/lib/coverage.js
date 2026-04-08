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

  const pipeline_needed   = safeDiv(channelGap, channel.win_rate / 100)
  const opps_needed       = safeDiv(pipeline_needed, channel.asp)
  const meetings_needed   = safeDiv(opps_needed, channel.meeting_to_opp / 100)
  const connects_needed   = safeDiv(meetings_needed, channel.connect_to_meeting / 100)
  const activities_needed = safeDiv(connects_needed, channel.activity_to_connect / 100)

  return {
    channelGap,
    pipeline_needed,
    opps_needed:       Math.round(opps_needed),
    meetings_needed:   Math.round(meetings_needed),
    connects_needed:   Math.round(connects_needed),
    activities_needed: Math.round(activities_needed),

    pipeline_per_week:    pipeline_needed / wks,
    opps_per_week:        opps_needed / wks,
    meetings_per_week:    meetings_needed / wks,
    connects_per_week:    connects_needed / wks,
    activities_per_week:  activities_needed / wks,
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
export function calcCoverageModel(channels, quota, fc_call, weeksRemaining) {
  const rawGap = Math.max(0, quota - fc_call)
  // Use quota as a floor so the model always shows meaningful activity targets
  const gap = rawGap > 0 ? rawGap : 0

  const enabledKeys = Object.keys(channels).filter(k => channels[k].enabled)
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
