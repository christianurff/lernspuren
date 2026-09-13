import { useState } from 'react';
import { Group, Line, Circle, Arrow, Rect, Text } from 'react-konva';
import { useConnectionsStore, useCardsStore, useProjectStore, useUIStore, useDragStore } from '../../stores';
import type { Connection, ConnectionAnchor, Card, Position } from '../../types';
import { cardDimensions } from '../../utils/cardGeometry';
import { useT } from '../../i18n';

// Calculate anchor point position on a card
function getAnchorPosition(
  card: Card,
  anchor: ConnectionAnchor,
  size: { width: number; height: number },
  overridePosition?: Position // Optional override for dragging
): { x: number; y: number } {
  const { x, y } = overridePosition || card.position;

  switch (anchor) {
    case 'top':
      return { x: x + size.width / 2, y };
    case 'right':
      return { x: x + size.width, y: y + size.height / 2 };
    case 'bottom':
      return { x: x + size.width / 2, y: y + size.height };
    case 'left':
      return { x, y: y + size.height / 2 };
    default:
      return { x: x + size.width / 2, y: y + size.height / 2 };
  }
}

// Calculate control points for curved lines
function getCurvedPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  sourceAnchor: ConnectionAnchor,
  targetAnchor: ConnectionAnchor
): number[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const curvature = Math.min(distance * 0.3, 100);

  // Calculate control point offsets based on anchor directions
  let cp1x = start.x;
  let cp1y = start.y;
  let cp2x = end.x;
  let cp2y = end.y;

  switch (sourceAnchor) {
    case 'top':
      cp1y -= curvature;
      break;
    case 'right':
      cp1x += curvature;
      break;
    case 'bottom':
      cp1y += curvature;
      break;
    case 'left':
      cp1x -= curvature;
      break;
  }

  switch (targetAnchor) {
    case 'top':
      cp2y -= curvature;
      break;
    case 'right':
      cp2x += curvature;
      break;
    case 'bottom':
      cp2y += curvature;
      break;
    case 'left':
      cp2x -= curvature;
      break;
  }

  return [start.x, start.y, cp1x, cp1y, cp2x, cp2y, end.x, end.y];
}

// Get elbow path points
function getElbowPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  sourceAnchor: ConnectionAnchor,
  targetAnchor: ConnectionAnchor
): number[] {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Simple elbow: go out from source, turn, go to target
  if (sourceAnchor === 'left' || sourceAnchor === 'right') {
    if (targetAnchor === 'top' || targetAnchor === 'bottom') {
      return [start.x, start.y, end.x, start.y, end.x, end.y];
    }
    return [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y];
  } else {
    if (targetAnchor === 'left' || targetAnchor === 'right') {
      return [start.x, start.y, start.x, end.y, end.x, end.y];
    }
    return [start.x, start.y, start.x, midY, end.x, midY, end.x, end.y];
  }
}

interface ConnectionLineProps {
  connection: Connection;
  cards: Card[];
  globalCompactView: boolean;
  freeLayout: boolean;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  isSelected: boolean;
  draggingCard?: { cardId: string; position: Position } | null;
  // Zweite Bestätigung ausstehend (zweistufiges Löschen statt window.confirm)
  isConfirmingDelete: boolean;
  confirmLabel: string;
}

