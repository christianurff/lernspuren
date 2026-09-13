import { v4 as uuid } from 'uuid';
import type { Project, Card } from '../types';
import {
  projectService,
  cardService,
  zoneService,
  groupService,
  connectionService,
  backgroundTextService,
  bookService,
} from './db/database';

interface DuplicateOptions {
  asTemplate?: boolean;
  // 'all' = alle Karten, 'tasks' = nur Aufgabenkarten (iOS: "Nur Aufgaben"), 'none' = keine Karten
  cardMode?: 'all' | 'tasks' | 'none';
}

// Tiefe Kopie eines Projekts mit ID-Remapping (wie iOS ProjectShareService/Template-Nutzung).
// Verwendet für "Als Vorlage speichern" und "Vorlage verwenden".
export async function duplicateProject(
  sourceId: string,
  newName: string,
  options: DuplicateOptions = {}
): Promise<Project | null> {
  const source = await projectService.getById(sourceId);
  if (!source) return null;

  const now = Date.now();
  const newProjectId = uuid();

  const cardMode = options.cardMode ?? 'all';
  const sourceCards = cardMode === 'none' ? [] : await cardService.getAllByProject(sourceId);
  const cards = cardMode === 'tasks' ? sourceCards.filter((c) => c.type === 'task') : sourceCards;
  const zones = await zoneService.getAllByProject(sourceId);
  const groups = await groupService.getAllByProject(sourceId);
  const connections = await connectionService.getAllByProject(sourceId);
  const backgroundTexts = await backgroundTextService.getAllByProject(sourceId);

  // ID-Remapping vorbereiten
  const cardIdMap = new Map(cards.map((c) => [c.id, uuid()]));
  const groupIdMap = new Map(groups.map((g) => [g.id, uuid()]));
  // Stapel-IDs ebenfalls neu vergeben (wie canvasFile.stackIdFor), sonst teilen
  // sich Original und Kopie denselben Stapel
  const stackIdMap = new Map<string, string>();
  const stackIdFor = (stackId: string | undefined): string | undefined => {
    if (!stackId) return undefined;
    if (!stackIdMap.has(stackId)) stackIdMap.set(stackId, uuid());
    return stackIdMap.get(stackId);
  };

  const project: Project = {
    ...source,
    id: newProjectId,
    name: newName,
    isTemplate: options.asTemplate ?? false,
    isDeleted: false,
    deletedAt: undefined,
    createdAt: now,
    updatedAt: now,
    cardCount: cards.length,
  };
  await projectService.create(project);

  const cardCopies: Card[] = cards.map((card) => ({
    ...card,
    id: cardIdMap.get(card.id)!,
    projectId: newProjectId,
    stackId: stackIdFor(card.stackId),
    isDeleted: false,
    deletedAt: undefined,
    createdAt: now,
    updatedAt: now,
  }));
  await cardService.bulkCreate(cardCopies);

  for (const group of groups) {
    await groupService.create({
      ...group,
      id: groupIdMap.get(group.id)!,
      projectId: newProjectId,
      cardIds: group.cardIds
        .filter((id) => cardIdMap.has(id))
        .map((id) => cardIdMap.get(id)!),
    });
  }

  for (const zone of zones) {
    await zoneService.create({
      ...zone,
      id: uuid(),
      projectId: newProjectId,
      groupId: zone.groupId ? groupIdMap.get(zone.groupId) : undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const connection of connections) {
    // Verbindungen nur kopieren, wenn beide Karten mitkopiert wurden
    const sourceCardId = cardIdMap.get(connection.sourceCardId);
    const targetCardId = cardIdMap.get(connection.targetCardId);
    if (!sourceCardId || !targetCardId) continue;
    await connectionService.create({
      ...connection,
      id: uuid(),
      projectId: newProjectId,
      sourceCardId,
      targetCardId,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const text of backgroundTexts) {
    await backgroundTextService.create({
      ...text,
      id: uuid(),
      projectId: newProjectId,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Buch-Modus: Seiten und Elemente mit ID-Remapping kopieren
  if (source.kind === 'book') {
    const pages = await bookService.getPages(sourceId);
    const items = cardMode === 'none' ? [] : await bookService.getItems(sourceId);
    const pageIdMap = new Map(pages.map((p) => [p.id, uuid()]));
    for (const page of pages) {
      await bookService.createPage({
        ...page,
        id: pageIdMap.get(page.id)!,
        projectId: newProjectId,
        createdAt: now,
        updatedAt: now,
      });
    }
    const copiedItems = items
      .filter((item) => pageIdMap.has(item.pageId))
      .map((item) => ({
        ...item,
        id: uuid(),
        projectId: newProjectId,
        pageId: pageIdMap.get(item.pageId)!,
        createdAt: now,
        updatedAt: now,
      }));
    if (copiedItems.length > 0) await bookService.bulkCreateItems(copiedItems);
  }

  return project;
}
