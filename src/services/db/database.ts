import Dexie, { type Table } from 'dexie';
import type { Project, Card, Zone, Connection, BackgroundText, CanvasEvent, Scene, BookPage, BookItem } from '../../types';

// CardGroup type for persistence
export interface PersistedCardGroup {
  id: string;
  projectId: string;
  name?: string;
  cardIds: string[];
  color: string;
}

export class DokumentenraumDB extends Dexie {
  // Primärschlüssel sind überall String-IDs (uuid) – als Typ mitgeben, damit
  // primaryKeys() typsicher string[] liefert.
  projects!: Table<Project, string>;
  cards!: Table<Card, string>;
  zones!: Table<Zone, string>;
  groups!: Table<PersistedCardGroup, string>;
  connections!: Table<Connection, string>;
  backgroundTexts!: Table<BackgroundText, string>;
  events!: Table<CanvasEvent, string>;
  scenes!: Table<Scene, string>;
  bookPages!: Table<BookPage, string>;
  bookItems!: Table<BookItem, string>;

  constructor() {
    super('dokumentenraum');

    // Version 1: Original schema
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      cards: 'id, projectId, type, zIndex, stackId, createdAt, updatedAt',
    });

    // Version 2: Add zones and groups tables
    this.version(2).stores({
      projects: 'id, name, createdAt, updatedAt',
      cards: 'id, projectId, type, zIndex, stackId, createdAt, updatedAt',
      zones: 'id, projectId, groupId, createdAt, updatedAt',
      groups: 'id, projectId',
    });

    // Version 3: Add connections table (Verbindungen überleben jetzt einen Reload)
    this.version(3).stores({
      projects: 'id, name, createdAt, updatedAt',
      cards: 'id, projectId, type, zIndex, stackId, createdAt, updatedAt',
      zones: 'id, projectId, groupId, createdAt, updatedAt',
      groups: 'id, projectId',
      connections: 'id, projectId, sourceCardId, targetCardId',
    });

    // Version 4: Hintergrundtexte, Lernspur-Ereignisse, persistierte Szenen
    this.version(4).stores({
      projects: 'id, name, createdAt, updatedAt',
      cards: 'id, projectId, type, zIndex, stackId, createdAt, updatedAt',
      zones: 'id, projectId, groupId, createdAt, updatedAt',
      groups: 'id, projectId',
      connections: 'id, projectId, sourceCardId, targetCardId',
      backgroundTexts: 'id, projectId',
      events: 'id, projectId, timestamp',
      scenes: 'id, projectId',
    });

    // Version 5: Buch-Modus (Seiten + Elemente)
    this.version(5).stores({
      projects: 'id, name, createdAt, updatedAt',
      cards: 'id, projectId, type, zIndex, stackId, createdAt, updatedAt',
      zones: 'id, projectId, groupId, createdAt, updatedAt',
      groups: 'id, projectId',
      connections: 'id, projectId, sourceCardId, targetCardId',
      backgroundTexts: 'id, projectId',
      events: 'id, projectId, timestamp',
      scenes: 'id, projectId',
      bookPages: 'id, projectId, index',
      bookItems: 'id, projectId, pageId',
    });

    // Version 6: Papierkorb-Indizes (deletedAt) – Purge und Papierkorb-Liste
    // laufen jetzt über den Index statt über alle Karten inkl. Base64-Medien.
    this.version(6).stores({
      projects: 'id, name, createdAt, updatedAt, deletedAt',
      cards: 'id, projectId, type, zIndex, stackId, createdAt, updatedAt, deletedAt, [projectId+deletedAt]',
      zones: 'id, projectId, groupId, createdAt, updatedAt',
      groups: 'id, projectId',
      connections: 'id, projectId, sourceCardId, targetCardId',
      backgroundTexts: 'id, projectId',
      events: 'id, projectId, timestamp',
      scenes: 'id, projectId',
      bookPages: 'id, projectId, index',
      bookItems: 'id, projectId, pageId',
    });
  }
}

const REQUIRED_DB_VERSION = 6;
const DB_VERSION_KEY = 'dokumentenraum_db_version';
const RELOAD_GUARD_KEY = 'dokumentenraum_db_reload_attempted';

export const db = new DokumentenraumDB();

