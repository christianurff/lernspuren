import { create } from 'zustand';
import type { ComplexityLevel } from '../types';

// App-Einstellungen (wie iOS SettingsSheet), in localStorage persistiert
const STORAGE_KEY = 'dokumentenraum_settings';

interface StoredSettings {
  complexityLevel: ComplexityLevel;
  showTemplates: boolean;
}

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredSettings>;
      return {
        complexityLevel: (parsed.complexityLevel === 1 || parsed.complexityLevel === 2 || parsed.complexityLevel === 3)
          ? parsed.complexityLevel
          : 2,
        showTemplates: parsed.showTemplates !== false,
      };
    }
  } catch {
    // defekte Einstellungen ignorieren
  }
  return { complexityLevel: 2, showTemplates: true };
}

function persistSettings(settings: StoredSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Speichern fehlgeschlagen (z. B. Private Mode) — Einstellungen gelten nur für die Sitzung
  }
}

interface SettingsState extends StoredSettings {
  setComplexityLevel: (level: ComplexityLevel) => void;
  toggleShowTemplates: () => void;
}

const initial = loadSettings();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...initial,

  setComplexityLevel: (level: ComplexityLevel) => {
    set({ complexityLevel: level });
    persistSettings({ complexityLevel: level, showTemplates: get().showTemplates });
  },

  toggleShowTemplates: () => {
    const showTemplates = !get().showTemplates;
    set({ showTemplates });
    persistSettings({ complexityLevel: get().complexityLevel, showTemplates });
  },
}));
