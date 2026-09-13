import { Line } from 'react-konva';
import { useDrawingStore } from '../../stores';

export function DrawingLayer() {
  const { paths, currentPath } = useDrawingStore();

  return (
    <>
      {/* Completed paths */}
      {paths.map((path, index) => (
        <Line
          key={index}
          points={path.points.flatMap((p) => [p.x, p.y])}
          stroke={path.color}
          strokeWidth={path.strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.5}
          globalCompositeOperation="source-over"
        />
      ))}

      {/* Current path being drawn */}
      {currentPath && currentPath.points.length > 0 && (
        <Line
          points={currentPath.points.flatMap((p) => [p.x, p.y])}
          stroke={currentPath.color}
          strokeWidth={currentPath.strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.5}
          globalCompositeOperation="source-over"
        />
      )}
    </>
  );
}
