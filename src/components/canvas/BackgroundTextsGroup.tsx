import { Group, Label, Tag, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { FONT_FAMILY } from '../../theme';
import { useUIStore } from '../../stores';
import { useBackgroundTextsStore } from '../../stores/useBackgroundTextsStore';
import type { BackgroundText } from '../../types';

interface BackgroundTextsGroupProps {
  projectId: string;
}

/**
 * Rendert die freien Hintergrund-Beschriftungen (Lehrkraft-Feature) innerhalb
 * einer bestehenden Konva-Layer. Gibt bewusst ein <Group> zurück, KEINE Layer.
 *
 * - Lehrkraft-Modus: Beschriftungen sind verschiebbar und per Doppelklick/-tipp
 *   bearbeitbar.
 * - Kind-Modus: reiner Hintergrund (listening=false), nicht anklickbar oder
 *   verschiebbar.
 */
export function BackgroundTextsGroup({ projectId }: BackgroundTextsGroupProps) {
  const { texts, updateText } = useBackgroundTextsStore();
  const { isTeacherMode, openModal } = useUIStore();

  const projectTexts = texts.filter((t) => t.projectId === projectId);

  const handleDragEnd =
    (t: BackgroundText) => (e: KonvaEventObject<DragEvent>) => {
      const node = e.target;
      updateText(t.id, { position: { x: node.x(), y: node.y() } });
    };

  const handleEdit =
    (t: BackgroundText) => (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isTeacherMode) return;
      e.cancelBubble = true;
      openModal('backgroundTextEditor', t);
    };

  return (
    <Group>
      {projectTexts.map((t) => (
        <Label
          key={t.id}
          x={t.position.x}
          y={t.position.y}
          draggable={isTeacherMode}
          listening={isTeacherMode}
          onDragEnd={handleDragEnd(t)}
          onDblClick={handleEdit(t)}
          onDblTap={handleEdit(t)}
        >
          <Tag fill="rgba(255,255,255,0.6)" cornerRadius={8} />
          <Text
            text={t.text}
            fontSize={t.fontSize}
            fill={t.color}
            fontFamily={FONT_FAMILY}
            fontStyle="600"
            padding={8}
          />
        </Label>
      ))}
    </Group>
  );
}
