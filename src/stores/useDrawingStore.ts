import { create } from 'zustand';
import type { DrawingPath, Position } from '../types';

const DRAWING_COLORS = [
  '#1f2937', // Dark gray (default)
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
] as const;

const STROKE_WIDTHS = [2, 4, 8] as const;

interface DrawingState {
  // Current drawing paths for active project
  paths: DrawingPath[];
  currentPath: DrawingPath | null;
  isDrawingMode: boolean;
  isErasing: boolean;

  // Tool settings
  currentColor: string;
  strokeWidth: number;

  // Constants
  colors: readonly string[];
  strokeWidths: readonly number[];

  // Actions
  setDrawingMode: (enabled: boolean) => void;
  setErasingMode: (enabled: boolean) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;

  // Drawing actions
  startPath: (point: Position) => void;
  addPoint: (point: Position) => void;
  endPath: () => void;

  // Erasing
  eraseAtPoint: (point: Position, radius: number) => void;

  // Persistence
  loadDrawing: (paths: DrawingPath[]) => void;
  clearDrawing: () => void;
  getPaths: () => DrawingPath[];

  // Undo
  undo: () => void;
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  paths: [],
  currentPath: null,
  isDrawingMode: false,
  isErasing: false,

  currentColor: DRAWING_COLORS[0],
  strokeWidth: STROKE_WIDTHS[1],

  colors: DRAWING_COLORS,
  strokeWidths: STROKE_WIDTHS,

  setDrawingMode: (enabled: boolean) => {
    set({ isDrawingMode: enabled, isErasing: false });
  },

  setErasingMode: (enabled: boolean) => {
    set({ isErasing: enabled, isDrawingMode: enabled ? true : get().isDrawingMode });
  },

  setColor: (color: string) => {
    set({ currentColor: color });
  },

  setStrokeWidth: (width: number) => {
    set({ strokeWidth: width });
  },

  startPath: (point: Position) => {
    const { currentColor, strokeWidth, isErasing } = get();
    if (isErasing) return;

    const newPath: DrawingPath = {
      points: [point],
      color: currentColor,
      strokeWidth,
    };
    set({ currentPath: newPath });
  },

  addPoint: (point: Position) => {
    const { currentPath, isErasing } = get();
    if (isErasing || !currentPath) return;

    set({
      currentPath: {
        ...currentPath,
        points: [...currentPath.points, point],
      },
    });
  },

  endPath: () => {
    const { currentPath, paths } = get();
    if (!currentPath || currentPath.points.length < 2) {
      set({ currentPath: null });
      return;
    }

    set({
      paths: [...paths, currentPath],
      currentPath: null,
    });
  },

  eraseAtPoint: (point: Position, radius: number) => {
    const { paths } = get();

    // Filter out paths that intersect with the erase point
    const remainingPaths = paths.filter((path) => {
      // Check if any point in the path is within the erase radius
      return !path.points.some((p) => {
        const distance = Math.sqrt(
          Math.pow(p.x - point.x, 2) + Math.pow(p.y - point.y, 2)
        );
        return distance < radius;
      });
    });

    set({ paths: remainingPaths });
  },

  loadDrawing: (paths: DrawingPath[]) => {
    set({ paths, currentPath: null });
  },

  clearDrawing: () => {
    set({ paths: [], currentPath: null });
  },

  getPaths: () => {
    return get().paths;
  },

  undo: () => {
    const { paths } = get();
    if (paths.length > 0) {
      set({ paths: paths.slice(0, -1) });
    }
  },
}));
