import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

const DEFAULT_CHANNELS = {
  sdr_inbound: {
    label:               'SDR Inbound',
    enabled:             true,
    allocation:          40,
    asp:                 20000,
    win_rate:            20,
    activity_to_meeting: 15,   // activities needed to book 1 meeting
    meeting_to_opp:      30,
    opp_to_saa:          60,
    headcount:           2,
  },
  sdr_outbound: {
    label:               'SDR Outbound',
    enabled:             true,
    allocation:          40,
    asp:                 22000,
    win_rate:            18,
    activity_to_meeting: 20,   // activities needed to book 1 meeting
    meeting_to_opp:      25,
    opp_to_saa:          55,
    headcount:           2,
  },
  ae_outbound: {
    label:               'AE Outbound',
    enabled:             true,
    allocation:          20,
    asp:                 28000,
    win_rate:            25,
    activity_to_meeting: 10,   // activities needed to book 1 meeting
    meeting_to_opp:      40,
    opp_to_saa:          65,
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
      name:    'moat-coverage-v3',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        channels:    s.channels,
        gapOverride: s.gapOverride,
      }),
    }
  )
)
