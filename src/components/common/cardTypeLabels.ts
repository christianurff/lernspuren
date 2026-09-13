import type { CardType } from '../../types';

// Deutsche Typnamen und Symbole für Karten (wie iOS).
// Die Texte sind i18n-Schlüssel und werden per t(...) übersetzt.
export const CARD_TYPE_LABELS: Record<CardType, string> = {
  photo: 'Foto',
  text: 'Text',
  video: 'Video',
  audio: 'Audio',
  drawing: 'Zeichnung',
  task: 'Aufgabe',
};

export const CARD_TYPE_ICONS: Record<CardType, string> = {
  photo: '📷',
  text: '📝',
  video: '🎬',
  audio: '🎵',
  drawing: '🎨',
  task: '✅',
};
