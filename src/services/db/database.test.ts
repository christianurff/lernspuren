import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  cardService,
  projectService,
  connectionService,
  eventService,
  purgeExpiredTrash,
} from './database';
import type { Card, Connection, Project, TextCard } from '../../types';

const PROJECT = 'projekt-db';

function project(id = PROJECT): Project {
  return {
    id,
    name: 'Testprojekt',
    backgroundColor: '#fff',
    createdAt: 1,
    updatedAt: 1,
    cardCount: 0,
  };
}

function textCard(id: string, overrides: Partial<TextCard> = {}): Card {
  return {
    id,
    projectId: PROJECT,
    type: 'text',
    size: 'medium',
    position: { x: 0, y: 0 },
    zIndex: 0,
    content: 'Text',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Card;
}

function connection(id: string, source: string, target: string): Connection {
  return {
    id,
    projectId: PROJECT,
    sourceCardId: source,
    targetCardId: target,
    sourceAnchor: 'right',
    targetAnchor: 'left',
    lineStyle: 'straight',
    startArrow: 'none',
    endArrow: 'arrow',
    color: '#000',
    strokeWidth: 2,
    createdAt: 1,
    updatedAt: 1,
  };
}

async function reset() {
  await db.cards.clear();
  await db.projects.clear();
  await db.connections.clear();
  await db.events.clear();
  await db.projects.add(project());
}

describe('cardService – Papierkorb und Massenoperationen', () => {
  beforeEach(reset);

  it('getDeleted liefert nur gelöschte Karten, neueste zuerst', async () => {
    await cardService.bulkCreate([textCard('a'), textCard('b'), textCard('c')]);
    await cardService.softDelete('a');
    await db.cards.update('a', { deletedAt: 1000 });
    await cardService.softDelete('c');
    await db.cards.update('c', { deletedAt: 2000 });

    const deleted = await cardService.getDeleted();
    expect(deleted.map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('bulkCreate legt alle Karten an und aktualisiert den Kartenzähler einmal', async () => {
    await cardService.bulkCreate([textCard('a'), textCard('b'), textCard('c')]);

    expect(await db.cards.count()).toBe(3);
    expect((await projectService.getById(PROJECT))?.cardCount).toBe(3);
  });

  it('zählt gelöschte Karten nicht mit', async () => {
    await cardService.bulkCreate([textCard('a'), textCard('b')]);
    await cardService.softDelete('a');

    expect((await projectService.getById(PROJECT))?.cardCount).toBe(1);

    await cardService.restore('a');
    expect((await projectService.getById(PROJECT))?.cardCount).toBe(2);
  });

  it('bulkUpdate schreibt alle Änderungen', async () => {
    await cardService.bulkCreate([textCard('a'), textCard('b')]);

    await cardService.bulkUpdate([
      { id: 'a', changes: { position: { x: 10, y: 20 }, zIndex: 5 } },
      { id: 'b', changes: { position: { x: 30, y: 40 }, zIndex: 6 } },
    ]);

    const a = await cardService.getById('a');
    const b = await cardService.getById('b');
    expect(a?.position).toEqual({ x: 10, y: 20 });
    expect(a?.zIndex).toBe(5);
    expect(b?.position).toEqual({ x: 30, y: 40 });
  });

  it('Hard-Delete entfernt auch die Verbindungen der Karte', async () => {
    await cardService.bulkCreate([textCard('a'), textCard('b')]);
    await connectionService.create(connection('v1', 'a', 'b'));
    await connectionService.create(connection('v2', 'b', 'a'));

    await cardService.delete('a');

    expect(await db.connections.count()).toBe(0);
    expect(await cardService.getById('a')).toBeUndefined();
  });
});

describe('purgeExpiredTrash', () => {
  beforeEach(reset);

  it('löscht abgelaufene Karten inkl. Verbindungen und behält frische', async () => {
    await cardService.bulkCreate([textCard('alt'), textCard('neu')]);
    await connectionService.create(connection('v1', 'alt', 'neu'));

    const alt = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await db.cards.update('alt', { isDeleted: true, deletedAt: alt });
    await db.cards.update('neu', { isDeleted: true, deletedAt: Date.now() });

    await purgeExpiredTrash();

    expect(await cardService.getById('alt')).toBeUndefined();
    expect(await cardService.getById('neu')).toBeDefined();
    expect(await db.connections.count()).toBe(0);
  });

  it('löscht abgelaufene Projekte samt Karten', async () => {
    await cardService.bulkCreate([textCard('a')]);
    const alt = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await db.projects.update(PROJECT, { isDeleted: true, deletedAt: alt });

    await purgeExpiredTrash();

    expect(await projectService.getById(PROJECT)).toBeUndefined();
    expect(await db.cards.count()).toBe(0);
  });
});

describe('eventService', () => {
  beforeEach(reset);

  it('countByProject zählt ohne die Ereignisse zu laden', async () => {
    await eventService.add({ id: 'e1', projectId: PROJECT, eventType: 'createCard', targetId: 'a', timestamp: 1 });
    await eventService.add({ id: 'e2', projectId: PROJECT, eventType: 'createCard', targetId: 'b', timestamp: 1 });

    expect(await eventService.countByProject(PROJECT)).toBe(2);
    expect(await eventService.countByProject('anderes')).toBe(0);
  });

  it('keepOnly behält genau die übergebenen Ereignisse – auch bei gleichem Zeitstempel', async () => {
    await eventService.add({ id: 'e1', projectId: PROJECT, eventType: 'createCard', targetId: 'a', timestamp: 5 });
    await eventService.add({ id: 'e2', projectId: PROJECT, eventType: 'createCard', targetId: 'b', timestamp: 5 });
    await eventService.add({ id: 'e3', projectId: PROJECT, eventType: 'createCard', targetId: 'c', timestamp: 5 });

    await eventService.keepOnly(PROJECT, ['e1', 'e2']);

    const rest = await eventService.getAllByProject(PROJECT);
    expect(rest.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });
});
