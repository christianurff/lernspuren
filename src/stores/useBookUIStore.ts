import { create } from 'zustand';

// UI-Zustand des Buch-Editors (nicht persistiert)
export type BookTool = 'select' | 'pen';
export type BookPanel = null | 'add' | 'inspector' | 'pages' | 'export';
export type BookCapture = null | 'photo' | 'gallery' | 'video' | 'audio' | 'import';

interface BookUIState {
  tool: BookTool;
  // Drawing-Item, das gerade mit dem Stift nachbearbeitet wird (undefined = neue Zeichnung)
  editingDrawingId: string | null;
  panel: BookPanel;
  capture: BookCapture;
  // Zählt jedes Öffnen mit: So löst auch das erneute Wählen derselben Quelle
  // (z. B. Kamera nach abgebrochenem Dateidialog) wieder eine Aktion aus.
  captureNonce: number;
  isReading: boolean; // Präsentationsmodus
  // Bild-Element, das gerade zugeschnitten wird
  croppingItemId: string | null;

  setTool: (tool: BookTool) => void;
  startPen: (drawingId?: string) => void;
  stopPen: () => void;
  openPanel: (panel: BookPanel) => void;
  togglePanel: (panel: Exclude<BookPanel, null>) => void;
  closePanel: () => void;
  setCapture: (capture: BookCapture) => void;
  startReading: () => void;
  stopReading: () => void;
  startCrop: (itemId: string) => void;
  stopCrop: () => void;
  reset: () => void;
}

export const useBookUIStore = create<BookUIState>((set, get) => ({
  tool: 'select',
  editingDrawingId: null,
  panel: null,
  capture: null,
  captureNonce: 0,
  isReading: false,
  croppingItemId: null,

  setTool: (tool) => set({ tool }),
  startPen: (drawingId) => set({ tool: 'pen', editingDrawingId: drawingId ?? null, panel: null }),
  stopPen: () => set({ tool: 'select', editingDrawingId: null }),
  openPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set({ panel: get().panel === panel ? null : panel }),
  closePanel: () => set({ panel: null }),
  setCapture: (capture) => set((state) => ({ capture, panel: null, captureNonce: state.captureNonce + 1 })),
  startReading: () => set({ isReading: true, panel: null, tool: 'select', editingDrawingId: null }),
  stopReading: () => set({ isReading: false }),
  startCrop: (itemId) => set({ croppingItemId: itemId, panel: null }),
  stopCrop: () => set({ croppingItemId: null }),
  reset: () =>
    set({ tool: 'select', editingDrawingId: null, panel: null, capture: null, isReading: false, croppingItemId: null }),
}));
