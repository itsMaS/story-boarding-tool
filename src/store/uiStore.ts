import { create } from 'zustand';

export type Tool = 'pen' | 'eraser' | 'select';
export type View = 'edit' | 'overview' | 'play';
export type Dialog = 'none' | 'export' | 'settings' | 'ai' | 'sounds' | 'projects' | 'shortcuts';

export interface UiState {
  view: View;
  currentSlideId: string | null;
  tool: Tool;
  color: string;
  size: number;
  eraserSize: number;
  opacity: number;
  selectedIds: string[];
  onionSkin: boolean;
  dialog: Dialog;
  /** Recently used colours, most recent first. */
  palette: string[];
  toast: { id: number; text: string; kind: 'info' | 'error' } | null;

  setView: (v: View) => void;
  setCurrentSlide: (id: string | null) => void;
  setTool: (t: Tool) => void;
  setColor: (c: string) => void;
  setSize: (n: number) => void;
  setEraserSize: (n: number) => void;
  setOpacity: (n: number) => void;
  setSelection: (ids: string[]) => void;
  toggleOnionSkin: () => void;
  openDialog: (d: Dialog) => void;
  closeDialog: () => void;
  showToast: (text: string, kind?: 'info' | 'error') => void;
}

const DEFAULT_PALETTE = ['#1a1a1a', '#ffffff', '#e5484d', '#f5a524', '#f7d154', '#30a46c', '#0090ff', '#8e4ec6', '#a0a0a0'];

let toastCounter = 0;

export const useUiStore = create<UiState>()((set) => ({
  view: 'edit',
  currentSlideId: null,
  tool: 'pen',
  color: '#1a1a1a',
  size: 6,
  eraserSize: 30,
  opacity: 1,
  selectedIds: [],
  onionSkin: false,
  dialog: 'none',
  palette: DEFAULT_PALETTE,
  toast: null,

  setView: (view) => set({ view, selectedIds: [] }),
  setCurrentSlide: (currentSlideId) => set({ currentSlideId, selectedIds: [] }),
  setTool: (tool) => set((s) => ({ tool, selectedIds: tool === 'select' ? s.selectedIds : [] })),
  setColor: (color) =>
    set((s) => ({ color, palette: [color, ...s.palette.filter((c) => c !== color)].slice(0, 12) })),
  setSize: (size) => set({ size: Math.max(1, Math.min(200, size)) }),
  setEraserSize: (eraserSize) => set({ eraserSize: Math.max(2, Math.min(400, eraserSize)) }),
  setOpacity: (opacity) => set({ opacity: Math.max(0.05, Math.min(1, opacity)) }),
  setSelection: (selectedIds) => set({ selectedIds }),
  toggleOnionSkin: () => set((s) => ({ onionSkin: !s.onionSkin })),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: 'none' }),
  showToast: (text, kind = 'info') => {
    const id = ++toastCounter;
    set({ toast: { id, text, kind } });
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), kind === 'error' ? 6000 : 3000);
  },
}));
