import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { BackgroundText, CanvasEvent, Card, Connection, Project, Scene, Zone } from '../types';
import type { PersistedCardGroup } from './db/database';
import { setLanguageSetting } from '../i18n';

// Der Buch-Import rendert ein Cover über <canvas>; in jsdom gibt es keins.
vi.mock('./bookRenderer', () => ({
  renderCoverThumbnail: vi.fn(async () => 'data:image/jpeg;base64,/9j/4AAQ'),
}));

const {
  CANVAS_FILE_FORMAT,
  CANVAS_FILE_VERSION,
  CANVAS_MANIFEST_NAME,
  buildCanvasFile,
  buildCanvasManifest,
  importCanvasFile,
  parseCanvasFile,
} = await import('./canvasFile');
const { importAnyFile } = await import('./projectFile');
const { buildEpub } = await import('./bookFile');
const {
  backgroundTextService,
  cardService,
  connectionService,
  db,
  eventService,
  groupService,
  projectService,
  sceneService,
  zoneService,
} = await import('./db/database');

// Mini-Medien als Data-URLs
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG_THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const AUDIO = 'data:audio/mpeg;base64,SUQzBAAAAAAA';
const VIDEO = 'data:video/webm;base64,GkXfow==';
const BACKGROUND = 'data:image/png;base64,iVBORw0KGgo=';

const project: Project = {
  id: 'p1',
  name: 'Mein Whiteboard',
  backgroundColor: '#F0F4FF',
  backgroundImage: BACKGROUND,
  backgroundImageWidth: 1200,
  backgroundImageHeight: 800,
  createdAt: 1,
  updatedAt: 2,
  cardCount: 5,
};

const cards: Card[] = [
  {
    id: 'c-photo',
    projectId: 'p1',
    type: 'photo',
    size: 'medium',
    position: { x: 40, y: 80 },
    zIndex: 1,
    frameColor: '#AEC6CF',
    label: 'Foto',
    stackId: 'stack-1',
    stackIndex: 0,
    createdAt: 10,
    updatedAt: 11,
    imageData: PNG_1X1,
    thumbnailData: JPEG_THUMB,
    annotationData: PNG_1X1,
  },
  {
    id: 'c-text',
    projectId: 'p1',
    type: 'text',
    size: 'small',
    position: { x: 200, y: 120 },
    zIndex: 2,
    createdAt: 12,
    updatedAt: 13,
    content: 'Hallo Welt',
  },
  {
    id: 'c-audio',
    projectId: 'p1',
    type: 'audio',
    size: 'small',
    position: { x: 300, y: 60 },
    zIndex: 3,
    createdAt: 14,
    updatedAt: 15,
    audioData: AUDIO,
    duration: 4,
    mimeType: 'audio/mpeg',
    transcription: 'Test',
  },
  {
    id: 'c-video',
    projectId: 'p1',
    type: 'video',
    size: 'large',
    position: { x: 400, y: 200 },
    zIndex: 4,
    createdAt: 16,
    updatedAt: 17,
    videoData: VIDEO,
    thumbnailData: JPEG_THUMB,
    mimeType: 'video/webm',
  },
  {
    id: 'c-drawing',
    projectId: 'p1',
    type: 'drawing',
    size: 'medium',
    position: { x: 500, y: 300 },
    zIndex: 5,
    createdAt: 18,
    updatedAt: 19,
    imageData: PNG_1X1,
    drawingData: '[]',
  },
  {
    id: 'c-task',
    projectId: 'p1',
    type: 'task',
    size: 'large',
    position: { x: 600, y: 400 },
    zIndex: 6,
    createdAt: 20,
    updatedAt: 21,
    taskText: 'Findest du alle Muster?',
    hints: ['Schau genau hin', 'Zähle die Ecken'],
    checklist: [
      { id: 'i1', text: 'Muster gefunden', isChecked: true },
      { id: 'i2', text: 'Muster beschrieben', isChecked: false },
    ],
  },
  {
    // Papierkorb: darf NICHT exportiert werden
    id: 'c-deleted',
    projectId: 'p1',
    type: 'text',
    size: 'small',
    position: { x: 0, y: 0 },
    zIndex: 7,
    isDeleted: true,
    deletedAt: 99,
    createdAt: 22,
    updatedAt: 23,
    content: 'Weg damit',
  },
];

