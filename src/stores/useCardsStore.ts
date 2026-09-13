import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { blobToDataUrl } from '../utils/mediaFormats';
import type { Card, CardLayout, CardSize, Position, PhotoCard, TextCard, VideoCard, AudioCard, DrawingCard, TaskCard, ChecklistItem } from '../types';
import { CARD_SIZES } from '../types';
import { cardService, groupService } from '../services/db/database';
import { logCanvasEvent } from '../services/canvasEvents';
import { useZonesStore } from './useZonesStore';
import { useProjectStore } from './useProjectStore';
import { cardDimensions, freeTextFontSize, measureTextHeight, naturalSize } from '../utils/cardGeometry';

const STACK_THRESHOLD = 50; // pixels
// Laufende Nummer für loadCards: verhindert, dass eine langsame Antwort eines
// alten Projekts die Karten eines inzwischen geöffneten Projekts überschreibt.
let loadCardsRequestId = 0;
const GRID_GAP = 20; // pixels between cards in grid
const DUPLICATE_OFFSET = 24; // Versatz der Kopie beim Duplizieren

// Sorting types
export type SortCriteria = 'date-newest' | 'date-oldest' | 'type' | 'size' | 'label' | 'groups';
const CARD_TYPE_ORDER: Record<string, number> = {
  photo: 0,
  text: 1,
  video: 2,
  audio: 3,
  drawing: 4,
  task: 5,
};
const CARD_SIZE_ORDER: Record<string, number> = {
  small: 0,
  medium: 1,
  large: 2,
};

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

interface CardGroup {
  id: string;
  projectId: string;
  name?: string;
  cardIds: string[];
  color: string;
}

const GROUP_COLORS = [
  '#98D8C8', // Mint
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#DDA0DD', // Plum
  '#FFEAA7', // Yellow
  '#F7DC6F', // Gold
  '#FF6B6B', // Red
] as const;

export type InlineEditField = 'label' | 'content';

