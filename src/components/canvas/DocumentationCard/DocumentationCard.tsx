import { memo, useEffect, useMemo, useState } from 'react';
import { Group, Rect, Image as KonvaImage, Text, Circle, Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Context } from 'konva/lib/Context';
import type { Card, CardSize, PhotoCard, TextCard, VideoCard, AudioCard, DrawingCard, TaskCard, ConnectionAnchor, Position } from '../../../types';
import { CARD_SIZES } from '../../../types';
import { cardDimensions, COMPACT_SIZE, freeTextFontSize, resizeFreeSize, textEditRect } from '../../../utils/cardGeometry';
import { findConnectionTarget, type ConnectionCandidate } from '../../../utils/connectionTargets';
import { focusInlineEditField } from '../inlineEditFocus';
import { useCardsStore, useUIStore, useCanvasStore, useZonesStore, useProjectStore, useConnectionsStore, useHistoryStore, useDragStore, useDrawingStore, useSettingsStore } from '../../../stores';
import { GRID_SIZE } from '../../../stores/useCanvasStore';
import { logCanvasEvent } from '../../../services/canvasEvents';
import { theme, FONT_FAMILY } from '../../../theme';
import { useT } from '../../../i18n';

// Calculate aspect-fit dimensions for an image within a container
function calculateAspectFit(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number
): { width: number; height: number; x: number; y: number } {
  const imageRatio = imageWidth / imageHeight;
  const containerRatio = containerWidth / containerHeight;

  let width: number;
  let height: number;

  if (imageRatio > containerRatio) {
    // Image is wider - fit to width
    width = containerWidth;
    height = containerWidth / imageRatio;
  } else {
    // Image is taller - fit to height
    height = containerHeight;
    width = containerHeight * imageRatio;
  }

  // Center the image in the container
  const x = (containerWidth - width) / 2;
  const y = (containerHeight - height) / 2;

  return { width, height, x, y };
}

// Calculate crop so the image fills the container (wie iOS scaledToFill)
function calculateCoverCrop(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number; width: number; height: number } {
  const imageRatio = imageWidth / imageHeight;
  const containerRatio = containerWidth / containerHeight;

  if (imageRatio > containerRatio) {
    // Image is wider - crop left/right
    const cropWidth = imageHeight * containerRatio;
    return { x: (imageWidth - cropWidth) / 2, y: 0, width: cropWidth, height: imageHeight };
  }
  // Image is taller - crop top/bottom
  const cropHeight = imageWidth / containerRatio;
  return { x: 0, y: (imageHeight - cropHeight) / 2, width: imageWidth, height: cropHeight };
}

interface DocumentationCardProps {
  card: Card;
}

// Stack offset for visual stacking
const STACK_OFFSET = 8;

// Reihenfolge der Kartengrößen für den Ziehgriff (klein → groß)
const SIZE_STEPS: CardSize[] = ['small', 'medium', 'large'];

// Reihenfolge und Lage der Verbindungsanker (Mitte der jeweiligen Kante)
const ANCHOR_LIST: ConnectionAnchor[] = ['top', 'right', 'bottom', 'left'];

function anchorOffset(anchor: ConnectionAnchor, width: number, height: number): { x: number; y: number } {
  switch (anchor) {
    case 'top':
      return { x: width / 2, y: 0 };
    case 'right':
      return { x: width, y: height / 2 };
    case 'bottom':
      return { x: width / 2, y: height };
    case 'left':
      return { x: 0, y: height / 2 };
  }
}

// Unterhalb dieser Bildschirmdistanz gilt ein Ziehen noch als Tippen
const TAP_TOLERANCE = 8;

/**
 * Play-Dreieck als gezeichnete Form. Das Textzeichen „▶" (U+25B6) wird von
 * macOS und iOS über die Emoji-Schrift dargestellt – es erschiene farbig
 * mitten auf dem weißen Play-Knopf.
 */
function playTrianglePoints(centerX: number, centerY: number, size: number): number[] {
  const halfHeight = size / 2;
  const width = size * 0.85;
  // Optischer Ausgleich: ein Dreieck wirkt mittig, wenn es leicht rechts sitzt
  const left = centerX - width / 2 + size * 0.08;
  return [left, centerY - halfHeight, left + width, centerY, left, centerY + halfHeight];
}

// Eckenradius wie iOS-Karten
const CARD_RADIUS = 16;
const COMPACT_RADIUS = 12;

// Schriftgröße für Textkarten je Kartengröße (iOS: 13/15/17)
const TEXT_FONT_SIZES: Record<string, number> = {
  small: 13,
  medium: 15,
  large: 17,
};

// Nächstliegende Kartengröße zu einer gezogenen Kantenlänge
function nearestCardSize(edge: number): CardSize {
  return SIZE_STEPS.reduce((best, size) =>
    Math.abs(CARD_SIZES[size].width - edge) < Math.abs(CARD_SIZES[best].width - edge) ? size : best
  );
}