const groups: PersistedCardGroup[] = [
  { id: 'g1', projectId: 'p1', name: 'Gruppe A', color: '#B5EAD7', cardIds: ['c-photo', 'c-text'] },
];

const zones: Zone[] = [
  {
    id: 'z1',
    projectId: 'p1',
    name: 'Bereich 1',
    color: '#FFD1DC',
    position: { x: 10, y: 20 },
    width: 400,
    height: 300,
    groupId: 'g1',
    createdAt: 30,
    updatedAt: 31,
  },
  {
    id: 'z2',
    projectId: 'p1',
    color: '#FDFD96',
    position: { x: 500, y: 20 },
    width: 200,
    height: 200,
    createdAt: 32,
    updatedAt: 33,
  },
];

const connections: Connection[] = [
  {
    id: 'conn1',
    projectId: 'p1',
    sourceCardId: 'c-photo',
    targetCardId: 'c-text',
    sourceAnchor: 'right',
    targetAnchor: 'left',
    lineStyle: 'curved',
    startArrow: 'none',
    endArrow: 'arrow',
    color: '#5B8DEF',
    strokeWidth: 3,
    createdAt: 40,
    updatedAt: 41,
  },
  {
    // zeigt auf eine gelöschte Karte → darf nicht exportiert werden
    id: 'conn2',
    projectId: 'p1',
    sourceCardId: 'c-photo',
    targetCardId: 'c-deleted',
    sourceAnchor: 'top',
    targetAnchor: 'bottom',
    lineStyle: 'straight',
    startArrow: 'none',
    endArrow: 'arrow',
    color: '#5B8DEF',
    strokeWidth: 2,
    createdAt: 42,
    updatedAt: 43,
  },
];

const backgroundTexts: BackgroundText[] = [
  {
    id: 'bt1',
    projectId: 'p1',
    text: 'Forscherfrage',
    position: { x: 100, y: 10 },
    fontSize: 36,
    color: '#1E3A5F',
    createdAt: 50,
    updatedAt: 51,
  },
];

// Lernspur: Kartenereignisse (werden auf Referenznummern abgebildet) und ein
// Bereichsereignis (behält seine undurchsichtige Kennung)
const events: CanvasEvent[] = [
  { id: 'e1', projectId: 'p1', timestamp: 100, eventType: 'createCard', targetId: 'c-photo', to: { x: 40, y: 80 } },
  {
    id: 'e2',
    projectId: 'p1',
    timestamp: 110,
    eventType: 'moveCard',
    targetId: 'c-photo',
    from: { x: 40, y: 80 },
    to: { x: 60, y: 90 },
  },
  { id: 'e3', projectId: 'p1', timestamp: 120, eventType: 'createZone', targetId: 'z1' },
  {
    // zeigt auf eine gelöschte Karte → darf nicht exportiert werden
    id: 'e4',
    projectId: 'p1',
    timestamp: 130,
    eventType: 'createCard',
    targetId: 'c-deleted',
  },
];

const scenes: Scene[] = [
  {
    id: 's1',
    projectId: 'p1',
    name: 'Anordnung A',
    cardStates: [
      { cardId: 'c-photo', position: { x: 40, y: 80 }, zIndex: 1 },
      // gelöschte Karte → fällt weg
      { cardId: 'c-deleted', position: { x: 0, y: 0 }, zIndex: 9 },
    ],
    zoneStates: [{ zoneId: 'z1', position: { x: 10, y: 20 }, width: 400, height: 300 }],
    canvasPosition: { x: -50, y: -20 },
    canvasScale: 1.25,
    createdAt: 60,
    updatedAt: 61,
  },
];