interface InlineEditState {
  cardId: string;
  field: InlineEditField;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface CardsState {
  cards: Card[];
  selectedCardId: string | null;
  selectedCardIds: string[]; // Multiple selection
  isMultiSelectMode: boolean;
  groups: CardGroup[];
  isLoading: boolean;
  currentSortCriteria: SortCriteria | null;
  inlineEdit: InlineEditState | null;
  lastLoadedProjectId: string | null; // Track which project was loaded
  // Hinweis: Der Zieh-Zustand liegt in useDragStore (rendert beim Ziehen nicht alle Karten neu)

  // Actions
  loadCards: (projectId: string, force?: boolean) => Promise<void>;
  loadGroups: (projectId: string) => Promise<void>;
  addPhotoCard: (projectId: string, imageData: string, thumbnailData?: string) => Promise<Card>;
  addTextCard: (projectId: string, content?: string, position?: Position) => Promise<Card>;
  addVideoCard: (projectId: string, videoData: string | Blob, thumbnailData?: string, duration?: number, mimeType?: string) => Promise<Card>;
  addAudioCard: (projectId: string, audioData: string | Blob, duration?: number, mimeType?: string) => Promise<Card>;
  addDrawingCard: (projectId: string, imageData: string, drawingData: string) => Promise<Card>;
  addTaskCard: (projectId: string, taskText: string, hints?: string[], checklist?: ChecklistItem[]) => Promise<Card>;
  toggleChecklistItem: (cardId: string, itemId: string) => Promise<void>;
  updateCard: (id: string, changes: Partial<Card>) => Promise<void>;
  duplicateCard: (id: string) => Promise<Card | null>;
  deleteCard: (id: string) => Promise<void>;
  setSelectedCard: (id: string | null) => void;

  // Position & Z-Index
  updatePosition: (id: string, position: Position) => Promise<void>;
  bringToFront: (id: string) => Promise<void>;

  // Size
  changeSize: (id: string, size: CardSize) => Promise<void>;

  // Compact mode
  toggleCardCompact: (id: string) => Promise<void>;

  // Darstellungsmodus des Whiteboards
  setCardLayout: (projectId: string, layout: CardLayout) => Promise<void>;
  applyFreeLayout: (projectId: string) => Promise<void>;

  // Stack Management
  // Liefert die tatsächliche Endposition der Karte zurück (Stapelposition, wenn
  // gestapelt wurde, sonst die Drop-Position); null, wenn die Karte fehlt.
  checkAndCreateStack: (cardId: string, dropPosition: Position) => Promise<Position | null>;
  removeFromStack: (cardId: string) => Promise<void>;

  // Arrangement
  stackAllCards: () => Promise<BoundingBox | null>;
  // viewportWidth begrenzt optional die Spaltenzahl; ohne Angabe quadratisches Raster
  arrangeInGrid: (viewportWidth?: number, viewportHeight?: number) => Promise<BoundingBox | null>;

  // Multi-selection
  toggleMultiSelectMode: () => void;
  toggleCardSelection: (cardId: string) => void;
  selectAllCards: () => void;
  clearSelection: () => void;

  // Grouping
  createGroup: (projectId: string, name?: string) => Promise<string | null>;
  createEmptyGroup: (projectId: string, name?: string, color?: string) => Promise<CardGroup>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  addCardToGroup: (groupId: string, cardId: string) => Promise<void>;
  removeCardFromGroup: (groupId: string, cardId: string) => Promise<void>;
  ungroupCards: (groupId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  moveGroup: (groupId: string, delta: Position) => Promise<void>;
  moveGroupedCard: (cardId: string, newPosition: Position) => Promise<void>;
  selectGroupCards: (groupId: string) => void;
  getGroupByCardId: (cardId: string) => CardGroup | undefined;
  getGroupsByCardId: (cardId: string) => CardGroup[];
  getGroupById: (groupId: string) => CardGroup | undefined;
  getAllGroups: () => CardGroup[];
  arrangeByGroups: (viewportWidth: number, viewportHeight: number) => Promise<BoundingBox | null>;

  // Sorting
  sortAndArrangeCards: (criteria: SortCriteria, viewportWidth: number, viewportHeight: number) => Promise<BoundingBox | null>;
  clearSort: () => void;

  // Inline Editing
  startInlineEdit: (cardId: string, field: InlineEditField, position: { x: number; y: number }, size: { width: number; height: number }) => void;
  endInlineEdit: () => void;
  saveInlineEdit: (value: string) => Promise<void>;

  // Helpers
  getCardById: (id: string) => Card | undefined;
  getSortedCards: () => Card[];
  getBoundingBox: () => BoundingBox | null;
}

type CardUpdate = { id: string; changes: Partial<Card> };
type CardsSet = (updater: (state: CardsState) => Partial<CardsState>) => void;

// zIndex-Basis für Anordnungs-Aktionen: eins über dem höchsten zIndex der Karten,
// die nicht neu angeordnet werden (sonst kollidieren die neuen Werte).
function baseZIndexFor(cards: Card[], keptCardIds: Set<string>): number {
  const kept = cards.filter((c) => keptCardIds.has(c.id));
  if (kept.length === 0) return 0;
  return Math.max(...kept.map((c) => c.zIndex)) + 1;
}

/**
 * Maße einer Karte für die Anordnungs-Aktionen. Die kompakte Ansicht bleibt
 * hier bewusst außen vor: Anordnen und Bounding-Box haben schon immer mit den
 * vollen Maßen gerechnet, damit die Abstände beim Zurückschalten stimmen.
 */
function dimensionsOf(card: Card): { width: number; height: number } {
  const project = useProjectStore.getState().projects.find((p) => p.id === card.projectId);
  return cardDimensions(card, { freeLayout: project?.cardLayout === 'free', compact: false });
}

/** Seitenverhältnis (Breite/Höhe) des Mediums einer Karte; null, wenn es keins gibt. */
async function mediaAspect(card: Card): Promise<number | null> {
  const source =
    card.type === 'photo' ? card.imageData
    : card.type === 'drawing' ? card.imageData
    : card.type === 'video' ? card.thumbnailData
    : undefined;
  if (!source) return null;

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve(image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : null);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

/** Wie Promise.all, aber höchstens `limit` Aufgaben gleichzeitig (große Boards). */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Freie Startmaße einer Karte (Bildmaße werden dafür einmalig gelesen). */
async function freeSizeFor(card: Card): Promise<{ width: number; height: number }> {
  return naturalSize(card, await mediaAspect(card), CARD_SIZES[card.size].width);
}

/**
 * Setzt die freien Maße einer frisch angelegten Karte, wenn das Projekt im
 * freien Modus ist. Wird vor `cardService.create` aufgerufen, damit die Karte
 * gleich vollständig in der Datenbank landet.
 */
async function applyFreeSizeIfNeeded(card: Card): Promise<void> {
  const project = useProjectStore.getState().projects.find((p) => p.id === card.projectId);
  if (project?.cardLayout !== 'free') return;
  card.freeSize = await freeSizeFor(card);
}

// Alle Änderungen in einer Transaktion schreiben und den State über eine Map
// anwenden (statt n Einzelschreibvorgängen und O(n²)-Suche).
async function applyCardUpdates(
  set: CardsSet,
  updates: CardUpdate[],
  extra: Partial<CardsState> = {}
): Promise<void> {
  await cardService.bulkUpdate(updates);
  const changesById = new Map(updates.map((u) => [u.id, u.changes]));
  const updatedAt = Date.now();
  set((state) => ({
    ...extra,
    cards: state.cards.map((card) => {
      const changes = changesById.get(card.id);
      return changes ? ({ ...card, ...changes, updatedAt } as Card) : card;
    }),
  }));
}

export const useCardsStore = create<CardsState>((set, get) => ({
  cards: [],
  selectedCardId: null,
  selectedCardIds: [],
  isMultiSelectMode: false,
  groups: [],
  inlineEdit: null,
  isLoading: false,
  currentSortCriteria: null,
  lastLoadedProjectId: null,

  loadCards: async (projectId: string, force = false) => {
    const { lastLoadedProjectId } = get();

    // Skip if already loaded for this project (unless forced)
    if (!force && lastLoadedProjectId === projectId) {
      return;
    }

    const requestId = ++loadCardsRequestId;
    set({ isLoading: true });
    try {
      const cards = await cardService.getAllByProject(projectId);
      // Zwischenzeitlich wurde ein anderes Projekt geladen – Ergebnis verwerfen
      if (requestId !== loadCardsRequestId) return;
      set({ cards, isLoading: false, lastLoadedProjectId: projectId });
    } catch (error) {
      console.error('Failed to load cards:', error);
      if (requestId === loadCardsRequestId) set({ isLoading: false });
    }
  },

  loadGroups: async (projectId: string) => {
    try {
      const persistedGroups = await groupService.getAllByProject(projectId);
      // Convert PersistedCardGroup to CardGroup (they have the same structure)
      const groups: CardGroup[] = persistedGroups.map(g => ({
        id: g.id,
        projectId: g.projectId,
        name: g.name,
        cardIds: g.cardIds,
        color: g.color,
      }));
      set((state) => {
        // Keep groups from other projects, replace groups for this project
        const otherGroups = state.groups.filter(g => g.projectId !== projectId);
        return { groups: [...otherGroups, ...groups] };
      });
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  },

  addPhotoCard: async (projectId: string, imageData: string, thumbnailData?: string) => {
    const maxZIndex = Math.max(0, ...get().cards.map((c) => c.zIndex));
    const now = Date.now();

    const card: PhotoCard = {
      id: uuid(),
      projectId,
      type: 'photo',
      size: 'medium',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      zIndex: maxZIndex + 1,
      imageData,
      thumbnailData,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await applyFreeSizeIfNeeded(card);
      await cardService.create(card);
      logCanvasEvent(projectId, 'createCard', card.id, undefined, card.position);
      set((state) => ({ cards: [...state.cards, card] }));
      return card;
    } catch (error) {
      console.error('Failed to add photo card:', error);
      throw error;
    }
  },

  addTextCard: async (projectId: string, content = '', position?: Position) => {
    const maxZIndex = Math.max(0, ...get().cards.map((c) => c.zIndex));
    const now = Date.now();

    const card: TextCard = {
      id: uuid(),
      projectId,
      type: 'text',
      size: 'medium',
      position: position ?? { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      zIndex: maxZIndex + 1,
      content,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await applyFreeSizeIfNeeded(card);
      await cardService.create(card);
      logCanvasEvent(projectId, 'createCard', card.id, undefined, card.position);
      set((state) => ({ cards: [...state.cards, card] }));
      return card;
    } catch (error) {
      console.error('Failed to add text card:', error);
      throw error;
    }
  },

  addVideoCard: async (projectId: string, videoData: string | Blob, thumbnailData?: string, duration?: number, mimeType?: string) => {
    const maxZIndex = Math.max(0, ...get().cards.map((c) => c.zIndex));
    const now = Date.now();

    // Blob → Data-URL mit reinem Basistyp (Codec-Kommas würden die Data-URL zerlegen)
    const storedData = typeof videoData === 'string' ? videoData : await blobToDataUrl(videoData, 'video/mp4');

    const card: VideoCard = {
      id: uuid(),
      projectId,
      type: 'video',
      size: 'medium',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      zIndex: maxZIndex + 1,
      videoData: storedData,
      thumbnailData,
      duration,
      mimeType,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await applyFreeSizeIfNeeded(card);
      await cardService.create(card);
      logCanvasEvent(projectId, 'createCard', card.id, undefined, card.position);
      set((state) => ({ cards: [...state.cards, card] }));
      return card;
    } catch (error) {
      console.error('Failed to add video card:', error);
      throw error;
    }
  },

  addAudioCard: async (projectId: string, audioData: string | Blob, duration?: number, mimeType?: string) => {
    const maxZIndex = Math.max(0, ...get().cards.map((c) => c.zIndex));
    const now = Date.now();

    // Blob → Data-URL mit reinem Basistyp (Codec-Kommas würden die Data-URL zerlegen)
    const storedData = typeof audioData === 'string' ? audioData : await blobToDataUrl(audioData, 'audio/mp4');

    const card: AudioCard = {
      id: uuid(),
      projectId,
      type: 'audio',
      size: 'medium',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      zIndex: maxZIndex + 1,
      audioData: storedData,
      duration,
      mimeType,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await applyFreeSizeIfNeeded(card);
      await cardService.create(card);
      logCanvasEvent(projectId, 'createCard', card.id, undefined, card.position);
      set((state) => ({ cards: [...state.cards, card] }));
      return card;
    } catch (error) {
      console.error('Failed to add audio card:', error);
      throw error;
    }
  },

  addDrawingCard: async (projectId: string, imageData: string, drawingData: string) => {
    const maxZIndex = Math.max(0, ...get().cards.map((c) => c.zIndex));
    const now = Date.now();

    const card: DrawingCard = {
      id: uuid(),
      projectId,
      type: 'drawing',
      size: 'medium',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      zIndex: maxZIndex + 1,
      imageData,
      drawingData,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await applyFreeSizeIfNeeded(card);
      await cardService.create(card);
      logCanvasEvent(projectId, 'createCard', card.id, undefined, card.position);
      set((state) => ({ cards: [...state.cards, card] }));
      return card;
    } catch (error) {
      console.error('Failed to add drawing card:', error);
      throw error;
    }
  },

  addTaskCard: async (projectId: string, taskText: string, hints: string[] = [], checklist: ChecklistItem[] = []) => {
    const maxZIndex = Math.max(0, ...get().cards.map((c) => c.zIndex));
    const now = Date.now();

    const card: TaskCard = {
      id: uuid(),
      projectId,
      type: 'task',
      size: 'medium',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      zIndex: maxZIndex + 1,
      taskText,
      hints,
      checklist,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await applyFreeSizeIfNeeded(card);
      await cardService.create(card);
      logCanvasEvent(projectId, 'createCard', card.id, undefined, card.position);
      set((state) => ({ cards: [...state.cards, card] }));
      return card;
    } catch (error) {
      console.error('Failed to add task card:', error);
      throw error;
    }
  },

  toggleChecklistItem: async (cardId: string, itemId: string) => {
    const card = get().cards.find((c) => c.id === cardId);
    if (!card || card.type !== 'task') return;

    const checklist = card.checklist.map((item) =>
      item.id === itemId ? { ...item, isChecked: !item.isChecked } : item
    );
    await get().updateCard(cardId, { checklist });
  },

  updateCard: async (id: string, changes: Partial<Card>) => {
    const card = get().cards.find((c) => c.id === id);
    let finalChanges = changes;

    // Freie Textkarten: die Höhe ist immer gemessen, nie gezogen. Sie kann sich
    // nur beim Ziehen am Griff oder beim Ändern des Inhalts ändern – hier der
    // zweite Fall (Text-Editor und Inline-Bearbeitung laufen beide hierüber).
    const nextContent = (changes as Partial<TextCard>).content;
    if (
      card?.type === 'text' &&
      typeof nextContent === 'string' &&
      card.freeSize &&
      !changes.freeSize
    ) {
      const width = card.freeSize.width;
      const height = measureTextHeight(nextContent, width, freeTextFontSize(width));
      finalChanges = { ...changes, freeSize: { width, height } };
    }

    try {
      await cardService.update(id, finalChanges);
      set((state) => ({
        cards: state.cards.map((c) =>
          c.id === id ? { ...c, ...finalChanges, updatedAt: Date.now() } as Card : c
        ),
      }));
    } catch (error) {
      console.error('Failed to update card:', error);
      throw error;
    }
  },

  // Kopie der Karte leicht versetzt daneben (wie "Duplizieren" im Buch-Modus)
  duplicateCard: async (id: string) => {
    const source = get().cards.find((c) => c.id === id);
    if (!source) return null;

    const maxZIndex = Math.max(0, ...get().cards.map((c) => c.zIndex));
    const now = Date.now();
    const copy = {
      ...source,
      id: uuid(),
      position: {
        x: source.position.x + DUPLICATE_OFFSET,
        y: source.position.y + DUPLICATE_OFFSET,
      },
      zIndex: maxZIndex + 1,
      // Die Kopie steht frei: weder im Stapel noch im Papierkorb
      stackId: undefined,
      stackIndex: undefined,
      isDeleted: undefined,
      deletedAt: undefined,
      createdAt: now,
      updatedAt: now,
    } as Card;

    try {
      await cardService.create(copy);
      logCanvasEvent(copy.projectId, 'createCard', copy.id, undefined, copy.position);
      set((state) => ({ cards: [...state.cards, copy], selectedCardId: copy.id }));
      return copy;
    } catch (error) {
      console.error('Failed to duplicate card:', error);
      return null;
    }
  },

  deleteCard: async (id: string) => {
    try {
      const card = get().cards.find((c) => c.id === id);
      const { useHistoryStore } = await import('./useHistoryStore');

      // Soft-Delete: Karte wandert in den Papierkorb; Verbindungen bleiben
      // erhalten und tauchen beim Wiederherstellen automatisch wieder auf.
      await cardService.softDelete(id);
      set((state) => ({
        cards: state.cards.filter((c) => c.id !== id),
        selectedCardId: state.selectedCardId === id ? null : state.selectedCardId,
      }));

      if (card) {
        logCanvasEvent(card.projectId, 'deleteCard', card.id, card.position);
        useHistoryStore.getState().record({ type: 'deleteCard', card, connections: [] });
      }
    } catch (error) {
      console.error('Failed to delete card:', error);
      throw error;
    }
  },

  setSelectedCard: (id: string | null) => {
    set({ selectedCardId: id });
  },

  updatePosition: async (id: string, position: Position) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;

    try {
      await cardService.update(id, { position });
      set((state) => ({
        cards: state.cards.map((c) =>
          c.id === id ? { ...c, position, updatedAt: Date.now() } : c
        ),
      }));
    } catch (error) {
      console.error('Failed to update position:', error);
    }
  },

  bringToFront: async (id: string) => {
    const maxZIndex = Math.max(0, ...get().cards.map((c) => c.zIndex));
    const newZIndex = maxZIndex + 1;

    try {
      await cardService.update(id, { zIndex: newZIndex });
      set((state) => ({
        cards: state.cards.map((c) =>
          c.id === id ? { ...c, zIndex: newZIndex, updatedAt: Date.now() } : c
        ),
      }));
    } catch (error) {
      console.error('Failed to bring to front:', error);
    }
  },

  changeSize: async (id: string, size: CardSize) => {
    try {
      await cardService.update(id, { size });
      set((state) => ({
        cards: state.cards.map((c) =>
          c.id === id ? { ...c, size, updatedAt: Date.now() } : c
        ),
      }));
    } catch (error) {
      console.error('Failed to change size:', error);
    }
  },

  toggleCardCompact: async (id: string) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;

    const isCompact = !card.isCompact;
    try {
      await cardService.update(id, { isCompact });
      set((state) => ({
        cards: state.cards.map((c) =>
          c.id === id ? { ...c, isCompact, updatedAt: Date.now() } : c
        ),
      }));
    } catch (error) {
      console.error('Failed to toggle compact:', error);
    }
  },

  setCardLayout: async (projectId: string, layout: CardLayout) => {
    await useProjectStore.getState().updateProject(projectId, { cardLayout: layout });
    // Zurück auf 'square' löscht nichts: die freien Maße bleiben gespeichert
    if (layout === 'free') await get().applyFreeLayout(projectId);
  },

  applyFreeLayout: async (projectId: string) => {
    const pending = get().cards.filter(
      (c) => c.projectId === projectId && !c.isDeleted && !c.freeSize
    );
    if (pending.length === 0) return;

    const sizes = await mapLimited(pending, 8, freeSizeFor);
    await applyCardUpdates(
      set,
      pending.map((card, index) => ({ id: card.id, changes: { freeSize: sizes[index] } }))
    );
  },

  checkAndCreateStack: async (cardId: string, dropPosition: Position) => {
    const { cards, updateCard } = get();
    const droppedCard = cards.find((c) => c.id === cardId);
    if (!droppedCard) return null;

    // Find cards close enough to stack
    const nearbyCards = cards.filter((c) => {
      if (c.id === cardId) return false;
      const distance = Math.sqrt(
        Math.pow(c.position.x - dropPosition.x, 2) +
        Math.pow(c.position.y - dropPosition.y, 2)
      );
      return distance < STACK_THRESHOLD;
    });

    if (nearbyCards.length === 0) {
      // Remove from any existing stack – Position bleibt die Drop-Position
      if (droppedCard.stackId) {
        await updateCard(cardId, { stackId: undefined, stackIndex: undefined });
      }
      return dropPosition;
    }

    // Find or create stack
    const targetCard = nearbyCards[0];
    const stackId = targetCard.stackId || uuid();

    // Get all cards in the stack
    const stackCards = cards.filter(
      (c) => c.stackId === stackId || c.id === targetCard.id
    );
    const maxStackIndex = Math.max(0, ...stackCards.map((c) => c.stackIndex || 0));

    // Update target card if not in stack yet
    if (!targetCard.stackId) {
      await updateCard(targetCard.id, { stackId, stackIndex: 0 });
    }

    // Add dropped card to stack – nur hier wird die Position wirklich verändert
    const stackPosition = { ...targetCard.position };
    await updateCard(cardId, {
      stackId,
      stackIndex: maxStackIndex + 1,
      position: stackPosition,
    });

    return stackPosition;
  },

  removeFromStack: async (cardId: string) => {
    const { updateCard } = get();
    await updateCard(cardId, { stackId: undefined, stackIndex: undefined });
  },

  stackAllCards: async () => {
    const { cards, groups } = get();
    if (cards.length === 0) return null;

    // Get all card IDs that are in groups
    const groupedCardIds = new Set(groups.flatMap((g) => g.cardIds));

    // Filter to only ungrouped cards
    const ungroupedCards = cards.filter((c) => !groupedCardIds.has(c.id));
    if (ungroupedCards.length === 0) return null;

    // Find the bounding box of zones to position stack above them
    const zonesStore = useZonesStore.getState();
    const projectId = cards[0]?.projectId;
    const zones = projectId ? zonesStore.getZonesForProject(projectId) : [];

    const stackX = 80;
    let stackY = 80;

    if (zones.length > 0) {
      // Find the topmost zone position and place stack above it
      const minZoneY = Math.min(...zones.map((z) => z.position.y));
      const maxCardHeight = ungroupedCards.reduce((max, card) => {
        const size = dimensionsOf(card);
        return Math.max(max, size.height);
      }, 0);
      // Position stack above zones with some margin
      stackY = Math.max(80, minZoneY - maxCardHeight - 40);
    }

    const stackId = uuid();
    // zIndex oberhalb der nicht angeordneten (gruppierten) Karten vergeben,
    // sonst kollidieren die neuen Werte mit bestehenden.
    const baseZIndex = baseZIndexFor(cards, groupedCardIds);

    // Stack only ungrouped cards at the same position with incremental stackIndex
    const updates = ungroupedCards.map((card, index) => ({
      id: card.id,
      changes: {
        position: { x: stackX, y: stackY },
        stackId,
        stackIndex: index,
        zIndex: baseZIndex + index,
      },
    }));

    await applyCardUpdates(set, updates);

    // Return bounding box
    const maxCard = ungroupedCards.reduce((max, card) => {
      const size = dimensionsOf(card);
      return size.width > dimensionsOf(max).width ? card : max;
    }, ungroupedCards[0]);
    const maxSize = dimensionsOf(maxCard);

    return {
      minX: stackX,
      minY: stackY,
      maxX: stackX + maxSize.width,
      maxY: stackY + maxSize.height,
      width: maxSize.width,
      height: maxSize.height,
    };
  },

  arrangeInGrid: async (viewportWidth?: number) => {
    const { cards, groups } = get();
    if (cards.length === 0) return null;

    // Get all card IDs that are in groups
    const groupedCardIds = new Set(groups.flatMap((g) => g.cardIds));

    // Filter to only ungrouped cards
    const ungroupedCards = cards.filter((c) => !groupedCardIds.has(c.id));
    if (ungroupedCards.length === 0) return null;

    // Find the bounding box of zones to position grid above them
    const zonesStore = useZonesStore.getState();
    const projectId = cards[0]?.projectId;
    const zones = projectId ? zonesStore.getZonesForProject(projectId) : [];

    // Calculate optimal grid layout
    const cardCount = ungroupedCards.length;

    // Find the largest card size for consistent grid
    const maxCardSize = ungroupedCards.reduce((max, card) => {
      const size = dimensionsOf(card);
      return {
        width: Math.max(max.width, size.width),
        height: Math.max(max.height, size.height),
      };
    }, { width: 0, height: 0 });

    const cellWidth = maxCardSize.width + GRID_GAP;
    const cellHeight = maxCardSize.height + GRID_GAP;

    // Calculate number of columns that would fit nicely; bei bekannter
    // Viewport-Breite nicht breiter werden als der sichtbare Bereich
    const maxCols = viewportWidth && viewportWidth > 0
      ? Math.max(1, Math.floor(viewportWidth / cellWidth))
      : Number.POSITIVE_INFINITY;
    const cols = Math.max(1, Math.min(Math.ceil(Math.sqrt(cardCount)), maxCols));
    const rows = Math.ceil(cardCount / cols);

    // Calculate starting position
    const totalWidth = cols * cellWidth - GRID_GAP;
    const totalHeight = rows * cellHeight - GRID_GAP;
    const startX = GRID_GAP;
    let startY = GRID_GAP;

    if (zones.length > 0) {
      // Find the topmost zone position and place grid above it
      const minZoneY = Math.min(...zones.map((z) => z.position.y));
      // Position grid above zones with some margin
      startY = Math.max(GRID_GAP, minZoneY - totalHeight - 40);
    }

    // Remove all stacks and arrange in grid (only ungrouped cards)
    const baseZIndex = baseZIndexFor(cards, groupedCardIds);
    const updates = ungroupedCards.map((card, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return {
        id: card.id,
        changes: {
          position: {
            x: startX + col * cellWidth,
            y: startY + row * cellHeight,
          },
          stackId: undefined,
          stackIndex: undefined,
          zIndex: baseZIndex + index,
        },
      };
    });

    await applyCardUpdates(set, updates);

    return {
      minX: startX,
      minY: startY,
      maxX: startX + totalWidth,
      maxY: startY + totalHeight,
      width: totalWidth,
      height: totalHeight,
    };
  },

  // Sorting
  sortAndArrangeCards: async (criteria: SortCriteria, viewportWidth: number, viewportHeight: number) => {
    const { cards, groups, arrangeByGroups } = get();
    if (cards.length === 0) return null;

    // Handle group sorting separately
    if (criteria === 'groups') {
      return arrangeByGroups(viewportWidth, viewportHeight);
    }

    // Get all card IDs that are in groups
    const groupedCardIds = new Set(groups.flatMap((g) => g.cardIds));

    // Filter to only ungrouped cards
    const ungroupedCards = cards.filter((c) => !groupedCardIds.has(c.id));
    if (ungroupedCards.length === 0) return null;

    // Find the bounding box of zones to position grid above them
    const zonesStore = useZonesStore.getState();
    const projectId = cards[0]?.projectId;
    const zones = projectId ? zonesStore.getZonesForProject(projectId) : [];

    // Sort cards based on criteria
    const sortedCards = [...ungroupedCards].sort((a, b) => {
      switch (criteria) {
        case 'date-newest':
          return b.createdAt - a.createdAt;
        case 'date-oldest':
          return a.createdAt - b.createdAt;
        case 'type':
          return CARD_TYPE_ORDER[a.type] - CARD_TYPE_ORDER[b.type];
        case 'size':
          return CARD_SIZE_ORDER[a.size] - CARD_SIZE_ORDER[b.size];
        case 'label': {
          const labelA = a.label || '';
          const labelB = b.label || '';
          return labelA.localeCompare(labelB, 'de');
        }
        default:
          return 0;
      }
    });

    // Find the largest card size for consistent grid
    const maxCardSize = sortedCards.reduce((max, card) => {
      const size = dimensionsOf(card);
      return {
        width: Math.max(max.width, size.width),
        height: Math.max(max.height, size.height),
      };
    }, { width: 0, height: 0 });

    const cellWidth = maxCardSize.width + GRID_GAP;
    const cellHeight = maxCardSize.height + GRID_GAP;

    // Calculate number of columns
    const cols = Math.ceil(Math.sqrt(sortedCards.length));
    const rows = Math.ceil(sortedCards.length / cols);

    const totalWidth = cols * cellWidth - GRID_GAP;
    const totalHeight = rows * cellHeight - GRID_GAP;
    const startX = GRID_GAP;
    let startY = GRID_GAP;

    if (zones.length > 0) {
      // Find the topmost zone position and place grid above it
      const minZoneY = Math.min(...zones.map((z) => z.position.y));
      // Position grid above zones with some margin
      startY = Math.max(GRID_GAP, minZoneY - totalHeight - 40);
    }

    // Update only ungrouped cards with new positions
    const baseZIndex = baseZIndexFor(cards, groupedCardIds);
    const updates = sortedCards.map((card, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return {
        id: card.id,
        changes: {
          position: {
            x: startX + col * cellWidth,
            y: startY + row * cellHeight,
          },
          stackId: undefined,
          stackIndex: undefined,
          zIndex: baseZIndex + index,
        },
      };
    });

    await applyCardUpdates(set, updates, { currentSortCriteria: criteria });

    return {
      minX: startX,
      minY: startY,
      maxX: startX + totalWidth,
      maxY: startY + totalHeight,
      width: totalWidth,
      height: totalHeight,
    };
  },

  clearSort: () => {
    set({ currentSortCriteria: null });
  },

  // Inline Editing
  startInlineEdit: (cardId: string, field: InlineEditField, position: { x: number; y: number }, size: { width: number; height: number }) => {
    set({
      inlineEdit: { cardId, field, position, size },
    });
  },

  endInlineEdit: () => {
    set({ inlineEdit: null });
  },

  saveInlineEdit: async (value: string) => {
    const { inlineEdit, updateCard } = get();
    if (!inlineEdit) return;

    const { cardId, field } = inlineEdit;

    if (field === 'label') {
      await updateCard(cardId, { label: value });
    } else if (field === 'content') {
      await updateCard(cardId, { content: value } as Partial<Card>);
    }

    set({ inlineEdit: null });
  },

  getCardById: (id: string) => {
    return get().cards.find((c) => c.id === id);
  },

  getSortedCards: () => {
    return [...get().cards].sort((a, b) => a.zIndex - b.zIndex);
  },

  getBoundingBox: () => {
    const { cards } = get();
    if (cards.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const card of cards) {
      const size = dimensionsOf(card);
      minX = Math.min(minX, card.position.x);
      minY = Math.min(minY, card.position.y);
      maxX = Math.max(maxX, card.position.x + size.width);
      maxY = Math.max(maxY, card.position.y + size.height);
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  },

  // Multi-selection
  toggleMultiSelectMode: () => {
    set((state) => ({
      isMultiSelectMode: !state.isMultiSelectMode,
      selectedCardIds: state.isMultiSelectMode ? [] : state.selectedCardIds,
    }));
  },

  toggleCardSelection: (cardId: string) => {
    set((state) => {
      const isSelected = state.selectedCardIds.includes(cardId);
      return {
        selectedCardIds: isSelected
          ? state.selectedCardIds.filter((id) => id !== cardId)
          : [...state.selectedCardIds, cardId],
      };
    });
  },

  selectAllCards: () => {
    set((state) => ({
      selectedCardIds: state.cards.map((c) => c.id),
    }));
  },

  clearSelection: () => {
    set({
      selectedCardIds: [],
      isMultiSelectMode: false,
    });
  },

  // Grouping
  createGroup: async (projectId: string, name?: string) => {
    const { selectedCardIds, groups } = get();
    if (selectedCardIds.length < 2) return null;

    const projectGroups = groups.filter((g) => g.projectId === projectId);
    const groupId = uuid();
    const colorIndex = projectGroups.length % GROUP_COLORS.length;
    const newGroup: CardGroup = {
      id: groupId,
      projectId,
      name: name || `Gruppe ${projectGroups.length + 1}`,
      cardIds: [...selectedCardIds],
      color: GROUP_COLORS[colorIndex],
    };

    // Persist to IndexedDB
    try {
      await groupService.create(newGroup);
    } catch (error) {
      console.error('Failed to persist group:', error);
    }

    // Use functional update to avoid race conditions
    set((state) => ({
      groups: [...state.groups, newGroup],
      selectedCardIds: [],
      isMultiSelectMode: false,
    }));

    return groupId;
  },

  createEmptyGroup: async (projectId: string, name?: string, color?: string) => {
    const { groups } = get();
    const projectGroups = groups.filter((g) => g.projectId === projectId);
    const groupId = uuid();
    const colorIndex = projectGroups.length % GROUP_COLORS.length;
    const newGroup: CardGroup = {
      id: groupId,
      projectId,
      name: name || `Gruppe ${projectGroups.length + 1}`,
      cardIds: [],
      color: color || GROUP_COLORS[colorIndex],
    };

    // Persist to IndexedDB
    try {
      await groupService.create(newGroup);
    } catch (error) {
      console.error('Failed to persist empty group:', error);
    }

    // Use functional update to avoid race conditions
    set((state) => ({
      groups: [...state.groups, newGroup],
    }));

    return newGroup;
  },

  renameGroup: async (groupId: string, name: string) => {
    // Persist to IndexedDB
    try {
      await groupService.update(groupId, { name });
    } catch (error) {
      console.error('Failed to persist group rename:', error);
    }

    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, name } : g
      ),
    }));

    // Also update linked zone name
    const zonesStore = useZonesStore.getState();
    const linkedZone = zonesStore.getZoneByGroupId(groupId);
    if (linkedZone) {
      zonesStore.updateZone(linkedZone.id, { name });
    }
  },

  addCardToGroup: async (groupId: string, cardId: string) => {
    const group = get().groups.find(g => g.id === groupId);
    if (!group || group.cardIds.includes(cardId)) return;

    const newCardIds = [...group.cardIds, cardId];

    // Persist to IndexedDB
    try {
      await groupService.update(groupId, { cardIds: newCardIds });
    } catch (error) {
      console.error('Failed to persist adding card to group:', error);
    }

    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, cardIds: newCardIds }
          : g
      ),
    }));
  },

  removeCardFromGroup: async (groupId: string, cardId: string) => {
    const group = get().groups.find(g => g.id === groupId);
    if (!group) return;

    const newCardIds = group.cardIds.filter((id) => id !== cardId);

    // Keep groups even when empty (they're linked to zones)
    // Groups should only be deleted via deleteGroup when the zone is deleted
    try {
      await groupService.update(groupId, { cardIds: newCardIds });
    } catch (error) {
      console.error('Failed to persist removing card from group:', error);
    }

    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, cardIds: newCardIds }
          : g
      ),
    }));
  },

  ungroupCards: async (groupId: string) => {
    // Persist to IndexedDB
    try {
      await groupService.delete(groupId);
    } catch (error) {
      console.error('Failed to delete group:', error);
    }

    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId),
    }));
  },

  deleteGroup: async (groupId: string) => {
    // Gruppe für Undo festhalten, bevor sie verschwindet
    const group = get().groups.find((g) => g.id === groupId);

    // Persist to IndexedDB
    try {
      await groupService.delete(groupId);
    } catch (error) {
      console.error('Failed to delete group:', error);
    }

    // Only remove the group structure, keep the cards
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId),
    }));

    // Also delete the linked zone – die Gruppe wandert in denselben Undo-Eintrag,
    // damit „Rückgängig" Bereich UND Gruppe zurückbringt.
    const zonesStore = useZonesStore.getState();
    const linkedZone = zonesStore.getZoneByGroupId(groupId);
    if (linkedZone) {
      await zonesStore.deleteZone(linkedZone.id, group);
    }
  },

  moveGroup: async (groupId: string, delta: Position) => {
    const { groups, cards, updateCard } = get();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    // Move all cards in the group
    for (const cardId of group.cardIds) {
      const card = cards.find((c) => c.id === cardId);
      if (card) {
        const newPosition = {
          x: card.position.x + delta.x,
          y: card.position.y + delta.y,
        };
        await updateCard(cardId, { position: newPosition });
      }
    }
  },

  moveGroupedCard: async (cardId: string, newPosition: Position) => {
    const { cards, groups } = get();
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    const group = groups.find((g) => g.cardIds.includes(cardId));
    if (!group) {
      // Card is not in a group, just move it normally
      await get().updatePosition(cardId, newPosition);
      return;
    }

    // Calculate the delta from the card's old position
    const delta = {
      x: newPosition.x - card.position.x,
      y: newPosition.y - card.position.y,
    };

    // Zielpositionen einmal berechnen und identisch in DB und State schreiben
    const updates: CardUpdate[] = [];
    for (const groupCardId of group.cardIds) {
      const groupCard = cards.find((c) => c.id === groupCardId);
      if (!groupCard) continue;
      updates.push({
        id: groupCardId,
        changes: {
          position: {
            x: groupCard.position.x + delta.x,
            y: groupCard.position.y + delta.y,
          },
        },
      });
    }

    await applyCardUpdates(set, updates);
  },

  selectGroupCards: (groupId: string) => {
    const group = get().groups.find((g) => g.id === groupId);
    if (!group) return;

    set({
      selectedCardIds: [...group.cardIds],
      isMultiSelectMode: true,
    });
  },

  getGroupByCardId: (cardId: string) => {
    return get().groups.find((g) => g.cardIds.includes(cardId));
  },

  getGroupsByCardId: (cardId: string) => {
    return get().groups.filter((g) => g.cardIds.includes(cardId));
  },

  getGroupById: (groupId: string) => {
    return get().groups.find((g) => g.id === groupId);
  },

  getAllGroups: () => {
    return get().groups;
  },

  // Venn-Diagram style arrangement by groups
  arrangeByGroups: async (viewportWidth: number, viewportHeight: number) => {
    const { cards, groups } = get();
    const zonesStore = useZonesStore.getState();

    if (cards.length === 0) return null;

    // Get projectId from first card
    const projectId = cards[0].projectId;

    // If no groups exist, fall back to grid arrangement
    if (groups.length === 0) {
      return get().arrangeInGrid(viewportWidth, viewportHeight);
    }

    // Delete existing group zones for this project
    const existingZones = zonesStore.getZonesForProject(projectId);
    for (const zone of existingZones) {
      if (zone.groupId) {
        zonesStore.deleteZone(zone.id);
      }
    }

    // Calculate group membership for each card
    const cardGroupMap = new Map<string, string[]>();
    for (const card of cards) {
      const cardGroups = groups.filter((g) => g.cardIds.includes(card.id));
      cardGroupMap.set(card.id, cardGroups.map((g) => g.id));
    }

    // Create group signature for each card (sorted group IDs joined)
    const cardSignatureMap = new Map<string, string>();
    for (const card of cards) {
      const groupIds = cardGroupMap.get(card.id) || [];
      cardSignatureMap.set(card.id, groupIds.sort().join('|') || 'ungrouped');
    }

    // Group cards by their signature (same combination of groups)
    const signatureGroups = new Map<string, Card[]>();
    for (const card of cards) {
      const signature = cardSignatureMap.get(card.id) || 'ungrouped';
      if (!signatureGroups.has(signature)) {
        signatureGroups.set(signature, []);
      }
      signatureGroups.get(signature)!.push(card);
    }

    // Calculate positions for Venn-like arrangement
    const numGroups = groups.length;
    const centerX = 400;
    const centerY = 400;
    const groupRadius = Math.min(300, 150 + numGroups * 30); // Radius for group circles

    // Position each group's center point in a circle
    const groupCenters = new Map<string, { x: number; y: number }>();
    groups.forEach((group, index) => {
      const angle = (index / numGroups) * 2 * Math.PI - Math.PI / 2;
      groupCenters.set(group.id, {
        x: centerX + Math.cos(angle) * groupRadius,
        y: centerY + Math.sin(angle) * groupRadius,
      });
    });

    // Position ungrouped cards on the side
    const ungroupedCenter = { x: centerX + groupRadius * 2 + 200, y: centerY };

    // Find the largest card size for consistent spacing
    const maxCardSize = cards.reduce((max, card) => {
      const size = dimensionsOf(card);
      return {
        width: Math.max(max.width, size.width),
        height: Math.max(max.height, size.height),
      };
    }, { width: 0, height: 0 });

    const cellWidth = maxCardSize.width + GRID_GAP;
    const cellHeight = maxCardSize.height + GRID_GAP;

    const updates: { id: string; changes: { position: Position; stackId: undefined; stackIndex: undefined; zIndex: number } }[] = [];
    let zIndex = 0;

    // Track card positions for each group (to calculate zone bounds)
    const groupCardPositions = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();

    // Initialize group bounds
    for (const group of groups) {
      groupCardPositions.set(group.id, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    }

    // Arrange cards by their signature
    for (const [signature, signatureCards] of signatureGroups) {
      let targetCenter: { x: number; y: number };

      if (signature === 'ungrouped') {
        targetCenter = ungroupedCenter;
      } else {
        const groupIds = signature.split('|');
        // Calculate center as average of all group centers
        let sumX = 0;
        let sumY = 0;
        for (const gid of groupIds) {
          const center = groupCenters.get(gid);
          if (center) {
            sumX += center.x;
            sumY += center.y;
          }
        }
        targetCenter = {
          x: sumX / groupIds.length,
          y: sumY / groupIds.length,
        };
      }

      // Arrange cards in a small grid around the target center
      const cols = Math.ceil(Math.sqrt(signatureCards.length));
      const gridWidth = cols * cellWidth;
      const gridHeight = Math.ceil(signatureCards.length / cols) * cellHeight;
      const startX = targetCenter.x - gridWidth / 2;
      const startY = targetCenter.y - gridHeight / 2;

      signatureCards.forEach((card, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const cardSize = dimensionsOf(card);
        const cardX = startX + col * cellWidth;
        const cardY = startY + row * cellHeight;

        updates.push({
          id: card.id,
          changes: {
            position: { x: cardX, y: cardY },
            stackId: undefined,
            stackIndex: undefined,
            zIndex: zIndex++,
          },
        });

        // Update bounds for each group this card belongs to
        const cardGroupIds = cardGroupMap.get(card.id) || [];
        for (const gid of cardGroupIds) {
          const bounds = groupCardPositions.get(gid);
          if (bounds) {
            bounds.minX = Math.min(bounds.minX, cardX);
            bounds.minY = Math.min(bounds.minY, cardY);
            bounds.maxX = Math.max(bounds.maxX, cardX + cardSize.width);
            bounds.maxY = Math.max(bounds.maxY, cardY + cardSize.height);
          }
        }
      });
    }

    // Alle Karten werden hier neu angeordnet – zIndex ab 0 ist kollisionsfrei
    await applyCardUpdates(set, updates, { currentSortCriteria: 'groups' });

    // Create zones for each group
    const zonePadding = 30;
    for (const group of groups) {
      const bounds = groupCardPositions.get(group.id);
      if (bounds && bounds.minX !== Infinity) {
        await zonesStore.createZoneForGroup(
          projectId,
          group.id,
          group.name || `Gruppe ${groups.indexOf(group) + 1}`,
          group.color,
          { x: bounds.minX - zonePadding, y: bounds.minY - zonePadding },
          bounds.maxX - bounds.minX + zonePadding * 2,
          bounds.maxY - bounds.minY + zonePadding * 2
        );
      }
    }

    // Calculate bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const update of updates) {
      const card = cards.find((c) => c.id === update.id);
      if (card) {
        const size = dimensionsOf(card);
        minX = Math.min(minX, update.changes.position.x);
        minY = Math.min(minY, update.changes.position.y);
        maxX = Math.max(maxX, update.changes.position.x + size.width);
        maxY = Math.max(maxY, update.changes.position.y + size.height);
      }
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  },
}));
