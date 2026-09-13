import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, cardService, groupService, zoneService } from '../services/db/database';
import { useCardsStore } from './useCardsStore';
import { useZonesStore } from './useZonesStore';
import { useHistoryStore } from './useHistoryStore';
import { useProjectStore } from './useProjectStore';
import type { Card, Project, Zone } from '../types';

const PROJECT = 'projekt-karten';

function project(id = PROJECT): Project {
  return { id, name: 'Test', backgroundColor: '#fff', createdAt: 1, updatedAt: 1, cardCount: 0 };
}

function textCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    projectId: PROJECT,
    type: 'text',
    size: 'medium',
    position: { x: 0, y: 0 },
    zIndex: 0,
    content: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Card;
}

async function seed(cards: Card[]) {
  await db.cards.clear();
  await db.projects.clear();
  await db.groups.clear();
  await db.zones.clear();
  await db.projects.add(project());
  await cardService.bulkCreate(cards);
  useCardsStore.setState({
    cards,
    groups: [],
    selectedCardId: null,
    selectedCardIds: [],
    currentSortCriteria: null,
    lastLoadedProjectId: PROJECT,
  });
  useZonesStore.setState({ zones: [] });
  useHistoryStore.getState().clear();
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('loadCards', () => {
  it('verwirft das Ergebnis eines veralteten Projektwechsels', async () => {
    await seed([]);
    const langsam = [textCard('alt', { projectId: 'A' })];
    const schnell = [textCard('neu', { projectId: 'B' })];

    vi.spyOn(cardService, 'getAllByProject').mockImplementation(async (projectId: string) => {
      if (projectId === 'A') {
        await new Promise((r) => setTimeout(r, 30));
        return langsam;
      }
      return schnell;
    });

    const first = useCardsStore.getState().loadCards('A', true);
    const second = useCardsStore.getState().loadCards('B', true);
    await Promise.all([first, second]);

    expect(useCardsStore.getState().cards.map((c) => c.id)).toEqual(['neu']);
    expect(useCardsStore.getState().lastLoadedProjectId).toBe('B');
    expect(useCardsStore.getState().isLoading).toBe(false);
  });
});

describe('Anordnen', () => {
  it('vergibt zIndex oberhalb der gruppierten Karten', async () => {
    const cards = [
      textCard('g1', { zIndex: 7 }),
      textCard('u1', { zIndex: 1 }),
      textCard('u2', { zIndex: 2 }),
    ];
    await seed(cards);
    useCardsStore.setState({
      groups: [{ id: 'gruppe', projectId: PROJECT, cardIds: ['g1'], color: '#fff' }],
    });

    await useCardsStore.getState().arrangeInGrid();

    const state = useCardsStore.getState();
    const zIndices = state.cards.filter((c) => c.id !== 'g1').map((c) => c.zIndex);
    expect(Math.min(...zIndices)).toBeGreaterThan(7);
    expect(new Set(state.cards.map((c) => c.zIndex)).size).toBe(3);
  });

  it('schreibt die Rasterpositionen auch in die Datenbank', async () => {
    await seed([textCard('a'), textCard('b')]);

    await useCardsStore.getState().arrangeInGrid();

    const stored = await cardService.getAllByProject(PROJECT);
    const state = useCardsStore.getState().cards;
    for (const card of stored) {
      const inState = state.find((c) => c.id === card.id)!;
      expect(card.position).toEqual(inState.position);
      expect(card.zIndex).toBe(inState.zIndex);
    }
  });
});

describe('checkAndCreateStack', () => {
  it('liefert die Drop-Position, wenn nicht gestapelt wird', async () => {
    await seed([textCard('a', { position: { x: 0, y: 0 } })]);

    const result = await useCardsStore.getState().checkAndCreateStack('a', { x: 500, y: 500 });
    expect(result).toEqual({ x: 500, y: 500 });
  });

  it('liefert die Stapelposition, wenn gestapelt wird', async () => {
    await seed([
      textCard('ziel', { position: { x: 100, y: 100 } }),
      textCard('a', { position: { x: 110, y: 110 } }),
    ]);

    const result = await useCardsStore.getState().checkAndCreateStack('a', { x: 110, y: 110 });
    expect(result).toEqual({ x: 100, y: 100 });

    const gespeichert = await cardService.getById('a');
    expect(gespeichert?.position).toEqual({ x: 100, y: 100 });
    expect(gespeichert?.stackId).toBeTruthy();
  });
});

describe('moveGroupedCard', () => {
  it('schreibt identische absolute Positionen in DB und State', async () => {
    await seed([
      textCard('a', { position: { x: 0, y: 0 } }),
      textCard('b', { position: { x: 50, y: 50 } }),
    ]);
    useCardsStore.setState({
      groups: [{ id: 'gruppe', projectId: PROJECT, cardIds: ['a', 'b'], color: '#fff' }],
    });

    await useCardsStore.getState().moveGroupedCard('a', { x: 20, y: 30 });

    const state = useCardsStore.getState().cards;
    expect(state.find((c) => c.id === 'a')?.position).toEqual({ x: 20, y: 30 });
    expect(state.find((c) => c.id === 'b')?.position).toEqual({ x: 70, y: 80 });

    expect((await cardService.getById('a'))?.position).toEqual({ x: 20, y: 30 });
    expect((await cardService.getById('b'))?.position).toEqual({ x: 70, y: 80 });
  });
});

describe('deleteGroup + Undo', () => {
  it('stellt Bereich und Gruppe gemeinsam wieder her', async () => {
    await seed([textCard('a'), textCard('b')]);
    const group = { id: 'gruppe', projectId: PROJECT, cardIds: ['a', 'b'], color: '#98D8C8' };
    await groupService.create(group);
    const zone: Zone = {
      id: 'bereich',
      projectId: PROJECT,
      name: 'Gruppe 1',
      color: 'rgba(0,0,0,0.2)',
      position: { x: 0, y: 0 },
      width: 200,
      height: 200,
      groupId: 'gruppe',
      createdAt: 1,
      updatedAt: 1,
    };
    await zoneService.create(zone);
    useCardsStore.setState({ groups: [group] });
    useZonesStore.setState({ zones: [zone] });

    await useCardsStore.getState().deleteGroup('gruppe');
    expect(useCardsStore.getState().groups).toHaveLength(0);
    expect(useZonesStore.getState().zones).toHaveLength(0);

    await useHistoryStore.getState().undo();

    expect(useCardsStore.getState().groups.map((g) => g.id)).toEqual(['gruppe']);
    expect(useZonesStore.getState().zones.map((z) => z.id)).toEqual(['bereich']);
    expect(await groupService.getById('gruppe')).toBeDefined();
    expect(await zoneService.getById('bereich')).toBeDefined();

    // Redo entfernt beides wieder
    await useHistoryStore.getState().redo();
    expect(useCardsStore.getState().groups).toHaveLength(0);
    expect(await groupService.getById('gruppe')).toBeUndefined();
  });
});

describe('duplicateCard', () => {
  it('legt eine versetzte Kopie oben auf und wählt sie aus', async () => {
    await seed([
      textCard('a', { position: { x: 100, y: 50 }, zIndex: 3, content: 'Hallo', label: 'Karte A' }),
      textCard('b', { zIndex: 7 }),
    ]);

    const copy = await useCardsStore.getState().duplicateCard('a');

    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe('a');
    expect(copy!.position).toEqual({ x: 124, y: 74 });
    expect(copy!.zIndex).toBe(8);
    expect((copy as { content: string }).content).toBe('Hallo');
    expect(copy!.label).toBe('Karte A');
    expect(useCardsStore.getState().selectedCardId).toBe(copy!.id);
    expect(await cardService.getById(copy!.id)).toBeTruthy();
  });

  it('löst die Kopie aus dem Stapel der Vorlage', async () => {
    await seed([textCard('a', { stackId: 'stapel-1', stackIndex: 2 })]);

    const copy = await useCardsStore.getState().duplicateCard('a');

    expect(copy!.stackId).toBeUndefined();
    expect(copy!.stackIndex).toBeUndefined();
  });

  it('gibt null zurück, wenn die Karte fehlt', async () => {
    await seed([]);
    expect(await useCardsStore.getState().duplicateCard('weg')).toBeNull();
  });
});

describe('Freie Kartengrößen', () => {
  // jsdom lädt keine Bilder – ein Ersatz mit festem Seitenverhältnis 2:1
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 400;
    naturalHeight = 200;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  async function seedProject(cards: Card[], cardLayout?: 'square' | 'free') {
    await seed(cards);
    useProjectStore.setState({
      projects: [{ ...project(), ...(cardLayout ? { cardLayout } : {}) }],
      currentProjectId: PROJECT,
    });
  }

  it('gibt beim Wechsel jeder Karte ihre natürliche Größe', async () => {
    vi.stubGlobal('Image', FakeImage);
    const foto = {
      ...textCard('foto'),
      type: 'photo',
      imageData: 'data:image/png;base64,AA',
    } as unknown as Card;
    await seedProject([foto, textCard('t1', { size: 'large' })]);

    await useCardsStore.getState().setCardLayout(PROJECT, 'free');

    const cards = useCardsStore.getState().cards;
    expect(cards.find((c) => c.id === 'foto')!.freeSize).toEqual({ width: 200, height: 100 });
    expect(cards.find((c) => c.id === 't1')!.freeSize!.width).toBe(320);
    expect(useProjectStore.getState().projects[0].cardLayout).toBe('free');
    vi.unstubAllGlobals();
  });

  it('lässt vorhandene freie Maße unangetastet', async () => {
    await seedProject([textCard('t1', { freeSize: { width: 500, height: 80 } })]);

    await useCardsStore.getState().setCardLayout(PROJECT, 'free');

    expect(useCardsStore.getState().cards[0].freeSize).toEqual({ width: 500, height: 80 });
  });

  it('behält die freien Maße beim Zurückschalten', async () => {
    await seedProject([textCard('t1', { freeSize: { width: 500, height: 80 } })], 'free');

    await useCardsStore.getState().setCardLayout(PROJECT, 'square');

    expect(useCardsStore.getState().cards[0].freeSize).toEqual({ width: 500, height: 80 });
    expect(useProjectStore.getState().projects[0].cardLayout).toBe('square');
  });

  it('rechnet mit den freien Maßen in der Bounding-Box', async () => {
    await seedProject([textCard('t1', { freeSize: { width: 500, height: 80 } })], 'free');

    expect(useCardsStore.getState().getBoundingBox()).toMatchObject({ width: 500, height: 80 });
  });

  it('gibt neuen Karten im freien Modus gleich ihre Größe', async () => {
    await seedProject([], 'free');

    const created = await useCardsStore.getState().addTextCard(PROJECT, 'Hallo');

    expect(created.freeSize).toEqual({ width: 320, height: expect.any(Number) });
  });

  it('gibt neuen Karten im quadratischen Modus keine freien Maße', async () => {
    await seedProject([]);

    const created = await useCardsStore.getState().addTextCard(PROJECT, 'Hallo');

    expect(created.freeSize).toBeUndefined();
  });

  it('passt die Höhe einer freien Textkarte an neuen Inhalt an', async () => {
    await seedProject([textCard('t1', { freeSize: { width: 320, height: 40 } })], 'free');

    await useCardsStore.getState().updateCard('t1', {
      content: 'Ein deutlich längerer Text als vorher, der über mehrere Zeilen laufen muss',
    } as Partial<Card>);

    const freeSize = useCardsStore.getState().cards[0].freeSize!;
    expect(freeSize.width).toBe(320);
    expect(freeSize.height).toBeGreaterThan(40);
  });
});
