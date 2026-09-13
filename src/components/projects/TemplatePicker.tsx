import type { Project } from '../../types';
import { BOOK_FORMATS, type BookFormat } from '../../types';
import { BUILTIN_TEMPLATES, templateUrl, type BuiltinTemplate } from '../../data/templates';
import { BOOK_TEMPLATES, type BookTemplate, type BookTemplatePage } from '../../data/bookTemplates';
import { useT } from '../../i18n';

/** Was beim Erstellen als Vorlage gewählt ist (nichts = leeres Projekt). */
export type NewProjectTemplate =
  | { kind: 'builtin'; template: BuiltinTemplate }
  | { kind: 'user'; template: Project }
  | { kind: 'book'; template: BookTemplate };

const TILE = 'w-[132px] shrink-0 rounded-[14px] overflow-hidden text-left transition-all';
const PREVIEW_HEIGHT = 84;

function tileClasses(active: boolean): string {
  return `${TILE} ${
    active
      ? 'ring-2 ring-primary-blue shadow-[0_2px_10px_rgba(91,141,239,0.35)]'
      : 'shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
  }`;
}

function TileLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-semibold text-ink truncate px-2 py-1.5 bg-white">{children}</p>;
}

/** „Leer" – ohne Vorlage anfangen. Steht immer als Erstes. */
function EmptyTile({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onSelect} className={tileClasses(active)} aria-pressed={active}>
      <div
        className="flex items-center justify-center bg-white border-b border-gray-100"
        style={{ height: PREVIEW_HEIGHT }}
      >
        <svg className="w-8 h-8 text-ink-soft/50" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="4 3" />
          <path strokeLinecap="round" d="M12 9v6M9 12h6" />
        </svg>
      </div>
      <TileLabel>{t('Leer')}</TileLabel>
    </button>
  );
}

interface WhiteboardTemplatePickerProps {
  userTemplates: Project[];
  selected: NewProjectTemplate | null;
  onSelect: (template: NewProjectTemplate | null) => void;
  onDeleteUserTemplate: (id: string) => void;
}

/** Vorlagen für die Pinnwand: eigene zuerst, danach die mitgelieferten. */
export function WhiteboardTemplatePicker({
  userTemplates,
  selected,
  onSelect,
  onDeleteUserTemplate,
}: WhiteboardTemplatePickerProps) {
  const t = useT();

  return (
    <div className="flex gap-3 overflow-x-auto -mx-2 px-2 pt-1.5 pb-3">
      <EmptyTile active={selected === null} onSelect={() => onSelect(null)} />

      {userTemplates.map((project) => {
        const active = selected?.kind === 'user' && selected.template.id === project.id;
        return (
          <div key={project.id} className="relative shrink-0">
            <button
              type="button"
              onClick={() => onSelect({ kind: 'user', template: project })}
              className={`${tileClasses(active)} bg-white border-2 border-dashed border-primary-blue/60`}
              aria-pressed={active}
            >
              <div style={{ height: PREVIEW_HEIGHT }} className="overflow-hidden">
                {project.coverImage ? (
                  <img src={project.coverImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: project.backgroundColor }}
                  >
                    <svg className="w-7 h-7 text-ink-soft/40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="13" rx="2" />
                      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
                    </svg>
                  </div>
                )}
              </div>
              <TileLabel>{project.name}</TileLabel>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteUserTemplate(project.id);
              }}
              className="absolute top-1.5 right-1.5 w-6 h-6 bg-white/90 rounded-full text-red-500 flex items-center justify-center text-xs shadow"
              aria-label={t('Vorlage löschen')}
            >
              ✕
            </button>
          </div>
        );
      })}

      {BUILTIN_TEMPLATES.map((template) => {
        const active = selected?.kind === 'builtin' && selected.template.file === template.file;
        return (
          <button
            key={template.file}
            type="button"
            onClick={() => onSelect({ kind: 'builtin', template })}
            className={`${tileClasses(active)} bg-white`}
            aria-pressed={active}
          >
            <div style={{ height: PREVIEW_HEIGHT }} className="bg-white">
              <img
                src={templateUrl(template)}
                alt=""
                loading="lazy"
                className="w-full h-full object-contain p-1"
              />
            </div>
            <TileLabel>{t(template.name)}</TileLabel>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Miniatur einer Buchvorlage: zeigt das Gerüst einer Inhaltsseite —
 * gefüllte Balken sind vorgegebene Überschriften, gestrichelte die freien
 * Felder zum Selberschreiben.
 */
function BookTemplatePreview({ page, format }: { page: BookTemplatePage; format: BookFormat }) {
  const { width, height } = BOOK_FORMATS[format];
  const scale = Math.min((PREVIEW_HEIGHT - 8) / height, 116 / width);
  return (
    <div className="flex items-center justify-center bg-surface-light" style={{ height: PREVIEW_HEIGHT }}>
      <div
        className="relative rounded-[3px] overflow-hidden shadow-sm"
        style={{ width: width * scale, height: height * scale, backgroundColor: page.backgroundColor }}
      >
        {page.texts.map((text, index) => (
          <div
            key={index}
            className="absolute rounded-[2px]"
            style={{
              left: `${text.x * 100}%`,
              top: `${text.y * 100}%`,
              width: `${text.width * 100}%`,
              height: `${Math.max(text.height * 100, 6)}%`,
              backgroundColor: text.text ? 'rgba(30,58,95,0.55)' : 'transparent',
              border: text.text ? undefined : '1px dashed rgba(30,58,95,0.35)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface BookTemplatePickerProps {
  selected: BookTemplate | null;
  onSelect: (template: BookTemplate | null) => void;
}

/** Vorlagen für das Buch: fertige Seitengerüste zum Weiterschreiben. */
export function BookTemplatePicker({ selected, onSelect }: BookTemplatePickerProps) {
  const t = useT();
  return (
    <div className="flex gap-3 overflow-x-auto -mx-2 px-2 pt-1.5 pb-3">
      <EmptyTile active={selected === null} onSelect={() => onSelect(null)} />
      {BOOK_TEMPLATES.map((template) => {
        const active = selected?.id === template.id;
        // Die zweite Seite zeigt das Gerüst besser als das Deckblatt
        const preview = template.pages[1] ?? template.pages[0];
        return (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template)}
            className={`${tileClasses(active)} bg-white`}
            aria-pressed={active}
            title={t(template.description)}
          >
            <BookTemplatePreview page={preview} format={template.format} />
            <TileLabel>{t(template.name)}</TileLabel>
          </button>
        );
      })}
    </div>
  );
}
