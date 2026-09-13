/**
 * canvasFile – Export und Import eines Whiteboard-Projekts als `.lernspur`-Datei.
 *
 * Aufbau der Datei (ZIP-Container, wie die EPUB beim Buch):
 *   dokumentenraum-canvas.json   Manifest: Projekt, Karten, Zonen, Gruppen,
 *                                Verbindungen, Hintergrundtexte, Lernspur
 *                                (Ereignisprotokoll) und Szenen
 *   media/…                      alle Medien (Fotos, Videos, Audios,
 *                                Zeichnungen, Hintergrundbild) als Binärdateien
 *
 * Karten haben im Manifest keine Datenbank-IDs, sondern eine laufende Nummer
 * (`ref`). Gruppen, Zonen und Verbindungen verweisen über diese Nummern
 * aufeinander, sodass der Import alle Bezüge auf neue UUIDs abbilden kann.
 *
 * Alles läuft lokal im Browser (JSZip), es gibt keinen Server.
 */
import type JSZip from 'jszip';
import { saveBlob } from '../utils/nativeBridge';
import { v4 as uuid } from 'uuid';
import type {
  BackgroundText,
  CanvasEvent,
  Card,
  CardLayout,
  Connection,
  Position,
  Project,
  Scene,
  Zone,
} from '../types';
import {
  bytesToDataUrl,
  dataUrlToBytes,
  extensionForMime,
  mimeForPath,
} from './bookFile';
import {
  backgroundTextService,
  cardService,
  connectionService,
  eventService,
  groupService,
  projectService,
  sceneService,
  zoneService,
  type PersistedCardGroup,
} from './db/database';
import { t } from '../i18n';

/** Kennung, an der ein Dokumentenraum-Whiteboard erkannt wird. */
export const CANVAS_FILE_FORMAT = 'dokumentenraum-canvas';

/**
 * Version des Manifests im Container. Wird beim Import geprüft.
 * 1 = Projekt, Karten, Gruppen, Zonen, Verbindungen, Hintergrundtexte
 * 2 = zusätzlich Lernspur (`events`), Szenen (`scenes`), `isTemplate` und
 *     Referenznummern für Zonen. Version 1 wird weiterhin gelesen.
 */
export const CANVAS_FILE_VERSION = 2;

/** Name der Manifest-Datei im Container. */
export const CANVAS_MANIFEST_NAME = 'dokumentenraum-canvas.json';

/** Dateiendung des Containers. */
export const CANVAS_FILE_EXTENSION = 'lernspur';

// Grenzen für den Import: eine `.lernspur`-Datei kann aus fremder Hand stammen,
// darum wird nichts ohne Obergrenze entpackt.
/** Größte Datei, die überhaupt geöffnet wird. */
export const MAX_IMPORT_FILE_BYTES = 200 * 1024 * 1024;
/** Größte Menge an Mediendaten, die beim Import entpackt wird. */
export const MAX_IMPORT_MEDIA_BYTES = 300 * 1024 * 1024;
/** Größtes Manifest (JSON) im Container. */
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
/** Höchstzahl Karten in einer importierten Datei. */
export const MAX_IMPORT_CARDS = 2000;

/** Fehler, wenn eine Datei die Import-Grenzen sprengt (eigene Klasse, damit sie
 * nicht versehentlich als „Medium fehlt" verschluckt wird). */
export class CanvasFileTooLargeError extends Error {}

function tooLargeError(): CanvasFileTooLargeError {
  return new CanvasFileTooLargeError(t('Diese Datei ist zu groß zum Öffnen'));
}

/** JSZip erst laden, wenn wirklich eine Datei gebaut oder gelesen wird. */
async function loadJSZip() {
  const module = await import('jszip');
  return module.default;
}

/** Fehlermeldung, wenn die Datei kein Dokumentenraum-Whiteboard ist. */
function notACanvasError(): Error {
  return new Error(t('Diese Datei ist keine Dokumentenraum-Pinnwand'));
}

