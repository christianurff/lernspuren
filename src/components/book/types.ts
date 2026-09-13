// Gemeinsame Props-Verträge der Buch-Komponenten
import type { BookDrawingItem, BookItem, BookPage, BookTextItem } from '../../types';

export type BookViewMode = 'edit' | 'read' | 'static';

export interface BookPageViewProps {
  page: BookPage;
  items: BookItem[]; // bereits nach zIndex sortiert
  pageWidth: number; // logische Seitengröße
  pageHeight: number;
  scale: number; // Seitenpunkte -> CSS-Pixel
  mode: BookViewMode;
  // read-Modus: Item wurde angetippt (Text vorlesen, Audio/Video abspielen)
  onItemActivate?: (item: BookItem) => void;
  className?: string;
}

export interface PenResult {
  imageData: string; // transparentes PNG in Seitengröße
  drawingData: string; // JSON DrawingPath[] in Seitenkoordinaten
}

// Snap-Zustand während einer Ziehgeste (Hilfslinien an der Seitenmitte)
export interface BookSnapState {
  snapX: boolean;
  snapY: boolean;
}

export interface BookItemViewProps {
  item: BookItem;
  mode: BookViewMode;
  scale: number; // Seitenpunkte -> CSS-Pixel
  pageWidth: number;
  pageHeight: number;
  zIndex: number; // Stapelreihenfolge innerhalb der Seite (Listenindex)
  isSelected: boolean;
  isEditing: boolean; // Text-Item in Inline-Bearbeitung
  onItemActivate?: (item: BookItem) => void;
  onSnapChange?: (snap: BookSnapState) => void;
}

export interface TextItemEditorProps {
  item: BookTextItem;
}

export interface ItemActionBarProps {
  item: BookItem;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

export interface PenOverlayProps {
  pageWidth: number;
  pageHeight: number;
  scale: number;
  initial?: BookDrawingItem;
  onDone: (result: PenResult | null) => void;
}

export interface BookStageProps {
  pageWidth: number;
  pageHeight: number;
}
