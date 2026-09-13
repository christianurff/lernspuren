import { useLayoutEffect, useRef } from 'react';
import { useCardsStore, useCanvasStore } from '../../stores';
import type { TextCard } from '../../types';
import { blurInlineEditFields, focusInlineEditField, registerInlineEditField } from './inlineEditFocus';
import { useT } from '../../i18n';

// Ruheplatz der Felder, solange nichts bearbeitet wird: unsichtbar, aber im
// DOM und fokussierbar. Nur so kann der Fokus schon im Tipp gesetzt werden und
// die Tastatur auf iOS mit dem Feld zusammen erscheinen (siehe inlineEditFocus).
const PARKED = {
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
} as const;

export function InlineEditOverlay() {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const inlineEdit = useCardsStore((state) => state.inlineEdit);
  const endInlineEdit = useCardsStore((state) => state.endInlineEdit);
  const saveInlineEdit = useCardsStore((state) => state.saveInlineEdit);
  const cards = useCardsStore((state) => state.cards);
  const scale = useCanvasStore((state) => state.scale);
  const position = useCanvasStore((state) => state.position);

  const card = inlineEdit ? cards.find((c) => c.id === inlineEdit.cardId) : undefined;
  const active = inlineEdit && card ? inlineEdit : null;

  useLayoutEffect(() => {
    registerInlineEditField('label', inputRef.current);
    registerInlineEditField('content', textareaRef.current);
    return () => {
      registerInlineEditField('label', null);
      registerInlineEditField('content', null);
    };
  }, []);

  // Fokus nachholen: Beim Tipp sitzt er schon auf dem Feld (Tastatur ist oben),
  // bei Maus und Tastatur passiert es erst hier.
  useLayoutEffect(() => {
    if (!inlineEdit) {
      blurInlineEditFields();
      return;
    }
    const target = useCardsStore.getState().cards.find((c) => c.id === inlineEdit.cardId);
    if (!target) return;
    const value = inlineEdit.field === 'label'
      ? target.label || ''
      : target.type === 'text' ? (target as TextCard).content || '' : '';
    focusInlineEditField(inlineEdit.field, value, inlineEdit.field === 'label' ? 'all' : 'end');
  }, [inlineEdit]);

  // Bildschirmposition aus der Canvas-Transformation
  const box = active
    ? {
        left: active.position.x * scale + position.x,
        top: active.position.y * scale + position.y,
        width: active.size.width * scale,
        height: active.size.height * scale,
      }
    : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      endInlineEdit();
    }
    // Beim einzeiligen Bezeichnungsfeld speichert Enter
    if (active?.field === 'label' && e.key === 'Enter') {
      e.preventDefault();
      saveInlineEdit((e.target as HTMLInputElement).value);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!active) return;
    saveInlineEdit(e.target.value);
  };

  const saveFromField = () => {
    if (!active) return;
    const element = active.field === 'label' ? inputRef.current : textareaRef.current;
    saveInlineEdit(element?.value ?? '');
  };

  const labelBox = active?.field === 'label' && box ? box : null;
  const contentBox = active?.field === 'content' && box ? box : null;

  return (
    <div className={`fixed inset-0 z-40 ${active ? '' : 'pointer-events-none'}`}>
      {/* Tipp daneben speichert und beendet die Bearbeitung */}
      {active && (
        <div className="absolute inset-0 pointer-events-auto" onClick={saveFromField} />
      )}

      <input
        ref={inputRef}
        type="text"
        placeholder={t('Bezeichnung eingeben...')}
        aria-label={t('Bezeichnung eingeben...')}
        aria-hidden={!labelBox}
        tabIndex={labelBox ? 0 : -1}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`absolute px-2 text-sm text-ink bg-white border-2 border-primary-blue rounded-full focus:outline-none focus:ring-2 focus:ring-primary-blue/30 ${
          labelBox ? 'pointer-events-auto' : ''
        }`}
        style={labelBox ? { ...labelBox, fontSize: `${12 * scale}px` } : PARKED}
      />

      <textarea
        ref={textareaRef}
        placeholder={t('Text eingeben...')}
        aria-label={t('Text eingeben...')}
        aria-hidden={!contentBox}
        tabIndex={contentBox ? 0 : -1}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={`absolute p-2 text-ink bg-white border-2 border-primary-blue rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue/30 resize-none ${
          contentBox ? 'pointer-events-auto' : ''
        }`}
        style={contentBox ? { ...contentBox, fontSize: `${14 * scale}px` } : PARKED}
      />
    </div>
  );
}
