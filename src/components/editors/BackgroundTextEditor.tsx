import { useState } from 'react';
import { Modal, Button } from '../common';
import type { BackgroundText, Position } from '../../types';
import { DRAWING_COLORS } from '../../theme';
import { useUIStore } from '../../stores';
import { useBackgroundTextsStore } from '../../stores/useBackgroundTextsStore';
import { useT } from '../../i18n';

interface BackgroundTextEditorProps {
  text?: BackgroundText;
  defaultPosition?: Position;
  projectId: string;
}

export function BackgroundTextEditor({
  text,
  defaultPosition,
  projectId,
}: BackgroundTextEditorProps) {
  const t = useT();
  const isEditing = !!text;

  // Schriftgrößen wie in der iOS-App (Klein / Mittel / Groß)
  const SIZE_OPTIONS: { label: string; value: number }[] = [
    { label: t('Klein'), value: 18 },
    { label: t('Mittel'), value: 24 },
    { label: t('Groß'), value: 36 },
  ];

  const { addText, updateText, deleteText } = useBackgroundTextsStore();
  const { closeModal, showToast } = useUIStore();

  const [value, setValue] = useState(text?.text ?? '');
  const [fontSize, setFontSize] = useState(text?.fontSize ?? 24);
  const [color, setColor] = useState(text?.color ?? DRAWING_COLORS[0].color);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0;

  const handleSave = async () => {
    if (!canSave) return;

    if (isEditing && text) {
      await updateText(text.id, { text: trimmed, fontSize, color });
      showToast(t('Beschriftung gespeichert'));
    } else {
      const position = defaultPosition ?? { x: 200, y: 200 };
      await addText(projectId, trimmed, position, fontSize, color);
      showToast(t('Beschriftung erstellt'));
    }

    closeModal();
  };

  const handleDelete = async () => {
    if (!text) return;
    await deleteText(text.id);
    showToast(t('Beschriftung gelöscht'));
    closeModal();
  };

  return (
    <Modal isOpen={true} onClose={closeModal} title={t('Beschriftung')}>
      <div className="space-y-5">
        {/* Texteingabe */}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('Beschriftung eingeben...')}
          autoFocus
          className="w-full px-4 py-3 rounded-xl bg-[#F5F7FA] text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary-blue"
        />

        {/* Größenauswahl */}
        <div>
          <p className="text-sm font-medium text-ink-soft mb-2">{t('Größe')}</p>
          <div className="flex gap-2">
            {SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFontSize(opt.value)}
                className={`flex-1 py-2.5 rounded-xl font-semibold transition-colors ${
                  fontSize === opt.value
                    ? 'bg-primary-blue text-white'
                    : 'bg-[#F5F7FA] text-ink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Farbauswahl */}
        <div>
          <p className="text-sm font-medium text-ink-soft mb-2">{t('Farbe')}</p>
          <div className="flex flex-wrap gap-3">
            {DRAWING_COLORS.map((c) => (
              <button
                key={c.color}
                type="button"
                aria-label={t(c.name)}
                onClick={() => setColor(c.color)}
                className={`w-9 h-9 rounded-full transition-transform ${
                  color === c.color
                    ? 'ring-[3px] ring-primary-blue ring-offset-2'
                    : ''
                }`}
                style={{ backgroundColor: c.color }}
              />
            ))}
          </div>
        </div>

        {/* Aktionen */}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={closeModal}>
            {t('Abbrechen')}
          </Button>
          <Button
            variant="primary"
            className="flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={!canSave}
          >
            {t('Speichern')}
          </Button>
        </div>

        {/* Löschen (nur im Bearbeiten-Modus) */}
        {isEditing && (
          <div className="pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={handleDelete}
              className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
            >
              {t('Beschriftung löschen')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