// ---------------------------------------------------------------------------
// Manifest-Typen
// ---------------------------------------------------------------------------

/** Entfernt die Datenbank-IDs (verteilt sich über die Karten-Union). */
type WithoutIds<T> = T extends unknown ? Omit<T, 'id' | 'projectId'> : never;

/**
 * Eine Karte wie auf dem Canvas, aber ohne Datenbank-IDs und mit
 * Container-Pfaden (z. B. `media/card-3.png`) statt Data-URLs in den
 * Medienfeldern `imageData`, `thumbnailData`, `annotationData`, `videoData`
 * und `audioData`. `ref` ist die stabile Nummer für Verweise.
 */
export type CanvasFileCard = WithoutIds<Card> & { ref: number };

/** Eine Gruppe; ihre Karten stehen als Referenznummern. */
export interface CanvasFileGroup {
  ref: number;
  name?: string;
  color: string;
  cardRefs: number[];
}

/** Ein Bereich; verweist optional auf eine Gruppe. `ref` gibt es ab Version 2. */
export type CanvasFileZone = Omit<Zone, 'id' | 'projectId' | 'groupId'> & {
  ref?: number;
  groupRef?: number;
};

/** Eine Verbindung zwischen zwei Karten (über Referenznummern). */
export type CanvasFileConnection = Omit<
  Connection,
  'id' | 'projectId' | 'sourceCardId' | 'targetCardId'
> & {
  sourceRef: number;
  targetRef: number;
};

/** Ein Hintergrundtext ohne Datenbank-IDs. */
export type CanvasFileBackgroundText = Omit<BackgroundText, 'id' | 'projectId'>;

/**
 * Ein Lernspur-Ereignis (ab Version 2). Kartenereignisse verweisen über
 * `targetRef` auf die Karte; Bereichs- und Verbindungsereignisse behalten ihre
 * ursprüngliche Kennung (`targetId`) – sie ist für die Wiedergabe nur ein
 * undurchsichtiger Schlüssel und muss lediglich in sich stimmig bleiben.
 */
export interface CanvasFileEvent {
  timestamp: number;
  eventType: CanvasEvent['eventType'];
  targetRef?: number;
  targetId?: string;
  from?: Position;
  to?: Position;
}

/** Eine gespeicherte Anordnung (ab Version 2); verweist über Referenznummern. */
export interface CanvasFileScene {
  name: string;
  cardStates: { cardRef: number; position: Position; zIndex: number }[];
  zoneStates: { zoneRef: number; position: Position; width: number; height: number }[];
  canvasPosition: Position;
  canvasScale: number;
  createdAt: number;
  updatedAt: number;
}

/** Vollständige Beschreibung eines Whiteboards im Container. */
export interface CanvasFileManifest {
  format: typeof CANVAS_FILE_FORMAT;
  version: number;
  project: {
    name: string;
    backgroundColor: string;
    /** Pfad im Container, z. B. `media/background.png` */
    backgroundImage?: string;
    backgroundImageWidth?: number;
    backgroundImageHeight?: number;
    /** Als Vorlage gespeichertes Projekt (ab Version 2) */
    isTemplate?: boolean;
    /** Darstellungsmodus des Whiteboards (ab Version 2): 'square' oder 'free' */
    cardLayout?: CardLayout;
  };
  cards: CanvasFileCard[];
  groups: CanvasFileGroup[];
  zones: CanvasFileZone[];
  connections: CanvasFileConnection[];
  backgroundTexts: CanvasFileBackgroundText[];
  /** Lernspur (ab Version 2) */
  events?: CanvasFileEvent[];
  /** Szenen (ab Version 2) */
  scenes?: CanvasFileScene[];
  exportedAt: number;
}

/** Eine Mediendatei im Container. */
export interface CanvasFileMedia {
  path: string; // z. B. 'media/card-3.png'
  bytes: Uint8Array;
  mimeType: string;
}

