import { useEffect, useState, useCallback } from 'react';
import type { Card, Position, TextCard, TaskCard, AudioCard } from '../../types';
import { cardDimensions } from '../../utils/cardGeometry';
import { useCardsStore, useUIStore, useProjectStore } from '../../stores';
import { ttsService } from '../../services/ttsService';
import { theme } from '../../theme';
import { useT } from '../../i18n';
// Höhe/Abstand der Aktionsleiste – wie im Buch-Modus (ItemActionBar)
import { BAR_GAP, BAR_HEIGHT, BOTTOM_UI_HEIGHT } from './selectionLayout';

interface CardSelectionActionsProps {
  card: Card;
  canvasScale: number;
  canvasPosition: Position;
  containerWidth: number;
  containerHeight: number;
}


// iOS-artige Selektions-UI: pinkes Lösch-X oben rechts + Aktionsleiste unter der Karte.
// Optik und Aufbau der Leiste entsprechen der Elementleiste im Buch-Modus.
export function CardSelectionActions({
  card,
  canvasScale,
  canvasPosition,
  containerWidth,
  containerHeight,
}: CardSelectionActionsProps) {
  const t = useT();
  const { deleteCard, duplicateCard, setSelectedCard } = useCardsStore();
  const { openModal, showToast, isTeacherMode } = useUIStore();
  // Darstellungsmodus des Whiteboards (freie Maße statt quadratischer Karten)
  const freeLayout = useProjectStore((state) =>
    state.projects.find((p) => p.id === card.projectId)?.cardLayout === 'free'
  );

  // Aufgabenkarten sind im Kind-Modus geschützt (wie iOS): nur Vorlesen erlaubt
  const isTaskProtected = card.type === 'task' && !isTeacherMode;

  const [isVisible, setIsVisible] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(ttsService.isSpeaking());

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Vorlese-Status verfolgen
  useEffect(() => {
    return ttsService.subscribe(setIsSpeaking);
  }, []);

  // Calculate card dimensions
  const cardSize = cardDimensions(card, { freeLayout, compact: card.isCompact === true });

  // Calculate screen position of card
  const cardScreenX = card.position.x * canvasScale + canvasPosition.x;
  const cardScreenY = card.position.y * canvasScale + canvasPosition.y;
  const cardScreenWidth = cardSize.width * canvasScale;
  const cardScreenHeight = cardSize.height * canvasScale;
  const cardCenterX = cardScreenX + cardScreenWidth / 2;

  // Unten bleibt die Werkzeugleiste frei – dort liegen ihre Menüs
  const bottomLimit = containerHeight - BOTTOM_UI_HEIGHT;

  // Lösch-X sitzt auf der oberen rechten Ecke (44px Touch-Target)
  const deletePosition = {
    x: Math.max(8, Math.min(cardScreenX + cardScreenWidth - 22, containerWidth - 52)),
    y: Math.max(8, Math.min(cardScreenY - 22, bottomLimit - 44)),
  };

  // Aktionsleiste mittig unter der Karte; ist unten kein Platz, rückt sie darüber
  // (im Buch-Modus genau umgekehrt, weil dort das Lösch-X in der Leiste sitzt).
  const fitsBelow = cardScreenY + cardScreenHeight + BAR_GAP + BAR_HEIGHT <= bottomLimit;
  const barY = fitsBelow
    ? cardScreenY + cardScreenHeight + BAR_GAP
    // Oberhalb bleibt Platz für das Lösch-X, das über der Kartenkante sitzt
    : Math.max(8, cardScreenY - 22 - BAR_GAP - BAR_HEIGHT);

  // Breite messen, damit die Leiste am Bildschirmrand nicht abgeschnitten wird
  const [barWidth, setBarWidth] = useState(0);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    if (el) setBarWidth(el.offsetWidth);
  }, []);
  const halfBar = barWidth / 2 || 120;
  const barX = Math.min(Math.max(cardCenterX, halfBar + 8), Math.max(halfBar + 8, containerWidth - halfBar - 8));

  const handleDelete = useCallback(async () => {
    setSelectedCard(null);
    await deleteCard(card.id);
    showToast(t('Karte gelöscht'));
  }, [card.id, deleteCard, setSelectedCard, showToast, t]);

  // Handle edit - open the appropriate editor
  const handleEdit = useCallback(() => {
    switch (card.type) {
      case 'text':
        openModal('textEditor', card);
        break;
      case 'video':
        openModal('videoEditor', card);
        break;
      case 'audio':
        openModal('audioEditor', card);
        break;
      case 'drawing':
        openModal('drawingEditor', card);
        break;
      case 'photo':
        openModal('photoEditor', card);
        break;
      case 'task':
        openModal('taskEditor', card);
        break;
    }
  }, [card, openModal]);

  const handleOptions = useCallback(() => {
    openModal('cardOptions', card);
  }, [card, openModal]);

  // Duplizieren wie im Buch-Modus: Kopie leicht versetzt daneben, direkt ausgewählt
  const handleDuplicate = useCallback(async () => {
    const copy = await duplicateCard(card.id);
    if (copy) showToast(t('Karte dupliziert'));
  }, [card.id, duplicateCard, showToast, t]);

  // Vorlesen (Text-, Aufgaben- und Audiokarten mit Inhalt/Transkript)
  const speakableText =
    card.type === 'text'
      ? ((card as TextCard).content || '').trim()
      : card.type === 'task'
        ? ((card as TaskCard).taskText || '').trim()
        : card.type === 'audio'
          ? ((card as AudioCard).transcription || '').trim()
          : '';
  const canSpeak = speakableText.length > 0 && ttsService.isSupported();
  const hasActions = !isTaskProtected || canSpeak;

  const handleSpeak = useCallback(() => {
    if (isSpeaking) {
      ttsService.stop();
    } else {
      ttsService.speak(speakableText);
    }
  }, [isSpeaking, speakableText]);

  return (
    <div className={`pointer-events-none absolute inset-0 z-30 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Lösch-X oben rechts (iOS: primaryPink-Kreis) */}
      {!isTaskProtected && (
      <button
        className="pointer-events-auto absolute w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
        style={{ left: deletePosition.x, top: deletePosition.y }}
        onClick={handleDelete}
        aria-label={t('Karte löschen')}
        title={t('Löschen')}
      >
        <span
          className="w-[30px] h-[30px] rounded-full flex items-center justify-center shadow-md"
          style={{ backgroundColor: theme.primaryPink }}
        >
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      </button>
      )}

      {/* Aktionsleiste (Optik wie die Elementleiste im Buch-Modus).
          Bleibt weg, wenn keine Aktion möglich ist (geschützte Aufgabenkarte ohne Text). */}
      {hasActions && (
      <div
        ref={measureRef}
        className="pointer-events-auto absolute -translate-x-1/2 flex items-center gap-1 rounded-2xl border border-white/60 bg-white px-2 shadow-[0_6px_20px_rgba(30,58,95,0.18)]"
        style={{ left: barX, top: barY, height: BAR_HEIGHT }}
      >
        {!isTaskProtected && (
          <>
            <ActionBarButton
              color={theme.primaryBlue}
              label={t('Bearbeiten')}
              onClick={handleEdit}
              icon={
                <svg {...iconProps}>
                  <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
            />
            <ActionBarButton
              color={theme.primaryBlue}
              label={t('Duplizieren')}
              onClick={() => void handleDuplicate()}
              icon={
                <svg {...iconProps}>
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
              }
            />
            <ActionBarButton
              color={theme.primaryPurple}
              label={t('Optionen')}
              onClick={handleOptions}
              icon={
                <svg {...iconProps}>
                  <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h13" />
                  <circle cx="15" cy="6" r="2" />
                  <circle cx="9" cy="12" r="2" />
                  <circle cx="19" cy="18" r="2" />
                </svg>
              }
            />
          </>
        )}
        {canSpeak && (
          <ActionBarButton
            color={theme.primaryGreen}
            label={isSpeaking ? t('Stopp') : t('Vorlesen')}
            onClick={handleSpeak}
            icon={
              isSpeaking ? (
                <svg {...iconProps} fill="currentColor" stroke="none">
                  <rect x="7" y="7" width="10" height="10" rx="1.5" />
                </svg>
              ) : (
                <svg {...iconProps}>
                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
              )
            }
          />
        )}
      </div>
      )}
    </div>
  );
}

// Einheitliche Icon-Maße wie im Buch-Modus
const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

interface ActionBarButtonProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}

function ActionBarButton({ icon, label, color, onClick }: ActionBarButtonProps) {
  return (
    <button
      className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 transition-all duration-150 active:scale-90 hover:bg-surface-light"
      style={{ color }}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {icon}
      <span className="text-[11px] font-medium leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}