function ConnectionLine({ connection, cards, globalCompactView, freeLayout, onDelete, onSelect, isSelected, draggingCard, isConfirmingDelete, confirmLabel }: ConnectionLineProps) {
  const sourceCard = cards.find((c) => c.id === connection.sourceCardId);
  const targetCard = cards.find((c) => c.id === connection.targetCardId);

  if (!sourceCard || !targetCard) return null;

  const sourceCompact = sourceCard.isCompact ?? globalCompactView;
  const targetCompact = targetCard.isCompact ?? globalCompactView;

  // Use dragging position if this card is being dragged
  const sourcePosition = draggingCard?.cardId === sourceCard.id ? draggingCard.position : undefined;
  const targetPosition = draggingCard?.cardId === targetCard.id ? draggingCard.position : undefined;

  const start = getAnchorPosition(
    sourceCard,
    connection.sourceAnchor,
    cardDimensions(sourceCard, { freeLayout, compact: sourceCompact }),
    sourcePosition
  );
  const end = getAnchorPosition(
    targetCard,
    connection.targetAnchor,
    cardDimensions(targetCard, { freeLayout, compact: targetCompact }),
    targetPosition
  );

  // Calculate midpoint for delete button
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  let points: number[];

  if (connection.lineStyle === 'straight') {
    points = [start.x, start.y, end.x, end.y];
  } else if (connection.lineStyle === 'elbow') {
    points = getElbowPath(start, end, connection.sourceAnchor, connection.targetAnchor);
  } else {
    // curved - use bezier
    points = getCurvedPath(start, end, connection.sourceAnchor, connection.targetAnchor);
  }

  // Calculate arrow angle for end arrow
  const lastSegmentStartX = points[points.length - 4] ?? points[0];
  const lastSegmentStartY = points[points.length - 3] ?? points[1];
  const angle = Math.atan2(end.y - lastSegmentStartY, end.x - lastSegmentStartX);

  return (
    <Group>
      {/* Main line */}
      {connection.lineStyle === 'curved' ? (
        <Line
          points={points}
          stroke={connection.color}
          strokeWidth={connection.strokeWidth}
          bezier
          lineCap="round"
          lineJoin="round"
        />
      ) : (
        <Line
          points={points}
          stroke={connection.color}
          strokeWidth={connection.strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
      )}

      {/* Start arrow/dot */}
      {connection.startArrow === 'arrow' && (
        <Arrow
          points={[
            start.x + Math.cos(angle + Math.PI) * 15,
            start.y + Math.sin(angle + Math.PI) * 15,
            start.x,
            start.y,
          ]}
          pointerLength={8}
          pointerWidth={8}
          fill={connection.color}
          stroke={connection.color}
          strokeWidth={connection.strokeWidth}
        />
      )}
      {connection.startArrow === 'dot' && (
        <Circle
          x={start.x}
          y={start.y}
          radius={5}
          fill={connection.color}
        />
      )}

      {/* End arrow/dot */}
      {connection.endArrow === 'arrow' && (
        <Arrow
          points={[
            end.x - Math.cos(angle) * 15,
            end.y - Math.sin(angle) * 15,
            end.x,
            end.y,
          ]}
          pointerLength={10}
          pointerWidth={10}
          fill={connection.color}
          stroke={connection.color}
          strokeWidth={connection.strokeWidth}
        />
      )}
      {connection.endArrow === 'dot' && (
        <Circle
          x={end.x}
          y={end.y}
          radius={5}
          fill={connection.color}
        />
      )}

      {/* Trefferfläche: ein Tipp wählt die Verbindung aus und zeigt das Lösch-X */}
      <Line
        points={points}
        stroke="transparent"
        strokeWidth={20}
        bezier={connection.lineStyle === 'curved'}
        onClick={(e) => { e.cancelBubble = true; onSelect(connection.id); }}
        onTap={(e) => { e.cancelBubble = true; onSelect(connection.id); }}
        onDblClick={() => onDelete(connection.id)}
        onDblTap={() => onDelete(connection.id)}
      />

      {/* Lösch-X – erscheint, sobald die Verbindung ausgewählt ist */}
      {isSelected && (
        <Group
          x={midX}
          y={midY}
          onClick={() => onDelete(connection.id)}
          onTap={() => onDelete(connection.id)}
        >
          {/* Zweistufige Bestätigung: erster Tipp fragt nach, zweiter löscht */}
          {isConfirmingDelete && (
            <>
              <Rect
                x={-52}
                y={-38}
                width={104}
                height={22}
                cornerRadius={11}
                fill="#ef4444"
              />
              <Text
                x={-52}
                y={-32}
                width={104}
                text={confirmLabel}
                fontSize={11}
                fontStyle="600"
                fill="#ffffff"
                align="center"
                listening={false}
              />
            </>
          )}
          {/* Background circle */}
          <Circle
            radius={isConfirmingDelete ? 14 : 12}
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth={2}
          />
          {/* X icon */}
          <Line
            points={[-4, -4, 4, 4]}
            stroke="#ffffff"
            strokeWidth={2}
            lineCap="round"
          />
          <Line
            points={[-4, 4, 4, -4]}
            stroke="#ffffff"
            strokeWidth={2}
            lineCap="round"
          />
        </Group>
      )}
    </Group>
  );
}

interface PendingConnectionLineProps {
  sourceCard: Card;
  sourceAnchor: ConnectionAnchor;
  mousePosition: { x: number; y: number };
  globalCompactView: boolean;
  freeLayout: boolean;
}

function PendingConnectionLine({
  sourceCard,
  sourceAnchor,
  mousePosition,
  globalCompactView,
  freeLayout,
}: PendingConnectionLineProps) {
  const isCompact = sourceCard.isCompact ?? globalCompactView;
  const start = getAnchorPosition(
    sourceCard,
    sourceAnchor,
    cardDimensions(sourceCard, { freeLayout, compact: isCompact })
  );

  // Use curved path for pending connection
  const points = getCurvedPath(start, mousePosition, sourceAnchor, 'left');

  return (
    <Line
      points={points}
      stroke="#5B8DEF"
      strokeWidth={2}
      dash={[8, 4]}
      bezier
      lineCap="round"
      opacity={0.7}
      // Reine Anzeige: die Linie endet am Zeiger und würde sonst genau den
      // Klick abfangen, mit dem man an der Zielkarte andocken will.
      listening={false}
    />
  );
}

interface ConnectionsLayerProps {
  globalCompactView: boolean;
  // Wiedergabe-Modus: nur diese Verbindungen anzeigen, Kartenliste überschreiben
  visibleConnectionIds?: Set<string>;
  overrideCards?: Card[];
}

export function ConnectionsLayer({ globalCompactView, visibleConnectionIds, overrideCards }: ConnectionsLayerProps) {
  const t = useT();
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  // Darstellungsmodus des Whiteboards: bestimmt, wie breit/hoch eine Karte ist
  const freeLayout = useProjectStore((state) =>
    state.projects.find((p) => p.id === state.currentProjectId)?.cardLayout === 'free'
  );
  const cards = useCardsStore((state) => state.cards);
  const draggingCard = useDragStore((state) => state.draggingCard);
  const deleteConnection = useConnectionsStore((state) => state.deleteConnection);
  const connections = useConnectionsStore((state) => state.connections);
  const showToast = useUIStore((state) => state.showToast);

  // Zweistufiges Löschen: erste Auswahl merkt sich die Verbindung
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Angetippte Verbindung – nur dort erscheint das Lösch-X
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  if (!currentProjectId) return null;

  const projectConnections = connections.filter(
    (c) => c.projectId === currentProjectId && (!visibleConnectionIds || visibleConnectionIds.has(c.id))
  );
  const projectCards = (overrideCards ?? cards).filter((c) => c.projectId === currentProjectId);

  const handleSelectConnection = (id: string) => {
    setSelectedConnectionId((current) => (current === id ? null : id));
    setConfirmDeleteId(null);
  };

  const handleDeleteConnection = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      showToast(t('Nochmal tippen zum Löschen'));
      return;
    }
    setConfirmDeleteId(null);
    setSelectedConnectionId(null);
    deleteConnection(id);
  };

  return (
    <Group>
      {/* Render all connections */}
      {projectConnections.map((connection) => (
        <ConnectionLine
          key={connection.id}
          connection={connection}
          cards={projectCards}
          globalCompactView={globalCompactView}
          freeLayout={freeLayout}
          onDelete={handleDeleteConnection}
          onSelect={handleSelectConnection}
          isSelected={selectedConnectionId === connection.id}
          draggingCard={draggingCard}
          isConfirmingDelete={confirmDeleteId === connection.id}
          confirmLabel={t('Wirklich löschen?')}
        />
      ))}

    </Group>
  );
}

/**
 * Die Vorschaulinie einer angefangenen Verbindung. Sie liegt bewusst in einer
 * eigenen Ebene über den Karten – in der Verbindungsebene darunter würde sie
 * hinter der Quellkarte verschwinden, und man sähe nicht, woher der Pfeil kommt.
 */
export function PendingConnectionLayer({ globalCompactView }: { globalCompactView: boolean }) {
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const freeLayout = useProjectStore((state) =>
    state.projects.find((p) => p.id === state.currentProjectId)?.cardLayout === 'free'
  );
  const cards = useCardsStore((state) => state.cards);
  const pendingConnection = useConnectionsStore((state) => state.pendingConnection);
  const dragPoint = useConnectionsStore((state) => state.dragPoint);

  if (!currentProjectId || !pendingConnection || !dragPoint) return null;

  const sourceCard = cards.find(
    (c) => c.id === pendingConnection.sourceCardId && c.projectId === currentProjectId
  );
  if (!sourceCard) return null;

  return (
    <PendingConnectionLine
      sourceCard={sourceCard}
      sourceAnchor={pendingConnection.sourceAnchor}
      mousePosition={dragPoint}
      globalCompactView={globalCompactView}
      freeLayout={freeLayout}
    />
  );
}
