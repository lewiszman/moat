import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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