/** Die Projektfelder, die für den Export gebraucht werden. */
export type CanvasFileProjectInput = Pick<
  Project,
  | 'name'
  | 'backgroundColor'
  | 'backgroundImage'
  | 'backgroundImageWidth'
  | 'backgroundImageHeight'
  | 'isTemplate'
  | 'cardLayout'
>;

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------

/** Datum als YYYY-MM-DD für Dateinamen. */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Entfernt Zeichen, die in Dateinamen Probleme machen. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'Whiteboard';
}

/** Entfernt die Datenbank-IDs einer Karte. */
function stripCardIds<T extends Card>(card: T): Omit<T, 'id' | 'projectId'> {
  const copy: Partial<T> = { ...card };
  delete copy.id;
  delete copy.projectId;
  return copy as Omit<T, 'id' | 'projectId'>;
}

/** Entfernt die Referenznummer einer Manifest-Karte. */
function stripRef<T extends { ref: number }>(value: T): Omit<T, 'ref'> {
  const copy: Partial<T> = { ...value };
  delete copy.ref;
  return copy as Omit<T, 'ref'>;
}


// ---------------------------------------------------------------------------
// Manifest bauen
// ---------------------------------------------------------------------------

/**
 * Baut Manifest und Medienliste aus Projekt, Karten, Zonen, Gruppen,
 * Verbindungen, Hintergrundtexten, Lernspur und Szenen. Gelöschte Karten
 * (Papierkorb) werden übersprungen, Karten nach `zIndex` sortiert.
 */
