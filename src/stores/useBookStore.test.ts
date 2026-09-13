import { beforeEach, describe, expect, it } from 'vitest';
import { db, bookService } from '../services/db/database';
import { useBookStore } from './useBookStore';
import { createTextItem } from '../services/bookItemFactory';

const PROJECT = 'projekt-1';
const PAGE = { width: 768, height: 1024 };

async function freshBook() {
  await db.bookItems.clear();
  await db.bookPages.clear();
  await db.projects.clear();
  await db.projects.add({
    id: PROJECT,
    name: 'Testbuch',
    backgroundColor: '#fff',
    kind: 'book',
    bookFormat: 'portrait',
    createdAt: 1,
    updatedAt: 1,
    cardCount: 0,
  });
  useBookStore.getState().clear();
  await useBookStore.getState().loadBook(PROJECT, 'portrait');
}

describe('useBookStore – Seiten', () => {
  beforeEach(freshBook);

  it('legt beim Laden eines leeren Buchs eine Titelseite an', async () => {
    const { pages } = useBookStore.getState();
    expect(pages).toHaveLength(1);
    expect(pages[0].index).toBe(0);
    expect(await bookService.getPages(PROJECT)).toHaveLength(1);
  });

  it('fügt Seiten hinter der aktuellen ein und hält die Indizes lückenlos', async () => {
    const store = useBookStore.getState();
    await store.addPage(); // -> index 1, aktuell
    await store.addPage(); // -> index 2
    useBookStore.getState().setCurrentPage(0);
    await useBookStore.getState().addPage(); // -> hinter Seite 0 einfügen

    const pages = useBookStore.getState().pages;
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    expect(useBookStore.getState().currentPageIndex).toBe(1);

    const persisted = await bookService.getPages(PROJECT);
    expect(persisted.map((p) => p.id)).toEqual(pages.map((p) => p.id));
  });

  it('verschiebt Seiten und schreibt die Reihenfolge in die DB', async () => {
    const store = useBookStore.getState();
    await store.addPage();
    await store.addPage();
    const [a, b, c] = useBookStore.getState().pages.map((p) => p.id);

    await useBookStore.getState().movePage(2, 0);
    expect(useBookStore.getState().pages.map((p) => p.id)).toEqual([c, a, b]);
    expect(useBookStore.getState().pages.map((p) => p.index)).toEqual([0, 1, 2]);

    const persisted = await bookService.getPages(PROJECT);
    expect(persisted.map((p) => p.id)).toEqual([c, a, b]);
  });

  it('löscht die letzte verbleibende Seite nicht', async () => {
    const page = useBookStore.getState().pages[0];
    await useBookStore.getState().deletePage(page.id);
    expect(useBookStore.getState().pages).toHaveLength(1);
  });

  it('löscht eine Seite samt Items und stellt sie per Undo wieder her', async () => {
    const store = useBookStore.getState();
    const page = await store.addPage();
    await useBookStore.getState().addItem(createTextItem(page.id, PAGE, 'Hallo'));
    expect(useBookStore.getState().items).toHaveLength(1);

    await useBookStore.getState().deletePage(page.id);
    expect(useBookStore.getState().pages).toHaveLength(1);
    expect(useBookStore.getState().items).toHaveLength(0);
    expect(await bookService.getItems(PROJECT)).toHaveLength(0);

    await useBookStore.getState().undo();
    expect(useBookStore.getState().pages).toHaveLength(2);
    expect(useBookStore.getState().items).toHaveLength(1);
    expect(await bookService.getItems(PROJECT)).toHaveLength(1);

    await useBookStore.getState().redo();
    expect(useBookStore.getState().pages).toHaveLength(1);
    expect(await bookService.getPages(PROJECT)).toHaveLength(1);
  });

  it('dupliziert eine Seite inklusive Items mit neuen IDs', async () => {
    const page = useBookStore.getState().pages[0];
    const item = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, 'Kopie'));
    const copy = await useBookStore.getState().duplicatePage(page.id);
    expect(copy).not.toBeNull();
    const items = useBookStore.getState().items;
    expect(items).toHaveLength(2);
    const copied = items.find((it) => it.pageId === copy!.id);
    expect(copied?.id).not.toBe(item.id);
    expect(copied?.type === 'text' && copied.text).toBe('Kopie');
  });
});

