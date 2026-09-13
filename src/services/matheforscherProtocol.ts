/**
 * matheforscherProtocol.ts — Matheforscher-Protokoll (postMessage) für Dokumentenraum.
 *
 * Dokumentenraum hat das Protokoll bisher NICHT gesprochen. Diese Datei führt es
 * additiv ein — Grundstock (Embedding-Erkennung, hello/discover→ready mit
 * Manifest, state/action) PLUS den Teil von v3.0, der ohne eigene
 * Benutzerverwaltung sinnvoll ist (capabilities/context merken,
 * set-context/context-applied).
 *
 * Dokumentenraum ist ein Dokumentations-/Organisationswerkzeug ohne bewertbare
 * Aufgaben und ohne eigene Benutzerverwaltung: `ergebnis`/`report`
 * (Rollout-Brief Abschnitt D) und Profil-Adoption (Abschnitt B) entfallen
 * ehrlich ersatzlos — protocolLevel bleibt bei 2 ("beobachtbar": state + action).
 *
 * Nichts hier ändert bestehendes Verhalten: standalone (nicht eingebettet)
 * bleibt die App unverändert; ohne hello/discover vom Host bleibt sie
 * komplett stumm (`send()` ist dann ein No-op).
 *
 * DATENSCHUTZ: Es werden NIE Projekt-/Kartennamen oder Karteninhalte (Text,
 * Foto, Audio, Video, Zeichnung, Aufgabentext) gesendet — nur abstrakte
 * Zähl-/Typ-Metadaten (wie viele Karten welchen Typs, wie viele Bereiche/
 * Verbindungen) und Verben für Handlungen.
 *
 * Kanonische Doku: mathe.digital/docs/postmessage-protokoll.md
 *   - Quickstart / Plattform-Erkennung / Event-Typen / App-Manifest
 *   - Abschnitt "Protokoll v3.0 — Integrierte Hosts"
 *
 * Aufruf: initMatheforscherProtocol() einmalig beim App-Start (src/main.tsx).
 * Fachliche Events: notifyCanvasEvent(...) wird von logCanvasEvent()
 * (src/services/canvasEvents.ts) bei jedem Lernspur-Ereignis aufgerufen — das
 * ist bereits der zentrale Punkt, über den alle 18 Aufrufstellen (Karten,
 * Bereiche, Verbindungen) laufen.
 */

import type { Card, CardType, CanvasEventType, Connection, Position, Zone } from '../types';

// ─── Plattform-Erkennung ────────────────────────────────────────────────────
// Drei redundante Signale, wie in der Doku empfohlen. `detectEmbedded` ist
// bewusst als reine Funktion (keine window-Zugriffe) gehalten, damit sie ohne
// Browser isoliert testbar ist — `isEmbedded()` ist der reale Aufrufer.

export function detectEmbedded(search: string, hash: string, isInIframe: boolean): boolean {
  return (
    new URLSearchParams(search).get('matheforscher') === '1' ||
    hash.includes('matheforscher=1') ||
    isInIframe
  );
}

function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  return detectEmbedded(window.location.search, window.location.hash, window.self !== window.top);
}

// ─── Modul-Zustand ──────────────────────────────────────────────────────────

export interface HostProfil {
  id: string;
  name?: string;
  emoji?: string;
  farbe?: string;
}

export interface HostContext {
  profil: HostProfil | null;
  locale?: string;
}

let embedded = false;
let capabilities: string[] = [];
let context: HostContext | null = null;
let initialized = false;
/**
 * Origin des Hosts, festgelegt beim ersten `hello`/`discover` (Origin-Pinning).
 * Danach werden Nachrichten NUR noch von dieser Origin angenommen und
 * ausschließlich an sie gesendet – nie an '*'. Solange nichts gepinnt ist,
 * sendet `send()` gar nicht.
 */
let hostOrigin: string | null = null;

/** Nur für Tests/Diagnose: kompletten Modul-Zustand zurücksetzen. */
export function _resetForTests(): void {
  embedded = false;
  capabilities = [];
  context = null;
  initialized = false;
  hostOrigin = null;
}

/** Für Tests/Diagnose: die beim ersten hello gemerkte Host-Origin. */
export function getHostOrigin(): string | null {
  return hostOrigin;
}

/** Für Tests/Diagnose: aktuell gemerkte capabilities (read-only Kopie). */
export function getCapabilities(): string[] {
  return [...capabilities];
}

/** Für Tests/Diagnose: aktuell gemerkter Host-Kontext (read-only). */
export function getContext(): HostContext | null {
  return context;
}

// ─── Send-Helper ─────────────────────────────────────────────────────────────

function send(msg: Record<string, unknown>): void {
  if (!embedded) return;
  if (typeof window === 'undefined') return;
  // Ohne gepinnte Host-Origin wird nichts gesendet – kein postMessage an '*',
  // damit ein fremder Einbetter keine Daten mitlesen kann.
  if (!hostOrigin) return;
  window.parent.postMessage(msg, hostOrigin);
}