export function buildCanvasManifest(
  project: CanvasFileProjectInput,
  cards: Card[],
  zones: Zone[],
  groups: PersistedCardGroup[],
  connections: Connection[],
  backgroundTexts: BackgroundText[],
  events: CanvasEvent[] = [],
  scenes: Scene[] = [],
  now: number = Date.now()
): { manifest: CanvasFileManifest; media: CanvasFileMedia[] } {
  const media: CanvasFileMedia[] = [];

  /** Legt eine Mediendatei an und liefert ihren Pfad zurück. */
  const store = (dataUrl: string | undefined, baseName: string): string | undefined => {
    if (!dataUrl) return undefined;
    const decoded = dataUrlToBytes(dataUrl);
    if (!decoded) return undefined;
    const path = `media/${baseName}.${extensionForMime(decoded.mimeType)}`;
    media.push({ path, bytes: decoded.bytes, mimeType: decoded.mimeType });
    return path;
  };

  const liveCards = cards
    .filter((card) => !card.isDeleted)
    .sort((a, b) => a.zIndex - b.zIndex);

  // Referenznummern: laufende Nummer je Karte bzw. Gruppe
  const cardRefs = new Map<string, number>();
  liveCards.forEach((card, index) => cardRefs.set(card.id, index + 1));
  const groupRefs = new Map<string, number>();
  groups.forEach((group, index) => groupRefs.set(group.id, index + 1));
  const zoneRefs = new Map<string, number>();
  zones.forEach((zone, index) => zoneRefs.set(zone.id, index + 1));

  const fileCards: CanvasFileCard[] = liveCards.map((card): CanvasFileCard => {
    const ref = cardRefs.get(card.id)!;
    const base = { ref };

    switch (card.type) {
      case 'photo':
        return {
          ...stripCardIds(card),
          ...base,
          imageData: store(card.imageData, `card-${ref}`) ?? '',
          thumbnailData: store(card.thumbnailData, `card-${ref}-thumb`),
          annotationData: store(card.annotationData, `card-${ref}-annotation`),
        };
      case 'drawing':
        return {
          ...stripCardIds(card),
          ...base,
          imageData: store(card.imageData, `card-${ref}`) ?? '',
        };
      case 'video':
        return {
          ...stripCardIds(card),
          ...base,
          videoData: store(card.videoData, `card-${ref}`) ?? '',
          thumbnailData: store(card.thumbnailData, `card-${ref}-thumb`),
        };
      case 'audio':
        return {
          ...stripCardIds(card),
          ...base,
          audioData: store(card.audioData, `card-${ref}`) ?? '',
        };
      case 'text':
        return { ...stripCardIds(card), ...base };
      default:
        // Aufgabenkarte: keine Medien, alles bleibt im Manifest
        return { ...stripCardIds(card), ...base };
    }
  });

  const fileGroups: CanvasFileGroup[] = groups.map((group) => ({
    ref: groupRefs.get(group.id)!,
    name: group.name,
    color: group.color,
    cardRefs: group.cardIds
      .filter((id) => cardRefs.has(id))
      .map((id) => cardRefs.get(id)!),
  }));

  const fileZones: CanvasFileZone[] = zones.map((zone) => ({
    ref: zoneRefs.get(zone.id)!,
    name: zone.name,
    color: zone.color,
    position: zone.position,
    width: zone.width,
    height: zone.height,
    groupRef: zone.groupId ? groupRefs.get(zone.groupId) : undefined,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  }));

  const fileConnections: CanvasFileConnection[] = connections
    .filter((c) => cardRefs.has(c.sourceCardId) && cardRefs.has(c.targetCardId))
    .map((connection) => ({
      sourceRef: cardRefs.get(connection.sourceCardId)!,
      targetRef: cardRefs.get(connection.targetCardId)!,
      sourceAnchor: connection.sourceAnchor,
      targetAnchor: connection.targetAnchor,
      lineStyle: connection.lineStyle,
      startArrow: connection.startArrow,
      endArrow: connection.endArrow,
      color: connection.color,
      strokeWidth: connection.strokeWidth,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    }));

  const fileTexts: CanvasFileBackgroundText[] = backgroundTexts.map((text) => ({
    text: text.text,
    position: text.position,
    fontSize: text.fontSize,
    color: text.color,
    createdAt: text.createdAt,
    updatedAt: text.updatedAt,
  }));

  // Lernspur: Kartenereignisse auf Referenznummern abbilden; Ereignisse zu
  // Karten, die nicht mit exportiert werden (Papierkorb), fallen weg.
  const CARD_EVENTS = new Set(['createCard', 'moveCard', 'deleteCard']);
  const fileEvents: CanvasFileEvent[] = events
    .filter((event) => !CARD_EVENTS.has(event.eventType) || cardRefs.has(event.targetId))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((event) => ({
      timestamp: event.timestamp,
      eventType: event.eventType,
      ...(CARD_EVENTS.has(event.eventType)
        ? { targetRef: cardRefs.get(event.targetId)! }
        : { targetId: event.targetId }),
      ...(event.from ? { from: event.from } : {}),
      ...(event.to ? { to: event.to } : {}),
    }));

  const fileScenes: CanvasFileScene[] = scenes.map((scene) => ({
    name: scene.name,
    cardStates: scene.cardStates
      .filter((state) => cardRefs.has(state.cardId))
      .map((state) => ({
        cardRef: cardRefs.get(state.cardId)!,
        position: state.position,
        zIndex: state.zIndex,
      })),
    zoneStates: (scene.zoneStates ?? [])
      .filter((state) => zoneRefs.has(state.zoneId))
      .map((state) => ({
        zoneRef: zoneRefs.get(state.zoneId)!,
        position: state.position,
        width: state.width,
        height: state.height,
      })),
    canvasPosition: scene.canvasPosition,
    canvasScale: scene.canvasScale,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  }));

  return {
    manifest: {
      format: CANVAS_FILE_FORMAT,
      version: CANVAS_FILE_VERSION,
      project: {
        name: project.name,
        backgroundColor: project.backgroundColor,
        backgroundImage: store(project.backgroundImage, 'background'),
        backgroundImageWidth: project.backgroundImageWidth,
        backgroundImageHeight: project.backgroundImageHeight,
        isTemplate: project.isTemplate,
        cardLayout: project.cardLayout,
      },
      cards: fileCards,
      groups: fileGroups,
      zones: fileZones,
      connections: fileConnections,
      backgroundTexts: fileTexts,
      events: fileEvents,
      scenes: fileScenes,
      exportedAt: now,
    },
    media,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Baut den `.lernspur`-Container (ZIP) mit Manifest und allen Medien. */
export async function buildCanvasFile(
  project: CanvasFileProjectInput,
  cards: Card[],
  zones: Zone[],
  groups: PersistedCardGroup[],
  connections: Connection[],
  backgroundTexts: BackgroundText[],
  events: CanvasEvent[] = [],
  scenes: Scene[] = []
): Promise<Blob> {
  const { manifest, media } = buildCanvasManifest(
    project,
    cards,
    zones,
    groups,
    connections,
    backgroundTexts,
    events,
    scenes
  );

  const JSZipCtor = await loadJSZip();
  const zip = new JSZipCtor();
  zip.file(CANVAS_MANIFEST_NAME, JSON.stringify(manifest, null, 2));
  for (const file of media) {
    zip.file(file.path, file.bytes);
  }

  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}

/**
 * Exportiert ein Whiteboard-Projekt als `.lernspur`-Datei (Download).
 * Lädt alle Inhalte selbst über die Services.
 */
/** Lädt alle Daten eines Whiteboards aus der DB und baut daraus die .lernspur-Datei. */
export async function buildCanvasFileForProject(projectId: string): Promise<Blob> {
  const project = await projectService.getById(projectId);
  if (!project) throw new Error(t('Projekt nicht gefunden'));

  const [cards, zones, groups, connections, backgroundTexts, events, scenes] = await Promise.all([
    cardService.getAllByProject(projectId),
    zoneService.getAllByProject(projectId),
    groupService.getAllByProject(projectId),
    connectionService.getAllByProject(projectId),
    backgroundTextService.getAllByProject(projectId),
    eventService.getAllByProject(projectId),
    sceneService.getAllByProject(projectId),
  ]);

  return buildCanvasFile(project, cards, zones, groups, connections, backgroundTexts, events, scenes);
}

export async function exportCanvasFile(projectId: string): Promise<void> {
  const project = await projectService.getById(projectId);
  if (!project) throw new Error(t('Projekt nicht gefunden'));
  const blob = await buildCanvasFileForProject(projectId);
  await saveBlob(
    blob,
    `${safeFileName(project.name)}_${formatDate(new Date())}.${CANVAS_FILE_EXTENSION}`
  );
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Prüft, ob ein unbekannter Wert die Manifest-Form hat. */
function isCanvasFileManifest(value: unknown): value is CanvasFileManifest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CanvasFileManifest>;
  return (
    candidate.format === CANVAS_FILE_FORMAT &&
    typeof candidate.version === 'number' &&
    Array.isArray(candidate.cards) &&
    typeof candidate.project === 'object' &&
    candidate.project !== null
  );
}

/**
 * Öffnet eine `.lernspur`-Datei und liefert das Manifest sowie einen Zugriff
 * auf die enthaltenen Medien als Data-URL.
 */
export async function parseCanvasFile(
  file: Blob | ArrayBuffer
): Promise<{ manifest: CanvasFileManifest; media: (path: string) => Promise<string> }> {
  // Grenzen zuerst: eine fremde Datei darf nichts Unbegrenztes entpacken.
  const fileSize = file instanceof Blob ? file.size : file.byteLength;
  if (fileSize > MAX_IMPORT_FILE_BYTES) throw tooLargeError();

  const JSZipCtor = await loadJSZip();
  let zip: JSZip;
  try {
    zip = await JSZipCtor.loadAsync(file);
  } catch {
    throw notACanvasError();
  }

  const manifestEntry =
    zip.file(CANVAS_MANIFEST_NAME) ??
    zip.file(new RegExp(`(^|/)${CANVAS_MANIFEST_NAME}$`))[0] ??
    null;

  if (!manifestEntry) throw notACanvasError();

  let parsed: unknown;
  try {
    const json = await manifestEntry.async('string');
    if (json.length > MAX_MANIFEST_BYTES) throw tooLargeError();
    parsed = JSON.parse(json);
  } catch (error) {
    if (error instanceof CanvasFileTooLargeError) throw error;
    throw notACanvasError();
  }

  if (!isCanvasFileManifest(parsed)) throw notACanvasError();
  if (parsed.version > CANVAS_FILE_VERSION) {
    throw new Error(t('Diese Datei wurde mit einer neueren Version erstellt'));
  }
  if (parsed.cards.length > MAX_IMPORT_CARDS) {
    throw new Error(
      t('Diese Datei enthält zu viele Karten ({count}, höchstens {max})', {
        count: parsed.cards.length,
        max: MAX_IMPORT_CARDS,
      })
    );
  }

  // Medienpfade sind relativ zum Ordner, in dem das Manifest liegt
  const baseDir = manifestEntry.name.slice(0, manifestEntry.name.lastIndexOf('/') + 1);

  // Entpackte Gesamtgröße deckeln (Schutz vor „Zip-Bomben")
  let unpackedBytes = 0;

  const media = async (path: string): Promise<string> => {
    const entry = zip.file(`${baseDir}${path}`) ?? zip.file(path);
    if (!entry) throw new Error(t('Datei fehlt im Whiteboard: {path}', { path }));
    const bytes = await entry.async('uint8array');
    unpackedBytes += bytes.length;
    if (unpackedBytes > MAX_IMPORT_MEDIA_BYTES) throw tooLargeError();
    return bytesToDataUrl(bytes, mimeForPath(path));
  };

  return { manifest: parsed, media };
}

/** Löst einen Medienpfad auf; bei Problemen bleibt das Feld leer. */
async function resolveMedia(
  media: (path: string) => Promise<string>,
  path: string | undefined
): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    return await media(path);
  } catch (error) {
    // Grenzverletzungen bricht der Import ab; ein einzelnes fehlendes Medium nicht.
    if (error instanceof CanvasFileTooLargeError) throw error;
    console.warn('Medium konnte nicht gelesen werden:', path, error);
    return undefined;
  }
}

