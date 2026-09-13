import { create } from 'zustand';
import type { Position } from '../types';

export interface DraggingCardState {
  cardId: string;
  position: Position;
}

interface DragState {
  // Aktuell gezogene Karte (Live-Position für Verbindungslinien)
  draggingCard: DraggingCardState | null;

  setDraggingCard: (cardId: string, position: Position) => void;
  updateDraggingPosition: (position: Position) => void;
  clearDraggingCard: () => void;
}

/**
 * Eigener, sehr kleiner Store für den Zieh-Zustand.
 * Bewusst getrennt vom Karten-Store: Beim Ziehen wird pro Frame aktualisiert –
 * so rendern nur die Komponenten neu, die die Live-Position wirklich brauchen
 * (Verbindungslinien), nicht alle Karten.
 */
export const useDragStore = create<DragState>((set, get) => ({
  draggingCard: null,

  setDraggingCard: (cardId: string, position: Position) => {
    set({ draggingCard: { cardId, position } });
  },

  updateDraggingPosition: (position: Position) => {
    const { draggingCard } = get();
    if (draggingCard) {
      set({ draggingCard: { ...draggingCard, position } });
    }
  },

  clearDraggingCard: () => {
    set({ draggingCard: null });
  },
}));