function build(): Promise<Blob> {
  return buildCanvasFile(project, cards, zones, groups, connections, backgroundTexts, events, scenes);
}

describe('buildCanvasManifest', () => {
  it('lässt gelöschte Karten weg und vergibt fortlaufende Referenzen', () => {
    const { manifest, media } = buildCanvasManifest(
      project,
      cards,
      zones,
      groups,
      connections,
      backgroundTexts,
      events,
      scenes,
      1234
    );

    expect(manifest.format).toBe(CANVAS_FILE_FORMAT);
    expect(manifest.version).toBe(CANVAS_FILE_VERSION);
    expect(manifest.exportedAt).toBe(1234);
    expect(manifest.cards).toHaveLength(6);
    expect(manifest.cards.map((c) => c.ref)).toEqual([1, 2, 3, 4, 5, 6]);

    // Verbindung auf die gelöschte Karte fällt weg
    expect(manifest.connections).toHaveLength(1);
    expect(manifest.connections[0]).toMatchObject({ sourceRef: 1, targetRef: 2 });

    // Gruppen- und Zonenbezüge
    expect(manifest.groups[0].cardRefs).toEqual([1, 2]);
    expect(manifest.zones[0].groupRef).toBe(manifest.groups[0].ref);
    expect(manifest.zones[1].groupRef).toBeUndefined();

    // Medien wurden als Pfade ausgelagert
    const photo = manifest.cards[0];
    expect(photo.type).toBe('photo');
    if (photo.type === 'photo') {
      expect(photo.imageData).toBe('media/card-1.png');
      expect(photo.thumbnailData).toBe('media/card-1-thumb.jpg');
      expect(photo.annotationData).toBe('media/card-1-annotation.png');
    }
    expect(manifest.project.backgroundImage).toBe('media/background.png');
    expect(media.map((m) => m.path)).toContain('media/background.png');
  });

  it('nimmt Lernspur und Szenen mit Referenznummern auf', () => {
    const { manifest } = buildCanvasManifest(
      project,
      cards,
      zones,
      groups,
      connections,
      backgroundTexts,
      events,
      scenes
    );

    // Ereignis zur gelöschten Karte fällt weg
    expect(manifest.events).toHaveLength(3);
    expect(manifest.events![0]).toMatchObject({ eventType: 'createCard', targetRef: 1 });
    expect(manifest.events![1]).toMatchObject({ eventType: 'moveCard', targetRef: 1 });
    // Bereichsereignis behält seine Kennung
    expect(manifest.events![2]).toMatchObject({ eventType: 'createZone', targetId: 'z1' });
    expect(manifest.events![2].targetRef).toBeUndefined();

    expect(manifest.zones[0].ref).toBe(1);
    expect(manifest.scenes).toHaveLength(1);
    expect(manifest.scenes![0].cardStates).toEqual([
      { cardRef: 1, position: { x: 40, y: 80 }, zIndex: 1 },
    ]);
    expect(manifest.scenes![0].zoneStates).toEqual([
      { zoneRef: 1, position: { x: 10, y: 20 }, width: 400, height: 300 },
    ]);
    expect(manifest.scenes![0].canvasScale).toBe(1.25);
  });

  it('merkt sich, dass das Projekt eine Vorlage ist', () => {
    const { manifest } = buildCanvasManifest({ ...project, isTemplate: true }, [], [], [], [], []);
    expect(manifest.project.isTemplate).toBe(true);
  });

  it('übernimmt Aufgabenkarten inkl. Tipps und Checkliste sowie Stapel', () => {
    const { manifest } = buildCanvasManifest(project, cards, [], [], [], []);
    const task = manifest.cards.find((c) => c.type === 'task');
    expect(task).toBeDefined();
    if (task?.type === 'task') {
      expect(task.hints).toEqual(['Schau genau hin', 'Zähle die Ecken']);
      expect(task.checklist).toHaveLength(2);
      expect(task.checklist[0].isChecked).toBe(true);
    }
    const photo = manifest.cards[0];
    expect(photo.stackId).toBe('stack-1');
    expect(photo.stackIndex).toBe(0);
  });
});