/** Baut aus einer Manifest-Karte wieder eine Karte mit Data-URLs. */
async function cardFromManifest(
  fileCard: CanvasFileCard,
  projectId: string,
  stackIdFor: (stackId: string | undefined) => string | undefined,
  media: (path: string) => Promise<string>
): Promise<Card> {
  const id = uuid();

  switch (fileCard.type) {
    case 'photo':
      return {
        ...stripRef(fileCard),
        id,
        projectId,
        stackId: stackIdFor(fileCard.stackId),
        imageData: (await resolveMedia(media, fileCard.imageData)) ?? '',
        thumbnailData: await resolveMedia(media, fileCard.thumbnailData),
        annotationData: await resolveMedia(media, fileCard.annotationData),
      };
    case 'drawing':
      return {
        ...stripRef(fileCard),
        id,
        projectId,
        stackId: stackIdFor(fileCard.stackId),
        imageData: (await resolveMedia(media, fileCard.imageData)) ?? '',
      };
    case 'video':
      return {
        ...stripRef(fileCard),
        id,
        projectId,
        stackId: stackIdFor(fileCard.stackId),
        videoData: (await resolveMedia(media, fileCard.videoData)) ?? '',
        thumbnailData: await resolveMedia(media, fileCard.thumbnailData),
      };
    case 'audio':
      return {
        ...stripRef(fileCard),
        id,
        projectId,
        stackId: stackIdFor(fileCard.stackId),
        audioData: (await resolveMedia(media, fileCard.audioData)) ?? '',
      };
    case 'text':
      return { ...stripRef(fileCard), id, projectId, stackId: stackIdFor(fileCard.stackId) };
    default:
      // Aufgabenkarte
      return { ...stripRef(fileCard), id, projectId, stackId: stackIdFor(fileCard.stackId) };
  }
}

