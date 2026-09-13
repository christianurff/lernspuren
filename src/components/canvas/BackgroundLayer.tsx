import { useEffect, useMemo, useState } from 'react';
import { Layer, Rect, Shape, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { Context } from 'konva/lib/Context';
import { GRID_SIZE } from '../../stores/useCanvasStore';

interface BackgroundLayerProps {
  width: number;
  height: number;
  backgroundColor: string;
  showGrid: boolean;
  scale: number;
  position: { x: number; y: number };
  // Hintergrundbild (Vorlagen / Lehrkraft-Modus), in Welt-Koordinaten ab (0,0)
  backgroundImage?: string;
  backgroundImageWidth?: number;
  backgroundImageHeight?: number;
}

export function BackgroundLayer({
  width,
  height,
  backgroundColor,
  showGrid,
  scale,
  position,
  backgroundImage,
  backgroundImageWidth,
  backgroundImageHeight,
}: BackgroundLayerProps) {
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!backgroundImage) {
      setBgImage(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.src = backgroundImage;
    img.onload = () => {
      if (!cancelled) setBgImage(img);
    };
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [backgroundImage]);

  // Calculate visible area in world coordinates
  // The viewport shows from (-position.x/scale) to ((-position.x + width) / scale)
  const viewportLeft = -position.x / scale;
  const viewportTop = -position.y / scale;
  const viewportRight = viewportLeft + width / scale;
  const viewportBottom = viewportTop + height / scale;

  // Gerundete Grenzen als Memo-Schlüssel: neu berechnen nur bei echter Verschiebung
  const roundedLeft = Math.round(viewportLeft);
  const roundedTop = Math.round(viewportTop);
  const roundedRight = Math.round(viewportRight);
  const roundedBottom = Math.round(viewportBottom);

  // Punkte-Raster wie in der iOS-App (GridPatternView): 3px-Punkte, 40er-Raster.
  // Als eine einzige Shape gezeichnet – sonst entstünden pro Render hunderte Konva-Knoten.
  const gridSceneFunc = useMemo(() => {
    if (!showGrid) return null;

    // Beim Herauszoomen Rasterweite verdoppeln, damit die Punktzahl begrenzt bleibt
    let spacing = GRID_SIZE;
    while (spacing * scale < 24) {
      spacing *= 2;
    }

    const startX = Math.floor(viewportLeft / spacing) * spacing;
    const startY = Math.floor(viewportTop / spacing) * spacing;
    const endX = viewportRight;
    const endY = viewportBottom;
    const dotRadius = 1.5 / scale;

    return (ctx: Context, shape: Konva.Shape) => {
      ctx.beginPath();
      for (let x = startX; x <= endX; x += spacing) {
        for (let y = startY; y <= endY; y += spacing) {
          ctx.moveTo(x + dotRadius, y);
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2, false);
        }
      }
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    };
    // viewport*-Werte stammen aus den gerundeten Grenzen unten (bewusst nicht in den Deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGrid, scale, roundedLeft, roundedTop, roundedRight, roundedBottom]);

  return (
    <Layer listening={false}>
      <Rect
        x={-10000}
        y={-10000}
        width={20000}
        height={20000}
        fill={backgroundColor}
      />
      {/* Hintergrundbild (multiply, damit weiße Flächen transparent wirken — wie iOS) */}
      {backgroundImage && bgImage && (
        <KonvaImage
          image={bgImage}
          x={0}
          y={0}
          width={backgroundImageWidth ?? bgImage.naturalWidth}
          height={backgroundImageHeight ?? bgImage.naturalHeight}
          globalCompositeOperation="multiply"
        />
      )}
      {gridSceneFunc && (
        <Shape sceneFunc={gridSceneFunc} fill="rgba(107,114,128,0.25)" listening={false} />
      )}
    </Layer>
  );
}
