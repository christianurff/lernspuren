import { Group, Rect, Text, Transformer } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useRef, useEffect } from 'react';
import type Konva from 'konva';
import { useZonesStore, useProjectStore, useCardsStore } from '../../stores';
import type { Zone } from '../../types';
import { cardDimensions } from '../../utils/cardGeometry';
import { useT } from '../../i18n';

interface ZoneLayerProps {
  // Wiedergabe-Modus: nur diese Zonen anzeigen
  visibleZoneIds?: Set<string>;
  // Im Zeichen-/Bereichsmodus dürfen Zonen nicht gezogen werden
  draggable?: boolean;
}

export function ZoneLayer({ visibleZoneIds, draggable = true }: ZoneLayerProps = {}) {
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const zones = useZonesStore((state) => state.zones);
  const selectedZoneId = useZonesStore((state) => state.selectedZoneId);
  const setSelectedZone = useZonesStore((state) => state.setSelectedZone);
  const updateZone = useZonesStore((state) => state.updateZone);
  const deleteZone = useZonesStore((state) => state.deleteZone);
  const editingZoneId = useZonesStore((state) => state.editingZoneId);
  const setEditingZone = useZonesStore((state) => state.setEditingZone);
  const setDraggingZone = useZonesStore((state) => state.setDraggingZone);
  const deleteGroup = useCardsStore((state) => state.deleteGroup);

  const projectZones = zones.filter(
    (z) => z.projectId === currentProjectId && (!visibleZoneIds || visibleZoneIds.has(z.id))
  );

  const handleDeleteZone = (zone: Zone) => {
    if (zone.groupId) {
      // Delete the group (this also deletes the linked zone)
      deleteGroup(zone.groupId);
    } else {
      // Zone without group - just delete the zone
      deleteZone(zone.id);
    }
  };

  return (
    <>
      {projectZones.map((zone) => (
        <ZoneComponent
          key={zone.id}
          zone={zone}
          isSelected={selectedZoneId === zone.id}
          onSelect={() => setSelectedZone(zone.id)}
          onUpdate={(changes) => updateZone(zone.id, changes)}
          onDelete={() => handleDeleteZone(zone)}
          onEditName={() => setEditingZone(zone.id)}
          isEditing={editingZoneId === zone.id}
          draggable={draggable}
          onDragStart={() => setDraggingZone(zone.id)}
          onDragEnd={() => setDraggingZone(null)}
        />
      ))}
    </>
  );
}

interface ZoneComponentProps {
  zone: Zone;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (changes: { position?: { x: number; y: number }; width?: number; height?: number }) => void;
  onDelete: () => void;
  onEditName: () => void;
  isEditing: boolean;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function ZoneComponent({ zone, isSelected, onSelect, onUpdate, onEditName, isEditing, draggable, onDragStart, onDragEnd }: ZoneComponentProps) {
  const shapeRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const cards = useCardsStore((state) => state.cards);
  // Darstellungsmodus des Whiteboards (freie Maße statt quadratischer Karten)
  const freeLayout = useProjectStore((state) =>
    state.projects.find((p) => p.id === zone.projectId)?.cardLayout === 'free'
  );
  const addCardToGroup = useCardsStore((state) => state.addCardToGroup);
  const removeCardFromGroup = useCardsStore((state) => state.removeCardFromGroup);
  const getGroupsByCardId = useCardsStore((state) => state.getGroupsByCardId);
  const minimalZoneDisplay = useZonesStore((state) => state.minimalZoneDisplay);
  const t = useT();

  // Update group membership based on which cards are inside the zone
  const updateCardsInZone = async (zonePos: { x: number; y: number }, zoneWidth: number, zoneHeight: number) => {
    if (!zone.groupId) return;

    const projectCards = cards.filter((c) => c.projectId === zone.projectId);

    for (const card of projectCards) {
      const cardSize = cardDimensions(card, { freeLayout, compact: card.isCompact === true });
      const cardCenterX = card.position.x + cardSize.width / 2;
      const cardCenterY = card.position.y + cardSize.height / 2;

      const isInZone =
        cardCenterX >= zonePos.x &&
        cardCenterX <= zonePos.x + zoneWidth &&
        cardCenterY >= zonePos.y &&
        cardCenterY <= zonePos.y + zoneHeight;

      const cardGroups = getGroupsByCardId(card.id);
      const isInGroup = cardGroups.some((g) => g.id === zone.groupId);

      if (isInZone && !isInGroup) {
        await addCardToGroup(zone.groupId, card.id);
      } else if (!isInZone && isInGroup) {
        await removeCardFromGroup(zone.groupId, card.id);
      }
    }
  };

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    onSelect();
  };

