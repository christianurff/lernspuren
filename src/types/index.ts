// Project Types
export interface Project {
  id: string;
  name: string;
  coverImage?: string;
  backgroundColor: string;
  // Hintergrundbild (Lehrkraft-Modus / Vorlagen): DataURL + Größe in Welt-Koordinaten
  backgroundImage?: string;
  backgroundImageWidth?: number;
  backgroundImageHeight?: number;
  // Als Vorlage gespeicherte Projekte erscheinen in der Vorlagen-Galerie
  isTemplate?: boolean;
  // Papierkorb (Soft-Delete, Auto-Purge nach 30 Tagen)
  isDeleted?: boolean;
  deletedAt?: number;
  // Projektart: Whiteboard (Canvas, Standard) oder seitenbasiertes Buch
  kind?: ProjectKind;
  bookFormat?: BookFormat;
  pageCount?: number;
  // Whiteboard-Darstellung: 'square' (Standard) oder 'free'
  cardLayout?: CardLayout;
  createdAt: number;
  updatedAt: number;
  cardCount: number;
}

// Projektarten: Whiteboard (Canvas) oder Buch (seitenbasiert, wie Book Creator)
export type ProjectKind = 'canvas' | 'book';
export type BookFormat = 'portrait' | 'square' | 'landscape';

// Card Types
export type CardType = 'photo' | 'text' | 'video' | 'audio' | 'drawing' | 'task';
export type CardSize = 'small' | 'medium' | 'large';

// Darstellungsmodus eines Whiteboards: quadratische Karten (Standard) oder freie,
// dem Inhalt folgende Maße (Collagen, Plakate).
export type CardLayout = 'square' | 'free';

export interface Position {
  x: number;
  y: number;
}

