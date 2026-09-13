import { useState } from 'react';
import { useDrawingStore, useUIStore } from '../../stores';
import { IconButton } from '../common';
import { useT } from '../../i18n';

export function DrawingToolbar() {
  const { showToast } = useUIStore();
  const t = useT();
  const {
    isDrawingMode,
    isErasing,
    currentColor,
    strokeWidth,
    colors,
    strokeWidths,
    setErasingMode,
    setColor,
    setStrokeWidth,
    undo,
    clearDrawing,
  } = useDrawingStore();

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokeWidth, setShowStrokeWidth] = useState(false);

  if (!isDrawingMode) return null;

  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 bg-white/80 backdrop-blur-md rounded-[20px] shadow-lg p-2">
        {/* Pen tool */}
        <IconButton
          label={t('Stift')}
          size="md"
          variant={!isErasing ? 'primary' : 'default'}
          onClick={() => {
            setErasingMode(false);
            showToast(t('Stift'));
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </IconButton>

        {/* Eraser */}
        <IconButton
          label={t('Radierer')}
          size="md"
          variant={isErasing ? 'danger' : 'default'}
          onClick={() => {
            setErasingMode(!isErasing);
            showToast(isErasing ? t('Stift') : t('Radierer'));
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </IconButton>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-300" />

        {/* Color picker */}
        <div className="relative">
          <IconButton
            label={t('Farbe')}
            size="md"
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowStrokeWidth(false);
            }}
          >
            <div
              className="w-6 h-6 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: currentColor }}
            />
          </IconButton>
          {showColorPicker && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg p-3 animate-in slide-in-from-bottom-2">
              <div className="flex flex-wrap gap-2 w-32">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      setColor(color);
                      setShowColorPicker(false);
                    }}
                    className={`w-8 h-8 rounded-full transition-transform active:scale-90 ${
                      currentColor === color ? 'scale-110' : ''
                    }`}
                    style={{
                      backgroundColor: color,
                      boxShadow:
                        currentColor === color
                          ? `0 0 0 3px #FFFFFF, 0 0 0 4px rgba(0,0,0,0.1), 0 0 8px ${color}`
                          : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                    }}
                    aria-label={t('Farbe {color}', { color })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Stroke width */}
        <div className="relative">
          <IconButton
            label={t('Strichstärke')}
            size="md"
            onClick={() => {
              setShowStrokeWidth(!showStrokeWidth);
              setShowColorPicker(false);
            }}
          >
            <div className="flex items-center justify-center w-6 h-6">
              <div
                className="rounded-full bg-current"
                style={{ width: Math.min(strokeWidth * 2, 20), height: Math.min(strokeWidth * 2, 20) }}
              />
            </div>
          </IconButton>
          {showStrokeWidth && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg p-2 animate-in slide-in-from-bottom-2">
              <div className="flex flex-col gap-2">
                {strokeWidths.map((width) => (
                  <button
                    key={width}
                    onClick={() => {
                      setStrokeWidth(width);
                      setShowStrokeWidth(false);
                    }}
                    className={`flex items-center justify-center w-12 h-12 rounded-lg transition-colors active:scale-90 ${
                      strokeWidth === width ? 'bg-pastel-blue' : 'hover:bg-gray-100'
                    }`}
                    aria-label={t('Strichstärke {width}', { width })}
                  >
                    <div
                      className="rounded-full bg-gray-800"
                      style={{ width: width * 2, height: width * 2 }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-300" />

        {/* Undo */}
        <IconButton
          label={t('Zurück')}
          size="md"
          onClick={undo}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </IconButton>

        {/* Clear all */}
        <button
          aria-label={t('Löschen')}
          title={t('Löschen')}
          onClick={() => {
            clearDrawing();
            showToast(t('Zeichnung gelöscht'));
          }}
          className="w-12 h-12 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-all duration-200 active:scale-90 touch-target"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
