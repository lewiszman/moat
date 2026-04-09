import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

// activity_to_meeting stored as a ratio (1/activitiesPerMeeting).
// e.g. 500 activities per meeting → stored as 0.002 = 1/500.
// Display in UI: Math.round(1 / activity_to_meeting) → 500.
// Convert on write: 1 / displayValue → 0.002.

const DEFAULT_CHANNELS = {
  sdr: {
    label:               'SDR',
    enabled:             true,
    allocation:          50,
    asp:                 20000,
    win_rate:            18,
    activity_to_meeting: 0.002,   // ratio: 1/500 (500 activities per meeting)
    meeting_to_opp:      100,
    opp_to_saa:          50,
    headcount:           2,
  },
  ae: {
    label:               'AE',
    enabled:             true,
    allocation:          50,
    asp:                 28000,
    win_rate:            25,
    activity_to_meeting: 0.002,   // ratio: 1/500 (500 activities per meeting)
    meeting_to_opp:      100,
    opp_to_saa:          50,
    headcount:           4,
  },
}

export const useCoverageStore = create(
  persist(
    immer((set) => ({
      channels:    structuredClone(DEFAULT_CHANNELS),
      gapOverride: null,   // number | null — null means use auto (quota - fc_call)

      setChannelField: (channelKey, field, value) =>
        set(s => { s.channels[channelKey][field] = value }),

      toggleChannel: (channelKey) =>
        set(s => { s.channels[channelKey].enabled = !s.channels[channelKey].enabled }),

      resetChannel: (channelKey) =>
        set(s => { s.channels[channelKey] = structuredClone(DEFAULT_CHANNELS[channelKey]) }),

      resetAllChannels: () =>
        set(s => { s.channels = structuredClone(DEFAULT_CHANNELS) }),

      setGapOverride: (value) =>
        set(s => { s.gapOverride = (value !== null && value > 0) ? value : null }),

      clearGapOverride: () =>
        set(s => { s.gapOverride = null }),
    })),
    {
      name:    'moat-coverage-v4',   // bumped to force fresh two-channel defaults
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        channels:    s.channels,
        gapOverride: s.gapOverride,
      }),
    }
  )
)