describe('buildCanvasFile / parseCanvasFile', () => {
  it('macht einen verlustfreien Round-Trip', async () => {
    const blob = await build();

    const zip = await JSZip.loadAsync(blob);
    expect(zip.file(CANVAS_MANIFEST_NAME)).not.toBeNull();

    const { manifest, media } = await parseCanvasFile(blob);
    expect(manifest.project.name).toBe('Mein Whiteboard');
    expect(manifest.project.backgroundImageWidth).toBe(1200);
    expect(manifest.backgroundTexts).toHaveLength(1);
    expect(manifest.backgroundTexts[0].text).toBe('Forscherfrage');

    const photo = manifest.cards[0];
    if (photo.type !== 'photo') throw new Error('Erste Karte ist kein Foto');
    expect(await media(photo.imageData)).toBe(PNG_1X1);
    expect(await media(photo.thumbnailData!)).toBe(JPEG_THUMB);
    expect(await media(manifest.project.backgroundImage!)).toBe(BACKGROUND);

    const audio = manifest.cards.find((c) => c.type === 'audio');
    if (audio?.type !== 'audio') throw new Error('Audiokarte fehlt');
    expect(await media(audio.audioData)).toBe(AUDIO);
  });

  it('meldet eine ZIP-Datei ohne Manifest als fremdes Format', async () => {
    setLanguageSetting('de');
    const zip = new JSZip();
    zip.file('irgendwas.txt', 'Hallo');
    const blob = await zip.generateAsync({ type: 'blob' });

    await expect(parseCanvasFile(blob)).rejects.toThrow(
      'Diese Datei ist keine Dokumentenraum-Pinnwand'
    );
    setLanguageSetting('auto');
  });

  it('lehnt eine neuere Version ab', async () => {
    setLanguageSetting('de');
    const zip = new JSZip();
    zip.file(
      CANVAS_MANIFEST_NAME,
      JSON.stringify({
        format: CANVAS_FILE_FORMAT,
        version: CANVAS_FILE_VERSION + 1,
        project: { name: 'Zukunft', backgroundColor: '#FFFFFF' },
        cards: [],
      })
    );
    const blob = await zip.generateAsync({ type: 'blob' });

    await expect(parseCanvasFile(blob)).rejects.toThrow('neueren Version');
    setLanguageSetting('auto');
  });
});