/**
 * Importiert eine `.lernspur`-Datei als neues Whiteboard-Projekt.
 * Alle IDs werden neu vergeben, Medien landen wieder als Data-URLs in der DB.
 */
export async function importCanvasFile(
  file: Blob,
  options?: { name?: string }
): Promise<Project> {
  const { manifest, media } = await parseCanvasFile(file);

  const now = Date.now();
  const backgroundImage = await resolveMedia(media, manifest.project.backgroundImage);

  const project: Project = {
    id: uuid(),
    name: options?.name ?? manifest.project.name ?? 'Whiteboard',
    backgroundColor: manifest.project.backgroundColor ?? '#FFFFFF',
    backgroundImage,
    backgroundImageWidth: backgroundImage ? manifest.project.backgroundImageWidth : undefined,
    backgroundImageHeight: backgroundImage ? manifest.project.backgroundImageHeight : undefined,
    // Vorlagen bleiben Vorlagen (ab Manifest-Version 2)
    ...(manifest.project.isTemplate ? { isTemplate: true } : {}),
    // Darstellungsmodus übernehmen (fehlt er, bleibt es beim Standard 'square')
    ...(manifest.project.cardLayout === 'free' ? { cardLayout: 'free' as const } : {}),
    kind: 'canvas',
    createdAt: now,
    updatedAt: now,
    cardCount: 0,
  };
  await projectService.create(project);

  try {
    return await fillImportedProject(project, manifest, media, now);
  } catch (error) {
    // Kein halb angelegtes Projekt zurücklassen: hart löschen (kein Papierkorb)
    // und den Fehler weiterreichen, damit die Oberfläche ihn anzeigen kann.
    try {
      await projectService.delete(project.id);
    } catch (cleanupError) {
      console.error('Aufräumen nach fehlgeschlagenem Import misslungen:', cleanupError);
    }
    throw error;
  }
}

