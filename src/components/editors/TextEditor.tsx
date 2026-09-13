import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common';
import type { TextCard } from '../../types';
import { useCardsStore, useUIStore } from '../../stores';
import { useT } from '../../i18n';

interface TextEditorProps {
  card: TextCard;
}

export function TextEditor({ card }: TextEditorProps) {
  const t = useT();
  const [content, setContent] = useState(card.content);
  const [label, setLabel] = useState(card.label || '');

  const { updateCard, deleteCard } = useCardsStore();
  const { closeModal, showToast } = useUIStore();

  // Felder beim Kartenwechsel neu laden (state-adjust during render)
  const [prevCardId, setPrevCardId] = useState(card.id);
  if (prevCardId !== card.id) {
    setPrevCardId(card.id);
    setContent(card.content);
    setLabel(card.label || '');
  }

  // Live preview: update card content with debounce
  const updatePreview = useCallback(async (newContent: string) => {
    await updateCard(card.id, { content: newContent });
  }, [card.id, updateCard]);

  // Debounced update for live preview
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content !== card.content) {
        updatePreview(content);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [content, card.content, updatePreview]);

  const handleSave = async () => {
    await updateCard(card.id, { content, label: label || undefined });
    closeModal();
  };

  const handleDelete = async () => {
    await deleteCard(card.id);
    showToast(t('Karte gelöscht'));
    closeModal();
  };

  return (
    <Modal
      isOpen={true}
      onClose={closeModal}
      onSave={handleSave}
      title={t('Text')}
    >
      <div className="space-y-4">
        {/* Label */}
        <div>
          <label htmlFor="card-label" className="block text-sm font-medium text-gray-700 mb-1">
            {t('Bezeichnung')}
          </label>
          <input
            id="card-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('z.B. Notiz 1')}
            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pastel-blue"
          />
        </div>

        {/* Text content */}
        <div>
          <label htmlFor="card-content" className="block text-sm font-medium text-gray-700 mb-1">
            {t('Inhalt')}
          </label>
          <textarea
            id="card-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('Schreibe hier deinen Text...')}
            rows={8}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pastel-blue resize-none"
            autoFocus
          />
        </div>

        {/* Delete link */}
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={handleDelete}
            className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
          >
            {t('Karte löschen')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
