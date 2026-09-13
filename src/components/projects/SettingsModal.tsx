import { Modal } from '../common';
import { useSettingsStore } from '../../stores';
import type { ComplexityLevel } from '../../types';
import { getLanguageSetting, setLanguageSetting, useT, type LanguageSetting } from '../../i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ComplexityOption {
  level: ComplexityLevel;
  title: string;
  subtitle: string;
}

const COMPLEXITY_OPTIONS: ComplexityOption[] = [
  {
    level: 1,
    title: 'Einfach',
    subtitle: 'Foto, Text und Audio – ideal für den Einstieg',
  },
  {
    level: 2,
    title: 'Standard',
    subtitle: 'Zusätzlich Video, Zeichnen, Bereiche und Verbindungen',
  },
  {
    level: 3,
    title: 'Erweitert',
    subtitle: 'Alle Funktionen inklusive Szenen',
  },
];

// Sprachauswahl: „Automatisch" folgt der Sprache des Geräts
const LANGUAGE_OPTIONS: { value: LanguageSetting; label: string }[] = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const t = useT();
  const complexityLevel = useSettingsStore((s) => s.complexityLevel);
  const setComplexityLevel = useSettingsStore((s) => s.setComplexityLevel);
  const showTemplates = useSettingsStore((s) => s.showTemplates);
  const toggleShowTemplates = useSettingsStore((s) => s.toggleShowTemplates);
  const languageSetting = getLanguageSetting();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Einstellungen')} size="md">
      <div className="flex flex-col gap-6">
        {/* Funktionsumfang */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink-soft">{t('Funktionsumfang')}</h3>
          <div className="flex flex-col gap-2">
            {COMPLEXITY_OPTIONS.map((option) => {
              const selected = complexityLevel === option.level;
              return (
                <button
                  key={option.level}
                  onClick={() => setComplexityLevel(option.level)}
                  className={`flex items-center justify-between gap-3 rounded-xl p-3 text-left transition-colors ${
                    selected
                      ? 'border border-primary-blue bg-primary-blue/10'
                      : 'border border-transparent bg-[#F5F7FA]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{t(option.title)}</p>
                    <p className="text-xs text-ink-soft">{t(option.subtitle)}</p>
                  </div>
                  {selected && <CheckIcon className="flex-shrink-0 text-primary-blue" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Sprache */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink-soft">{t('Sprache')}</h3>
          <div className="grid grid-cols-3 gap-2">
            {LANGUAGE_OPTIONS.map((option) => {
              const selected = languageSetting === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setLanguageSetting(option.value)}
                  className={`flex min-h-[52px] items-center justify-center gap-1.5 rounded-xl p-3 text-sm font-medium transition-colors ${
                    selected
                      ? 'border border-primary-blue bg-primary-blue/10 text-ink'
                      : 'border border-transparent bg-[#F5F7FA] text-ink-soft'
                  }`}
                >
                  {selected && <CheckIcon className="flex-shrink-0 text-primary-blue" />}
                  {option.value === 'auto' ? t('Automatisch') : option.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Vorlagen */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink-soft">{t('Vorlagen')}</h3>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#F5F7FA] p-3">
            <span className="font-medium text-ink">
              {t('Vorlagen beim Erstellen anbieten')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={showTemplates}
              aria-label={t('Vorlagen beim Erstellen anbieten')}
              onClick={toggleShowTemplates}
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                showTemplates ? 'bg-primary-blue' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  showTemplates ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
