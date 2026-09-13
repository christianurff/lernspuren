import { create } from 'zustand';
import type { Position } from '../types';

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

interface CanvasState {
  scale: number;
  position: Position;
  targetScale: number;
  targetPosition: Position;
  isAnimating: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  isDragging: boolean;

  // Actions
  setScale: (scale: number) => void;
  setPosition: (position: Position) => void;
  animateTo: (scale: number, position: Position) => void;
  updateAnimation: (scale: number, position: Position, done: boolean) => void;
  toggleGrid: () => void;
  toggleSnapToGrid: () => void;
  setIsDragging: (isDragging: boolean) => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: (boundingBox: BoundingBox, viewportWidth: number, viewportHeight: number) => void;
}

// Zoombereich wie in der iOS-App
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.15;
const PADDING = 60; // Padding around content when zooming to fit

// Rastermaß wie in der iOS-App (Snap-to-Grid)
export const GRID_SIZE = 40;

export const useCanvasStore = create<CanvasState>((set, get) => ({
  scale: 1,
  position: { x: 0, y: 0 },
  targetScale: 1,
  targetPosition: { x: 0, y: 0 },
  isAnimating: false,
  showGrid: false,
  snapToGrid: false,
  isDragging: false,

  setScale: (scale: number) => {
    set({ scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) });
  },

  setPosition: (position: Position) => {
    set({ position });
  },

  animateTo: (scale: number, position: Position) => {
    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    set({
      targetScale: clampedScale,
      targetPosition: position,
      isAnimating: true,
    });
  },

  updateAnimation: (scale: number, position: Position, done: boolean) => {
    set({
      scale,
      position,
      isAnimating: !done,
    });
  },

  toggleGrid: () => {
    set((state) => ({ showGrid: !state.showGrid }));
  },

  toggleSnapToGrid: () => {
    set((state) => ({ snapToGrid: !state.snapToGrid }));
  },

  setIsDragging: (isDragging: boolean) => {
    set({ isDragging });
  },

  resetView: () => {
    const { animateTo } = get();
    animateTo(1, { x: 0, y: 0 });
  },

  zoomIn: () => {
    const { scale, position, animateTo } = get();
    animateTo(Math.min(MAX_SCALE, scale + ZOOM_STEP), position);
  },

  zoomOut: () => {
    const { scale, position, animateTo } = get();
    animateTo(Math.max(MIN_SCALE, scale - ZOOM_STEP), position);
  },

  zoomToFit: (boundingBox: BoundingBox, viewportWidth: number, viewportHeight: number) => {
    // Calculate scale to fit content with padding
    const availableWidth = viewportWidth - PADDING * 2;
    const availableHeight = viewportHeight - PADDING * 2;

    const scaleX = availableWidth / boundingBox.width;
    const scaleY = availableHeight / boundingBox.height;
    // Limit to 100% max zoom when fitting - don't zoom in beyond original size
    const newScale = Math.min(1, Math.max(MIN_SCALE, Math.min(scaleX, scaleY)));

    // Calculate position to center the content
    const contentCenterX = boundingBox.minX + boundingBox.width / 2;
    const contentCenterY = boundingBox.minY + boundingBox.height / 2;

    const newPosition = {
      x: viewportWidth / 2 - contentCenterX * newScale,
      y: viewportHeight / 2 - contentCenterY * newScale,
    };

    const { animateTo } = get();
    animateTo(newScale, newPosition);
  },
}));
