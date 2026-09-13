import { useState, useRef, useEffect } from 'react';
import { IconButton } from '../common';
import { BottomToolbar } from './BottomToolbar';
import { DrawingToolbar } from './DrawingToolbar';
import { MoreMenu } from './MoreMenu';
import { ArrangeMenu } from './ArrangeMenu';
import { focusInlineEditField } from '../canvas/inlineEditFocus';
import { useUIStore, useProjectStore, useHistoryStore, useSettingsStore, useCanvasStore, usePlaybackStore } from '../../stores';
import { useT } from '../../i18n';

interface CanvasToolbarProps {
  onBack: () => void;
  projectName: string;
  viewportWidth: number;
  viewportHeight: number;
}

export function CanvasToolbar({ onBack, projectName, viewportWidth, viewportHeight }: CanvasToolbarProps) {
  const t = useT();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showArrangeMenu, setShowArrangeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const { openModal, showToast, isTeacherMode } = useUIStore();
  const { currentProjectId, updateProject } = useProjectStore();
  const { canUndo, canRedo, undo, redo } = useHistoryStore();
  const { complexityLevel } = useSettingsStore();
  const { scale, position } = useCanvasStore();
  const { hasEvents, start: startPlayback } = usePlaybackStore();
  const bgImageInputRef = useRef<HTMLInputElement>(null);

  // Bildschirmmitte in Welt-Koordinaten (für neue Beschriftungen)
  const viewportCenter = {
    x: (viewportWidth / 2 - position.x) / scale,
    y: (viewportHeight / 2 - position.y) / scale,
  };

  // Hintergrundbild wählen (Lehrkraft-Modus): auf Weltbreite 1200 normieren
  const handleBackgroundImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentProjectId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new window.Image();
      img.onload = async () => {
        const worldWidth = 1200;
        const worldHeight = worldWidth * (img.naturalHeight / img.naturalWidth);
        await updateProject(currentProjectId, {
          backgroundImage: dataUrl,
          backgroundImageWidth: worldWidth,
          backgroundImageHeight: worldHeight,
        });
        showToast(t('Hintergrundbild gesetzt'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Project name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(projectName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    };

    if (showAddMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAddMenu]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Update editedName when projectName changes externally
  useEffect(() => {
    setEditedName(projectName);
  }, [projectName]);

  const handleNameDoubleClick = () => {
    setIsEditingName(true);
  };

  const handleNameSave = async () => {
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== projectName && currentProjectId) {
      await updateProject(currentProjectId, { name: trimmedName });
      showToast(t('Projektname geändert'));
    } else {
      setEditedName(projectName);
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      setEditedName(projectName);
      setIsEditingName(false);
    }
  };

  return (
    <>
      {/* Top toolbar - simplified */}
      <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between p-4">
          {/* Back button and title */}
          <div className="flex items-center gap-3 pointer-events-auto">
            <IconButton label={t('Zurück')} onClick={onBack} size="lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </IconButton>
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={handleNameKeyDown}
                className="text-[17px] font-semibold text-ink bg-white px-4 py-2 rounded-full border-2 border-primary-blue outline-none min-w-[120px] shadow-sm"
              />
            ) : (
              <h1
                className="text-[17px] font-semibold text-ink bg-white/70 backdrop-blur-md px-4 py-2 rounded-full cursor-pointer hover:bg-white/90 transition-colors shadow-sm"
                onDoubleClick={handleNameDoubleClick}
                title={t('Doppelklick zum Bearbeiten')}
              >
                {projectName}
              </h1>
            )}
          </div>

          {/* Right side: Play + Undo/Redo cluster + More menu */}
          <div className="flex items-center gap-3 pointer-events-auto">
            {/* Wiedergabe der Lernspur (nur wenn Ereignisse existieren, wie iOS) */}
            {hasEvents && (
              <button
                onClick={() => currentProjectId && startPlayback(currentProjectId)}
                aria-label={t('Entstehung abspielen')}
                title={t('Entstehung abspielen')}
                className="w-11 h-11 rounded-full bg-white/70 backdrop-blur-md shadow-sm flex items-center justify-center text-primary-purple transition-all duration-200 active:scale-90 hover:bg-white/90"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 9l5 3-5 3V9z" />
                </svg>
              </button>
            )}

            {/* Undo/Redo cluster */}
            <div className="flex items-center bg-white/70 backdrop-blur-md rounded-full shadow-sm">
              <button
                onClick={undo}
                disabled={!canUndo}
                aria-label={t('Rückgängig')}
                title={t('Rückgängig')}
                className={`w-11 h-11 rounded-full flex items-center justify-center text-ink transition-all duration-200 active:scale-90 ${
                  canUndo ? 'hover:bg-black/5' : 'opacity-40'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l-5-5 5-5M4 9h10a5 5 0 010 10h-3" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                aria-label={t('Wiederholen')}
                title={t('Wiederholen')}
                className={`w-11 h-11 rounded-full flex items-center justify-center text-ink transition-all duration-200 active:scale-90 ${
                  canRedo ? 'hover:bg-black/5' : 'opacity-40'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 14l5-5-5-5M20 9h-10a5 5 0 000 10h3" />
                </svg>
              </button>
            </div>

            {/* More menu button */}
            <div className="relative" ref={moreMenuRef}>
              <IconButton
                label={t('Mehr')}
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                size="lg"
                variant={showMoreMenu ? 'primary' : 'default'}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </IconButton>
              <MoreMenu isOpen={showMoreMenu} onClose={() => setShowMoreMenu(false)} />
            </div>
          </div>
        </div>
      </div>

      {/* Add Menu Popover */}
      {showAddMenu && (
        <div
          ref={addMenuRef}
          className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md rounded-[24px] shadow-xl py-3 px-2 min-w-[220px] z-30 animate-in slide-in-from-bottom-2"
        >
          <h2 className="text-ink font-bold text-lg text-center mb-2 px-2">{t('Was möchtest du hinzufügen?')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {/* Take Photo (Camera) */}
            <AddCardButton
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              label={t('Foto')}
              color="#FF8FAB"
              onClick={() => {
                openModal('addCard', { type: 'photo-camera' });
                setShowAddMenu(false);
              }}
            />

            {/* Gallery (Photos & Videos from library) */}
            <AddCardButton
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
              label={t('Galerie')}
              color="#FFB347"
              onClick={() => {
                openModal('addCard', { type: 'gallery' });
                setShowAddMenu(false);
              }}
            />

            {/* Add Text */}
            <AddCardButton
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
              label={t('Text')}
              color="#5B8DEF"
              onClick={() => {
                // Tastatur auf iOS: Der Fokus muss in der Geste gesetzt werden.
                // Das Eingabefeld hängt dauerhaft im DOM (InlineEditOverlay) und
                // rückt an die Karte, sobald sie angelegt ist (AddCardModal).
                focusInlineEditField('content', '');
                openModal('addCard', { type: 'text' });
                setShowAddMenu(false);
              }}
            />

            {/* Add Drawing (ab Funktionsumfang Standard) */}
            {complexityLevel >= 2 && (
              <AddCardButton
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                }
                label={t('Zeichnung')}
                color="#FFE066"
                iconDark
                onClick={() => {
                  openModal('addCard', { type: 'drawing' });
                  setShowAddMenu(false);
                }}
              />
            )}

            {/* Add Video (ab Funktionsumfang Standard) */}
            {complexityLevel >= 2 && (
              <AddCardButton
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                }
                label={t('Video')}
                color="#B088F9"
                onClick={() => {
                  openModal('addCard', { type: 'video' });
                  setShowAddMenu(false);
                }}
              />
            )}

            {/* Add Audio */}
            <AddCardButton
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              }
              label={t('Audio')}
              color="#6BCB77"
              onClick={() => {
                openModal('addCard', { type: 'audio' });
                setShowAddMenu(false);
              }}
            />

            {/* Aufgabe (nur im Lehrkraft-Modus, wie iOS) */}
            {isTeacherMode && (
              <AddCardButton
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                }
                label={t('Aufgabe')}
                color="#FF6B6B"
                onClick={() => {
                  openModal('taskEditor');
                  setShowAddMenu(false);
                }}
              />
            )}

            {/* Beschriftung (nur im Lehrkraft-Modus, wie iOS) */}
            {isTeacherMode && (
              <AddCardButton
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h6" />
                  </svg>
                }
                label={t('Beschriftung')}
                color="#06B6D4"
                onClick={() => {
                  openModal('backgroundTextEditor', { defaultPosition: viewportCenter });
                  setShowAddMenu(false);
                }}
              />
            )}

            {/* Hintergrundbild (nur im Lehrkraft-Modus, wie iOS) */}
            {isTeacherMode && (
              <AddCardButton
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2zM9 8h.01" />
                  </svg>
                }
                label={t('Hintergrund')}
                color="#8B5CF6"
                onClick={() => {
                  bgImageInputRef.current?.click();
                  setShowAddMenu(false);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Verstecktes Datei-Input für das Hintergrundbild */}
      <input
        ref={bgImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleBackgroundImageSelected}
      />

      {/* Drawing toolbar - appears when drawing mode is active */}
      <DrawingToolbar />

      {/* Arrange menu - appears when arrange button is pressed */}
      <ArrangeMenu
        isOpen={showArrangeMenu}
        onClose={() => setShowArrangeMenu(false)}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
      />

      {/* Bottom toolbar with 5 main buttons */}
      <BottomToolbar
        onShowAddMenu={() => setShowAddMenu(!showAddMenu)}
        onShowArrangeMenu={() => setShowArrangeMenu(!showArrangeMenu)}
        isAddMenuOpen={showAddMenu}
        isArrangeMenuOpen={showArrangeMenu}
      />
    </>
  );
}

interface AddCardButtonProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  iconDark?: boolean;
  onClick: () => void;
}

function AddCardButton({ icon, label, color, iconDark = false, onClick }: AddCardButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-black/5 transition-colors active:scale-95"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${color}, ${color}B3)`,
          boxShadow: `0 4px 8px ${color}4D`,
          color: iconDark ? '#1E3A5F' : '#FFFFFF',
        }}
      >
        {icon}
      </div>
      <span className="text-xs font-medium text-ink">{label}</span>
    </button>
  );
}