// Database initialization with version check and error recovery
export async function initDatabase(): Promise<void> {
  // Dexie migriert ältere Versionen verlustfrei. Ein harter Reset ist nur nötig,
  // wenn eine NEUERE Version gespeichert ist als der Code kennt (Downgrade).
  const storedVersion = Number(localStorage.getItem(DB_VERSION_KEY) ?? '0');
  const needsReset = storedVersion > REQUIRED_DB_VERSION;

  if (needsReset) {
    console.log('Database version mismatch (downgrade), resetting database...');
    try {
      await Dexie.delete('dokumentenraum');
      console.log('Old database deleted');
    } catch (e) {
      console.error('Failed to delete old database:', e);
    }
  }

  try {
    await db.open();
    // Store current version after successful open
    localStorage.setItem(DB_VERSION_KEY, String(REQUIRED_DB_VERSION));
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    console.log('Database initialized successfully');
    // Papierkorb aufräumen (Auto-Purge nach 30 Tagen)
    purgeExpiredTrash().catch((e) => console.error('Trash purge failed:', e));
  } catch (error) {
    // Nur ein echtes Downgrade (gespeicherte DB ist neuer als der Code) rechtfertigt
    // das Löschen der Datenbank. Alle anderen Fehler (z. B. blockierte Upgrades,
    // Speicherprobleme) werden weitergereicht – sonst gehen Daten verloren und die
    // Seite lädt sich endlos neu.
    const name = (error as { name?: string } | null)?.name;
    const isDowngrade = name === 'VersionError';
    if (!isDowngrade) {
      console.error('Database open failed:', error);
      throw error;
    }

    console.warn('Database downgrade detected, resetting database...');
    await Dexie.delete('dokumentenraum');
    localStorage.removeItem(DB_VERSION_KEY);

    // Reload-Guard: höchstens ein automatischer Neuladeversuch pro Sitzung
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      console.error('Database reset already attempted in this session, giving up.');
      throw error;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    window.location.reload();
  }
}

// Call initialization immediately
initDatabase().catch(console.error);

// Papierkorb: Einträge älter als 30 Tage werden beim Start endgültig entfernt
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Anzahl der Karten im Papierkorb eines Projekts – rein über den Index gezählt.
// `before` grenzt optional auf abgelaufene Einträge ein.
async function countDeletedCards(projectId: string, before = Infinity): Promise<number> {
  return db.cards
    .where('[projectId+deletedAt]')
    .between([projectId, Dexie.minKey], [projectId, before], true, false)
    .count();
}

// Project Service
export const projectService = {
  async getAll(): Promise<Project[]> {
    const projects = await db.projects.orderBy('updatedAt').reverse().toArray();
    return projects.filter((p) => !p.isDeleted && !p.isTemplate);
  },

  async getTemplates(): Promise<Project[]> {
    const projects = await db.projects.orderBy('updatedAt').reverse().toArray();
    return projects.filter((p) => p.isTemplate && !p.isDeleted);
  },

  async getDeleted(): Promise<Project[]> {
    // Über den deletedAt-Index: nur Papierkorb-Einträge werden geladen
    return db.projects.where('deletedAt').above(0).reverse().toArray();
  },

  async getById(id: string): Promise<Project | undefined> {
    return db.projects.get(id);
  },

  async create(project: Project): Promise<string> {
    return db.projects.add(project);
  },

  async update(id: string, changes: Partial<Project>): Promise<number> {
    return db.projects.update(id, { ...changes, updatedAt: Date.now() });
  },

  /**
   * Änderung ohne neuen Zeitstempel – für alles, was nebenbei entsteht und
   * keine Bearbeitung ist (z. B. die Vorschau in der Projektübersicht).
   * Sonst rutschte ein Projekt allein vom Anschauen in der Liste nach oben.
   */
  async updateSilently(id: string, changes: Partial<Project>): Promise<number> {
    return db.projects.update(id, changes);
  },

  async softDelete(id: string): Promise<void> {
    await db.projects.update(id, { isDeleted: true, deletedAt: Date.now() });
  },

  async restore(id: string): Promise<void> {
    await db.projects.update(id, { isDeleted: false, deletedAt: undefined, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.projects, db.cards, db.zones, db.groups, db.connections, db.backgroundTexts, db.events, db.scenes, db.bookPages, db.bookItems], async () => {
      await db.cards.where('projectId').equals(id).delete();
      await db.bookPages.where('projectId').equals(id).delete();
      await db.bookItems.where('projectId').equals(id).delete();
      await db.zones.where('projectId').equals(id).delete();
      await db.groups.where('projectId').equals(id).delete();
      await db.connections.where('projectId').equals(id).delete();
      await db.backgroundTexts.where('projectId').equals(id).delete();
      await db.events.where('projectId').equals(id).delete();
      await db.scenes.where('projectId').equals(id).delete();
      await db.projects.delete(id);
    });
  },

  async updateCardCount(projectId: string): Promise<void> {
    // Nur zählen, keine Karten (inkl. Base64-Medien) laden.
    // Gelöschte Karten stehen im Compound-Index [projectId+deletedAt] – nicht
    // gelöschte Karten haben kein deletedAt und tauchen dort nicht auf.
    const total = await db.cards.where('projectId').equals(projectId).count();
    const deleted = await countDeletedCards(projectId);
    await db.projects.update(projectId, { cardCount: total - deleted, updatedAt: Date.now() });
  },
};