  const handleDblClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true;
    onEditName();
  };

  const handleDragStart = () => {
    onDragStart();
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    onDragEnd();
    const newPos = {
      x: e.target.x(),
      y: e.target.y(),
    };
    onUpdate({ position: newPos });
    // Update which cards are in this zone
    updateCardsInZone(newPos, zone.width, zone.height);
  };

  const handleTransformEnd = () => {
    const node = shapeRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale and apply to size
    node.scaleX(1);
    node.scaleY(1);

    // Get the parent group's position for the zone position
    const group = node.getParent();
    const groupPos = group ? { x: group.x(), y: group.y() } : zone.position;

    // The rect's position within the group might have changed during transform
    const newPos = {
      x: groupPos.x + node.x(),
      y: groupPos.y + node.y()
    };
    const newWidth = Math.max(50, node.width() * scaleX);
    const newHeight = Math.max(50, node.height() * scaleY);

    // Reset rect position within group
    node.x(0);
    node.y(0);

    // Update group position if rect moved
    if (group) {
      group.x(newPos.x);
      group.y(newPos.y);
    }

    onUpdate({
      position: newPos,
      width: newWidth,
      height: newHeight,
    });
    // Update which cards are in this zone
    updateCardsInZone(newPos, newWidth, newHeight);
  };

  // Show group indicator if zone is linked to a group
  const isGroupZone = !!zone.groupId;

  // Minimal display: dashed gray lines, very transparent
  const minimalFill = 'rgba(200, 200, 200, 0.05)';
  const minimalStroke = 'rgba(150, 150, 150, 0.4)';

  // Text offset based on display mode
  const textOffset = minimalZoneDisplay ? 6 : 10;

  return (
    <Group
      x={zone.position.x}
      y={zone.position.y}
      draggable={draggable}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Rect
        ref={shapeRef}
        x={0}
        y={0}
        width={zone.width}
        height={zone.height}
        fill={minimalZoneDisplay ? minimalFill : zone.color}
        stroke={isSelected ? '#5B8DEF' : minimalZoneDisplay ? minimalStroke : isGroupZone ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)'}
        strokeWidth={isSelected ? 2.5 : minimalZoneDisplay ? 1 : 2}
        dash={isSelected ? undefined : [8, 4]}
        cornerRadius={16}
        onTransformEnd={handleTransformEnd}
      />

      {/* Zone name label - clickable for editing */}
      {zone.name && !isEditing && !minimalZoneDisplay && (
        <Text
          x={textOffset}
          y={textOffset}
          text={zone.name}
          fontSize={16}
          fontStyle="bold"
          fill="#1E3A5F"
          fontFamily="ui-rounded, 'SF Pro Rounded', 'Nunito', 'Inter', system-ui, sans-serif"
        />
      )}
      {/* Minimal mode: smaller, lighter name */}
      {zone.name && !isEditing && minimalZoneDisplay && (
        <Text
          x={textOffset}
          y={textOffset}
          text={zone.name}
          fontSize={11}
          fill="rgba(120,120,120,0.6)"
          fontFamily="Inter, system-ui, sans-serif"
        />
      )}

      {/* "Double-tap to edit" hint for unnamed zones */}
      {!zone.name && isSelected && !isEditing && (
        <Text
          x={10}
          y={10}
          text={t('Doppelklick für Name')}
          fontSize={12}
          fill="rgba(0,0,0,0.4)"
          fontFamily="Inter, system-ui, sans-serif"
          fontStyle="italic"
        />
      )}

      {/* Transformer for resizing */}
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            // Limit resize
            if (newBox.width < 50 || newBox.height < 50) {
              return oldBox;
            }
            return newBox;
          }}
          enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']}
          rotateEnabled={false}
          keepRatio={false}
          borderStroke="#5B8DEF"
          anchorFill="#5B8DEF"
          anchorStroke="#ffffff"
          anchorSize={14}
          anchorCornerRadius={3}
        />
      )}
    </Group>
  );
}
