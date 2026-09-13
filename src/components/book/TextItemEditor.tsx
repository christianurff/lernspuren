import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { BOOK_FONT_FAMILIES } from '../../types';
import { useBookStore } from '../../stores/useBookStore';
import { MIN_ITEM_SIZE } from '../../utils/bookGeometry';
import type { TextItemEditorProps } from './types';

/**
 * Inline-Bearbeitung eines Text-Items: eine textarea liegt exakt über dem Item
 * und übernimmt Schrift, Farbe, Ausrichtung und Innenabstand des Items.
 */
export function TextItemEditor({ item }: TextItemEditorProps) {
  const updateItemLocal = useBookStore((s) => s.updateItemLocal);
  const setEditingItem = useBookStore((s) => s.setEditingItem);

  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    const end = area.value.length;
    area.setSelectionRange(end, end);
  }, []);

  const measuredHeight = (area: HTMLTextAreaElement): number => {
    area.style.height = 'auto';
    const height = Math.max(MIN_ITEM_SIZE, Math.round(area.scrollHeight));
    area.style.height = '100%';
    return height;
  };

  // Text und Höhe live in den Store schreiben (nur lokal). Persistenz + Undo-Eintrag
  // übernimmt der Store zentral beim Beenden der Bearbeitung (setEditingItem(null)) –
  // so geht nichts verloren, wenn die Bearbeitung von außen beendet wird.
  const handleInput = () => {
    const area = areaRef.current;
    if (!area) return;
    const height = measuredHeight(area);
    updateItemLocal(item.id, { text: area.value, height });
  };

  const commit = () => {
    if (useBookStore.getState().editingItemId === item.id) setEditingItem(null);
  };

  // Wird die App weggeschoben oder geschlossen (Tab-Wechsel, Home-Taste, PWA in den
  // Hintergrund), gibt es kein Blur: Die Bearbeitung wird hier aktiv abgeschlossen,
  // damit der Text nicht verloren geht.
  useEffect(() => {
    const finalize = () => {
      const area = areaRef.current;
      if (area) {
        area.style.height = 'auto';
        const height = Math.max(MIN_ITEM_SIZE, Math.round(area.scrollHeight));
        area.style.height = '100%';
        updateItemLocal(item.id, { text: area.value, height });
      }
      if (useBookStore.getState().editingItemId === item.id) setEditingItem(null);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') finalize();
    };
    window.addEventListener('pagehide', finalize);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', finalize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [item.id, updateItemLocal, setEditingItem]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      commit();
    }
  };

  // Tippen in die textarea darf keine Ziehgeste des Items auslösen
  const stopPointer = (e: ReactPointerEvent<HTMLTextAreaElement>) => e.stopPropagation();

  return (
    <textarea
      ref={areaRef}
      defaultValue={item.text}
      onInput={handleInput}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      onPointerDown={stopPointer}
      onPointerMove={stopPointer}
      onPointerUp={stopPointer}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        margin: 0,
        padding: 12,
        border: 'none',
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        background: 'transparent',
        font: `${item.bold ? 'bold ' : ''}${item.fontSize}px ${BOOK_FONT_FAMILIES[item.fontFamily].css}`,
        lineHeight: 1.25,
        color: item.color,
        textAlign: item.align,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        touchAction: 'auto',
      }}
    />
  );
}
