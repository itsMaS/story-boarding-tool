import { create } from 'zustand';

export interface AiCall {
  id: number;
  provider: string;
  model: string;
  latencyMs: number;
  costUsd: number;
  ok: boolean;
  at: number;
}

interface AiState {
  calls: AiCall[];
  record: (call: Omit<AiCall, 'id' | 'at'>) => void;
  sessionCost: () => number;
}

let counter = 0;

/** Session-only log of AI calls for the cost and latency display. */
export const useAiStore = create<AiState>()((set, get) => ({
  calls: [],
  record: (call) => set((s) => ({ calls: [...s.calls, { ...call, id: ++counter, at: Date.now() }].slice(-200) })),
  sessionCost: () => get().calls.filter((c) => c.ok).reduce((sum, c) => sum + c.costUsd, 0),
}));
