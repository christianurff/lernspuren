import { useState } from 'react';
import { Modal, Button } from '../common';
import type { Card, CardSize } from '../../types';
import { CARD_SIZES, FRAME_COLORS } from '../../types';
import { useCardsStore, useUIStore, useProjectStore } from '../../stores';
import { useT } from '../../i18n';

interface CardOptionsModalProps {
  card: Card;
}

export function CardOptionsModal({ card }: CardOptionsModalProps) {
  const t = useT();
  const [label, setLabel] = useState(card.label || '');

  const { updateCard, deleteCard, changeSize, removeFromStack, toggleCardCompact } = useCardsStore();
  const { closeModal, showToast, globalCompactView } = useUIStore();
  // Im freien Modus zieht man die Größe direkt an der Karte – die drei Stufen
  // hätten dort keine Wirkung.
  const isFreeLayout = useProjectStore((state) =>
    state.projects.find((p) => p.id === card.projectId)?.cardLayout === 'free'
  );

  // Bezeichnung beim Kartenwechsel neu laden (state-adjust during render, wie TextEditor)
  const [prevCardId, setPrevCardId] = useState(card.id);
  if (prevCardId !== card.id) {
    setPrevCardId(card.id);
    setLabel(card.label || '');
  }

  const handleSizeChange = async (size: CardSize) => {
    await changeSize(card.id, size);
  };

  const handleColorChange = async (color: string) => {
    await updateCard(card.id, { frameColor: color });
  };

  const handleLabelChange = async () => {
    await updateCard(card.id, { label: label || undefined });
    showToast(t('Bezeichnung gespeichert'));
  };

  const handleToggleCompact = async () => {
    await toggleCardCompact(card.id);
    const newState = !(card.isCompact ?? globalCompactView);
    showToast(newState ? t('Kompakte Ansicht') : t('Ausführliche Ansicht'));
  };

  const handleDelete = async () => {
    await deleteCard(card.id);
    showToast(t('Karte gelöscht'));
    closeModal();
  };

  const handleRemoveFromStack = async () => {
    await removeFromStack(card.id);
    showToast(t('Aus Stapel entfernt'));
  };

  const isCardCompact = card.isCompact ?? globalCompactView;

  return (
    <Modal isOpen={true} onClose={closeModal} title={t('Kartenoptionen')}>
      <div className="space-y-5">
        {/* Label input */}
        <div>
          <label htmlFor="card-label" className="block text-sm font-medium text-gray-700 mb-1">
            {t('Bezeichnung')}
          </label>
          <div className="flex gap-2">
            <input
              id="card-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={handleLabelChange}
              onKeyDown={(e) => e.key === 'Enter' && handleLabelChange()}
              placeholder={t('z.B. Foto 1')}
              className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pastel-blue"
            />
          </div>
        </div>

        {/* Compact toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('Ansicht')}
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleToggleCompact}
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                !isCardCompact
                  ? 'bg-pastel-blue text-gray-800'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              {t('Ausführlich')}
            </button>
            <button
              onClick={handleToggleCompact}
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                isCardCompact
                  ? 'bg-pastel-blue text-gray-800'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
              </svg>
              {t('Kompakt')}
            </button>
          </div>
        </div>

        {/* Size options - only show when not compact */}
        {!isCardCompact && !isFreeLayout && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('Größe')}
            </label>
            <div className="flex gap-2">
              {(Object.entries(CARD_SIZES) as [CardSize, typeof CARD_SIZES.small][]).map(
                ([size, config]) => (
                  <button
                    key={size}
                    onClick={() => handleSizeChange(size)}
                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${
                      card.size === size
                        ? 'bg-pastel-blue text-gray-800'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t(config.label)}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Color options */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('Rahmenfarbe')}
          </label>
          <div className="flex flex-wrap gap-2">
            {['#FFFFFF', ...FRAME_COLORS].map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className={`w-10 h-10 rounded-full border-2 transition-transform ${
                  card.frameColor === color || (!card.frameColor && color === '#FFFFFF')
                    ? 'border-gray-800 scale-110'
                    : 'border-gray-200'
                }`}
                style={{ backgroundColor: color }}
                aria-label={t('Farbe {color}', { color })}
              />
            ))}
          </div>
        </div>

        {/* Stack options */}
        {card.stackId && (
          <Button
            variant="secondary"
            onClick={handleRemoveFromStack}
            className="w-full"
          >
            {t('Aus Stapel entfernen')}
          </Button>
        )}

        {/* Delete */}
        <Button variant="danger" onClick={handleDelete} className="w-full">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          {t('Karte löschen')}
        </Button>
      </div>
    </Modal>
  );
}