describe('useBookStore – Items und Undo', () => {
  beforeEach(freshBook);

  it('vergibt aufsteigende zIndex-Werte je Seite', async () => {
    const page = useBookStore.getState().pages[0];
    const a = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, 'a'));
    const b = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, 'b'));
    expect(b.zIndex).toBeGreaterThan(a.zIndex);
    await useBookStore.getState().bringForward(a.id);
    expect(useBookStore.getState().getItem(a.id)!.zIndex).toBeGreaterThan(b.zIndex);
    await useBookStore.getState().sendBackward(a.id);
    expect(useBookStore.getState().getItem(a.id)!.zIndex).toBeLessThan(b.zIndex);
  });

  it('macht Item-Änderungen rückgängig und wiederholt sie', async () => {
    const page = useBookStore.getState().pages[0];
    const item = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, 'alt'));
    await useBookStore.getState().updateItem(item.id, { text: 'neu' });
    expect((useBookStore.getState().getItem(item.id) as { text: string }).text).toBe('neu');

    await useBookStore.getState().undo();
    expect((useBookStore.getState().getItem(item.id) as { text: string }).text).toBe('alt');
    expect(((await db.bookItems.get(item.id)) as { text: string }).text).toBe('alt');

    await useBookStore.getState().redo();
    expect((useBookStore.getState().getItem(item.id) as { text: string }).text).toBe('neu');
  });

  it('nutzt den übergebenen Vorher-Zustand nach einem Drag (updateItemLocal + updateItem)', async () => {
    const page = useBookStore.getState().pages[0];
    const item = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, 'drag'));
    const before = { x: item.x, y: item.y };
    useBookStore.getState().updateItemLocal(item.id, { x: 100, y: 100 });
    useBookStore.getState().updateItemLocal(item.id, { x: 200, y: 150 });
    await useBookStore.getState().updateItem(item.id, { x: 200, y: 150 }, before);

    await useBookStore.getState().undo();
    const restored = useBookStore.getState().getItem(item.id)!;
    expect(restored.x).toBe(before.x);
    expect(restored.y).toBe(before.y);
  });

  it('stellt gelöschte Items per Undo wieder her und leert Redo bei neuer Aktion', async () => {
    const page = useBookStore.getState().pages[0];
    const item = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, 'weg'));
    await useBookStore.getState().deleteItem(item.id);
    expect(useBookStore.getState().items).toHaveLength(0);

    await useBookStore.getState().undo();
    expect(useBookStore.getState().items).toHaveLength(1);
    expect(useBookStore.getState().canRedo()).toBe(true);

    await useBookStore.getState().updateItem(item.id, { x: 5 });
    expect(useBookStore.getState().canRedo()).toBe(false);
  });

  it('persistiert live geänderten Text beim Beenden der Bearbeitung mit einem Undo-Eintrag', async () => {
    const page = useBookStore.getState().pages[0];
    const item = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, ''));
    const undoBefore = useBookStore.getState().undoStack.length;

    useBookStore.getState().setEditingItem(item.id);
    useBookStore.getState().updateItemLocal(item.id, { text: 'Hal', height: 130 });
    useBookStore.getState().updateItemLocal(item.id, { text: 'Hallo', height: 140 });
    // Beenden von außen (z. B. Tippen auf die Seite) – ohne expliziten Commit
    useBookStore.getState().setEditingItem(null);

    expect(useBookStore.getState().undoStack.length).toBe(undoBefore + 1);
    // Persistenz läuft asynchron
    await new Promise((r) => setTimeout(r, 20));
    expect(((await db.bookItems.get(item.id)) as { text: string }).text).toBe('Hallo');

    await useBookStore.getState().undo();
    const restored = useBookStore.getState().getItem(item.id) as { text: string; height: number };
    expect(restored.text).toBe('');
    expect(((await db.bookItems.get(item.id)) as { text: string }).text).toBe('');
  });

  it('persistiert den Text auch, wenn die Auswahl aufgehoben wird (Tippen auf die Seite)', async () => {
    const page = useBookStore.getState().pages[0];
    const item = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, ''));
    useBookStore.getState().setEditingItem(item.id);
    useBookStore.getState().updateItemLocal(item.id, { text: 'Susi' });
    useBookStore.getState().selectItem(null);
    expect(useBookStore.getState().editingItemId).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(((await db.bookItems.get(item.id)) as { text: string }).text).toBe('Susi');
  });

  it('legt keinen Undo-Eintrag an, wenn der Text unverändert bleibt', async () => {
    const page = useBookStore.getState().pages[0];
    const item = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, 'gleich'));
    const undoBefore = useBookStore.getState().undoStack.length;
    useBookStore.getState().setEditingItem(item.id);
    useBookStore.getState().setEditingItem(null);
    expect(useBookStore.getState().undoStack.length).toBe(undoBefore);
  });

  it('wiederholt auch dann, wenn noch eine Textbearbeitung offen ist', async () => {
    const page = useBookStore.getState().pages[0];
    const item = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, 'alt'));
    await useBookStore.getState().updateItem(item.id, { text: 'neu' });
    await useBookStore.getState().undo();
    expect((useBookStore.getState().getItem(item.id) as { text: string }).text).toBe('alt');

    // Offene Bearbeitung mit Änderung: setEditingItem(null) legt einen Undo-Eintrag an
    // und leert dabei den Redo-Stapel – der gemerkte Eintrag muss trotzdem greifen.
    useBookStore.getState().setEditingItem(item.id);
    useBookStore.getState().updateItemLocal(item.id, { text: 'zwischendurch' });

    await useBookStore.getState().redo();
    expect((useBookStore.getState().getItem(item.id) as { text: string }).text).toBe('neu');
    expect(useBookStore.getState().editingItemId).toBeNull();
  });

  it('begrenzt den Undo-Stapel auf 50 Einträge', async () => {
    const page = useBookStore.getState().pages[0];
    const item = await useBookStore.getState().addItem(createTextItem(page.id, PAGE, ''));
    for (let i = 0; i < 60; i++) {
      await useBookStore.getState().updateItem(item.id, { x: i });
    }
    expect(useBookStore.getState().undoStack).toHaveLength(50);
  });
});