describe('importCanvasFile', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.projects.clear(),
      db.cards.clear(),
      db.zones.clear(),
      db.groups.clear(),
      db.connections.clear(),
      db.backgroundTexts.clear(),
      db.events.clear(),
      db.scenes.clear(),
    ]);
  });

  it('legt Projekt, Karten, Zonen und Verbindungen mit neuen IDs an', async () => {
    const blob = await build();
    const imported = await importCanvasFile(blob);

    expect(imported.id).not.toBe(project.id);
    expect(imported.kind).toBe('canvas');
    expect(imported.name).toBe('Mein Whiteboard');
    expect(imported.backgroundImage).toBe(BACKGROUND);
    expect(imported.backgroundImageWidth).toBe(1200);

    const savedProject = await projectService.getById(imported.id);
    expect(savedProject?.cardCount).toBe(6);

    const importedCards = await cardService.getAllByProject(imported.id);
    expect(importedCards).toHaveLength(6);
    expect(importedCards.every((c) => c.projectId === imported.id)).toBe(true);
    expect(importedCards.some((c) => c.id === 'c-photo')).toBe(false);

    const photo = importedCards.find((c) => c.type === 'photo');
    if (photo?.type !== 'photo') throw new Error('Fotokarte fehlt');
    expect(photo.imageData).toBe(PNG_1X1);
    expect(photo.thumbnailData).toBe(JPEG_THUMB);
    expect(photo.annotationData).toBe(PNG_1X1);
    expect(photo.stackId).toBeDefined();
    expect(photo.stackId).not.toBe('stack-1');

    const task = importedCards.find((c) => c.type === 'task');
    if (task?.type !== 'task') throw new Error('Aufgabenkarte fehlt');
    expect(task.hints).toHaveLength(2);
    expect(task.checklist[0].isChecked).toBe(true);

    // Gruppen und Zonen zeigen auf die neuen IDs
    const importedGroups = await groupService.getAllByProject(imported.id);
    expect(importedGroups).toHaveLength(1);
    const cardIds = new Set(importedCards.map((c) => c.id));
    expect(importedGroups[0].cardIds.every((id) => cardIds.has(id))).toBe(true);

    const importedZones = await zoneService.getAllByProject(imported.id);
    expect(importedZones).toHaveLength(2);
    const zoneWithGroup = importedZones.find((z) => z.name === 'Bereich 1');
    expect(zoneWithGroup?.groupId).toBe(importedGroups[0].id);

    const importedConnections = await connectionService.getAllByProject(imported.id);
    expect(importedConnections).toHaveLength(1);
    expect(cardIds.has(importedConnections[0].sourceCardId)).toBe(true);
    expect(cardIds.has(importedConnections[0].targetCardId)).toBe(true);

    const importedTexts = await backgroundTextService.getAllByProject(imported.id);
    expect(importedTexts).toHaveLength(1);
    expect(importedTexts[0].text).toBe('Forscherfrage');
  });

  it('stellt Lernspur und Szenen mit neuen IDs wieder her', async () => {
    const imported = await importCanvasFile(await build());
    const importedCards = await cardService.getAllByProject(imported.id);
    const importedZones = await zoneService.getAllByProject(imported.id);
    const photo = importedCards.find((c) => c.type === 'photo')!;

    const importedEvents = await eventService.getAllByProject(imported.id);
    expect(importedEvents).toHaveLength(3);
    expect(importedEvents[0]).toMatchObject({ eventType: 'createCard', targetId: photo.id });
    expect(importedEvents[1]).toMatchObject({ eventType: 'moveCard', targetId: photo.id, to: { x: 60, y: 90 } });
    expect(importedEvents[2].eventType).toBe('createZone');
    expect(importedEvents.every((e) => e.projectId === imported.id)).toBe(true);

    const importedScenes = await sceneService.getAllByProject(imported.id);
    expect(importedScenes).toHaveLength(1);
    expect(importedScenes[0].name).toBe('Anordnung A');
    expect(importedScenes[0].cardStates).toEqual([
      { cardId: photo.id, position: { x: 40, y: 80 }, zIndex: 1 },
    ]);
    const zoneWithGroup = importedZones.find((z) => z.name === 'Bereich 1')!;
    expect(importedScenes[0].zoneStates[0].zoneId).toBe(zoneWithGroup.id);
    expect(importedScenes[0].canvasScale).toBe(1.25);
  });

  it('liest eine Datei der Version 1 (ohne Lernspur und Szenen)', async () => {
    const zip = new JSZip();
    zip.file(
      CANVAS_MANIFEST_NAME,
      JSON.stringify({
        format: CANVAS_FILE_FORMAT,
        version: 1,
        project: { name: 'Alt', backgroundColor: '#FFFFFF' },
        cards: [
          {
            ref: 1,
            type: 'text',
            size: 'small',
            position: { x: 1, y: 2 },
            zIndex: 1,
            createdAt: 1,
            updatedAt: 2,
            content: 'Alt',
          },
        ],
        groups: [],
        zones: [{ color: '#FDFD96', position: { x: 0, y: 0 }, width: 10, height: 10, createdAt: 1, updatedAt: 1 }],
        connections: [],
        backgroundTexts: [],
        exportedAt: 1,
      })
    );
    const imported = await importCanvasFile(await zip.generateAsync({ type: 'blob' }));

    expect(imported.name).toBe('Alt');
    expect(await eventService.getAllByProject(imported.id)).toHaveLength(0);
    expect(await sceneService.getAllByProject(imported.id)).toHaveLength(0);
    expect(await zoneService.getAllByProject(imported.id)).toHaveLength(1);
  });

  it('übernimmt die Vorlagen-Kennzeichnung', async () => {
    const blob = await buildCanvasFile({ ...project, isTemplate: true }, [], [], [], [], []);
    const imported = await importCanvasFile(blob);
    expect(imported.isTemplate).toBe(true);
  });

  it('lässt bei einem Fehler kein halbes Projekt zurück', async () => {
    const before = await db.projects.count();
    // Fehler mitten im Import erzwingen (hier beim Schreiben der Karten)
    const spy = vi.spyOn(cardService, 'bulkCreate').mockRejectedValueOnce(new Error('Schreibfehler'));

    await expect(importCanvasFile(await build())).rejects.toThrow('Schreibfehler');
    spy.mockRestore();

    expect(await db.projects.count()).toBe(before);
  });

  it('übernimmt einen abweichenden Namen', async () => {
    const blob = await build();
    const imported = await importCanvasFile(blob, { name: 'Kopie' });
    expect(imported.name).toBe('Kopie');
  });
});