/** Antwortet direkt an den Absender (e.source), mit Fallback auf window.parent. */
function reply(e: MessageEvent, msg: Record<string, unknown>): void {
  const target = e.origin || hostOrigin;
  if (!target) return;
  const source = e.source as { postMessage?: (m: unknown, o: string) => void } | null;
  if (source && typeof source.postMessage === 'function') {
    source.postMessage(msg, target);
    return;
  }
  send(msg);
}

// ─── App-Manifest ────────────────────────────────────────────────────────────

export interface Manifest {
  name: string;
  description: string;
  kindActions: string;
  categories: string[];
  version: string;
  stateSchema: string;
  reporting: { ergebnis: boolean };
  protocolLevel: number;
}

export function buildManifest(): Manifest {
  return {
    name: 'Dokumentenraum',
    description:
      'Kindgerechte Dokumentations-App: Fotos, Texte, Zeichnungen, Audio und Video als Karten auf einer freien Fläche anordnen, beschriften und verbinden.',
    kindActions:
      'Karten (Foto, Text, Zeichnung, Audio, Video, Aufgabe) anlegen, verschieben, gruppieren, mit Bereichen und Verbindungslinien in Beziehung setzen, wieder löschen.',
    categories: ['Dokumentation', 'Organisation'],
    version: '1.0.0',
    stateSchema:
      'state.kartenGesamt: Anzahl Karten im aktuell offenen Projekt (Zahl). state.kartenNachTyp: Karten je Typ (photo/text/video/audio/drawing/task, je eine Zahl). state.bereicheGesamt, state.verbindungenGesamt: Anzahl Bereiche bzw. Verbindungslinien (Zahl). Enthält nie Karteninhalte, Beschriftungen oder Projektnamen.',
    reporting: { ergebnis: false },
    protocolLevel: 2,
  };
}

// ─── state (Rollout-Brief: "beobachtbar" — Karten-/Bereichs-/Verbindungszähler) ─
// Rein zähl-/typbasiert — nie Karteninhalte, Beschriftungen oder Projektnamen.

export interface CanvasStateSnapshot {
  kartenGesamt: number;
  kartenNachTyp: Record<CardType, number>;
  bereicheGesamt: number;
  verbindungenGesamt: number;
}

const EMPTY_CARD_COUNTS: Record<CardType, number> = {
  photo: 0,
  text: 0,
  video: 0,
  audio: 0,
  drawing: 0,
  task: 0,
};

/** Reine Aggregation — kein Kartentext/-bild, nur Typ-Zähler. */
export function buildCanvasState(cards: Card[], zones: Zone[], connections: Connection[]): CanvasStateSnapshot {
  const kartenNachTyp = { ...EMPTY_CARD_COUNTS };
  for (const card of cards) {
    kartenNachTyp[card.type] += 1;
  }
  return {
    kartenGesamt: cards.length,
    kartenNachTyp,
    bereicheGesamt: zones.length,
    verbindungenGesamt: connections.length,
  };
}

/** Reine Beschreibung des state-Snapshots — kurzer deutscher Satz für die KI. */
export function describeCanvasState(state: CanvasStateSnapshot): string {
  if (state.kartenGesamt === 0) return 'Projekt ist noch leer, keine Karten angelegt.';
  const teile: string[] = [`${state.kartenGesamt} Karte${state.kartenGesamt === 1 ? '' : 'n'}`];
  if (state.bereicheGesamt > 0) teile.push(`${state.bereicheGesamt} Bereich${state.bereicheGesamt === 1 ? '' : 'e'}`);
  if (state.verbindungenGesamt > 0) teile.push(`${state.verbindungenGesamt} Verbindung${state.verbindungenGesamt === 1 ? '' : 'en'}`);
  return `${teile.join(', ')} auf der Fläche.`;
}

/**
 * Lädt Karten/Bereiche/Verbindungen des Projekts dynamisch (bricht den
 * Zirkelbezug canvasEvents.ts → matheforscherProtocol.ts → Stores →
 * canvasEvents.ts auf — gleiches Muster wie useCardsStore.ts:deleteCard()).
 */
async function sendCanvasState(projectId: string): Promise<void> {
  if (!embedded) return;
  try {
    const [{ useCardsStore }, { useZonesStore }, { useConnectionsStore }] = await Promise.all([
      import('../stores/useCardsStore'),
      import('../stores/useZonesStore'),
      import('../stores/useConnectionsStore'),
    ]);
    const cards = useCardsStore.getState().cards.filter((c) => c.projectId === projectId);
    const zones = useZonesStore.getState().getZonesForProject(projectId);
    const connections = useConnectionsStore.getState().connections.filter((c) => c.projectId === projectId);
    const state = buildCanvasState(cards, zones, connections);
    send({ type: 'matheforscher:state', state, beschreibung: describeCanvasState(state) });
  } catch (error) {
    console.error('[matheforscher] state konnte nicht ermittelt werden', error);
  }
}

