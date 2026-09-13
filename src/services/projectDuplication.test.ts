import { beforeEach, describe, expect, it } from 'vitest';
import { db, cardService, projectService } from './db/database';
import { duplicateProject } from './projectDuplication';
import type { Card, Project } from '../types';

const PROJECT = 'quelle';

function textCard(id: string, stackId?: string): Card {
  return {
    id,
    projectId: PROJECT,
    type: 'text',
    size: 'medium',
    position: { x: 0, y: 0 },
    zIndex: 0,
    content: id,
    stackId,
    stackIndex: stackId ? 0 : undefined,
    createdAt: 1,
    updatedAt: 1,
  } as Card;
}

const source: Project = {
  id: PROJECT,
  name: 'Quelle',
  backgroundColor: '#fff',
  createdAt: 1,
  updatedAt: 1,
  cardCount: 0,
};

beforeEach(async () => {
  await db.cards.clear();
  await db.projects.clear();
  await db.groups.clear();
  await db.zones.clear();
  await db.connections.clear();
  await db.backgroundTexts.clear();
  await db.projects.add(source);
});

describe('duplicateProject', () => {
  it('bildet Stapel-IDs neu ab, behält aber die Stapelzugehörigkeit', async () => {
    await cardService.bulkCreate([
      textCard('a', 'stapel-1'),
      textCard('b', 'stapel-1'),
      textCard('c', 'stapel-2'),
      textCard('d'),
    ]);

    const copy = await duplicateProject(PROJECT, 'Kopie');
    expect(copy).not.toBeNull();

    const copies = await cardService.getAllByProject(copy!.id);
    expect(copies).toHaveLength(4);

    const stackIds = copies.map((c) => c.stackId);
    // Keine Stapel-ID des Originals darf weiterverwendet werden
    expect(stackIds).not.toContain('stapel-1');
    expect(stackIds).not.toContain('stapel-2');

    const withStack = copies.filter((c) => c.stackId);
    expect(withStack).toHaveLength(3);
    // Zwei Karten teilen sich weiterhin einen Stapel, die dritte hat einen eigenen
    expect(new Set(withStack.map((c) => c.stackId)).size).toBe(2);
  });

  it('setzt den Kartenzähler des Duplikats korrekt', async () => {
    await cardService.bulkCreate([textCard('a'), textCard('b')]);

    const copy = await duplicateProject(PROJECT, 'Kopie');
    const stored = await projectService.getById(copy!.id);
    expect(stored?.cardCount).toBe(2);
  });
});
