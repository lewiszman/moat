import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

const DEFAULT_CHANNELS = {
  sdr_inbound: {
    label:                 'SDR Inbound',
    enabled:               true,
    allocation:            40,
    asp:                   20000,
    win_rate:              20,
    activity_to_connect:   20,
    connect_to_meeting:    40,
    meeting_to_opp:        30,
    headcount:             2,
  },
  sdr_outbound: {
    label:                 'SDR Outbound',
    enabled:               true,
    allocation:            40,
    asp:                   22000,
    win_rate:              18,
    activity_to_connect:   15,
    connect_to_meeting:    35,
    meeting_to_opp:        25,
    headcount:             2,
  },
  ae_outbound: {
    label:                 'AE Outbound',
    enabled:               true,
    allocation:            20,
    asp:                   28000,
    win_rate:              25,
    activity_to_connect:   25,
    connect_to_meeting:    50,
    meeting_to_opp:        40,
    headcount:             4,
  },
}

export const useCoverageStore = create(
  persist(
    immer((set) => ({
      channels: structuredClone(DEFAULT_CHANNELS),

      setChannelField: (channelKey, field, value) =>
        set(s => { s.channels[channelKey][field] = value }),

      toggleChannel: (channelKey) =>
        set(s => { s.channels[channelKey].enabled = !s.channels[channelKey].enabled }),

      resetChannel: (channelKey) =>
        set(s => { s.channels[channelKey] = structuredClone(DEFAULT_CHANNELS[channelKey]) }),

      resetAllChannels: () =>
        set(s => { s.channels = structuredClone(DEFAULT_CHANNELS) }),
    })),
    {
      name:    'moat-coverage-v1',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