// Card Service
export const cardService = {
  async getAllByProject(projectId: string): Promise<Card[]> {
    const cards = await db.cards.where('projectId').equals(projectId).toArray();
    return cards.filter((c) => !c.isDeleted);
  },

  async getAllByProjectIncludingDeleted(projectId: string): Promise<Card[]> {
    return db.cards.where('projectId').equals(projectId).toArray();
  },

  async getDeleted(): Promise<Card[]> {
    // Über den deletedAt-Index: nur Papierkorb-Karten werden geladen
    return db.cards.where('deletedAt').above(0).reverse().toArray();
  },

  async getById(id: string): Promise<Card | undefined> {
    return db.cards.get(id);
  },

  async create(card: Card): Promise<string> {
    const id = await db.cards.add(card);
    await projectService.updateCardCount(card.projectId);
    return id;
  },

  // Mehrere Karten auf einmal anlegen: ein bulkAdd statt n Einzelschreibvorgängen,
  // Kartenzähler wird nur einmal aktualisiert (Import, Duplizieren).
  async bulkCreate(cards: Card[]): Promise<void> {
    if (cards.length === 0) return;
    await db.cards.bulkAdd(cards);
    const projectIds = [...new Set(cards.map((c) => c.projectId))];
    for (const projectId of projectIds) {
      await projectService.updateCardCount(projectId);
    }
  },

  async update(id: string, changes: Partial<Card>): Promise<number> {
    const result = await db.cards.update(id, { ...changes, updatedAt: Date.now() });
    return result;
  },

  // Mehrere Karten in einer Transaktion aktualisieren (Anordnen, Gruppen verschieben)
  async bulkUpdate(updates: { id: string; changes: Partial<Card> }[]): Promise<void> {
    if (updates.length === 0) return;
    const updatedAt = Date.now();
    await db.transaction('rw', db.cards, async () => {
      await Promise.all(
        updates.map((u) => db.cards.update(u.id, { ...u.changes, updatedAt }))
      );
    });
  },

  async softDelete(id: string): Promise<void> {
    const card = await db.cards.get(id);
    if (card) {
      await db.cards.update(id, { isDeleted: true, deletedAt: Date.now() });
      await projectService.updateCardCount(card.projectId);
    }
  },

  async restore(id: string): Promise<Card | undefined> {
    const card = await db.cards.get(id);
    if (card) {
      await db.cards.update(id, { isDeleted: false, deletedAt: undefined, updatedAt: Date.now() });
      await projectService.updateCardCount(card.projectId);
      return db.cards.get(id);
    }
    return undefined;
  },

  // Hard-Delete (nur aus dem Papierkorb): Karte und ihre Verbindungen verschwinden
  // gemeinsam, sonst blieben verwaiste Verbindungen zurück.
  async delete(id: string): Promise<void> {
    const card = await db.cards.get(id);
    if (!card) return;
    await db.transaction('rw', [db.cards, db.connections], async () => {
      await connectionService.deleteByCard(id);
      await db.cards.delete(id);
    });
    await projectService.updateCardCount(card.projectId);
  },

  async getMaxZIndex(projectId: string): Promise<number> {
    const cards = await db.cards.where('projectId').equals(projectId).toArray();
    if (cards.length === 0) return 0;
    return Math.max(...cards.map(c => c.zIndex));
  },

  async bringToFront(id: string): Promise<void> {
    const card = await db.cards.get(id);
    if (card) {
      const maxZIndex = await this.getMaxZIndex(card.projectId);
      await db.cards.update(id, { zIndex: maxZIndex + 1, updatedAt: Date.now() });
    }
  },
};

