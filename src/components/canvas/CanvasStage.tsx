import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import { useCanvasStore, useCardsStore, useDrawingStore, useZonesStore, useProjectStore, useConnectionsStore, useUIStore, useDragStore } from '../../stores';
import { usePlaybackStore, computeExistenceState } from '../../stores/usePlaybackStore';
import { cardDimensions } from '../../utils/cardGeometry';
import { findConnectionTarget } from '../../utils/connectionTargets';
import { BackgroundLayer } from './BackgroundLayer';
import { DrawingLayer } from './DrawingLayer';
import { ZoneLayer } from './ZoneLayer';
import { ConnectionsLayer, PendingConnectionLayer } from './ConnectionsLayer';
import { BackgroundTextsGroup } from './BackgroundTextsGroup';
import { DocumentationCard } from './DocumentationCard/DocumentationCard';
import { CardSelectionActions } from './CardSelectionActions';
import { ZoneSelectionActions } from './ZoneSelectionActions';
import { useT } from '../../i18n';

// HTML overlay component for editing zone name inline
function ZoneNameEditor() {
  const t = useT();
  const zones = useZonesStore((state) => state.zones);
  const editingZoneId = useZonesStore((state) => state.editingZoneId);
  const setEditingZone = useZonesStore((state) => state.setEditingZone);
  const updateZone = useZonesStore((state) => state.updateZone);
  const renameGroup = useCardsStore((state) => state.renameGroup);
  const scale = useCanvasStore((state) => state.scale);
  const position = useCanvasStore((state) => state.position);

  const zone = editingZoneId ? zones.find((z) => z.id === editingZoneId) : null;
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Beim Wechsel der bearbeiteten Zone den Namen übernehmen (state-adjust during render)
  const [prevZoneId, setPrevZoneId] = useState<string | null>(null);
  if ((zone?.id ?? null) !== prevZoneId) {
    setPrevZoneId(zone?.id ?? null);
    if (zone) setName(zone.name || '');
  }

  useEffect(() => {
    if (!zone) return;
    // Fokus im nächsten Tick setzen (Eingabefeld ist dann gerendert)
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, [zone]);

  if (!zone) return null;

  // Calculate screen position
  const screenX = zone.position.x * scale + position.x + 10 * scale;
  const screenY = zone.position.y * scale + position.y + 10 * scale;

  const handleSave = async () => {
    await updateZone(zone.id, { name });
    // If zone is linked to a group, update group name too
    if (zone.groupId) {
      await renameGroup(zone.groupId, name);
    }
    setEditingZone(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditingZone(null);
    }
  };

  return (
    <div
      className="fixed z-50"
      style={{
        left: screenX,
        top: screenY,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="px-2 py-1 rounded-lg border-2 bg-white text-sm font-bold shadow-lg focus:outline-none"
        style={{
          fontSize: Math.max(12, 14 * scale),
          minWidth: 120,
          borderColor: '#5B8DEF',
        }}
        placeholder={t('Gruppenname')}
      />
    </div>
  );
}

interface CanvasStageProps {
  projectId: string;
  backgroundColor: string;
  backgroundImage?: string;
  backgroundImageWidth?: number;
  backgroundImageHeight?: number;
}

export interface CanvasStageHandle {
  toDataURL: (config?: { pixelRatio?: number }) => string;
}

export const CanvasStage = forwardRef<CanvasStageHandle, CanvasStageProps>(function CanvasStage({ projectId, backgroundColor, backgroundImage, backgroundImageWidth, backgroundImageHeight }, ref) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Feldweise Selektoren: nur bei tatsächlich genutzten Änderungen neu rendern
  const scale = useCanvasStore((state) => state.scale);
  const position = useCanvasStore((state) => state.position);
  const showGrid = useCanvasStore((state) => state.showGrid);
  const setScale = useCanvasStore((state) => state.setScale);
  const setPosition = useCanvasStore((state) => state.setPosition);
  const setIsDragging = useCanvasStore((state) => state.setIsDragging);
  const isAnimating = useCanvasStore((state) => state.isAnimating);
  const targetScale = useCanvasStore((state) => state.targetScale);
  const targetPosition = useCanvasStore((state) => state.targetPosition);
  const updateAnimation = useCanvasStore((state) => state.updateAnimation);

  const loadCards = useCardsStore((state) => state.loadCards);
  const setSelectedCard = useCardsStore((state) => state.setSelectedCard);
  const createEmptyGroup = useCardsStore((state) => state.createEmptyGroup);
  const addCardToGroup = useCardsStore((state) => state.addCardToGroup);
  const selectedCardId = useCardsStore((state) => state.selectedCardId);
  const cards = useCardsStore((state) => state.cards);
  // Nur die ID abonnieren – die Live-Position ändert sich pro Frame und wird hier nicht gebraucht
  const draggingCardId = useDragStore((state) => state.draggingCard?.cardId ?? null);

  // Get selected card for contextual actions
  const selectedCard = useMemo(() => {
    return selectedCardId ? cards.find((c) => c.id === selectedCardId) : null;
  }, [selectedCardId, cards]);

  // Check if selected card is being dragged
  const isSelectedCardDragging = !!draggingCardId && !!selectedCard && draggingCardId === selectedCard.id;

  const isDrawingMode = useDrawingStore((state) => state.isDrawingMode);
  const isErasing = useDrawingStore((state) => state.isErasing);
  const startPath = useDrawingStore((state) => state.startPath);
  const addPoint = useDrawingStore((state) => state.addPoint);
  const endPath = useDrawingStore((state) => state.endPath);
  const eraseAtPoint = useDrawingStore((state) => state.eraseAtPoint);

  const isCreatingZone = useZonesStore((state) => state.isCreatingZone);
  const zoneCreationStart = useZonesStore((state) => state.zoneCreationStart);
  const setZoneCreationStart = useZonesStore((state) => state.setZoneCreationStart);
  const createZoneForGroup = useZonesStore((state) => state.createZoneForGroup);
  const endZoneCreation = useZonesStore((state) => state.endZoneCreation);
  const setSelectedZone = useZonesStore((state) => state.setSelectedZone);
  const selectedZoneId = useZonesStore((state) => state.selectedZoneId);
  const zones = useZonesStore((state) => state.zones);
  const draggingZoneId = useZonesStore((state) => state.draggingZoneId);

  // Get selected zone for contextual actions
  const selectedZone = useMemo(() => {
    return selectedZoneId ? zones.find((z) => z.id === selectedZoneId) : null;
  }, [selectedZoneId, zones]);
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  // Darstellungsmodus des Whiteboards (freie Maße statt quadratischer Karten)
  const freeCardLayout = useProjectStore((state) =>
    state.projects.find((p) => p.id === state.currentProjectId)?.cardLayout === 'free'
  );
  const pendingConnection = useConnectionsStore((state) => state.pendingConnection);
  const cancelConnection = useConnectionsStore((state) => state.cancelConnection);
  const updateConnectionDrag = useConnectionsStore((state) => state.updateConnectionDrag);
  const globalCompactView = useUIStore((state) => state.globalCompactView);

  // Track mouse position for pending connection line

  // Memoize sorted cards to prevent infinite loops
  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => a.zIndex - b.zIndex);
  }, [cards]);

  // Lernspur-Wiedergabe: Karten/Zonen/Verbindungen aus dem Ereignisprotokoll ableiten
  const playbackActive = usePlaybackStore((state) => state.isActive);
  const playbackStep = usePlaybackStore((state) => state.currentStep);
  const playbackEvents = usePlaybackStore((state) => state.events);
  const playbackAllCards = usePlaybackStore((state) => state.allCards);

  const playbackState = useMemo(() => {
    if (!playbackActive) return null;
    return computeExistenceState(playbackEvents, playbackStep);
  }, [playbackActive, playbackEvents, playbackStep]);

  const playbackCards = useMemo(() => {
    if (!playbackState) return null;
    return playbackAllCards
      .filter((c) => playbackState.cards.has(c.id))
      .map((c) => ({
        ...c,
        position: playbackState.cards.get(c.id)!,
        stackId: undefined,
        stackIndex: undefined,
      }))
      .sort((a, b) => a.zIndex - b.zIndex);
  }, [playbackState, playbackAllCards]);

  const renderedCards = playbackCards ?? sortedCards;

  // Drawing state
  const isDrawing = useRef(false);

  // Zone creation state
  const isCreatingZoneRef = useRef(false);
  const [zonePreview, setZonePreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Pinch zoom state
  const lastCenter = useRef<{ x: number; y: number } | null>(null);
  const lastDist = useRef<number>(0);
  const isPinching = useRef(false);

  // Load cards on mount - only when projectId changes
  useEffect(() => {
    loadCards(projectId, true); // Force load on mount/projectId change
    // Freihand-Striche gehören zum jeweiligen Projekt (nicht persistiert) → beim Wechsel leeren
    useDrawingStore.getState().clearDrawing();
    return () => {
      useDrawingStore.getState().clearDrawing();
    };
  }, [projectId, loadCards]);

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Animation for zoom/pan transitions
  useEffect(() => {
    if (!isAnimating) return;

    // Startwerte bewusst einmalig einfrieren (nicht als Effekt-Abhängigkeit),
    // sonst würde die Animation bei jedem Zwischenschritt neu starten.
    const { scale: startScale, position: startPositionState } = useCanvasStore.getState();
    const startPosition = { ...startPositionState };
    const duration = 300; // ms
    const startTime = Date.now();
    let rafId = 0;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic function
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentScale = startScale + (targetScale - startScale) * easeOut;
      const currentPosition = {
        x: startPosition.x + (targetPosition.x - startPosition.x) * easeOut,
        y: startPosition.y + (targetPosition.y - startPosition.y) * easeOut,
      };

      updateAnimation(currentScale, currentPosition, progress >= 1);

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isAnimating, targetScale, targetPosition, updateAnimation]);

  // Expose toDataURL method via ref
  useImperativeHandle(ref, () => ({
    toDataURL: (config?: { pixelRatio?: number }) => {
      if (stageRef.current) {
        return stageRef.current.toDataURL(config);
      }
      return '';
    },
  }), []);

  // Calculate distance between two touch points
  const getDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  // Calculate center between two touch points
  const getCenter = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  };

  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();

      const stage = stageRef.current;
      if (!stage) return;

      const oldScale = scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - position.x) / oldScale,
        y: (pointer.y - position.y) / oldScale,
      };

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = Math.min(3, Math.max(0.25, oldScale + direction * 0.1));

      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };

      setScale(newScale);
      setPosition(newPos);
    },
    [scale, position, setScale, setPosition]
  );

  // Handle touch start for pinch zoom detection
  const handleTouchStart = useCallback(
    (e: KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (touches.length >= 2) {
        // Start pinching - disable stage dragging
        isPinching.current = true;
        const stage = stageRef.current;
        if (stage) {
          stage.draggable(false);
        }

        const p1 = { x: touches[0].clientX, y: touches[0].clientY };
        const p2 = { x: touches[1].clientX, y: touches[1].clientY };

        lastCenter.current = getCenter(p1, p2);
        lastDist.current = getDistance(p1, p2);
      }
      // Single touch is handled by Konva's built-in drag and tap handling
    },
    []
  );

  // Handle touch events for pinch zoom
  const handleTouchMove = useCallback(
    (e: KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;

      if (touches.length >= 2) {
        e.evt.preventDefault();

        const stage = stageRef.current;
        if (!stage) return;

        // Ensure pinching state is set
        if (!isPinching.current) {
          isPinching.current = true;
          stage.draggable(false);
        }

        const p1 = { x: touches[0].clientX, y: touches[0].clientY };
        const p2 = { x: touches[1].clientX, y: touches[1].clientY };

        const newCenter = getCenter(p1, p2);
        const dist = getDistance(p1, p2);

        if (!lastCenter.current) {
          lastCenter.current = newCenter;
          lastDist.current = dist;
          return;
        }

        const oldScale = scale;
        const newScale = Math.min(3, Math.max(0.25, oldScale * (dist / lastDist.current)));

        // Calculate the point that should stay fixed (center between fingers)
        const pointTo = {
          x: (newCenter.x - position.x) / oldScale,
          y: (newCenter.y - position.y) / oldScale,
        };

        // Calculate new position so the point stays under the fingers
        const newPos = {
          x: newCenter.x - pointTo.x * newScale,
          y: newCenter.y - pointTo.y * newScale,
        };

        setScale(newScale);
        setPosition(newPos);

        lastCenter.current = newCenter;
        lastDist.current = dist;
      }
    },
    [scale, position, setScale, setPosition]
  );

  const handleTouchEnd = useCallback(() => {
    // Reset pinch state and re-enable dragging
    if (isPinching.current) {
      isPinching.current = false;
      const stage = stageRef.current;
      if (stage && !isDrawingMode && !isCreatingZone) {
        stage.draggable(true);
      }
    }
    lastCenter.current = null;
    lastDist.current = 0;
  }, [isDrawingMode, isCreatingZone]);

  // Handle stage drag (pan)
  const handleDragStart = () => {
    setIsDragging(true);
  };

  // Beim Verschieben der Fläche die Store-Position mitführen (per rAF gedrosselt),
  // damit HTML-Overlays (Auswahl-Aktionen, Inline-Editor, Medien-Player) mitwandern.
  const panRafRef = useRef<number | null>(null);

  const handleStageDragMove = (e: KonvaEventObject<DragEvent>) => {
    if (e.target !== stageRef.current) return;
    if (panRafRef.current !== null) return;
    panRafRef.current = requestAnimationFrame(() => {
      panRafRef.current = null;
      const stage = stageRef.current;
      if (stage) {
        setPosition({ x: stage.x(), y: stage.y() });
      }
    });
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    setIsDragging(false);
    if (panRafRef.current !== null) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }
    const stage = e.target;
    if (stage === stageRef.current) {
      setPosition({
        x: stage.x(),
        y: stage.y(),
      });
    }
  };

  // Ausstehenden Frame beim Unmount verwerfen
  useEffect(() => {
    return () => {
      if (panRafRef.current !== null) {
        cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }
    };
  }, []);

  // Get pointer position relative to canvas (accounting for scale and position)
  const getPointerPosition = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - position.x) / scale,
      y: (pointer.y - position.y) / scale,
    };
  }, [position, scale]);

  // Helper to check for multi-touch
  const isMultiTouch = (evt: MouseEvent | TouchEvent): boolean => {
    return 'touches' in evt && evt.touches.length > 1;
  };

  // Handle drawing start
  const handleDrawingStart = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isDrawingMode) return;
      if (isMultiTouch(e.evt)) return; // Ignore multi-touch

      const pos = getPointerPosition();
      if (!pos) return;

      e.evt.preventDefault();
      isDrawing.current = true;

      if (isErasing) {
        eraseAtPoint(pos, 20 / scale);
      } else {
        startPath(pos);
      }
    },
    [isDrawingMode, isErasing, getPointerPosition, startPath, eraseAtPoint, scale]
  );

  // Handle drawing move
  const handleDrawingMove = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isDrawingMode || !isDrawing.current) return;
      if (isMultiTouch(e.evt)) return;

      const pos = getPointerPosition();
      if (!pos) return;

      if (isErasing) {
        eraseAtPoint(pos, 20 / scale);
      } else {
        addPoint(pos);
      }
    },
    [isDrawingMode, isErasing, getPointerPosition, addPoint, eraseAtPoint, scale]
  );

  // Handle drawing end
  const handleDrawingEnd = useCallback(() => {
    if (!isDrawingMode) return;
    isDrawing.current = false;
    if (!isErasing) {
      endPath();
    }
  }, [isDrawingMode, isErasing, endPath]);

  // Handle zone creation start
  const handleZoneCreationStart = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isCreatingZone) return;
      if (isMultiTouch(e.evt)) return;

      const pos = getPointerPosition();
      if (!pos) return;

      e.evt.preventDefault();
      isCreatingZoneRef.current = true;
      setZoneCreationStart(pos);
      setZonePreview({ x: pos.x, y: pos.y, width: 0, height: 0 });
    },
    [isCreatingZone, getPointerPosition, setZoneCreationStart]
  );

  // Handle zone creation move
  const handleZoneCreationMove = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isCreatingZone || !isCreatingZoneRef.current || !zoneCreationStart) return;
      if (isMultiTouch(e.evt)) return;

      const pos = getPointerPosition();
      if (!pos) return;

      // Calculate zone dimensions (support drawing in any direction)
      const x = Math.min(zoneCreationStart.x, pos.x);
      const y = Math.min(zoneCreationStart.y, pos.y);
      const width = Math.abs(pos.x - zoneCreationStart.x);
      const height = Math.abs(pos.y - zoneCreationStart.y);

      setZonePreview({ x, y, width, height });
    },
    [isCreatingZone, zoneCreationStart, getPointerPosition]
  );

  // Handle zone creation end
  const handleZoneCreationEnd = useCallback(async () => {
    if (!isCreatingZone || !isCreatingZoneRef.current || !zoneCreationStart || !zonePreview) {
      isCreatingZoneRef.current = false;
      setZonePreview(null);
      return;
    }

    isCreatingZoneRef.current = false;

    // Only create zone if it has a minimum size
    if (zonePreview.width >= 50 && zonePreview.height >= 50 && currentProjectId) {
      // Create a new group and link it to the zone
      const newGroup = await createEmptyGroup(currentProjectId);
      await createZoneForGroup(
        currentProjectId,
        newGroup.id,
        newGroup.name || '',
        newGroup.color,
        { x: zonePreview.x, y: zonePreview.y },
        zonePreview.width,
        zonePreview.height
      );

      // Add cards that are inside the zone to the group
      const projectCards = cards.filter((c) => c.projectId === currentProjectId);
      for (const card of projectCards) {
        const cardSize = cardDimensions(card, {
          freeLayout: freeCardLayout,
          compact: card.isCompact === true,
        });
        const cardCenterX = card.position.x + cardSize.width / 2;
        const cardCenterY = card.position.y + cardSize.height / 2;

        const isInZone =
          cardCenterX >= zonePreview.x &&
          cardCenterX <= zonePreview.x + zonePreview.width &&
          cardCenterY >= zonePreview.y &&
          cardCenterY <= zonePreview.y + zonePreview.height;

        if (isInZone) {
          await addCardToGroup(newGroup.id, card.id);
        }
      }
    }

    setZonePreview(null);
    setZoneCreationStart(null);
    endZoneCreation();
  }, [isCreatingZone, zoneCreationStart, zonePreview, currentProjectId, freeCardLayout, cards, createZoneForGroup, createEmptyGroup, addCardToGroup, setZoneCreationStart, endZoneCreation]);

  // Combined mouse/touch handlers
  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (isCreatingZone) {
        handleZoneCreationStart(e);
      } else if (isDrawingMode) {
        handleDrawingStart(e);
      }
    },
    [isCreatingZone, isDrawingMode, handleZoneCreationStart, handleDrawingStart]
  );

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (isCreatingZone) {
        handleZoneCreationMove(e);
      } else if (isDrawingMode) {
        handleDrawingMove(e);
      }

      // Offene Verbindung (nach einem Tipp auf den Anker): Vorschaulinie und
      // Andockziel folgen dem Zeiger, bis die Zielkarte angetippt wird.
      if (pendingConnection) {
        const pos = getPointerPosition();
        if (pos) {
          const candidates = cards
            .filter((c) => c.projectId === currentProjectId && !c.isDeleted)
            .map((c) => ({
              id: c.id,
              position: c.position,
              size: cardDimensions(c, {
                freeLayout: freeCardLayout,
                compact: c.isCompact ?? globalCompactView,
              }),
            }));
          updateConnectionDrag(pos, findConnectionTarget(pos, candidates, pendingConnection.sourceCardId));
        }
      }
    },
    [isCreatingZone, isDrawingMode, pendingConnection, cards, currentProjectId, freeCardLayout, globalCompactView, updateConnectionDrag, handleZoneCreationMove, handleDrawingMove, getPointerPosition]
  );

  const handleMouseUp = useCallback(() => {
    if (isCreatingZone) {
      handleZoneCreationEnd();
    } else if (isDrawingMode) {
      handleDrawingEnd();
    }
  }, [isCreatingZone, isDrawingMode, handleZoneCreationEnd, handleDrawingEnd]);

  // Deselect card and zone when clicking on empty canvas
  const handleStageClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (isDrawingMode || isCreatingZone) return; // Don't deselect when drawing or creating zone
    if (e.target === stageRef.current) {
      setSelectedCard(null);
      setSelectedZone(null);
      // Angefangene Verbindung verwerfen, wenn ins Leere getippt wird
      if (pendingConnection) cancelConnection();
    }
  };

  // Determine if interaction modes are active
  const isInteractionMode = isDrawingMode || isCreatingZone;

  // Determine if card selection actions should be shown (hide during drag/playback)
  const showCardActions = selectedCard && !isDrawingMode && !isCreatingZone && !pendingConnection && !isSelectedCardDragging && !playbackActive;

  // Determine if zone selection actions should be shown (hide during drag/playback)
  const isSelectedZoneDragging = draggingZoneId && selectedZone && draggingZoneId === selectedZone.id;
  const showZoneActions = selectedZone && !isDrawingMode && !isCreatingZone && !pendingConnection && !isSelectedZoneDragging && !playbackActive;

  return (
    <div ref={containerRef} className="w-full h-full touch-none relative">
      {/* Zone name editor overlay - outside of Konva */}
      <ZoneNameEditor />

      {/* Card selection actions overlay - outside of Konva */}
      {showCardActions && dimensions.width > 0 && (
        <CardSelectionActions
          card={selectedCard}
          canvasScale={scale}
          canvasPosition={position}
          containerWidth={dimensions.width}
          containerHeight={dimensions.height}
        />
      )}

      {/* Zone selection actions overlay - outside of Konva */}
      {showZoneActions && dimensions.width > 0 && (
        <ZoneSelectionActions
          zone={selectedZone}
          canvasScale={scale}
          canvasPosition={position}
          containerWidth={dimensions.width}
          containerHeight={dimensions.height}
        />
      )}
      {dimensions.width > 0 && (
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          draggable={!isInteractionMode}
          onWheel={handleWheel}
          onTouchStart={isInteractionMode ? handleMouseDown : handleTouchStart}
          onTouchMove={isInteractionMode ? handleMouseMove : handleTouchMove}
          onTouchEnd={isInteractionMode ? handleMouseUp : handleTouchEnd}
          onDragStart={handleDragStart}
          onDragMove={handleStageDragMove}
          onDragEnd={handleDragEnd}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isCreatingZone ? 'crosshair' : isDrawingMode ? 'crosshair' : 'default' }}
        >
          <BackgroundLayer
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={backgroundColor}
            showGrid={showGrid}
            scale={scale}
            position={position}
            backgroundImage={backgroundImage}
            backgroundImageWidth={backgroundImageWidth}
            backgroundImageHeight={backgroundImageHeight}
          />
          {/* Zones layer - behind everything except background */}
          {/* Im Zeichen-/Bereichsmodus keine Zonen-Interaktion (sonst zieht der Strich die Zone mit) */}
          <Layer listening={!playbackActive && !isInteractionMode}>
            <BackgroundTextsGroup projectId={projectId} />
            <ZoneLayer visibleZoneIds={playbackState?.zones} draggable={!isInteractionMode} />
            {/* Zone creation preview */}
            {zonePreview && (
              <Rect
                x={zonePreview.x}
                y={zonePreview.y}
                width={zonePreview.width}
                height={zonePreview.height}
                fill="rgba(91, 141, 239, 0.15)"
                stroke="#5B8DEF"
                strokeWidth={2}
                dash={[8, 4]}
                cornerRadius={16}
              />
            )}
          </Layer>
          {/* Drawing layer - between zones and cards */}
          <Layer>
            <DrawingLayer />
          </Layer>
          {/* Connections layer - between drawings and cards */}
          <Layer listening={!playbackActive && !isInteractionMode}>
            <ConnectionsLayer
              globalCompactView={globalCompactView}
              visibleConnectionIds={playbackState?.connections}
              overrideCards={playbackCards ?? undefined}
            />
          </Layer>
          {/* Karten: im Zeichen-/Bereichsmodus nicht anfassbar */}
          <Layer listening={!playbackActive && !isInteractionMode}>
            {renderedCards.map((card) => (
              <DocumentationCard key={card.id} card={card} />
            ))}
            {/* Vorschaulinie über den Karten, damit sie nicht dahinter verschwindet */}
            <PendingConnectionLayer globalCompactView={globalCompactView} />
          </Layer>
        </Stage>
      )}
    </div>
  );
});