export interface BaseCard {
  id: string;
  projectId: string;
  type: CardType;
  size: CardSize;
  position: Position;
  zIndex: number;
  stackId?: string;
  stackIndex?: number;
  frameColor?: string;
  label?: string;
  isCompact?: boolean;
  // Freie Maße für cardLayout === 'free'; bleiben beim Zurückschalten erhalten
  freeSize?: { width: number; height: number };
  // Papierkorb (Soft-Delete, Auto-Purge nach 30 Tagen)
  isDeleted?: boolean;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PhotoCard extends BaseCard {
  type: 'photo';
  imageData: string; // base64 or blob URL
  thumbnailData?: string;
  annotationData?: string; // transparentes PNG-Overlay (Foto-Annotation)
}

export interface TextCard extends BaseCard {
  type: 'text';
  content: string;
}

export interface VideoCard extends BaseCard {
  type: 'video';
  videoData: string; // Base64 data URL - reliable cross-browser storage
  thumbnailData?: string;
  duration?: number;
  mimeType?: string;
}

export interface AudioCard extends BaseCard {
  type: 'audio';
  audioData: string; // Base64 data URL - reliable cross-browser storage
  duration?: number;
  mimeType?: string;
  transcription?: string; // Automatische Transkription (Spracherkennung während der Aufnahme)
}

export interface DrawingCard extends BaseCard {
  type: 'drawing';
  imageData: string; // PNG image data of the drawing
  drawingData: string; // JSON string of drawing paths for editing
}

// Aufgabenkarten (wie iOS): Aufgabentext + gestufte Tipps + Checkliste
export interface ChecklistItem {
  id: string;
  text: string;
  isChecked: boolean;
}

export interface TaskCard extends BaseCard {
  type: 'task';
  taskText: string;
  hints: string[];
  checklist: ChecklistItem[];
}

export type Card = PhotoCard | TextCard | VideoCard | AudioCard | DrawingCard | TaskCard;

// Card Size Dimensions (quadratisch, wie in der iOS-App)
export const CARD_SIZES: Record<CardSize, { width: number; height: number; label: string }> = {
  small: { width: 140, height: 140, label: 'Klein' },
  medium: { width: 200, height: 200, label: 'Mittel' },
  large: { width: 280, height: 280, label: 'Groß' },
};

// Canvas Types
export interface CanvasState {
  scale: number;
  position: Position;
  showGrid: boolean;
}

// UI Types
export interface ModalState {
  isOpen: boolean;
  type: 'createProject' | 'deleteProject' | 'cardOptions' | 'addCard' | 'textEditor' | 'videoEditor' | 'audioEditor' | 'drawingEditor' | 'exportProject' | null;
  data?: unknown;
}

// Drawing Types
export interface DrawingPath {
  points: Position[];
  color: string;
  strokeWidth: number;
}

export interface CanvasDrawing {
  id: string;
  projectId: string;
  paths: DrawingPath[];
  createdAt: number;
  updatedAt: number;
}

// Group Types
export interface CardGroup {
  id: string;
  projectId: string;
  name?: string;
  cardIds: string[];
  position: Position;
  createdAt: number;
  updatedAt: number;
}

// Zone Types
export interface Zone {
  id: string;
  projectId: string;
  name?: string;
  color: string;
  position: Position;
  width: number;
  height: number;
  groupId?: string; // Link to a group - when set, zone represents a group area
  createdAt: number;
  updatedAt: number;
}

// Stack Types
export interface Stack {
  id: string;
  cardIds: string[];
  position: Position;
}

// Scene Types - for saving and restoring arrangements
export interface SceneCardState {
  cardId: string;
  position: Position;
  zIndex: number;
}

export interface SceneZoneState {
  zoneId: string;
  position: Position;
  width: number;
  height: number;
}

export interface Scene {
  id: string;
  projectId: string;
  name: string;
  cardStates: SceneCardState[];
  zoneStates: SceneZoneState[];
  canvasPosition: Position;
  canvasScale: number;
  createdAt: number;
  updatedAt: number;
}

// Connection Types - for connecting cards with arrows
export type ConnectionAnchor = 'top' | 'right' | 'bottom' | 'left';
export type ConnectionLineStyle = 'straight' | 'curved' | 'elbow';
export type ConnectionArrowStyle = 'none' | 'arrow' | 'dot';

export interface Connection {
  id: string;
  projectId: string;
  sourceCardId: string;
  targetCardId: string;
  sourceAnchor: ConnectionAnchor;
  targetAnchor: ConnectionAnchor;
  lineStyle: ConnectionLineStyle;
  startArrow: ConnectionArrowStyle;
  endArrow: ConnectionArrowStyle;
  color: string;
  strokeWidth: number;
  createdAt: number;
  updatedAt: number;
}

// Hintergrundtexte (Lehrkraft-Modus): freie Beschriftungen auf dem Canvas
export interface BackgroundText {
  id: string;
  projectId: string;
  text: string;
  position: Position;
  fontSize: number; // 18 (Klein) / 24 (Mittel) / 36 (Groß)
  color: string;
  createdAt: number;
  updatedAt: number;
}

// Lernspur: Ereignisprotokoll für die Wiedergabe (wie iOS CanvasEvent)
export type CanvasEventType =
  | 'createCard'
  | 'moveCard'
  | 'deleteCard'
  | 'createZone'
  | 'deleteZone'
  | 'createConnection'
  | 'deleteConnection';

export interface CanvasEvent {
  id: string;
  projectId: string;
  timestamp: number;
  eventType: CanvasEventType;
  targetId: string;
  from?: Position;
  to?: Position;
}

// Funktionsumfang-Stufen (wie iOS: 1 Einfach, 2 Standard, 3 Erweitert)
export type ComplexityLevel = 1 | 2 | 3;

// Frame Colors
export const FRAME_COLORS = [
  '#FFD1DC', // Pastel Pink
  '#AEC6CF', // Pastel Blue
  '#B5EAD7', // Pastel Green
  '#FDFD96', // Pastel Yellow
  '#E0BBE4', // Pastel Purple
  '#FFB347', // Pastel Orange
  '#98D8C8', // Mint
  '#FFFFFF', // White
] as const;

export type FrameColor = typeof FRAME_COLORS[number];


// ---------------------------------------------------------------------------
// Buch-Modus: seitenbasierte Dokumentation (wie Book Creator)
// ---------------------------------------------------------------------------

// Logische Seitengröße je Format (Seitenkoordinaten, geräteunabhängig)
export const BOOK_FORMATS: Record<BookFormat, { width: number; height: number; label: string }> = {
  portrait: { width: 768, height: 1024, label: 'Hochformat' },
  square: { width: 1024, height: 1024, label: 'Quadrat' },
  landscape: { width: 1024, height: 768, label: 'Querformat' },
};

export type BookPagePattern = 'none' | 'lines' | 'grid' | 'dots';

export interface BookPage {
  id: string;
  projectId: string;
  index: number; // 0-basiert, lückenlos
  backgroundColor: string;
  backgroundPattern?: BookPagePattern;
  createdAt: number;
  updatedAt: number;
}

export type BookItemType = 'text' | 'image' | 'video' | 'audio' | 'drawing';
export type BookFontFamily = 'rounded' | 'serif' | 'chalk';
export type BookTextAlign = 'left' | 'center' | 'right';

export interface BookItemBase {
  id: string;
  projectId: string;
  pageId: string;
  type: BookItemType;
  // Position/Größe in Seitenkoordinaten (siehe BOOK_FORMATS)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // Grad
  zIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface BookTextItem extends BookItemBase {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: BookFontFamily;
  color: string;
  align: BookTextAlign;
  bold: boolean;
  backgroundColor?: string;
}

export interface BookImageItem extends BookItemBase {
  type: 'image';
  imageData: string; // Data-URL (komprimiert)
  thumbnailData?: string;
  borderColor?: string;
  borderRadius?: number;
}

/** Ein Untertitel-Abschnitt: Startzeit in Sekunden ab Aufnahmebeginn */
export interface BookCaption {
  start: number;
  text: string;
}

/** Wo ein Video im Lesemodus abgespielt wird: bildschirmfüllend oder an seinem Platz auf der Seite */
export type BookVideoPlayback = 'fullscreen' | 'inline';

export interface BookVideoItem extends BookItemBase {
  type: 'video';
  // Ohne Angabe: Vollbild (bisheriges Verhalten)
  playback?: BookVideoPlayback;
  videoData: string; // Data-URL
  thumbnailData?: string;
  mimeType?: string;
  duration?: number;
  captions?: BookCaption[]; // Untertitel aus der Spracherkennung während der Aufnahme
  // Beschnitt ohne Neukodierung: Wiedergabe nur zwischen diesen Zeitpunkten (Sekunden)
  trimStart?: number;
  trimEnd?: number;
}

export interface BookAudioItem extends BookItemBase {
  type: 'audio';
  audioData: string; // Data-URL
  mimeType?: string;
  duration?: number;
  label?: string;
  transcription?: string;
  captions?: BookCaption[]; // Untertitel aus der Spracherkennung während der Aufnahme
}

export interface BookDrawingItem extends BookItemBase {
  type: 'drawing';
  imageData: string; // transparentes PNG
  drawingData: string; // JSON: DrawingPath[] in Seitenkoordinaten
}

export type BookItem = BookTextItem | BookImageItem | BookVideoItem | BookAudioItem | BookDrawingItem;

// Schriftgrößen-Stufen für Text-Items (Seitenpunkte)
export const BOOK_FONT_SIZES: { label: string; size: number }[] = [
  { label: 'S', size: 24 },
  { label: 'M', size: 32 },
  { label: 'L', size: 44 },
  { label: 'XL', size: 64 },
];

// CSS-Schriftfamilien für Text-Items (nur Systemschriften, offline verfügbar)
export const BOOK_FONT_FAMILIES: Record<BookFontFamily, { label: string; css: string }> = {
  rounded: { label: 'Rund', css: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Inter', system-ui, sans-serif" },
  serif: { label: 'Klassisch', css: "Georgia, 'Times New Roman', serif" },
  chalk: { label: 'Tafel', css: "'Chalkboard SE', 'Comic Sans MS', 'Comic Neue', cursive" },
};

// Seitenfarben (kräftiger als Projekt-Hintergründe, kindgerecht)
export const BOOK_PAGE_COLORS: { name: string; color: string }[] = [
  { name: 'Weiß', color: '#FFFFFF' },
  { name: 'Creme', color: '#FFF8E7' },
  { name: 'Himmel', color: '#E3F0FF' },
  { name: 'Minze', color: '#E3F9EC' },
  { name: 'Rosa', color: '#FFE6EE' },
  { name: 'Lavendel', color: '#EEE6FF' },
  { name: 'Sonne', color: '#FFF3C4' },
  { name: 'Pfirsich', color: '#FFE8D6' },
  { name: 'Nacht', color: '#1E3A5F' },
];
