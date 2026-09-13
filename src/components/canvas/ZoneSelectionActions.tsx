import { useEffect, useState, useCallback } from 'react';
import type { Zone, Position } from '../../types';
import { useZonesStore, useCardsStore, useUIStore } from '../../stores';
import { useT } from '../../i18n';
import { BOTTOM_UI_HEIGHT } from './selectionLayout';

// Zone colors matching the store
const ZONE_COLORS = [
  'rgba(255, 209, 220, 0.4)', // Pastel Pink
  'rgba(174, 198, 207, 0.4)', // Pastel Blue
  'rgba(181, 234, 215, 0.4)', // Pastel Green
  'rgba(253, 253, 150, 0.4)', // Pastel Yellow
  'rgba(224, 187, 228, 0.4)', // Pastel Purple
  'rgba(255, 179, 71, 0.4)', // Pastel Orange
];

interface ZoneSelectionActionsProps {
  zone: Zone;
  canvasScale: number;
  canvasPosition: Position;
  containerWidth: number;
  containerHeight: number;
}

export function ZoneSelectionActions({
  zone,
  canvasScale,
  canvasPosition,
  containerWidth,
  containerHeight,
}: ZoneSelectionActionsProps) {
  const { deleteZone, setSelectedZone, setEditingZone, updateZone } = useZonesStore();
  const { deleteGroup } = useCardsStore();
  const { showToast } = useUIStore();
  const t = useT();

  const [isVisible, setIsVisible] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Calculate screen position of zone center
  const zoneScreenX = zone.position.x * canvasScale + canvasPosition.x;
  const zoneScreenY = zone.position.y * canvasScale + canvasPosition.y;
  const zoneScreenWidth = zone.width * canvasScale;
  const zoneScreenHeight = zone.height * canvasScale;
  const zoneCenterX = zoneScreenX + zoneScreenWidth / 2;
  const zoneCenterY = zoneScreenY + zoneScreenHeight / 2;

  // Button positioning
  const buttonSize = 48;
  const buttonOffset = 20;

  // Calculate positions for action buttons
  const positions = {
    left: {
      x: zoneScreenX - buttonSize - buttonOffset,
      y: zoneCenterY - buttonSize / 2,
    },
    top: {
      x: zoneCenterX - buttonSize / 2,
      y: zoneScreenY - buttonSize - buttonOffset,
    },
    right: {
      x: zoneScreenX + zoneScreenWidth + buttonOffset,
      y: zoneCenterY - buttonSize / 2,
    },
  };

  // Clamp positions to viewport – unten bleibt die Werkzeugleiste frei,
  // sonst liegen die Knöpfe über ihren Menüs und schlucken deren Tipps
  const clampToViewport = (pos: { x: number; y: number }) => ({
    x: Math.max(8, Math.min(pos.x, containerWidth - buttonSize - 8)),
    y: Math.max(8, Math.min(pos.y, containerHeight - BOTTOM_UI_HEIGHT - buttonSize)),
  });

  const clampedPositions = {
    left: clampToViewport(positions.left),
    top: clampToViewport(positions.top),
    right: clampToViewport(positions.right),
  };

  // Handle delete
  const handleDelete = useCallback(async () => {
    // Clear selection first
    setSelectedZone(null);

    // If zone is linked to a group, delete the group (which also deletes the zone)
    if (zone.groupId) {
      await deleteGroup(zone.groupId);
      showToast(t('Gruppe gelöscht'));
    } else {
      await deleteZone(zone.id);
      showToast(t('Bereich gelöscht'));
    }
  }, [zone, deleteZone, deleteGroup, setSelectedZone, showToast, t]);

  // Handle edit (rename)
  const handleEdit = useCallback(() => {
    setEditingZone(zone.id);
  }, [zone.id, setEditingZone]);

  // Handle color change
  const handleColorChange = useCallback(async (color: string) => {
    await updateZone(zone.id, { color });
    setShowColorPicker(false);
    showToast(t('Farbe geändert'));
  }, [zone.id, updateZone, showToast, t]);

  // Get current color for display (extract solid color from rgba)
  const getCurrentColorSolid = () => {
    // Convert rgba to a more visible solid color for the button
    const match = zone.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
    }
    return zone.color;
  };

  return (
    <div className={`pointer-events-none absolute inset-0 z-30 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Delete button - Left */}
      <ActionButton
        position={clampedPositions.left}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        }
        label={t('Löschen')}
        variant="danger"
        onClick={handleDelete}
        delay={0}
      />

      {/* Edit/Rename button - Top */}
      <ActionButton
        position={clampedPositions.top}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        }
        label={t('Umbenennen')}
        variant="primary"
        onClick={handleEdit}
        delay={50}
      />

      {/* Color button - Right */}
      <div
        className="pointer-events-auto absolute"
        style={{
          left: clampedPositions.right.x,
          top: clampedPositions.right.y,
        }}
      >
        <ActionButton
          position={{ x: 0, y: 0 }}
          icon={
            <div
              className="w-6 h-6 rounded-full border-2 border-white shadow-inner"
              style={{ backgroundColor: getCurrentColorSolid() }}
            />
          }
          label={t('Farbe ändern')}
          onClick={() => setShowColorPicker(!showColorPicker)}
          delay={100}
          isRelative
        />

        {/* Color picker popover */}
        {showColorPicker && (
          <div className="absolute top-full mt-2 right-0 bg-white rounded-xl shadow-lg p-3 animate-in slide-in-from-bottom-2 z-40">
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                {ZONE_COLORS.slice(0, 3).map((color, index) => {
                  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                  const solidColor = match ? `rgb(${match[1]}, ${match[2]}, ${match[3]})` : color;
                  const isSelected = zone.color === color;

                  return (
                    <button
                      key={index}
                      onClick={() => handleColorChange(color)}
                      className={`w-10 h-10 rounded-full border-2 transition-transform active:scale-90 flex-shrink-0 ${
                        isSelected ? 'border-gray-800 scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: solidColor }}
                      aria-label={t('Farbe {n}', { n: index + 1 })}
                    />
                  );
                })}
              </div>
              <div className="flex gap-3">
                {ZONE_COLORS.slice(3, 6).map((color, index) => {
                  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                  const solidColor = match ? `rgb(${match[1]}, ${match[2]}, ${match[3]})` : color;
                  const isSelected = zone.color === color;

                  return (
                    <button
                      key={index + 3}
                      onClick={() => handleColorChange(color)}
                      className={`w-10 h-10 rounded-full border-2 transition-transform active:scale-90 flex-shrink-0 ${
                        isSelected ? 'border-gray-800 scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: solidColor }}
                      aria-label={t('Farbe {n}', { n: index + 4 })}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ActionButtonProps {
  position: { x: number; y: number };
  icon: React.ReactNode;
  label: string;
  variant?: 'default' | 'primary' | 'danger';
  onClick: () => void;
  delay: number;
  isRelative?: boolean;
}

function ActionButton({ position, icon, label, variant = 'default', onClick, delay, isRelative = false }: ActionButtonProps) {
  const [isAnimated, setIsAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsAnimated(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const variantClasses = {
    default: 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200',
    primary: 'bg-gray-900 text-white hover:bg-gray-800',
    danger: 'bg-red-100 text-red-700 hover:bg-red-200',
  };

  const positionStyle = isRelative
    ? {}
    : { left: position.x, top: position.y };

  return (
    <button
      className={`
        ${isRelative ? 'relative' : 'pointer-events-auto absolute'} w-12 h-12 rounded-full shadow-lg
        flex items-center justify-center transition-all duration-200
        active:scale-90 ${variantClasses[variant]}
        ${isAnimated ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}
      `}
      style={{
        ...positionStyle,
        transitionDelay: `${delay}ms`,
      }}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}
