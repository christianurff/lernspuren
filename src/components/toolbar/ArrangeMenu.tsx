import { useState, useRef, useEffect } from 'react';
import { useCanvasStore, useCardsStore, useUIStore, useProjectStore, useScenesStore, useSettingsStore } from '../../stores';
import { IconButton } from '../common';
import { useT } from '../../i18n';

interface ArrangeMenuProps {
  isOpen: boolean;
  onClose: () => void;
  viewportWidth: number;
  viewportHeight: number;
}

export function ArrangeMenu({ isOpen, onClose, viewportWidth, viewportHeight }: ArrangeMenuProps) {
  const t = useT();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const { scale, zoomIn, zoomOut, resetView, zoomToFit } = useCanvasStore();
  const {
    stackAllCards,
    arrangeInGrid,
    cards,
    sortAndArrangeCards,
    currentSortCriteria,
    clearSort,
    groups,
  } = useCardsStore();
  const { showToast } = useUIStore();
  const { currentProjectId } = useProjectStore();
  const { toggleScenesPanel, isScenesPanelOpen, getScenesForProject } = useScenesStore();
  const { complexityLevel } = useSettingsStore();

  // Get scene count for badge
  const projectScenes = currentProjectId ? getScenesForProject(currentProjectId) : [];

  // Filter groups by current project
  const projectGroups = groups.filter((g) => g.projectId === currentProjectId);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
        setShowSortMenu(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleStackAll = async () => {
    if (cards.length === 0) {
      showToast(t('Keine Karten vorhanden'));
      return;
    }
    const boundingBox = await stackAllCards();
    if (boundingBox) {
      const marginLeft = 80;
      const marginTop = 80;
      const newPosition = {
        x: marginLeft - boundingBox.minX,
        y: marginTop - boundingBox.minY,
      };
      useCanvasStore.getState().setScale(1);
      useCanvasStore.getState().setPosition(newPosition);
      showToast(t('Alle Karten gestapelt'));
    }
    onClose();
  };

  const handleArrangeGrid = async () => {
    if (cards.length === 0) {
      showToast(t('Keine Karten vorhanden'));
      return;
    }
    const boundingBox = await arrangeInGrid(viewportWidth, viewportHeight);
    if (boundingBox) {
      zoomToFit(boundingBox, viewportWidth, viewportHeight);
      showToast(t('Karten angeordnet'));
    }
    onClose();
  };

  const handleSort = async (criteria: 'date-newest' | 'date-oldest' | 'type' | 'size' | 'label' | 'groups') => {
    if (cards.length === 0) {
      showToast(t('Keine Karten vorhanden'));
      return;
    }
    if (criteria === 'groups' && projectGroups.length === 0) {
      showToast(t('Keine Gruppen vorhanden'));
      return;
    }
    const boundingBox = await sortAndArrangeCards(criteria, viewportWidth, viewportHeight);
    if (boundingBox) {
      zoomToFit(boundingBox, viewportWidth, viewportHeight);
      const sortLabels: Record<string, string> = {
        'date-newest': t('Neueste zuerst'),
        'date-oldest': t('Älteste zuerst'),
        'type': t('Nach Typ'),
        'size': t('Nach Größe'),
        'label': t('Nach Name'),
        'groups': t('Nach Gruppen (Venn)'),
      };
      showToast(t('Sortiert: {label}', { label: sortLabels[criteria] }));
    }
    setShowSortMenu(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-2"
    >
      <div className="bg-white/90 backdrop-blur-md rounded-[20px] shadow-xl p-3">
        {/* Main arrange actions */}
        <div className="flex items-center gap-2 mb-3">
          {/* Stack all */}
          <button
            onClick={handleStackAll}
            className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-primary-blue/10 transition-colors active:scale-90"
          >
            <div className="w-12 h-12 flex items-center justify-center bg-white rounded-full shadow-sm border border-white/60">
              <svg className="w-5 h-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="text-xs font-medium text-ink-soft">{t('Stapeln')}</span>
          </button>

          {/* Grid layout */}
          <button
            onClick={handleArrangeGrid}
            className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-primary-blue/10 transition-colors active:scale-90"
          >
            <div className="w-12 h-12 flex items-center justify-center bg-white rounded-full shadow-sm border border-white/60">
              <svg className="w-5 h-5 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-ink-soft">{t('Raster')}</span>
          </button>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors active:scale-90 ${
                currentSortCriteria || showSortMenu ? 'bg-primary-blue/10' : 'hover:bg-primary-blue/10'
              }`}
            >
              <div className={`w-12 h-12 flex items-center justify-center rounded-full shadow-sm border ${
                currentSortCriteria ? 'bg-primary-blue text-white border-primary-blue' : 'bg-white text-ink-soft border-white/60'
              }`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
              </div>
              <span className={`text-xs font-medium ${currentSortCriteria ? 'text-primary-blue' : 'text-ink-soft'}`}>{t('Sortieren')}</span>
            </button>

            {showSortMenu && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md rounded-xl shadow-xl py-2 min-w-[180px] z-40 animate-in slide-in-from-bottom-2">
                <SortMenuItem
                  label={t('Neueste zuerst')}
                  active={currentSortCriteria === 'date-newest'}
                  onClick={() => handleSort('date-newest')}
                />
                <SortMenuItem
                  label={t('Älteste zuerst')}
                  active={currentSortCriteria === 'date-oldest'}
                  onClick={() => handleSort('date-oldest')}
                />
                <SortMenuItem
                  label={t('Nach Typ')}
                  active={currentSortCriteria === 'type'}
                  onClick={() => handleSort('type')}
                />
                <SortMenuItem
                  label={t('Nach Größe')}
                  active={currentSortCriteria === 'size'}
                  onClick={() => handleSort('size')}
                />
                <SortMenuItem
                  label={t('Nach Name')}
                  active={currentSortCriteria === 'label'}
                  onClick={() => handleSort('label')}
                />
                {currentSortCriteria && (
                  <>
                    <div className="border-t my-1" />
                    <button
                      onClick={() => {
                        clearSort();
                        setShowSortMenu(false);
                        showToast(t('Sortierung aufgehoben'));
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50"
                    >
                      {t('Sortierung aufheben')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Scenes button — nur bei Funktionsumfang „Erweitert" */}
          {complexityLevel >= 3 && (
          <button
            onClick={() => {
              toggleScenesPanel();
              onClose();
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors active:scale-90 ${
              isScenesPanelOpen ? 'bg-primary-blue/10' : 'hover:bg-primary-blue/10'
            }`}
          >
            <div className={`w-12 h-12 flex items-center justify-center rounded-full shadow-sm border relative ${
              isScenesPanelOpen ? 'bg-primary-blue text-white border-primary-blue' : 'bg-white text-ink-soft border-white/60'
            }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2m0 2a2 2 0 00-2 2v1m0 0h2m-2 0a2 2 0 00-2 2v9a2 2 0 002 2h2m0 0v2m0-2a2 2 0 002-2v-1m0 0h-2m2 0a2 2 0 002-2V6a2 2 0 00-2-2h-2m10 0V2m0 2a2 2 0 012 2v1m0 0h-2m2 0a2 2 0 012 2v9a2 2 0 01-2 2h-2m0 0v2m0-2a2 2 0 01-2-2v-1m0 0h2m-2 0a2 2 0 01-2-2V6a2 2 0 012-2h2" />
              </svg>
              {projectScenes.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {projectScenes.length}
                </span>
              )}
            </div>
            <span className={`text-xs font-medium ${isScenesPanelOpen ? 'text-primary-blue' : 'text-ink-soft'}`}>{t('Szenen')}</span>
          </button>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-200">
          <IconButton
            label={t('Verkleinern')}
            size="sm"
            onClick={zoomOut}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </IconButton>

          <button
            onClick={resetView}
            className="px-3 py-2 text-sm font-medium text-ink-soft hover:bg-primary-blue/10 rounded-lg transition-colors"
            title={t('Zurücksetzen')}
          >
            {Math.round(scale * 100)}%
          </button>

          <IconButton
            label={t('Vergrößern')}
            size="sm"
            onClick={zoomIn}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </IconButton>
        </div>
      </div>
    </div>
  );
}

interface SortMenuItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function SortMenuItem({ label, active, onClick }: SortMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between transition-colors ${
        active ? 'bg-primary-blue/10 text-primary-blue' : 'text-ink hover:bg-primary-blue/10'
      }`}
    >
      <span>{label}</span>
      {active && (
        <svg className="w-4 h-4 text-primary-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