describe('importAnyFile', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([db.projects.clear(), db.cards.clear(), db.bookPages.clear(), db.bookItems.clear()]);
  });

  it('erkennt ein Whiteboard', async () => {
    const imported = await importAnyFile(await build());
    expect(imported.kind).toBe('canvas');
    expect(imported.name).toBe('Mein Whiteboard');
  });

  it('erkennt ein Buch', async () => {
    const bookProject: Project = {
      id: 'b1',
      name: 'Mein Buch',
      backgroundColor: '#FFFFFF',
      kind: 'book',
      bookFormat: 'portrait',
      pageCount: 1,
      createdAt: 1,
      updatedAt: 2,
      cardCount: 0,
    };
    const epub = await buildEpub(
      bookProject,
      [
        {
          id: 'page-a',
          projectId: 'b1',
          index: 0,
          backgroundColor: '#FFFFFF',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      []
    );

    const imported = await importAnyFile(epub);
    expect(imported.kind).toBe('book');
    expect(imported.name).toBe('Mein Buch');
  });

  it('meldet unbekannte Dateien', async () => {
    setLanguageSetting('de');
    const zip = new JSZip();
    zip.file('irgendwas.txt', 'Hallo');
    const blob = await zip.generateAsync({ type: 'blob' });

    await expect(importAnyFile(blob)).rejects.toThrow('Unbekanntes Dateiformat');
    setLanguageSetting('auto');
  });
});

describe('Darstellungsmodus', () => {
  it('nimmt den freien Modus mit in die Datei und zurück', async () => {
    const freiesProjekt: Project = { ...project, id: 'p-frei', cardLayout: 'free' };
    const freieKarten: Card[] = [
      {
        id: 'c-frei',
        projectId: 'p-frei',
        type: 'text',
        size: 'medium',
        position: { x: 0, y: 0 },
        zIndex: 0,
        content: 'Hallo',
        freeSize: { width: 500, height: 80 },
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const { manifest } = buildCanvasManifest(freiesProjekt, freieKarten, [], [], [], []);
    expect(manifest.project.cardLayout).toBe('free');

    const blob = await buildCanvasFile(freiesProjekt, freieKarten, [], [], [], []);
    const imported = await importCanvasFile(blob);
    expect(imported.cardLayout).toBe('free');

    const importedCards = await cardService.getAllByProject(imported.id);
    expect(importedCards[0].freeSize).toEqual({ width: 500, height: 80 });
  });
});
