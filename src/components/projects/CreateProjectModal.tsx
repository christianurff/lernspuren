import React, { useState } from 'react';
import { Modal, Button } from '../common';
import { PROJECT_BACKGROUNDS } from '../../theme';
import { BOOK_FORMATS, type BookFormat, type Project, type ProjectKind } from '../../types';
import type { BookTemplate } from '../../data/bookTemplates';
import { BookTemplatePicker, WhiteboardTemplatePicker, type NewProjectTemplate } from './TemplatePicker';
import { useT } from '../../i18n';

export type { NewProjectTemplate };

export interface CreateProjectOptions {
  kind: ProjectKind;
  backgroundColor: string;
  bookFormat: BookFormat;
  template: NewProjectTemplate | null;
}

interface CreateProjectModalProps {
  isOpen: boolean;
  kind: ProjectKind;
  onClose: () => void;
  onCreate: (name: string, options: CreateProjectOptions) => void;
  defaultName?: string;
  userTemplates: Project[];
  onDeleteUserTemplate: (id: string) => void;
  showTemplates: boolean;
}

const DEFAULT_BACKGROUND_COLOR = '#F0F4FF';

/** Titel des Deckblatts einer Buchvorlage (erstes Textfeld der ersten Seite). */
function coverTitleOf(template: BookTemplate): string {
  return template.pages[0]?.texts[0]?.text || template.name;
}

// Mini-Vorschau der Buchformate (Seitenverhältnis in einer 56-px-Box)
function FormatPreview({ format }: { format: BookFormat }) {
  const { width, height } = BOOK_FORMATS[format];
  const scale = 44 / Math.max(width, height);
  return (
    <div className="w-14 h-14 flex items-center justify-center">
      <div
        className="bg-white border-2 border-current rounded-[3px]"
        style={{ width: width * scale, height: height * scale }}
      />
    </div>
  );
}

/**
 * Neue Pinnwand oder neues Buch. Welches von beidem, steht schon vorher fest
 * (zwei Knöpfe auf der Startseite) — der Dialog fragt nur noch, was zur
 * gewählten Art gehört: Name, Vorlage und Farbe bzw. Seitenformat.
 */
export function CreateProjectModal({
  isOpen,
  kind,
  onClose,
  onCreate,
  defaultName,
  userTemplates,
  onDeleteUserTemplate,
  showTemplates,
}: CreateProjectModalProps) {
  const t = useT();
  const isBook = kind === 'book';
  const [name, setName] = useState(defaultName ?? '');
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR);
  const [bookFormat, setBookFormat] = useState<BookFormat>('portrait');
  const [template, setTemplate] = useState<NewProjectTemplate | null>(null);
  // Solange niemand selbst getippt hat, darf die Vorlage den Namen vorschlagen
  const [nameTouched, setNameTouched] = useState(false);

  // Beim Öffnen zurücksetzen (state-adjust während des Renderns statt Effect)
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setName(defaultName ?? (isBook ? t('Mein Buch') : t('Meine Pinnwand')));
      setBackgroundColor(DEFAULT_BACKGROUND_COLOR);
      setBookFormat('portrait');
      setTemplate(null);
      setNameTouched(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), { kind, backgroundColor, bookFormat, template });
    onClose();
  };

  // Buchvorlage bringt einen Formatvorschlag mit, der änderbar bleibt
  const selectBookTemplate = (next: BookTemplate | null) => {
    setTemplate(next ? { kind: 'book', template: next } : null);
    if (!next) return;
    setBookFormat(next.format);
    // Der Titel der Vorlage steht auch auf dem Deckblatt – beides bleibt gleich
    if (!nameTouched) setName(t(coverTitleOf(next)));
  };

  // Auch die Pinnwand-Vorlage schlägt ihren Namen vor, solange nichts getippt wurde
  const selectWhiteboardTemplate = (next: NewProjectTemplate | null) => {
    setTemplate(next);
    if (!next || nameTouched) return;
    setName(next.kind === 'builtin' ? t(next.template.name) : next.template.name);
  };

  const selectedBookTemplate = template?.kind === 'book' ? template.template : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isBook ? t('Neues Buch') : t('Neue Pinnwand')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Kurze Orientierung – die lange Erklärung im alten Auswahlschritt entfällt */}
        <p className="text-xs text-ink-soft leading-snug -mt-1">
          {isBook
            ? t('Zum Erzählen und Zeigen: Seite für Seite, zum Blättern und Vorlesen.')
            : t('Zum Sammeln, Ordnen und Sortieren. Karten lassen sich später in ein Buch übernehmen.')}
        </p>
        {showTemplates && (
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">
              {isBook ? t('Buchvorlage') : t('Vorlage')}
            </label>
            {isBook ? (
              <BookTemplatePicker selected={selectedBookTemplate} onSelect={selectBookTemplate} />
            ) : (
              <WhiteboardTemplatePicker
                userTemplates={userTemplates}
                selected={template}
                onSelect={selectWhiteboardTemplate}
                onDeleteUserTemplate={onDeleteUserTemplate}
              />
            )}
            {selectedBookTemplate && (
              <p className="mt-1 text-xs text-ink-soft leading-snug">
                {t(selectedBookTemplate.description)} · {t('{n} Seiten, alles änderbar', { n: selectedBookTemplate.pages.length })}
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="project-name" className="block text-sm font-medium text-ink-soft mb-1">
            {isBook ? t('Buchtitel') : t('Name')}
          </label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder={isBook ? t('Mein Buch') : t('Meine Pinnwand')}
            className="w-full px-4 py-3 rounded-xl bg-[#F5F7FA] border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-blue text-lg text-ink"
            autoFocus
          />
        </div>

        {isBook ? (
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">{t('Seitenformat')}</label>
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(BOOK_FORMATS) as BookFormat[]).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setBookFormat(format)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-colors ${
                    bookFormat === format
                      ? 'border-primary-blue bg-primary-blue/10 text-primary-blue'
                      : 'border-gray-200 bg-white text-ink-soft hover:bg-gray-50'
                  }`}
                  aria-pressed={bookFormat === format}
                >
                  <FormatPreview format={format} />
                  <span className="text-sm font-medium text-ink">{t(BOOK_FORMATS[format].label)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Bei einer Vorlage liegt das Vorlagenbild auf weißem Grund – dann
          // wäre eine Hintergrundfarbe nur verwirrend.
          template === null && (
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-2">{t('Hintergrundfarbe')}</label>
              <div className="flex flex-wrap gap-3">
                {PROJECT_BACKGROUNDS.map(({ name: bgName, color }) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBackgroundColor(color)}
                    title={t(bgName)}
                    className={`relative w-12 h-12 rounded-full transition-transform flex items-center justify-center ${
                      backgroundColor === color ? 'border-[3px] border-primary-blue' : 'border border-gray-200'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={t('Farbe {name}', { name: t(bgName) })}
                  >
                    {backgroundColor === color && <span className="text-primary-blue font-bold">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            {t('Abbrechen')}
          </Button>
          <Button type="submit" disabled={!name.trim()} className="flex-1">
            {t('Erstellen')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