// Format duration in mm:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function DocumentationCardComponent({ card }: DocumentationCardProps) {
  const t = useT();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [annotationImage, setAnnotationImage] = useState<HTMLImageElement | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);

  // Feldweise Selektoren – Aktionen sind stabile Referenzen
  const isSelected = useCardsStore((state) => state.selectedCardId === card.id);
  const isMultiSelected = useCardsStore((state) => state.selectedCardIds.includes(card.id));
  const isMultiSelectMode = useCardsStore((state) => state.isMultiSelectMode);
  const setSelectedCard = useCardsStore((state) => state.setSelectedCard);
  const toggleCardSelection = useCardsStore((state) => state.toggleCardSelection);
  const bringToFront = useCardsStore((state) => state.bringToFront);
  const changeSize = useCardsStore((state) => state.changeSize);
  const updateCard = useCardsStore((state) => state.updateCard);
  const updatePosition = useCardsStore((state) => state.updatePosition);
  const checkAndCreateStack = useCardsStore((state) => state.checkAndCreateStack);
  const startInlineEdit = useCardsStore((state) => state.startInlineEdit);
  const addCardToGroup = useCardsStore((state) => state.addCardToGroup);
  const removeCardFromGroup = useCardsStore((state) => state.removeCardFromGroup);
  const toggleChecklistItem = useCardsStore((state) => state.toggleChecklistItem);
  const groups = useCardsStore((state) => state.groups);

  const setDraggingCard = useDragStore((state) => state.setDraggingCard);
  const updateDraggingPosition = useDragStore((state) => state.updateDraggingPosition);
  const clearDraggingCard = useDragStore((state) => state.clearDraggingCard);

  const openModal = useUIStore((state) => state.openModal);
  const globalCompactView = useUIStore((state) => state.globalCompactView);
  const startMediaPlayback = useUIStore((state) => state.startMediaPlayback);
  const isTeacherMode = useUIStore((state) => state.isTeacherMode);
  // Für Kinder aufgedeckte Tipps (wie iOS revealedHintCount, nicht persistiert)
  const [revealedHintCount, setRevealedHintCount] = useState(0);
  const scale = useCanvasStore((state) => state.scale);
  const canvasPosition = useCanvasStore((state) => state.position);
  const snapToGrid = useCanvasStore((state) => state.snapToGrid);
  const getZonesForProject = useZonesStore((state) => state.getZonesForProject);
  const minimalZoneDisplay = useZonesStore((state) => state.minimalZoneDisplay);
  const isCreatingZone = useZonesStore((state) => state.isCreatingZone);
  const isDrawingMode = useDrawingStore((state) => state.isDrawingMode);
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const cardLayout = useProjectStore((state) =>
    state.projects.find((p) => p.id === card.projectId)?.cardLayout
  );
  const pendingConnection = useConnectionsStore((state) => state.pendingConnection);
  const startConnection = useConnectionsStore((state) => state.startConnection);
  const completeConnection = useConnectionsStore((state) => state.completeConnection);
  const cancelConnection = useConnectionsStore((state) => state.cancelConnection);
  const updateConnectionDrag = useConnectionsStore((state) => state.updateConnectionDrag);
  // Nur der Anker dieser Karte, an dem gerade angedockt würde – ein schmaler
  // Selektor, damit nicht jede Karte bei jeder Zeigerbewegung neu rendert.
  const hoveredAnchor = useConnectionsStore((state) =>
    state.hoverTarget?.cardId === card.id ? state.hoverTarget.anchor : null
  );
  // Verbindungen gibt es ab Funktionsumfang „Standard" (wie bisher die Toolbar)
  const connectionsEnabled = useSettingsStore((state) => state.complexityLevel >= 2);

  const cardGroups = useMemo(
    () => groups.filter((g) => g.cardIds.includes(card.id)),
    [groups, card.id]
  );
  const isInGroup = cardGroups.length > 0;

  // Aufgabenkarten sind im Kind-Modus geschützt (wie iOS: kein Verschieben/Bearbeiten)
  const isTaskProtected = card.type === 'task' && !isTeacherMode;
  // Im Zeichen-/Bereichsmodus darf die Karte nicht mitgezogen werden
  const isDraggable = !isTaskProtected && !isDrawingMode && !isCreatingZone;

  // Determine if this card should be compact
  const isCompact = card.isCompact ?? globalCompactView;

  // Use compact or full size – während des Ziehens am Griff zeigt die Vorschau die Zielgröße
  const [previewSize, setPreviewSize] = useState<CardSize | null>(null);
  const [previewRect, setPreviewRect] = useState<{ width: number; height: number } | null>(null);
  const effectiveSize = previewSize ?? card.size;
  const isFreeLayout = cardLayout === 'free' && !isCompact;
  const { width, height } = previewRect ?? (
    isFreeLayout
      ? cardDimensions(card, { freeLayout: true, compact: false })
      : isCompact
        ? COMPACT_SIZE
        : { width: CARD_SIZES[effectiveSize].width, height: CARD_SIZES[effectiveSize].height }
  );

  // Im freien Modus liegen Foto, Video, Zeichnung und Text ohne Kartenhülle auf
  // der Fläche. Audio braucht eine sichtbare Fläche, Aufgabenkarten ihren Kasten.
  const isBareContent = isFreeLayout && card.type !== 'task' && card.type !== 'audio';

  const frameColor = card.frameColor || '#FFFFFF';
  const isWhiteFrame = frameColor.toUpperCase() === '#FFFFFF';
  const radius = isCompact ? COMPACT_RADIUS : isBareContent ? 0 : CARD_RADIUS;

  // Rahmen wie iOS cardStyle: Auswahl = Blau 3px, Farbrahmen = 3px, Weiß = Haarlinie
  const borderColor = isSelected
    ? theme.primaryBlue
    : isMultiSelected
      ? '#22C55E'
      : isWhiteFrame
        ? 'rgba(0,0,0,0.08)'
        : frameColor;
  const borderWidth = isSelected || isMultiSelected ? 3 : isWhiteFrame ? 1 : 3;

  // Griff nur bei Einzelauswahl und normaler (nicht kompakter) Darstellung
  const showResizeHandle =
    isSelected && !isMultiSelectMode && !isCompact && !isTaskProtected && !isDrawingMode && !isCreatingZone && !pendingConnection;

  // Diese Karte ist gerade das Andockziel eines gezogenen Pfeils
  const isDockTarget = hoveredAnchor !== null && pendingConnection?.sourceCardId !== card.id;
  // Anker zeigen: an der ausgewählten Karte (zum Losziehen), an der Quelle einer
  // offenen Verbindung und an der Karte, der man sich gerade nähert.
  const showConnectionAnchors =
    connectionsEnabled &&
    !isMultiSelectMode &&
    !isDrawingMode &&
    !isCreatingZone &&
    !isTaskProtected &&
    (isDockTarget || pendingConnection?.sourceCardId === card.id || (isSelected && !pendingConnection));

  // Calculate stack offset position
  const stackOffset = card.stackIndex ? card.stackIndex * STACK_OFFSET : 0;
  const displayPosition = {
    x: card.position.x + stackOffset,
    y: card.position.y + stackOffset,
  };

  // Load image for photo, video (thumbnails), and drawing cards
  // Nur von den Bilddaten abhängig – sonst würde jede Kartenänderung neu dekodieren
  const photoImageSource = card.type === 'photo' ? (card as PhotoCard).thumbnailData || (card as PhotoCard).imageData : undefined;
  const annotationSource = card.type === 'photo' ? (card as PhotoCard).annotationData : undefined;
  const videoThumbnail = card.type === 'video' ? (card as VideoCard).thumbnailData : undefined;
  const drawingSource = card.type === 'drawing' ? (card as DrawingCard).imageData : undefined;
  const imageSource = photoImageSource ?? videoThumbnail ?? drawingSource;

  // Bild zurücksetzen, wenn die Quelle wegfällt (state-adjust during render statt setState im Effekt)
  const [prevImageSource, setPrevImageSource] = useState(imageSource);
  if (imageSource !== prevImageSource) {
    setPrevImageSource(imageSource);
    if (!imageSource) {
      setImage(null);
      setImageDimensions(null);
    }
  }

  const [prevAnnotationSource, setPrevAnnotationSource] = useState(annotationSource);
  if (annotationSource !== prevAnnotationSource) {
    setPrevAnnotationSource(annotationSource);
    if (!annotationSource) {
      setAnnotationImage(null);
    }
  }

  useEffect(() => {
    if (!imageSource) return;
    let cancelled = false;
    const img = new window.Image();
    img.src = imageSource;
    img.onload = () => {
      if (cancelled) return;
      setImage(img);
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [imageSource]);

  // Annotation-Overlay (transparentes PNG in Foto-Auflösung)
  useEffect(() => {
    if (!annotationSource) return;
    let cancelled = false;
    const overlay = new window.Image();
    overlay.src = annotationSource;
    overlay.onload = () => {
      if (!cancelled) setAnnotationImage(overlay);
    };
    return () => {
      cancelled = true;
      overlay.onload = null;
    };
  }, [annotationSource]);

  // Handle drag start - bring to front and start tracking position
  const handleDragStart = (e: KonvaEventObject<DragEvent>) => {
    setIsDraggingCard(true);
    bringToFront(card.id);
    setSelectedCard(card.id);
    // Start tracking dragging position for live connection updates
    const node = e.target;
    setDraggingCard(card.id, {
      x: node.x() - stackOffset,
      y: node.y() - stackOffset,
    });
  };

  // Handle drag move - update dragging position for live connection updates
  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target;
    updateDraggingPosition({
      x: node.x() - stackOffset,
      y: node.y() - stackOffset,
    });
  };

  // Handle drag end - update position and check for stacking/zone membership
  const handleDragEnd = async (e: KonvaEventObject<DragEvent>) => {
    setIsDraggingCard(false);
    clearDraggingCard(); // Clear dragging state
    const node = e.target;
    let newPosition = {
      x: node.x() - stackOffset,
      y: node.y() - stackOffset,
    };

    // Am Raster ausrichten (Snap-to-Grid wie iOS, 40px)
    if (snapToGrid) {
      newPosition = {
        x: Math.round(newPosition.x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(newPosition.y / GRID_SIZE) * GRID_SIZE,
      };
      node.position({
        x: newPosition.x + stackOffset,
        y: newPosition.y + stackOffset,
      });
    }

    // Always move cards individually (not as a group)
    const from = { ...card.position };
    await updatePosition(card.id, newPosition);
    // Beim Stapeln rückt die Karte auf die Stapelposition – diese zählt für Undo/Lernspur.
    // (Ältere Fassung liefert nichts zurück; dann bleibt die Ablageposition gültig.)
    const stackPosition = (await checkAndCreateStack(card.id, newPosition)) as Position | null | undefined;
    const finalPosition = stackPosition ?? newPosition;

    // Verschieben für Undo und Lernspur aufzeichnen
    if (Math.abs(from.x - finalPosition.x) > 0.5 || Math.abs(from.y - finalPosition.y) > 0.5) {
      useHistoryStore.getState().record({
        type: 'moveCard',
        cardId: card.id,
        from,
        to: finalPosition,
      });
      logCanvasEvent(card.projectId, 'moveCard', card.id, from, finalPosition);
    }

    // Check if card was dropped into a zone and add to its group
    if (currentProjectId) {
      const zones = getZonesForProject(currentProjectId);
      const cardCenterX = finalPosition.x + width / 2;
      const cardCenterY = finalPosition.y + height / 2;

      // Find zones the card is in
      const containingZones = zones.filter(
        (zone) =>
          zone.groupId &&
          cardCenterX >= zone.position.x &&
          cardCenterX <= zone.position.x + zone.width &&
          cardCenterY >= zone.position.y &&
          cardCenterY <= zone.position.y + zone.height
      );

      // Find zones the card is NOT in anymore
      const currentGroupIds = cardGroups.map((g) => g.id);
      const zonesWithGroups = zones.filter((z) => z.groupId);

      // Remove card from groups whose zones it's no longer in
      for (const zone of zonesWithGroups) {
        if (zone.groupId && currentGroupIds.includes(zone.groupId)) {
          const stillInZone = containingZones.some((z) => z.groupId === zone.groupId);
          if (!stillInZone) {
            await removeCardFromGroup(zone.groupId, card.id);
          }
        }
      }

      // Add card to groups for zones it's now in
      for (const zone of containingZones) {
        if (zone.groupId && !currentGroupIds.includes(zone.groupId)) {
          await addCardToGroup(zone.groupId, card.id);
        }
      }
    }
  };

  // Handle tap/click - select card or toggle selection in multi-select mode
  const handleClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    // Offene Verbindung? Dann dockt der Tipp hier an, statt die Karte auszuwählen
    if (completeConnectionHere(e)) return;
    if (isMultiSelectMode) {
      toggleCardSelection(card.id);
    } else {
      setSelectedCard(card.id);
    }
  };

  // Handle play button click - start inline media playback
  const handlePlayClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;

    if (card.type !== 'video' && card.type !== 'audio') return;

    // Inhalt füllt jetzt die ganze Karte
    const cardWidth = width;
    const cardHeight = height;

    const screenX = displayPosition.x * scale + canvasPosition.x;
    const screenY = displayPosition.y * scale + canvasPosition.y;
    const screenWidth = cardWidth * scale;
    const screenHeight = cardHeight * scale;

    startMediaPlayback(
      card as VideoCard | AudioCard,
      { x: screenX, y: screenY },
      { width: screenWidth, height: screenHeight }
    );
  };

  // Handle double tap/click - open editor
  const handleDblClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    switch (card.type) {
      case 'photo':
        openModal('photoEditor', card);
        break;
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
      case 'task':
        if (isTeacherMode) {
          openModal('taskEditor', card);
        }
        break;
      default:
        openModal('cardOptions', card);
    }
  };

  // Card type icon (nur für Platzhalter)
  const getTypeIcon = () => {
    switch (card.type) {
      case 'photo':
        return '📷';
      case 'text':
        return '📝';
      case 'video':
        return '🎬';
      case 'audio':
        return '🎵';
      case 'drawing':
        return '🎨';
      case 'task':
        return '📋';
      default:
        return '📄';
    }
  };

  // --- Größengriff (wie die Eckgriffe im Buch-Modus) ------------------------
  // Quadratischer Modus: gezogen wird stufenlos, eingerastet auf Klein/Mittel/Groß.
  // Freier Modus: stufenlos, Bilder behalten ihr Seitenverhältnis.
  const currentFreeSize = card.freeSize ?? {
    width: CARD_SIZES[card.size].width,
    height: CARD_SIZES[card.size].height,
  };

  // Beim Raster-Ausrichten rastet nur die gezogene Kante ein; die Höhe folgt
  // danach dem Seitenverhältnis bzw. dem Textinhalt.
  const snapEdge = (value: number) =>
    snapToGrid ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;

  const handleResizeStart = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    setSelectedCard(card.id);
  };

  const handleResizeMove = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const node = e.target;
    if (isFreeLayout) {
      setPreviewRect(resizeFreeSize(card, node.x(), node.y(), currentFreeSize));
      return;
    }
    const next = nearestCardSize(Math.max(node.x(), node.y()));
    if (next !== effectiveSize) setPreviewSize(next);
  };

  const handleResizeEnd = async (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const node = e.target;

    if (isFreeLayout) {
      const next = resizeFreeSize(card, snapEdge(node.x()), snapEdge(node.y()), currentFreeSize);
      setPreviewRect(null);
      node.position({ x: next.width, y: next.height });
      if (next.width !== currentFreeSize.width || next.height !== currentFreeSize.height) {
        await updateCard(card.id, { freeSize: next });
      }
      return;
    }

    const next = nearestCardSize(Math.max(node.x(), node.y()));
    setPreviewSize(null);
    node.position({ x: CARD_SIZES[next].width, y: CARD_SIZES[next].height });
    if (next !== card.size) await changeSize(card.id, next);
  };

  // Kompakte Textkarte: leer geht es sofort los, sonst selektiert der erste
  // Tipp und der zweite startet die Bearbeitung (wie in der vollen Darstellung)
  const handleCompactTextEdit = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    if (completeConnectionHere(e)) return;
    const content = card.type === 'text' ? (card as TextCard).content || '' : '';
    if (!isSelected && content.trim().length > 0) {
      handleClick(e);
      return;
    }
    setSelectedCard(card.id);
    // Fokus noch in der Geste – sonst bleibt die Tastatur auf iOS unten
    focusInlineEditField('content', content);
    const rect = textEditRect(card, displayPosition, { freeLayout: isFreeLayout, compact: true });
    startInlineEdit(card.id, 'content', rect.position, rect.size);
  };

  // --- Verbinden ----------------------------------------------------------
  // Anker sind dezent an der ausgewählten Karte sichtbar. Von dort zieht man
  // den Pfeil; die Zielkarte zeigt ihre Anker, sobald man ihr nahe kommt.
  // Ein Tipp auf den Anker geht auch: dann bleibt die Verbindung „offen", bis
  // man die Zielkarte antippt.

  // Kandidaten fürs Andocken: alle anderen Karten des Projekts mit ihren Maßen
  const connectionCandidates = (): ConnectionCandidate[] => {
    const state = useCardsStore.getState();
    const compactDefault = useUIStore.getState().globalCompactView;
    return state.cards
      .filter((c) => c.projectId === card.projectId && !c.isDeleted)
      .map((c) => ({
        id: c.id,
        position: c.position,
        size: cardDimensions(c, {
          freeLayout: cardLayout === 'free',
          compact: c.isCompact ?? compactDefault,
        }),
      }));
  };

  // Zeigerposition in Weltkoordinaten (der Anker-Kreis liegt im Karten-Group)
  const pointerWorldPosition = (e: KonvaEventObject<DragEvent>): Position | null => {
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - canvasPosition.x) / scale,
      y: (pointer.y - canvasPosition.y) / scale,
    };
  };

  const handleAnchorDragStart = (anchor: ConnectionAnchor, e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    startConnection(card.id, anchor);
  };

  const handleAnchorDragMove = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const point = pointerWorldPosition(e);
    if (!point) return;
    updateConnectionDrag(point, findConnectionTarget(point, connectionCandidates(), card.id));
  };

  const handleAnchorDragEnd = (anchor: ConnectionAnchor, e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const node = e.target;
    const point = pointerWorldPosition(e);
    // Griff zurück an seinen Platz – gezogen wird der Pfeil, nicht der Punkt
    node.position(anchorOffset(anchor, width, height));

    const target = point ? findConnectionTarget(point, connectionCandidates(), card.id) : null;
    if (target && currentProjectId) {
      completeConnection(target.cardId, target.anchor, currentProjectId);
      return;
    }
    // Nur getippt (kaum bewegt): Verbindung bleibt offen für den zweiten Tipp
    const moved = point ? distanceFromAnchor(point, anchor) > TAP_TOLERANCE / scale : false;
    if (moved) cancelConnection();
    else updateConnectionDrag(null, null);
  };

  // Weltabstand des Zeigers vom eigenen Anker (erkennt „nur getippt")
  const distanceFromAnchor = (point: Position, anchor: ConnectionAnchor): number => {
    const offset = anchorOffset(anchor, width, height);
    return Math.hypot(
      point.x - (displayPosition.x + offset.x),
      point.y - (displayPosition.y + offset.y)
    );
  };

  // Ein Tipp auf diese Karte schließt eine offene Verbindung an der nächsten Kante
  const completeConnectionHere = (e: KonvaEventObject<MouseEvent | TouchEvent>): boolean => {
    if (!pendingConnection || pendingConnection.sourceCardId === card.id) return false;
    if (!currentProjectId) return false;
    e.cancelBubble = true;
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    const point = pointer
      ? { x: (pointer.x - canvasPosition.x) / scale, y: (pointer.y - canvasPosition.y) / scale }
      : null;
    const anchor = point
      ? findConnectionTarget(point, connectionCandidates(), pendingConnection.sourceCardId)?.anchor ?? 'left'
      : 'left';
    completeConnection(card.id, anchor, currentProjectId);
    return true;
  };

  // Render connection anchors
  const renderConnectionAnchors = (cardWidth: number, cardHeight: number) => {
    if (!showConnectionAnchors) return null;

    const isSource = pendingConnection?.sourceCardId === card.id;
    // Am Ziel nur dezent, an der eigenen Karte greifbar
    const baseRadius = isDockTarget ? 7 : 6;

    return ANCHOR_LIST.map((anchor) => {
      const { x, y } = anchorOffset(anchor, cardWidth, cardHeight);
      const isActive =
        (isSource && pendingConnection?.sourceAnchor === anchor) || hoveredAnchor === anchor;

      return (
        <Circle
          key={anchor}
          x={x}
          y={y}
          radius={(isActive ? baseRadius + 3 : baseRadius) / Math.max(scale, 0.6)}
          fill={isActive ? theme.primaryBlue : '#ffffff'}
          stroke={theme.primaryBlue}
          strokeWidth={2 / Math.max(scale, 0.6)}
          opacity={isDockTarget && !isActive ? 0.75 : 1}
          hitStrokeWidth={28 / Math.max(scale, 0.6)}
          draggable={!isDockTarget}
          onDragStart={(e) => handleAnchorDragStart(anchor, e)}
          onDragMove={handleAnchorDragMove}
          onDragEnd={(e) => handleAnchorDragEnd(anchor, e)}
          onClick={(e) => { if (!completeConnectionHere(e)) { e.cancelBubble = true; startConnection(card.id, anchor); } }}
          onTap={(e) => { if (!completeConnectionHere(e)) { e.cancelBubble = true; startConnection(card.id, anchor); } }}
          onMouseEnter={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'crosshair';
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'default';
          }}
        />
      );
    });
  };

  // Inhalt auf abgerundete Kartenform beschneiden
  const clipRoundedRect = (ctx: Context) => {
    const r = radius;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(width, 0, width, height, r);
    ctx.arcTo(width, height, 0, height, r);
    ctx.arcTo(0, height, 0, 0, r);
    ctx.arcTo(0, 0, width, 0, r);
    ctx.closePath();
  };

  // Bezeichnungs-Pill oben links (wie iOS-Label-Capsule)
  const renderLabelPill = () => {
    if (isCompact || isBareContent) return null;

    const labelText = card.label || '';
    const showPill = labelText.length > 0 || isSelected;
    if (!showPill) return null;

    const pillText = labelText || t('Bezeichnung…');
    const pillWidth = Math.min(Math.max(pillText.length * 6 + 20, 64), width - 16);
    const pillHeight = 18;
    const pillY = -pillHeight / 2;

    const handleLabelEdit = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      e.cancelBubble = true;
      // Fokus noch in der Geste – sonst bleibt die Tastatur auf iOS unten
      focusInlineEditField('label', labelText, 'all');
      startInlineEdit(
        card.id,
        'label',
        { x: displayPosition.x + 8, y: displayPosition.y + pillY },
        { width: Math.max(pillWidth, 140), height: 24 }
      );
    };

    return (
      <Group x={8} y={pillY} onClick={handleLabelEdit} onTap={handleLabelEdit}>
        <Rect
          width={pillWidth}
          height={pillHeight}
          fill="rgba(255,255,255,0.9)"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={1}
          cornerRadius={pillHeight / 2}
        />
        <Text
          x={0}
          y={4}
          width={pillWidth}
          text={pillText}
          fontSize={10}
          fontStyle="500"
          fill={labelText ? theme.textSecondary : 'rgba(107,124,147,0.6)'}
          fontFamily={FONT_FAMILY}
          align="center"
          ellipsis
          wrap="none"
          listening={false}
        />
      </Group>
    );
  };

  // Render compact card
  if (isCompact) {
    return (
      <Group
        x={displayPosition.x}
        y={displayPosition.y}
        draggable={isDraggable}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        onTap={handleClick}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
      >
        {/* Group border rings (outer to inner) - hidden in minimal zone display */}
        {cardGroups.length > 0 && !minimalZoneDisplay && cardGroups.map((g, index) => (
          <Rect
            key={g.id}
            x={-3 * (cardGroups.length - index)}
            y={-3 * (cardGroups.length - index)}
            width={width + 6 * (cardGroups.length - index)}
            height={height + 6 * (cardGroups.length - index)}
            fill="transparent"
            cornerRadius={COMPACT_RADIUS + 3 * (cardGroups.length - index)}
            stroke={g.color}
            strokeWidth={3}
          />
        ))}

        {/* Card background (weiß, Schatten nur beim Ziehen) */}
        <Rect
          width={width}
          height={height}
          fill="#FFFFFF"
          cornerRadius={COMPACT_RADIUS}
          shadowColor="rgba(0,0,0,0.2)"
          shadowBlur={20}
          shadowOffsetY={10}
          shadowEnabled={isDraggingCard}
        />

        {/* Compact content - show thumbnail, text preview, or icon */}
        <Group clipFunc={clipRoundedRect}>
          {(card.type === 'photo' || card.type === 'video') && image && imageDimensions ? (
            <KonvaImage
              image={image}
              x={0}
              y={0}
              width={width}
              height={height}
              crop={calculateCoverCrop(imageDimensions.width, imageDimensions.height, width, height)}
            />
          ) : card.type === 'text' ? (
            <>
              <Rect
                x={0}
                y={0}
                width={width}
                height={4}
                fill="#AEC6CF"
              />
              <Text
                x={8}
                y={10}
                width={width - 16}
                height={height - 18}
                text={(card as TextCard).content || '…'}
                fontSize={10}
                fill={theme.textPrimary}
                fontFamily={FONT_FAMILY}
                wrap="word"
                ellipsis
                onClick={handleCompactTextEdit}
                onTap={handleCompactTextEdit}
              />
            </>
          ) : card.type === 'drawing' && image && imageDimensions ? (() => {
            const fit = calculateAspectFit(
              imageDimensions.width,
              imageDimensions.height,
              width - 12,
              height - 12
            );
            return (
              <KonvaImage
                image={image}
                x={6 + fit.x}
                y={6 + fit.y}
                width={fit.width}
                height={fit.height}
              />
            );
          })() : card.type === 'task' ? (
            <>
              <Rect x={0} y={0} width={width} height={4} fill="#FF6B6B" />
              <Text
                x={8}
                y={10}
                width={width - 16}
                height={height - 18}
                text={(card as TaskCard).taskText || t('Aufgabe…')}
                fontSize={10}
                fill={theme.textPrimary}
                fontFamily={FONT_FAMILY}
                wrap="word"
                ellipsis
                listening={false}
              />
            </>
          ) : (
            <Text
              x={0}
              y={height / 2 - 16}
              width={width}
              text={getTypeIcon()}
              fontSize={32}
              align="center"
              listening={false}
            />
          )}
        </Group>

        {/* Rahmen über dem Inhalt */}
        <Rect
          width={width}
          height={height}
          fill="transparent"
          cornerRadius={COMPACT_RADIUS}
          stroke={borderColor}
          strokeWidth={borderWidth}
          listening={false}
        />

        {/* Multi-select checkbox */}
        {isMultiSelectMode && (
          <>
            <Circle
              x={width - 14}
              y={14}
              radius={10}
              fill={isMultiSelected ? '#22C55E' : '#FFFFFF'}
              stroke={isMultiSelected ? '#22C55E' : '#9CA3AF'}
              strokeWidth={2}
            />
            {isMultiSelected && (
              <Text
                x={width - 20}
                y={8}
                width={12}
                text="✓"
                fontSize={11}
                fill="#ffffff"
                fontStyle="bold"
                align="center"
                listening={false}
              />
            )}
          </>
        )}

        {/* Connection anchors */}
        {renderConnectionAnchors(width, height)}
      </Group>
    );
  }

  // Render full content based on card type (Inhalt füllt die ganze Karte, wie iOS)
  const renderContent = () => {
    switch (card.type) {
      case 'photo': {
        if (image && imageDimensions) {
          return (
            <Group>
              <KonvaImage
                image={image}
                x={0}
                y={0}
                width={width}
                height={height}
                crop={calculateCoverCrop(imageDimensions.width, imageDimensions.height, width, height)}
              />
              {/* Foto-Annotation (gleiches Seitenverhältnis → gleicher Zuschnitt) */}
              {(card as PhotoCard).annotationData && annotationImage && (
                <KonvaImage
                  image={annotationImage}
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                  crop={calculateCoverCrop(annotationImage.naturalWidth, annotationImage.naturalHeight, width, height)}
                  listening={false}
                />
              )}
            </Group>
          );
        }
        return (
          <Group>
            <Rect x={0} y={0} width={width} height={height} fill="rgba(255,209,220,0.3)" />
            <Text
              x={0}
              y={height / 2 - 20}
              width={width}
              text="📷"
              fontSize={36}
              align="center"
              listening={false}
            />
          </Group>
        );
      }

      case 'text': {
        const textCard = card as TextCard;
        const textContent = textCard.content || '';
        const fontSize = TEXT_FONT_SIZES[effectiveSize] ?? 15;

        const handleContentEdit = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
          e.cancelBubble = true;
          // Offene Verbindung? Dann dockt der Tipp hier an, statt zu bearbeiten
          if (completeConnectionHere(e)) return;
          // Eine leere Textkarte hat nichts zu zeigen: Der erste Tipp öffnet
          // gleich die Eingabe. Karten mit Text werden erst ausgewählt (wie
          // iOS), damit man sie ohne Tastatur anfassen kann.
          if (!isSelected && textContent.trim().length > 0) {
            handleClick(e);
            return;
          }
          setSelectedCard(card.id);
          // Fokus noch in der Geste setzen, sonst erscheint auf iOS zwar das
          // Feld, aber keine Tastatur (siehe inlineEditFocus).
          focusInlineEditField('content', textContent);
          const rect = textEditRect(card, displayPosition, {
            freeLayout: isFreeLayout,
            compact: isCompact,
          });
          startInlineEdit(card.id, 'content', rect.position, rect.size);
        };

        if (isBareContent) {
          const bareFontSize = freeTextFontSize(width);
          return (
            <Group>
              {/* Klickfläche für Inline-Bearbeitung */}
              <Rect
                x={0}
                y={0}
                width={width}
                height={height}
                fill="transparent"
                onClick={handleContentEdit}
                onTap={handleContentEdit}
              />
              {/* Ohne feste Höhe: Konva bricht selbst um und schneidet nie ab,
                  auch wenn seine Umbruchstellen minimal von der Messung abweichen */}
              <Text
                x={0}
                y={0}
                width={width}
                text={textContent || t('Tippe zum Schreiben…')}
                fontSize={bareFontSize}
                lineHeight={1.3}
                fill={textContent ? theme.textPrimary : 'rgba(107,124,147,0.6)'}
                fontFamily={FONT_FAMILY}
                wrap="word"
                listening={false}
              />
            </Group>
          );
        }

        return (
          <Group>
            {/* Kopf-Akzentleiste (iOS: 4px Gradient) */}
            <Rect
              x={0}
              y={0}
              width={width}
              height={4}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: width, y: 0 }}
              fillLinearGradientColorStops={[0, '#AEC6CF', 1, 'rgba(174,198,207,0.5)']}
            />
            {/* Klickfläche für Inline-Bearbeitung */}
            <Rect
              x={0}
              y={4}
              width={width}
              height={height - 4}
              fill="transparent"
              onClick={handleContentEdit}
              onTap={handleContentEdit}
            />
            <Text
              x={12}
              y={16}
              width={width - 24}
              height={height - 28}
              text={textContent || t('Tippe zum Schreiben…')}
              fontSize={fontSize}
              lineHeight={1.3}
              fill={textContent ? theme.textPrimary : 'rgba(107,124,147,0.6)'}
              fontFamily={FONT_FAMILY}
              wrap="word"
              ellipsis
              listening={false}
            />
          </Group>
        );
      }

      case 'video': {
        const videoCard = card as VideoCard;
        const hasDuration = typeof videoCard.duration === 'number' && videoCard.duration > 0;

        return (
          <Group>
            {/* Video thumbnail or placeholder */}
            {image && imageDimensions ? (
              <KonvaImage
                image={image}
                x={0}
                y={0}
                width={width}
                height={height}
                crop={calculateCoverCrop(imageDimensions.width, imageDimensions.height, width, height)}
              />
            ) : (
              <Rect x={0} y={0} width={width} height={height} fill="#1F2937" />
            )}
            {/* Play-Badge (iOS: 44er Material-Kreis) */}
            <Circle
              x={width / 2}
              y={height / 2}
              radius={22}
              fill="rgba(255,255,255,0.85)"
              shadowColor="rgba(0,0,0,0.15)"
              shadowBlur={4}
              shadowOffsetY={2}
              onClick={handlePlayClick}
              onTap={handlePlayClick}
            />
            <Line
              points={playTrianglePoints(width / 2, height / 2, 18)}
              closed
              fill={theme.textPrimary}
              listening={false}
            />
            {/* Dauer-Badge unten rechts */}
            {hasDuration ? (
              <Group>
                <Rect
                  x={width - 54}
                  y={height - 28}
                  width={46}
                  height={20}
                  fill="rgba(0,0,0,0.6)"
                  cornerRadius={10}
                />
                <Text
                  x={width - 54}
                  y={height - 23}
                  width={46}
                  text={formatDuration(videoCard.duration!)}
                  fontSize={11}
                  fontStyle="500"
                  fill="#ffffff"
                  fontFamily={FONT_FAMILY}
                  align="center"
                />
              </Group>
            ) : null}
          </Group>
        );
      }

      case 'audio': {
        const audioCard = card as AudioCard;
        const hasDuration = typeof audioCard.duration === 'number' && audioCard.duration > 0;
        const transcription = (audioCard.transcription || '').trim();
        // Bei Transkript rückt der Player nach oben (wie iOS)
        const centerOffset = transcription ? -Math.round(height * 0.12) : 0;
        // Kleine Wellenform über dem Play-Button (weiß, wie iOS waveform-Icon)
        const barHeights = [14, 22, 30, 22, 14];
        const barWidth = 4;
        const barGap = 6;
        const barsTotalWidth = barHeights.length * barWidth + (barHeights.length - 1) * barGap;

        return (
          <Group>
            {/* Sanfter grüner Verlauf (iOS: #B5EAD7 → 60%) */}
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: width, y: height }}
              fillLinearGradientColorStops={[0, '#B5EAD7', 1, 'rgba(181,234,215,0.6)']}
            />
            {/* Wellenform */}
            {barHeights.map((barHeight, i) => (
              <Rect
                key={i}
                x={width / 2 - barsTotalWidth / 2 + i * (barWidth + barGap)}
                y={height / 2 + centerOffset - 44 - barHeight / 2}
                width={barWidth}
                height={barHeight}
                fill="rgba(255,255,255,0.9)"
                cornerRadius={2}
                listening={false}
              />
            ))}
            {/* Play-Button (weißer Kreis, grünes Dreieck) */}
            <Circle
              x={width / 2}
              y={height / 2 + centerOffset + 8}
              radius={22}
              fill="#FFFFFF"
              shadowColor="rgba(0,0,0,0.15)"
              shadowBlur={4}
              shadowOffsetY={2}
              onClick={handlePlayClick}
              onTap={handlePlayClick}
            />
            <Line
              points={playTrianglePoints(width / 2, height / 2 + centerOffset + 8, 18)}
              closed
              fill={theme.primaryGreen}
              listening={false}
            />
            {/* Dauer */}
            {hasDuration ? (
              <Text
                x={0}
                y={height / 2 + centerOffset + 42}
                width={width}
                text={formatDuration(audioCard.duration!)}
                fontSize={13}
                fontStyle="500"
                fill="#ffffff"
                fontFamily={FONT_FAMILY}
                align="center"
                listening={false}
              />
            ) : null}
            {/* Transkript (automatische Spracherkennung, wie iOS) */}
            {transcription ? (
              <Text
                x={12}
                y={height - Math.round(height * 0.28)}
                width={width - 24}
                height={Math.round(height * 0.28) - 10}
                text={transcription}
                fontSize={11}
                lineHeight={1.25}
                fill="rgba(0,0,0,0.7)"
                fontFamily={FONT_FAMILY}
                wrap="word"
                ellipsis
                listening={false}
              />
            ) : null}
          </Group>
        );
      }

      case 'drawing': {
        if (isBareContent && image) {
          // Die Karte hat bereits das Seitenverhältnis der Zeichnung
          return <KonvaImage image={image} x={0} y={0} width={width} height={height} />;
        }
        if (image && imageDimensions) {
          const fit = calculateAspectFit(
            imageDimensions.width,
            imageDimensions.height,
            width - 16,
            height - 16
          );
          return (
            <KonvaImage
              image={image}
              x={8 + fit.x}
              y={8 + fit.y}
              width={fit.width}
              height={fit.height}
            />
          );
        }
        return (
          <Group>
            <Rect x={0} y={0} width={width} height={height} fill="rgba(253,253,150,0.3)" />
            <Text
              x={0}
              y={height / 2 - 20}
              width={width}
              text="🎨"
              fontSize={36}
              align="center"
              listening={false}
            />
          </Group>
        );
      }

      case 'task': {
        const taskCard = card as TaskCard;
        const fontSize = TEXT_FONT_SIZES[effectiveSize] ?? 15;
        const hints = taskCard.hints;
        const checklist = taskCard.checklist;

        // Layout von oben: roter Kopfbalken (6px), Aufgabentext, Checkliste; Tipps unten
        const textTop = 16;
        const textHeight = checklist.length > 0 || hints.length > 0
          ? Math.round(height * 0.35)
          : height - textTop - 12;
        const hintReserve = hints.length > 0 ? 34 : 0;
        const checklistTop = textTop + textHeight + 4;
        const itemHeight = 22;
        const maxItems = Math.max(0, Math.floor((height - checklistTop - hintReserve - 8) / itemHeight));
        const visibleChecklist = checklist.slice(0, maxItems);

        // Im Lehrkraft-Modus alle Tipps zeigen, Kinder decken sie schrittweise auf
        const shownHints = isTeacherMode ? hints : hints.slice(0, revealedHintCount);
        const canRevealMore = !isTeacherMode && revealedHintCount < hints.length;
        const hintLineHeight = 15;
        const hintsBottom = height - 10;
        const pillHeight = 22;

        return (
          <Group>
            {/* Roter Kopfbalken (iOS: 6px Gradient) */}
            <Rect
              x={0}
              y={0}
              width={width}
              height={6}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: width, y: 0 }}
              fillLinearGradientColorStops={[0, '#FF6B6B', 1, 'rgba(255,107,107,0.7)']}
            />
            {/* Aufgabentext */}
            <Text
              x={12}
              y={textTop}
              width={width - 24}
              height={textHeight}
              text={taskCard.taskText || t('Aufgabe…')}
              fontSize={fontSize}
              lineHeight={1.3}
              fill={theme.textPrimary}
              fontFamily={FONT_FAMILY}
              wrap="word"
              ellipsis
              listening={false}
            />
            {/* Checkliste (immer interaktiv, auch im Kind-Modus) */}
            {visibleChecklist.map((item, index) => {
              const rowY = checklistTop + index * itemHeight;
              const handleToggle = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
                e.cancelBubble = true;
                toggleChecklistItem(card.id, item.id);
              };
              return (
                <Group key={item.id}>
                  <Rect
                    x={12}
                    y={rowY + 3}
                    width={14}
                    height={14}
                    cornerRadius={3}
                    fill={item.isChecked ? '#FF6B6B' : '#FFFFFF'}
                    stroke={item.isChecked ? '#FF6B6B' : theme.textSecondary}
                    strokeWidth={1.5}
                    listening={false}
                  />
                  {item.isChecked && (
                    <Text
                      x={13}
                      y={5.5 + rowY}
                      width={12}
                      text="✓"
                      fontSize={10}
                      fill="#ffffff"
                      fontStyle="bold"
                      align="center"
                      listening={false}
                    />
                  )}
                  <Text
                    x={32}
                    y={rowY + 4}
                    width={width - 44}
                    text={item.text}
                    fontSize={12}
                    fill={item.isChecked ? theme.textSecondary : theme.textPrimary}
                    fontFamily={FONT_FAMILY}
                    textDecoration={item.isChecked ? 'line-through' : undefined}
                    ellipsis
                    wrap="none"
                    listening={false}
                  />
                  {/* Klickfläche über der ganzen Zeile */}
                  <Rect
                    x={8}
                    y={rowY}
                    width={width - 16}
                    height={itemHeight}
                    fill="transparent"
                    onClick={handleToggle}
                    onTap={handleToggle}
                  />
                </Group>
              );
            })}
            {/* Aufgedeckte Tipps */}
            {shownHints.map((hint, index) => (
              <Text
                key={index}
                x={12}
                y={hintsBottom - pillHeight - (shownHints.length - index) * hintLineHeight}
                width={width - 24}
                text={`💡 ${hint}`}
                fontSize={10}
                fill="#B45309"
                fontFamily={FONT_FAMILY}
                ellipsis
                wrap="none"
                listening={false}
              />
            ))}
            {/* "Tipp N"-Button für Kinder */}
            {canRevealMore && (() => {
              const pillLabel = t('Tipp {n}', { n: revealedHintCount + 1 });
              const pillWidth = pillLabel.length * 7 + 24;
              const handleReveal = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
                e.cancelBubble = true;
                setRevealedHintCount((count) => Math.min(count + 1, hints.length));
              };
              return (
                <Group x={12} y={hintsBottom - pillHeight} onClick={handleReveal} onTap={handleReveal}>
                  <Rect
                    width={pillWidth}
                    height={pillHeight}
                    cornerRadius={pillHeight / 2}
                    fill="rgba(255,179,71,0.15)"
                  />
                  <Text
                    x={0}
                    y={5}
                    width={pillWidth}
                    text={`💡 ${pillLabel}`}
                    fontSize={11}
                    fontStyle="600"
                    fill="#C2700A"
                    fontFamily={FONT_FAMILY}
                    align="center"
                    listening={false}
                  />
                </Group>
              );
            })()}
          </Group>
        );
      }

      default: {
        return <Rect x={0} y={0} width={width} height={height} fill="#F3F4F6" />;
      }
    }
  };

  return (
    <Group
      x={displayPosition.x}
      y={displayPosition.y}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
    >
      {/* Group border rings (outer to inner) - hidden in minimal zone display */}
      {cardGroups.length > 0 && !minimalZoneDisplay && cardGroups.map((g, index) => (
        <Rect
          key={g.id}
          x={-4 * (cardGroups.length - index)}
          y={-4 * (cardGroups.length - index)}
          width={width + 8 * (cardGroups.length - index)}
          height={height + 8 * (cardGroups.length - index)}
          fill="transparent"
          cornerRadius={radius + 4 * (cardGroups.length - index)}
          stroke={g.color}
          strokeWidth={3}
        />
      ))}

      {/* Card background (weiß wie iOS, Schatten nur beim Ziehen) */}
      {!isBareContent && (
        <Rect
          width={width}
          height={height}
          fill="#FFFFFF"
          cornerRadius={radius}
          shadowColor="rgba(0,0,0,0.2)"
          shadowBlur={20}
          shadowOffsetY={10}
          shadowEnabled={isDraggingCard}
        />
      )}

      {/* Content (füllt die Karte, auf Kartenform beschnitten) */}
      <Group clipFunc={clipRoundedRect}>{renderContent()}</Group>

      {/* Rahmen über dem Inhalt (iOS cardStyle); randlose Inhalte zeigen ihn nur bei Auswahl */}
      {(!isBareContent || isSelected || isMultiSelected) && (
        <Rect
          width={width}
          height={height}
          fill="transparent"
          cornerRadius={radius}
          stroke={borderColor}
          strokeWidth={borderWidth}
          listening={false}
        />
      )}

      {/* Multi-select checkbox */}
      {isMultiSelectMode && (
        <>
          <Circle
            x={width - 18}
            y={18}
            radius={12}
            fill={isMultiSelected ? '#22C55E' : '#FFFFFF'}
            stroke={isMultiSelected ? '#22C55E' : '#9CA3AF'}
            strokeWidth={2}
          />
          {isMultiSelected && (
            <Text
              x={width - 25}
              y={11}
              width={14}
              text="✓"
              fontSize={13}
              fill="#ffffff"
              fontStyle="bold"
              align="center"
              listening={false}
            />
          )}
        </>
      )}

      {/* Group indicator - show number if in multiple groups */}
      {isInGroup && !isMultiSelectMode && (
        <Text
          x={width - 28}
          y={8}
          text={cardGroups.length > 1 ? `${cardGroups.length}👥` : '👥'}
          fontSize={cardGroups.length > 1 ? 12 : 16}
          listening={false}
        />
      )}

      {/* Bezeichnungs-Pill oben links */}
      {renderLabelPill()}

      {/* Connection anchors */}
      {renderConnectionAnchors(width, height)}

      {/* Größengriff unten rechts – Optik wie die Eckgriffe im Buch-Modus */}
      {showResizeHandle && (
        <Circle
          x={width}
          y={height}
          radius={14 / scale}
          fill="#FFFFFF"
          stroke={theme.primaryBlue}
          strokeWidth={2.5 / scale}
          shadowColor="rgba(30,58,95,0.25)"
          shadowBlur={3 / scale}
          shadowOffsetY={1 / scale}
          hitStrokeWidth={30 / scale}
          draggable
          onDragStart={handleResizeStart}
          onDragMove={handleResizeMove}
          onDragEnd={handleResizeEnd}
          onMouseEnter={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'nwse-resize';
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container();
            if (container) container.style.cursor = 'default';
          }}
        />
      )}
    </Group>
  );
}

// React.memo: Karten rendern nur bei eigener Änderung neu (wichtig beim Ziehen)
export const DocumentationCard = memo(DocumentationCardComponent);
