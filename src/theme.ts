// Zentrale Design-Tokens, abgeglichen mit der iOS-App (AppTheme.swift)

export const theme = {
  // Primärfarben
  primaryBlue: '#5B8DEF',
  primaryPink: '#FF8FAB',
  primaryGreen: '#6BCB77',
  primaryPurple: '#B088F9',
  primaryOrange: '#FFB347',
  primaryYellow: '#FFE066',

  // Modus-Akzentfarben (Canvas-Werkzeuge)
  accentDraw: '#EAB308',
  accentConnect: '#6366F1',

  // Hintergründe
  backgroundLight: '#F8FAFF',
  backgroundCard: '#FFFFFF',
  backgroundCanvas: '#F0F4FF',

  // Text
  textPrimary: '#1E3A5F',
  textSecondary: '#6B7C93',
  textLight: '#FFFFFF',

  // Eckenradien
  radiusSmall: 10,
  radiusMedium: 16,
  radiusLarge: 24,
} as const;

// Schrift: SF Rounded auf Apple-Geräten, sonst abgerundete System-Schrift
export const FONT_FAMILY = "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Inter', system-ui, sans-serif";

// Projekt-Hintergrundfarben (iOS: AppTheme.projectBackgrounds)
export const PROJECT_BACKGROUNDS: { name: string; color: string }[] = [
  { name: 'Himmel', color: '#F0F4FF' },
  { name: 'Wiese', color: '#F0FFF4' },
  { name: 'Sonnenuntergang', color: '#FFF5F5' },
  { name: 'Sand', color: '#FFFBEB' },
  { name: 'Lavendel', color: '#F5F3FF' },
  { name: 'Schnee', color: '#FFFFFF' },
  { name: 'Ozean', color: '#E0F2FE' },
  { name: 'Pfirsich', color: '#FFF1E6' },
];

// Zeichenfarben (iOS: AppTheme.drawingColors)
export const DRAWING_COLORS: { name: string; color: string }[] = [
  { name: 'Schwarz', color: '#1F2937' },
  { name: 'Rot', color: '#EF4444' },
  { name: 'Orange', color: '#F97316' },
  { name: 'Gelb', color: '#EAB308' },
  { name: 'Grün', color: '#22C55E' },
  { name: 'Blau', color: '#3B82F6' },
  { name: 'Lila', color: '#8B5CF6' },
  { name: 'Pink', color: '#EC4899' },
];