/**
 * Legt alle Inhalte des Manifests im schon angelegten Projekt an.
 * Bei einem Fehler räumt der Aufrufer (importCanvasFile) das Projekt weg.
 */
async function fillImportedProject(
  project: Project,
  manifest: CanvasFileManifest,
  media: (path: string) => Promise<string>,
  now: number
): Promise<Project> {

  // Stapel behalten ihren Zusammenhalt, bekommen aber neue IDs
  const stackIdMap = new Map<string, string>();
  const stackIdFor = (stackId: string | undefined): string | undefined => {
    if (!stackId) return undefined;
    const existing = stackIdMap.get(stackId);
    if (existing) return existing;
    const created = uuid();
    stackIdMap.set(stackId, created);
    return created;
  };

  // Karten anlegen und dabei Referenznummer → neue ID merken
  const cardIdByRef = new Map<number, string>();
  const newCards: Card[] = [];
  for (const fileCard of manifest.cards) {
    const card = await cardFromManifest(fileCard, project.id, stackIdFor, media);
    newCards.push(card);
    cardIdByRef.set(fileCard.ref, card.id);
  }
  await cardService.bulkCreate(newCards);

  // Gruppen
  const groupIdByRef = new Map<number, string>();
  for (const fileGroup of manifest.groups ?? []) {
    const group: PersistedCardGroup = {
      id: uuid(),
      projectId: project.id,
      name: fileGroup.name,
      color: fileGroup.color,
      cardIds: fileGroup.cardRefs
        .filter((ref) => cardIdByRef.has(ref))
        .map((ref) => cardIdByRef.get(ref)!),
    };
    await groupService.create(group);
    groupIdByRef.set(fileGroup.ref, group.id);
  }

  // Bereiche
  const zoneIdByRef = new Map<number, string>();
  for (const [index, fileZone] of (manifest.zones ?? []).entries()) {
    const zone: Zone = {
      id: uuid(),
      projectId: project.id,
      name: fileZone.name,
      color: fileZone.color,
      position: fileZone.position,
      width: fileZone.width,
      height: fileZone.height,
      groupId: fileZone.groupRef !== undefined ? groupIdByRef.get(fileZone.groupRef) : undefined,
      createdAt: fileZone.createdAt ?? now,
      updatedAt: now,
    };
    await zoneService.create(zone);
    // Vor Version 2 gab es keine `ref`; die Reihenfolge im Manifest ist der Ersatz.
    zoneIdByRef.set(fileZone.ref ?? index + 1, zone.id);
  }

  // Verbindungen (nur, wenn beide Karten vorhanden sind)
  for (const fileConnection of manifest.connections ?? []) {
    const sourceCardId = cardIdByRef.get(fileConnection.sourceRef);
    const targetCardId = cardIdByRef.get(fileConnection.targetRef);
    if (!sourceCardId || !targetCardId) continue;
    const connection: Connection = {
      id: uuid(),
      projectId: project.id,
      sourceCardId,
      targetCardId,
      sourceAnchor: fileConnection.sourceAnchor,
      targetAnchor: fileConnection.targetAnchor,
      lineStyle: fileConnection.lineStyle,
      startArrow: fileConnection.startArrow,
      endArrow: fileConnection.endArrow,
      color: fileConnection.color,
      strokeWidth: fileConnection.strokeWidth,
      createdAt: fileConnection.createdAt ?? now,
      updatedAt: now,
    };
    await connectionService.create(connection);
  }

  // Hintergrundtexte
  for (const fileText of manifest.backgroundTexts ?? []) {
    const text: BackgroundText = {
      id: uuid(),
      projectId: project.id,
      text: fileText.text,
      position: fileText.position,
      fontSize: fileText.fontSize,
      color: fileText.color,
      createdAt: fileText.createdAt ?? now,
      updatedAt: now,
    };
    await backgroundTextService.create(text);
  }

  // Lernspur (ab Manifest-Version 2): Kartenereignisse auf die neuen IDs abbilden,
  // Bereichs-/Verbindungsereignisse behalten ihre undurchsichtige Kennung.
  for (const fileEvent of manifest.events ?? []) {
    const targetId =
      fileEvent.targetRef !== undefined ? cardIdByRef.get(fileEvent.targetRef) : fileEvent.targetId;
    if (!targetId) continue;
    await eventService.add({
      id: uuid(),
      projectId: project.id,
      timestamp: fileEvent.timestamp,
      eventType: fileEvent.eventType,
      targetId,
      from: fileEvent.from,
      to: fileEvent.to,
    });
  }

  // Szenen (ab Manifest-Version 2)
  for (const fileScene of manifest.scenes ?? []) {
    const scene: Scene = {
      id: uuid(),
      projectId: project.id,
      name: fileScene.name,
      cardStates: (fileScene.cardStates ?? [])
        .filter((state) => cardIdByRef.has(state.cardRef))
        .map((state) => ({
          cardId: cardIdByRef.get(state.cardRef)!,
          position: state.position,
          zIndex: state.zIndex,
        })),
      zoneStates: (fileScene.zoneStates ?? [])
        .filter((state) => zoneIdByRef.has(state.zoneRef))
        .map((state) => ({
          zoneId: zoneIdByRef.get(state.zoneRef)!,
          position: state.position,
          width: state.width,
          height: state.height,
        })),
      canvasPosition: fileScene.canvasPosition,
      canvasScale: fileScene.canvasScale,
      createdAt: fileScene.createdAt ?? now,
      updatedAt: now,
    };
    await sceneService.create(scene);
  }

  // cardCount schreiben (cardService.bulkCreate pflegt ihn bereits mit)
  await projectService.updateCardCount(project.id);
  const saved = await projectService.getById(project.id);
  return saved ?? { ...project, cardCount: manifest.cards.length };
}
