import React, { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onSave?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  /** Klick auf den Hintergrund schließt den Dialog (Standard: true).
   *  Bei Editoren mit ungespeicherten Änderungen auf false setzen. */
  closeOnBackdrop?: boolean;
}

// Stapel der aktuell offenen Modals: nur das oberste reagiert auf Escape.
const modalStack: string[] = [];

// --- Sichtbarer Bereich bei eingeblendeter Tastatur ---------------------------
//
// Auf dem iPad schiebt die Tastatur das Layout nicht zusammen: `100vh` bleibt die
// volle Höhe, ein mittig stehender Dialog verschwindet also hinter der Tastatur.
// `visualViewport` meldet, was wirklich zu sehen ist – daran richtet sich der
// Dialog aus, statt sich an der Fensterhöhe zu orientieren.

function subscribeViewport(onChange: () => void): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  viewport.addEventListener('resize', onChange);
  viewport.addEventListener('scroll', onChange);
  return () => {
    viewport.removeEventListener('resize', onChange);
    viewport.removeEventListener('scroll', onChange);
  };
}

/** Höhe und Oberkante des sichtbaren Bereichs; 0, wenn der Browser nichts meldet. */
function useVisibleViewport(): { height: number; top: number } {
  const height = useSyncExternalStore(subscribeViewport, () => window.visualViewport?.height ?? 0);
  const top = useSyncExternalStore(subscribeViewport, () => window.visualViewport?.offsetTop ?? 0);
  return { height, top };
}

export function Modal({
  isOpen = true,
  onClose,
  title,
  children,
  size = 'md',
  onSave,
  saveLabel,
  cancelLabel,
  closeOnBackdrop = true,
}: ModalProps) {
  const t = useT();
  const modalRef = useRef<HTMLDivElement>(null);
  const stackId = useId();
  const titleId = useId();
  const viewport = useVisibleViewport();

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  // Modal-Stapel pflegen (das oberste Modal reagiert auf Escape)
  useEffect(() => {
    if (!isOpen) return;

    modalStack.push(stackId);
    document.body.style.overflow = 'hidden';

    return () => {
      const index = modalStack.lastIndexOf(stackId);
      if (index !== -1) modalStack.splice(index, 1);
      // Scroll-Sperre erst aufheben, wenn kein Modal mehr offen ist
      if (modalStack.length === 0) document.body.style.overflow = '';
    };
  }, [isOpen, stackId]);

  // Escape schließt nur das oberste Modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalStack[modalStack.length - 1] !== stackId) return;
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, stackId, onClose]);

  // Fokus beim Öffnen in den Dialog holen und beim Schließen zurückgeben
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = modalRef.current;
    // Ein per autoFocus fokussiertes Feld im Dialog behält den Fokus
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.focus();
    }
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // Ist der Dialog höher als der sichtbare Bereich, das angetippte Feld
  // hereinscrollen – sonst bleibt es unter der Tastatur.
  useEffect(() => {
    if (!isOpen) return;
    const dialog = modalRef.current;
    if (!dialog) return;
    const handleFocus = (e: FocusEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (!ziel || !dialog.contains(ziel)) return;
      // Erst nach dem Einblenden der Tastatur scrollen, sonst stimmen die Maße nicht.
      setTimeout(() => ziel.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    };
    dialog.addEventListener('focusin', handleFocus);
    return () => dialog.removeEventListener('focusin', handleFocus);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  const hasHeaderActions = !!onSave;

  // Per Portal an document.body: sonst sperrt das transform der animate-in-Klasse
  // eines Eltern-Modals verschachtelte position:fixed-Kinder ein.
  return createPortal(
    <div
      className="fixed inset-x-0 z-50 flex items-center justify-center bg-black/50 p-4"
      style={
        viewport.height > 0
          ? { top: viewport.top, height: viewport.height }
          : { top: 0, bottom: 0 }
      }
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`w-full ${sizeClasses[size]} rounded-[24px] bg-white shadow-xl animate-in fade-in zoom-in-95 duration-200 flex flex-col focus:outline-none`}
        style={{ maxHeight: viewport.height > 0 ? '100%' : '90vh' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {/* Header with actions */}
        {hasHeaderActions ? (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              {cancelLabel ?? t('Abbrechen')}
            </button>
            {title && (
              <h2 id={titleId} className="text-lg font-bold text-ink">
                {title}
              </h2>
            )}
            <button
              onClick={onSave}
              className="text-primary-blue hover:brightness-90 font-semibold transition-colors"
            >
              {saveLabel ?? t('Speichern')}
            </button>
          </div>
        ) : title ? (
          <h2 id={titleId} className="px-6 pt-6 pb-4 text-xl font-bold text-ink">
            {title}
          </h2>
        ) : null}

        {/* Content */}
        <div className={`overflow-y-auto ${hasHeaderActions ? 'p-4' : 'p-6 pt-0'}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