// ─── action (Rollout-Brief: "beobachtbar" — jede bedeutsame Handlung) ──────

interface ActionMapping {
  action: string;
  target: string;
  beschreibung: string;
  /** true = Handlung ändert Karten-/Bereichs-/Verbindungs-Zähler → state nachschicken. */
  sendState: boolean;
}

const ACTION_MAP: Record<CanvasEventType, ActionMapping> = {
  createCard: { action: 'place', target: 'karte', beschreibung: 'Kind fügt eine neue Karte hinzu', sendState: true },
  moveCard: { action: 'move', target: 'karte', beschreibung: 'Kind verschiebt eine Karte', sendState: false },
  deleteCard: { action: 'remove', target: 'karte', beschreibung: 'Kind entfernt eine Karte', sendState: true },
  createZone: { action: 'place', target: 'bereich', beschreibung: 'Kind erstellt einen Bereich', sendState: true },
  deleteZone: { action: 'remove', target: 'bereich', beschreibung: 'Kind entfernt einen Bereich', sendState: true },
  createConnection: { action: 'place', target: 'verbindung', beschreibung: 'Kind verbindet zwei Karten', sendState: true },
  deleteConnection: { action: 'remove', target: 'verbindung', beschreibung: 'Kind entfernt eine Verbindung', sendState: true },
};

/** Reine Payload-Konstruktion für `matheforscher:action` — nie Karteninhalte, nur die ID (opak) und Positionen. */
export function buildActionPayload(targetId: string, from?: Position, to?: Position): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: targetId };
  if (from !== undefined) payload.from = from;
  if (to !== undefined) payload.to = to;
  return payload;
}

/**
 * Zentraler Aufrufpunkt für jedes Lernspur-Ereignis (Rollout-Brief:
 * state/action). Wird aus logCanvasEvent() aufgerufen — No-op, wenn nicht
 * eingebettet.
 */
export function notifyCanvasEvent(
  projectId: string,
  eventType: CanvasEventType,
  targetId: string,
  from?: Position,
  to?: Position
): void {
  if (!embedded) return;
  const mapping = ACTION_MAP[eventType];
  send({
    type: 'matheforscher:action',
    action: mapping.action,
    target: mapping.target,
    payload: buildActionPayload(targetId, from, to),
    beschreibung: mapping.beschreibung,
  });
  if (mapping.sendState) {
    void sendCanvasState(projectId);
  }
}

// ─── hello / discover / set-context (Rollout-Brief Abschnitt A) ────────────

function handleHello(e: MessageEvent, data: Record<string, unknown>): void {
  embedded = true;
  // Origin-Pinning: Der erste Host, der sich meldet, bleibt der einzige
  // Gesprächspartner (siehe onMessage).
  if (!hostOrigin && e.origin) hostOrigin = e.origin;
  capabilities = Array.isArray(data.capabilities) ? (data.capabilities as string[]) : [];
  // Dokumentenraum hat keine eigene Benutzerverwaltung — Profil-Adoption
  // (Rollout-Brief Abschnitt B) entfällt, der Kontext wird nur gemerkt.
  context = (data.context as HostContext | undefined) ?? null;
  reply(e, { type: 'matheforscher:ready', payload: { manifest: buildManifest() } });
}

function handleSetContext(e: MessageEvent, data: Record<string, unknown>): void {
  const payload = (data.payload as { context?: HostContext } | undefined) ?? {};
  context = payload.context ?? null;
  // Ohne eigene Benutzerverwaltung genügt die minimale Bestätigung (Rollout-Brief Abschnitt A).
  reply(e, {
    type: 'matheforscher:context-applied',
    payload: { profil: context?.profil ? { id: context.profil.id } : null },
  });
}

function onMessage(e: MessageEvent): void {
  const data = e.data as Record<string, unknown> | null | undefined;
  const type = data?.type;
  if (typeof type !== 'string' || !type.startsWith('matheforscher:')) return;

  // Nach dem ersten hello/discover nur noch Nachrichten der gepinnten Host-Origin.
  if (hostOrigin && e.origin && e.origin !== hostOrigin) return;

  switch (type) {
    case 'matheforscher:hello':
    case 'matheforscher:discover':
      handleHello(e, data as Record<string, unknown>);
      break;
    case 'matheforscher:set-context':
      handleSetContext(e, data as Record<string, unknown>);
      break;
    default:
      break;
  }
}

/**
 * Einmalig beim App-Start aufrufen (src/main.tsx). Registriert den
 * message-Listener und ermittelt den initialen Embedding-Status. Läuft
 * standalone (nicht eingebettet) komplett unauffällig mit — `send()` ist
 * dann ein No-op.
 */
export function initMatheforscherProtocol(): void {
  if (initialized) return;
  initialized = true;
  embedded = isEmbedded();
  window.addEventListener('message', onMessage);
}