// Zone Service
export const zoneService = {
  async getAllByProject(projectId: string): Promise<Zone[]> {
    return db.zones.where('projectId').equals(projectId).toArray();
  },

  async getById(id: string): Promise<Zone | undefined> {
    return db.zones.get(id);
  },

  async create(zone: Zone): Promise<string> {
    return db.zones.add(zone);
  },

  async update(id: string, changes: Partial<Zone>): Promise<number> {
    return db.zones.update(id, { ...changes, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await db.zones.delete(id);
  },

  async deleteByProject(projectId: string): Promise<void> {
    await db.zones.where('projectId').equals(projectId).delete();
  },
};

// Group Service
export const groupService = {
  async getAllByProject(projectId: string): Promise<PersistedCardGroup[]> {
    return db.groups.where('projectId').equals(projectId).toArray();
  },

  async getById(id: string): Promise<PersistedCardGroup | undefined> {
    return db.groups.get(id);
  },

  async create(group: PersistedCardGroup): Promise<string> {
    return db.groups.add(group);
  },

  async update(id: string, changes: Partial<PersistedCardGroup>): Promise<number> {
    return db.groups.update(id, changes);
  },

  async delete(id: string): Promise<void> {
    await db.groups.delete(id);
  },

  async deleteByProject(projectId: string): Promise<void> {
    await db.groups.where('projectId').equals(projectId).delete();
  },
};

// Connection Service
export const connectionService = {
  async getAllByProject(projectId: string): Promise<Connection[]> {
    return db.connections.where('projectId').equals(projectId).toArray();
  },

  async create(connection: Connection): Promise<string> {
    return db.connections.add(connection);
  },

  async update(id: string, changes: Partial<Connection>): Promise<number> {
    return db.connections.update(id, changes);
  },

  async delete(id: string): Promise<void> {
    await db.connections.delete(id);
  },

  async deleteByCard(cardId: string): Promise<void> {
    await db.connections.where('sourceCardId').equals(cardId).delete();
    await db.connections.where('targetCardId').equals(cardId).delete();
  },

  async deleteByProject(projectId: string): Promise<void> {
    await db.connections.where('projectId').equals(projectId).delete();
  },
};

// Background Text Service (Hintergrundtexte, Lehrkraft-Modus)
export const backgroundTextService = {
  async getAllByProject(projectId: string): Promise<BackgroundText[]> {
    return db.backgroundTexts.where('projectId').equals(projectId).toArray();
  },

  async create(text: BackgroundText): Promise<string> {
    return db.backgroundTexts.add(text);
  },

  async update(id: string, changes: Partial<BackgroundText>): Promise<number> {
    return db.backgroundTexts.update(id, { ...changes, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await db.backgroundTexts.delete(id);
  },
};

// Event Service (Lernspur-Ereignisse für die Wiedergabe)
export const eventService = {
  async getAllByProject(projectId: string): Promise<CanvasEvent[]> {
    return db.events.where('projectId').equals(projectId).sortBy('timestamp');
  },

  async countByProject(projectId: string): Promise<number> {
    return db.events.where('projectId').equals(projectId).count();
  },

  async add(event: CanvasEvent): Promise<string> {
    return db.events.add(event);
  },

  // Zeitmaschine: exakt die übergebenen Ereignisse behalten, alle anderen des
  // Projekts löschen. Über IDs statt über den Zeitstempel, sonst überleben
  // Ereignisse mit identischem Millisekunden-Stempel.
  async keepOnly(projectId: string, keepIds: string[]): Promise<void> {
    const keep = new Set(keepIds);
    const allIds = await db.events.where('projectId').equals(projectId).primaryKeys();
    const toDelete = allIds.filter((id) => !keep.has(id));
    if (toDelete.length > 0) await db.events.bulkDelete(toDelete);
  },

  async deleteByProject(projectId: string): Promise<void> {
    await db.events.where('projectId').equals(projectId).delete();
  },
};

// Scene Service (persistierte Szenen)
export const sceneService = {
  async getAllByProject(projectId: string): Promise<Scene[]> {
    return db.scenes.where('projectId').equals(projectId).toArray();
  },

  async create(scene: Scene): Promise<string> {
    return db.scenes.add(scene);
  },

  async update(id: string, changes: Partial<Scene>): Promise<number> {
    return db.scenes.update(id, { ...changes, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await db.scenes.delete(id);
  },
};

// Book Service (Buch-Modus: Seiten und Elemente)
export const bookService = {
  async getPages(projectId: string): Promise<BookPage[]> {
    const pages = await db.bookPages.where('projectId').equals(projectId).toArray();
    return pages.sort((a, b) => a.index - b.index);
  },

  async getItems(projectId: string): Promise<BookItem[]> {
    return db.bookItems.where('projectId').equals(projectId).toArray();
  },

  async getItemsByPage(pageId: string): Promise<BookItem[]> {
    return db.bookItems.where('pageId').equals(pageId).toArray();
  },

  async createPage(page: BookPage): Promise<string> {
    const id = await db.bookPages.add(page);
    await this.updatePageCount(page.projectId);
    return id;
  },

  async updatePage(id: string, changes: Partial<BookPage>): Promise<number> {
    return db.bookPages.update(id, { ...changes, updatedAt: Date.now() });
  },

  // Seitenreihenfolge lückenlos schreiben (index = Position im Array)
  async setPageOrder(pageIds: string[]): Promise<void> {
    await db.transaction('rw', db.bookPages, async () => {
      await Promise.all(pageIds.map((id, index) => db.bookPages.update(id, { index })));
    });
  },

  async deletePage(id: string): Promise<void> {
    const page = await db.bookPages.get(id);
    await db.transaction('rw', [db.bookPages, db.bookItems], async () => {
      await db.bookItems.where('pageId').equals(id).delete();
      await db.bookPages.delete(id);
    });
    if (page) await this.updatePageCount(page.projectId);
  },

  async createItem(item: BookItem): Promise<string> {
    return db.bookItems.add(item);
  },

  async bulkCreateItems(items: BookItem[]): Promise<void> {
    await db.bookItems.bulkAdd(items);
  },

  async updateItem(id: string, changes: Partial<BookItem>): Promise<number> {
    return db.bookItems.update(id, { ...changes, updatedAt: Date.now() } as Partial<BookItem>);
  },

  async deleteItem(id: string): Promise<void> {
    await db.bookItems.delete(id);
  },

  async updatePageCount(projectId: string): Promise<void> {
    const pageCount = await db.bookPages.where('projectId').equals(projectId).count();
    await db.projects.update(projectId, { pageCount, updatedAt: Date.now() });
  },
};

// Papierkorb: alte Einträge endgültig entfernen (wie iOS: 30 Tage)
export async function purgeExpiredTrash(): Promise<void> {
  const cutoff = Date.now() - TRASH_RETENTION_MS;

  // Abgelaufene Projekte: nur die IDs über den Index holen, nicht die Projekte selbst
  const expiredProjectIds = await db.projects.where('deletedAt').below(cutoff).primaryKeys();
  for (const projectId of expiredProjectIds) {
    await projectService.delete(projectId);
  }

  // Abgelaufene Karten: IDs über den Index, dann gebündelt löschen.
  // Vorher merken, welche Projekte betroffen sind (reine Index-Zählung,
  // es werden keine Karteninhalte geladen).
  const expiredCardIds = await db.cards.where('deletedAt').below(cutoff).primaryKeys();
  if (expiredCardIds.length === 0) return;

  const projectIds = await db.projects.toCollection().primaryKeys();
  const affectedProjectIds: string[] = [];
  for (const projectId of projectIds) {
    if ((await countDeletedCards(projectId, cutoff)) > 0) affectedProjectIds.push(projectId);
  }

  await db.transaction('rw', [db.cards, db.connections], async () => {
    for (const cardId of expiredCardIds) {
      await connectionService.deleteByCard(cardId);
    }
    await db.cards.bulkDelete(expiredCardIds);
  });

  for (const projectId of affectedProjectIds) {
    await projectService.updateCardCount(projectId);
  }
}
