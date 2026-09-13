import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { BookFormat, BookItem, BookPage } from '../types';
import { BOOK_FORMATS } from '../types';
import { bookService } from '../services/db/database';

// Ein Undo-Eintrag beschreibt, wie eine Aktion zurückgenommen und wiederholt wird.
interface HistoryEntry {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const MAX_HISTORY = 50;

// Omit, das über die Union verteilt (sonst gehen die typspezifischen Felder verloren)
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewBookItem = DistributiveOmit<BookItem, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'zIndex'> & {
  zIndex?: number;
};

interface BookState {
  projectId: string | null;
  format: BookFormat;
  pages: BookPage[]; // sortiert nach index
  items: BookItem[]; // alle Items des Buchs
  currentPageIndex: number;
  selectedItemId: string | null;
  editingItemId: string | null; // Text-Item in Inline-Bearbeitung
  // Zustand des Text-Items beim Start der Bearbeitung (für genau einen Undo-Eintrag beim Beenden)
  editingBefore: { text: string; height: number } | null;
  isLoading: boolean;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  // Laden
  loadBook: (projectId: string, format: BookFormat) => Promise<void>;
  clear: () => void;

  // Navigation / Auswahl
  setCurrentPage: (index: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  selectItem: (id: string | null) => void;
  setEditingItem: (id: string | null) => void;

  // Seiten
  addPage: (afterIndex?: number) => Promise<BookPage>;
  duplicatePage: (pageId: string) => Promise<BookPage | null>;
  deletePage: (pageId: string) => Promise<void>;
  movePage: (fromIndex: number, toIndex: number) => Promise<void>;
  updatePage: (pageId: string, changes: Partial<BookPage>) => Promise<void>;

  // Items
  addItem: (item: NewBookItem) => Promise<BookItem>;
  addItems: (items: NewBookItem[]) => Promise<BookItem[]>;
  // Nur lokal (z. B. während Drag) – ohne Persistenz und ohne Undo-Eintrag
  updateItemLocal: (id: string, changes: Partial<BookItem>) => void;
  // Persistiert + Undo-Eintrag; `before` überschreibt den Vorher-Zustand (für Drag-Ende)
  updateItem: (id: string, changes: Partial<BookItem>, before?: Partial<BookItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  duplicateItem: (id: string) => Promise<BookItem | null>;
  bringForward: (id: string) => Promise<void>;
  sendBackward: (id: string) => Promise<void>;

  // Undo / Redo
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Selektoren
  getCurrentPage: () => BookPage | undefined;
  getPageItems: (pageId: string) => BookItem[];
  getItem: (id: string) => BookItem | undefined;
}

function sortPages(pages: BookPage[]): BookPage[] {
  return [...pages].sort((a, b) => a.index - b.index);
}

function reindex(pages: BookPage[]): BookPage[] {
  return pages.map((p, index) => (p.index === index ? p : { ...p, index }));
}

function pickBefore(item: BookItem, changes: Partial<BookItem>): Partial<BookItem> {
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(changes)) {
    before[key] = (item as unknown as Record<string, unknown>)[key];
  }
  return before as Partial<BookItem>;
}

export const useBookStore = create<BookState>((set, get) => {
  // --- Interne Helfer -------------------------------------------------------

  const pushHistory = (entry: HistoryEntry) => {
    set((state) => ({
      undoStack: [...state.undoStack.slice(-(MAX_HISTORY - 1)), entry],
      redoStack: [],
    }));
  };

  const applyItemChanges = async (id: string, changes: Partial<BookItem>) => {
    set((state) => ({
      items: state.items.map((it) => (it.id === id ? ({ ...it, ...changes, updatedAt: Date.now() } as BookItem) : it)),
    }));
    await bookService.updateItem(id, changes);
  };

  const insertItem = async (item: BookItem) => {
    set((state) => ({ items: [...state.items.filter((it) => it.id !== item.id), item] }));
    await bookService.createItem(item);
  };

  const removeItem = async (id: string) => {
    set((state) => ({
      items: state.items.filter((it) => it.id !== id),
      selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
      editingItemId: state.editingItemId === id ? null : state.editingItemId,
    }));
    await bookService.deleteItem(id);
  };

  const insertPageWithItems = async (page: BookPage, items: BookItem[], atIndex: number) => {
    const { pages } = get();
    const next = [...pages.filter((p) => p.id !== page.id)];
    next.splice(atIndex, 0, page);
    const reindexed = reindex(next);
    set((state) => ({
      pages: reindexed,
      items: [...state.items.filter((it) => it.pageId !== page.id), ...items],
    }));
    await bookService.createPage({ ...page, index: atIndex });
    if (items.length > 0) await bookService.bulkCreateItems(items);
    await bookService.setPageOrder(reindexed.map((p) => p.id));
  };

  const removePage = async (pageId: string) => {
    const { pages } = get();
    const remaining = reindex(pages.filter((p) => p.id !== pageId));
    set((state) => ({
      pages: remaining,
      items: state.items.filter((it) => it.pageId !== pageId),
      currentPageIndex: Math.min(state.currentPageIndex, Math.max(0, remaining.length - 1)),
      selectedItemId: null,
      editingItemId: null,
    }));
    await bookService.deletePage(pageId);
    await bookService.setPageOrder(remaining.map((p) => p.id));
  };

  const setOrder = async (orderedIds: string[]) => {
    const byId = new Map(get().pages.map((p) => [p.id, p]));
    const ordered = reindex(orderedIds.map((id) => byId.get(id)!).filter(Boolean));
    set({ pages: ordered });
    await bookService.setPageOrder(ordered.map((p) => p.id));
  };

  // Textbearbeitung abschließen: geänderten Text persistieren + Undo-Eintrag anlegen
  const finalizeTextEdit = (id: string, before: { text: string; height: number } | null) => {
    const item = get().items.find((it) => it.id === id);
    if (!item || item.type !== 'text' || !before) return;
    const after = { text: item.text, height: item.height };
    if (after.text !== before.text) {
      void bookService.updateItem(id, after);
      pushHistory({
        label: 'Text ändern',
        undo: async () => applyItemChanges(id, before),
        redo: async () => applyItemChanges(id, after),
      });
    } else if (after.height !== before.height) {
      // Nur die Höhe hat sich angepasst – kein Undo-Schritt
      void bookService.updateItem(id, { height: after.height });
    }
  };

  const maxZ = (pageId: string) => {
    const zs = get().items.filter((it) => it.pageId === pageId).map((it) => it.zIndex);
    return zs.length ? Math.max(...zs) : 0;
  };

  // --- Store -----------------------------------------------------------------

  return {
    projectId: null,
    format: 'portrait',
    pages: [],
    items: [],
    currentPageIndex: 0,
    selectedItemId: null,
    editingItemId: null,
    editingBefore: null,
    isLoading: false,
    undoStack: [],
    redoStack: [],

    loadBook: async (projectId, format) => {
      set({ isLoading: true, projectId, format, selectedItemId: null, editingItemId: null, undoStack: [], redoStack: [] });
      try {
        let pages = sortPages(await bookService.getPages(projectId));
        const items = await bookService.getItems(projectId);
        if (pages.length === 0) {
          // Jedes Buch hat mindestens eine Seite (Titelseite)
          const now = Date.now();
          const page: BookPage = {
            id: uuid(),
            projectId,
            index: 0,
            backgroundColor: '#FFFFFF',
            backgroundPattern: 'none',
            createdAt: now,
            updatedAt: now,
          };
          await bookService.createPage(page);
          pages = [page];
        } else {
          const reindexed = reindex(pages);
          if (reindexed.some((p, i) => p !== pages[i])) {
            await bookService.setPageOrder(reindexed.map((p) => p.id));
            pages = reindexed;
          }
        }
        set({ pages, items, currentPageIndex: 0, isLoading: false });
      } catch (error) {
        console.error('Failed to load book:', error);
        set({ isLoading: false });
      }
    },

    clear: () => {
      set({
        projectId: null,
        pages: [],
        items: [],
        currentPageIndex: 0,
        selectedItemId: null,
        editingItemId: null,
        editingBefore: null,
        undoStack: [],
        redoStack: [],
      });
    },

    setCurrentPage: (index) => {
      const { pages } = get();
      const clamped = Math.max(0, Math.min(index, pages.length - 1));
      set({ currentPageIndex: clamped, selectedItemId: null, editingItemId: null });
    },

    nextPage: () => get().setCurrentPage(get().currentPageIndex + 1),
    prevPage: () => get().setCurrentPage(get().currentPageIndex - 1),

    selectItem: (id) => {
      const { editingItemId } = get();
      // Auswahlwechsel beendet eine laufende Textbearbeitung (inkl. Persistenz)
      if (editingItemId && editingItemId !== id) get().setEditingItem(null);
      set({ selectedItemId: id });
    },

    // Beenden der Textbearbeitung persistiert den Text zentral – unabhängig davon,
    // ob sie per Blur, Escape, Tippen auf die Seite oder Undo beendet wurde.
    setEditingItem: (id) => {
      const { editingItemId, editingBefore } = get();
      if (editingItemId && editingItemId !== id) {
        finalizeTextEdit(editingItemId, editingBefore);
      }
      let before: BookState['editingBefore'] = null;
      if (id) {
        const item = get().items.find((it) => it.id === id);
        if (item?.type === 'text') before = { text: item.text, height: item.height };
      }
      set({ editingItemId: id, editingBefore: before, selectedItemId: id ?? get().selectedItemId });
    },

    // --- Seiten ---------------------------------------------------------------

    addPage: async (afterIndex) => {
      const { projectId, pages, currentPageIndex } = get();
      if (!projectId) throw new Error('Kein Buch geladen');
      const insertAt = (afterIndex ?? (pages.length ? currentPageIndex : -1)) + 1;
      const now = Date.now();
      const page: BookPage = {
        id: uuid(),
        projectId,
        index: insertAt,
        backgroundColor: pages[currentPageIndex]?.backgroundColor ?? '#FFFFFF',
        backgroundPattern: pages[currentPageIndex]?.backgroundPattern ?? 'none',
        createdAt: now,
        updatedAt: now,
      };
      await insertPageWithItems(page, [], insertAt);
      set({ currentPageIndex: insertAt, selectedItemId: null, editingItemId: null });
      pushHistory({
        label: 'Seite hinzufügen',
        undo: async () => removePage(page.id),
        redo: async () => {
          await insertPageWithItems(page, [], insertAt);
          set({ currentPageIndex: insertAt });
        },
      });
      return page;
    },

    duplicatePage: async (pageId) => {
      const { pages, items } = get();
      const source = pages.find((p) => p.id === pageId);
      if (!source) return null;
      const now = Date.now();
      const insertAt = source.index + 1;
      const page: BookPage = { ...source, id: uuid(), index: insertAt, createdAt: now, updatedAt: now };
      const copies: BookItem[] = items
        .filter((it) => it.pageId === pageId)
        .map((it) => ({ ...it, id: uuid(), pageId: page.id, createdAt: now, updatedAt: now }));
      await insertPageWithItems(page, copies, insertAt);
      set({ currentPageIndex: insertAt, selectedItemId: null, editingItemId: null });
      pushHistory({
        label: 'Seite duplizieren',
        undo: async () => removePage(page.id),
        redo: async () => {
          await insertPageWithItems(page, copies, insertAt);
          set({ currentPageIndex: insertAt });
        },
      });
      return page;
    },

    deletePage: async (pageId) => {
      const { pages, items } = get();
      if (pages.length <= 1) return; // die letzte Seite bleibt immer
      const page = pages.find((p) => p.id === pageId);
      if (!page) return;
      const pageItems = items.filter((it) => it.pageId === pageId);
      const index = page.index;
      await removePage(pageId);
      pushHistory({
        label: 'Seite löschen',
        undo: async () => {
          await insertPageWithItems(page, pageItems, index);
          set({ currentPageIndex: index });
        },
        redo: async () => removePage(pageId),
      });
    },

    movePage: async (fromIndex, toIndex) => {
      const { pages } = get();
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= pages.length || toIndex >= pages.length) return;
      const before = pages.map((p) => p.id);
      const after = [...before];
      const [moved] = after.splice(fromIndex, 1);
      after.splice(toIndex, 0, moved);
      await setOrder(after);
      set({ currentPageIndex: toIndex });
      pushHistory({
        label: 'Seite verschieben',
        undo: async () => {
          await setOrder(before);
          set({ currentPageIndex: fromIndex });
        },
        redo: async () => {
          await setOrder(after);
          set({ currentPageIndex: toIndex });
        },
      });
    },

    updatePage: async (pageId, changes) => {
      const page = get().pages.find((p) => p.id === pageId);
      if (!page) return;
      const before: Partial<BookPage> = {};
      for (const key of Object.keys(changes) as (keyof BookPage)[]) {
        (before as Record<string, unknown>)[key] = page[key];
      }
      const apply = async (values: Partial<BookPage>) => {
        set((state) => ({
          pages: state.pages.map((p) => (p.id === pageId ? { ...p, ...values, updatedAt: Date.now() } : p)),
        }));
        await bookService.updatePage(pageId, values);
      };
      await apply(changes);
      pushHistory({
        label: 'Seite ändern',
        undo: async () => apply(before),
        redo: async () => apply(changes),
      });
    },

    // --- Items ----------------------------------------------------------------

    addItem: async (input) => {
      const [item] = await get().addItems([input]);
      return item;
    },

    addItems: async (inputs) => {
      const { projectId } = get();
      if (!projectId) throw new Error('Kein Buch geladen');
      const now = Date.now();
      const created: BookItem[] = [];
      let zCounter = new Map<string, number>();
      for (const input of inputs) {
        const z = zCounter.get(input.pageId) ?? maxZ(input.pageId);
        const nextZ = input.zIndex ?? z + 1;
        zCounter.set(input.pageId, Math.max(z, nextZ));
        created.push({
          ...input,
          id: uuid(),
          projectId,
          zIndex: nextZ,
          createdAt: now,
          updatedAt: now,
        } as BookItem);
      }
      zCounter = new Map();
      set((state) => ({ items: [...state.items, ...created] }));
      await bookService.bulkCreateItems(created);
      pushHistory({
        label: created.length > 1 ? 'Elemente einfügen' : 'Element einfügen',
        undo: async () => {
          for (const item of created) await removeItem(item.id);
        },
        redo: async () => {
          for (const item of created) await insertItem(item);
        },
      });
      return created;
    },

    updateItemLocal: (id, changes) => {
      set((state) => ({
        items: state.items.map((it) => (it.id === id ? ({ ...it, ...changes } as BookItem) : it)),
      }));
    },

    updateItem: async (id, changes, beforeOverride) => {
      const item = get().items.find((it) => it.id === id);
      if (!item) return;
      const before = beforeOverride ?? pickBefore(item, changes);
      await applyItemChanges(id, changes);
      pushHistory({
        label: 'Element ändern',
        undo: async () => applyItemChanges(id, before),
        redo: async () => applyItemChanges(id, changes),
      });
    },

    deleteItem: async (id) => {
      const item = get().items.find((it) => it.id === id);
      if (!item) return;
      await removeItem(id);
      pushHistory({
        label: 'Element löschen',
        undo: async () => insertItem(item),
        redo: async () => removeItem(id),
      });
    },

    duplicateItem: async (id) => {
      const item = get().items.find((it) => it.id === id);
      if (!item) return null;
      const now = Date.now();
      const copy: BookItem = {
        ...item,
        id: uuid(),
        x: item.x + 24,
        y: item.y + 24,
        zIndex: maxZ(item.pageId) + 1,
        createdAt: now,
        updatedAt: now,
      };
      await insertItem(copy);
      set({ selectedItemId: copy.id });
      pushHistory({
        label: 'Element duplizieren',
        undo: async () => removeItem(copy.id),
        redo: async () => insertItem(copy),
      });
      return copy;
    },

    bringForward: async (id) => {
      const item = get().items.find((it) => it.id === id);
      if (!item) return;
      await get().updateItem(id, { zIndex: maxZ(item.pageId) + 1 });
    },

    sendBackward: async (id) => {
      const item = get().items.find((it) => it.id === id);
      if (!item) return;
      const zs = get().items.filter((it) => it.pageId === item.pageId).map((it) => it.zIndex);
      const minZ = zs.length ? Math.min(...zs) : 0;
      await get().updateItem(id, { zIndex: minZ - 1 });
    },

    // --- Undo / Redo ----------------------------------------------------------

    undo: async () => {
      get().setEditingItem(null);
      const { undoStack } = get();
      const entry = undoStack[undoStack.length - 1];
      if (!entry) return;
      set({ undoStack: undoStack.slice(0, -1), selectedItemId: null, editingItemId: null });
      await entry.undo();
      set((state) => ({ redoStack: [...state.redoStack, entry] }));
    },

    redo: async () => {
      // Erst den Eintrag merken: setEditingItem(null) kann eine laufende Textänderung
      // abschließen und dabei über pushHistory den Redo-Stapel leeren.
      const { redoStack } = get();
      const entry = redoStack[redoStack.length - 1];
      if (!entry) return;
      get().setEditingItem(null);
      set((state) => ({
        redoStack: state.redoStack.filter((e) => e !== entry),
        selectedItemId: null,
        editingItemId: null,
      }));
      await entry.redo();
      set((state) => ({ undoStack: [...state.undoStack, entry] }));
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    // --- Selektoren -----------------------------------------------------------

    getCurrentPage: () => get().pages[get().currentPageIndex],
    getPageItems: (pageId) =>
      get()
        .items.filter((it) => it.pageId === pageId)
        .sort((a, b) => a.zIndex - b.zIndex),
    getItem: (id) => get().items.find((it) => it.id === id),
  };
});

// Seitengröße des aktuell geladenen Buchs
export function useBookPageSize(): { width: number; height: number } {
  const format = useBookStore((s) => s.format);
  return BOOK_FORMATS[format];
}
