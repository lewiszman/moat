import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const DEFAULT_CAT_MAP = {
  worst_case: ['Worst Case', 'Commit'],
  call:       ['Call', 'Probable', 'Forecast'],
  best_case:  ['Best Case', 'Upside'],
  pipeline:   ['Pipeline'],
  closed:     ['Closed Won', 'Closed'],
  omitted:    ['Omitted'],
}

export const DEFAULT_VOCAB = {
  worst_case: 'Worst Case',
  call:       'Call',
  best_case:  'Best Case',
  pipeline:   'Pipeline',
  closed:     'Closed',
  omitted:    'Omitted',
}

export const useVocabStore = create(
  persist(
    (set) => ({
      vocab: { ...DEFAULT_VOCAB },
      setVocabLabel: (key, label) => set(s => ({
        vocab: { ...s.vocab, [key]: label.trim() || DEFAULT_VOCAB[key] }
      })),
      resetVocab: () => set({ vocab: { ...DEFAULT_VOCAB } }),
    }),
    { name: 'moat-vocab', storage: createJSONStorage(() => localStorage) }
  )
)

export function getVocab() {
  return useVocabStore.getState().vocab
}

export function useVocab(key) {
  return useVocabStore(s => s.vocab[key] ?? DEFAULT_VOCAB[key] ?? key)
}

// ── Category map store ─────────────────────────────────────────
// Maps internal category keys → arrays of raw CSV values.
export const useCatMapStore = create(
  persist(
    (set) => ({
      catMap: { ...DEFAULT_CAT_MAP },
      setCatMap:   (key, values) => set(s => ({ catMap: { ...s.catMap, [key]: values } })),
      resetCatMap: ()            => set({ catMap: { ...DEFAULT_CAT_MAP } }),
    }),
    { name: 'moat-cat-map', storage: createJSONStorage(() => localStorage) }
  )
)

export function getCatMap() {
  return useCatMapStore.getState().catMap
}
