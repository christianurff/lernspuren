import { useState } from 'react';
import { useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { useT } from '../../i18n';

interface BookToolbarProps {
  projectName: string;
  onBack: () => void;
  onRename: (name: string) => void;
}

// --- Icons (inline SVG, damit keine Abhängigkeit nötig ist) ------------------

function ChevronLeftIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l-5-5 5-5M4 9h10a5 5 0 010 10h-3" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 14l5-5-5-5M20 9H10a5 5 0 000 10h3" />
    </svg>
  );
}

function PagesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="3" width="10" height="14" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h10a2 2 0 002-2V8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5M12 8h.01" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 9l5 3-5 3V9z" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}

// --- Kleiner Werkzeug-Knopf --------------------------------------------------

interface ToolButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

function ToolButton({ label, onClick, active = false, disabled = false, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`h-11 min-w-[44px] px-3 rounded-full flex items-center gap-2 font-semibold text-[15px] transition-all duration-200 active:scale-95 ${
        active
          ? 'bg-primary-blue text-white shadow-sm'
          : disabled
          ? 'text-ink-soft opacity-40'
          : 'text-ink hover:bg-black/5'
      }`}
    >
      {children}
      <span className="hidden sm:inline whitespace-nowrap">{label}</span>
    </button>
  );
}

// --- Kopfzeile ---------------------------------------------------------------

export function BookToolbar({ projectName, onBack, onRename }: BookToolbarProps) {
  const t = useT();
  const undo = useBookStore((s) => s.undo);
  const redo = useBookStore((s) => s.redo);
  const undoCount = useBookStore((s) => s.undoStack.length);
  const redoCount = useBookStore((s) => s.redoStack.length);

  const panel = useBookUIStore((s) => s.panel);
  const togglePanel = useBookUIStore((s) => s.togglePanel);
  const startReading = useBookUIStore((s) => s.startReading);

  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);

  // Externe Namensänderung übernehmen (state-adjust during render statt Effect)
  const [lastName, setLastName] = useState(projectName);
  if (projectName !== lastName) {
    setLastName(projectName);
    if (!isEditingName) setDraftName(projectName);
  }

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== projectName) {
      onRename(trimmed);
    } else {
      setDraftName(projectName);
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitName();
    } else if (e.key === 'Escape') {
      setDraftName(projectName);
      setIsEditingName(false);
    }
  };

  return (
    <header className="relative z-30 bg-white/80 backdrop-blur-md border-b border-black/10 pt-[env(safe-area-inset-top)]">
      <div className="h-14 sm:h-16 px-2 sm:px-4 flex items-center gap-2">
        {/* Zurück */}
        <button
          type="button"
          onClick={onBack}
          aria-label={t('Zurück zu den Projekten')}
          className="h-11 pl-1 pr-3 rounded-full flex items-center gap-1 text-primary-blue font-semibold text-[15px] transition-all duration-200 active:scale-95 hover:bg-black/5"
        >
          <ChevronLeftIcon />
          <span className="hidden sm:inline">{t('Projekte')}</span>
        </button>

        {/* Buchtitel */}
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <input
              type="text"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={handleNameKeyDown}
              aria-label={t('Buchtitel')}
              className="w-full max-w-[280px] text-[17px] font-semibold text-ink bg-white px-4 h-11 rounded-full border-2 border-primary-blue outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftName(projectName);
                setIsEditingName(true);
              }}
              title={t('Titel ändern')}
              className="max-w-full h-11 px-3 rounded-full text-[17px] font-semibold text-ink truncate transition-colors hover:bg-black/5"
            >
              {projectName}
            </button>
          )}
        </div>

        {/* Werkzeuge rechts */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => void undo()}
            disabled={undoCount === 0}
            aria-label={t('Rückgängig')}
            title={t('Rückgängig')}
            className={`w-11 h-11 rounded-full flex items-center justify-center text-ink transition-all duration-200 active:scale-90 ${
              undoCount === 0 ? 'opacity-40' : 'hover:bg-black/5'
            }`}
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            onClick={() => void redo()}
            disabled={redoCount === 0}
            aria-label={t('Wiederholen')}
            title={t('Wiederholen')}
            className={`w-11 h-11 rounded-full flex items-center justify-center text-ink transition-all duration-200 active:scale-90 ${
              redoCount === 0 ? 'opacity-40' : 'hover:bg-black/5'
            }`}
          >
            <RedoIcon />
          </button>

          <ToolButton label={t('Seiten')} active={panel === 'pages'} onClick={() => togglePanel('pages')}>
            <PagesIcon />
          </ToolButton>

          {/* Hinzufügen (Hauptaktion) */}
          <button
            type="button"
            onClick={() => togglePanel('add')}
            aria-label={t('Element hinzufügen')}
            aria-pressed={panel === 'add'}
            title={t('Element hinzufügen')}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md transition-all duration-200 active:scale-90 ${
              panel === 'add' ? 'bg-[#4A7CE0]' : 'bg-primary-blue hover:brightness-105'
            }`}
          >
            <PlusIcon />
          </button>

          <ToolButton label={t('Info')} active={panel === 'inspector'} onClick={() => togglePanel('inspector')}>
            <InfoIcon />
          </ToolButton>

          <ToolButton label={t('Vorschau')} onClick={startReading}>
            <PlayIcon />
          </ToolButton>

          <ToolButton label={t('Exportieren')} active={panel === 'export'} onClick={() => togglePanel('export')}>
            <ExportIcon />
          </ToolButton>
        </div>
      </div>
    </header>
  );
}
