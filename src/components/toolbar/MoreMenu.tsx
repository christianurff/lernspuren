import { useRef, useEffect } from 'react';
import { useCanvasStore, useUIStore, useZonesStore, useCardsStore, useProjectStore } from '../../stores';
import { duplicateProject } from '../../services/projectDuplication';
import { useT } from '../../i18n';

interface MoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MoreMenu({ isOpen, onClose }: MoreMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { showGrid, toggleGrid, snapToGrid, toggleSnapToGrid } = useCanvasStore();
  const { openModal, showToast, globalCompactView, toggleGlobalCompactView, isTeacherMode, toggleTeacherMode } = useUIStore();
  const { minimalZoneDisplay, toggleMinimalZoneDisplay, getZonesForProject } = useZonesStore();
  const { groups, setCardLayout } = useCardsStore();
  const { currentProjectId, getCurrentProject, updateProject } = useProjectStore();
  const t = useT();

  const currentProject = getCurrentProject();
  // Darstellungsmodus des Whiteboards (Standard: quadratische Karten)
  const isFreeLayout = currentProject?.cardLayout === 'free';

  // Get zones for current project
  const projectZones = currentProjectId ? getZonesForProject(currentProjectId) : [];
  const projectGroups = groups.filter((g) => g.projectId === currentProjectId);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute top-full mt-2 right-0 bg-white/95 backdrop-blur-md rounded-[20px] shadow-xl py-2 min-w-[200px] z-30 animate-in slide-in-from-bottom-2"
    >
      {/* Lehrkraft-Modus (wie iOS: schaltet Aufgabenkarten frei) */}
      <MenuItem
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        }
        label={t('Lehrkraft-Modus')}
        active={isTeacherMode}
        onClick={() => {
          toggleTeacherMode();
          showToast(isTeacherMode ? t('Kind-Modus aktiviert') : t('Lehrkraft-Modus aktiviert'));
        }}
      />

      {/* Divider */}
      <div className="h-px bg-gray-200 my-2" />

      {/* Grid toggle */}
      <MenuItem
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM8 4v16M12 4v16M16 4v16M4 8h16M4 12h16M4 16h16" />
          </svg>
        }
        label={t('Raster')}
        active={showGrid}
        onClick={() => {
          toggleGrid();
          showToast(showGrid ? t('Raster ausgeblendet') : t('Raster eingeblendet'));
        }}
      />

      {/* Snap to grid toggle */}
      <MenuItem
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4zm12 0h4v4h-4v-4z" />
          </svg>
        }
        label={t('Am Raster ausrichten')}
        active={snapToGrid}
        onClick={() => {
          toggleSnapToGrid();
          showToast(snapToGrid ? t('Rasterausrichtung deaktiviert') : t('Am Raster ausrichten aktiviert'));
        }}
      />

      {/* Compact view toggle */}
      <MenuItem
        icon={
          globalCompactView ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
            </svg>
          )
        }
        label={globalCompactView ? t('Ausführliche Ansicht') : t('Kompakte Ansicht')}
        active={globalCompactView}
        onClick={() => {
          toggleGlobalCompactView();
          showToast(globalCompactView ? t('Ausführliche Ansicht') : t('Kompakte Ansicht'));
        }}
      />

      {/* Freie Kartengrößen: Inhalte behalten ihre natürliche Form */}
      <MenuItem
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="8" height="16" rx="2" strokeWidth={2} />
            <rect x="13" y="9" width="8" height="6" rx="2" strokeWidth={2} />
          </svg>
        }
        label={isFreeLayout ? t('Karten-Ansicht') : t('Freie Größen')}
        active={isFreeLayout}
        onClick={async () => {
          if (!currentProjectId) return;
          await setCardLayout(currentProjectId, isFreeLayout ? 'square' : 'free');
          showToast(isFreeLayout ? t('Karten-Ansicht') : t('Freie Größen'));
        }}
      />

      {/* Minimal zone display - only show when zones exist */}
      {projectZones.length > 0 && (
        <MenuItem
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect
                x="4"
                y="4"
                width="16"
                height="16"
                rx="2"
                strokeWidth={2}
                strokeDasharray="3 3"
                strokeLinecap="round"
              />
            </svg>
          }
          label={minimalZoneDisplay ? t('Bereiche normal') : t('Bereiche reduziert')}
          active={minimalZoneDisplay}
          onClick={() => {
            toggleMinimalZoneDisplay();
            showToast(minimalZoneDisplay ? t('Bereiche normal angezeigt') : t('Bereiche reduziert angezeigt'));
          }}
        />
      )}

      {/* Divider */}
      <div className="h-px bg-gray-200 my-2" />

      {/* Groups manager button */}
      <MenuItem
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="12" r="5" strokeWidth={2} />
            <circle cx="15" cy="12" r="5" strokeWidth={2} />
          </svg>
        }
        label={t('Gruppen & Bereiche')}
        badge={projectGroups.length > 0 ? projectGroups.length : undefined}
        onClick={() => {
          openModal('groupsPanel', {});
          onClose();
        }}
      />

      {/* Lehrkraft-Funktionen */}
      {isTeacherMode && (
        <>
          <div className="h-px bg-gray-200 my-2" />

          {/* Als Vorlage speichern (wie iOS) */}
          <MenuItem
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16" rx="3" strokeWidth={2} strokeDasharray="4 3" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v6m-3-3h6" />
              </svg>
            }
            label={t('Als Vorlage speichern')}
            onClick={async () => {
              if (!currentProject) return;
              const template = await duplicateProject(currentProject.id, currentProject.name, {
                asTemplate: true,
              });
              showToast(template ? t('Als Vorlage gespeichert') : t('Speichern fehlgeschlagen'));
              onClose();
            }}
          />

          {/* Hintergrundbild entfernen (nur wenn vorhanden) */}
          {currentProject?.backgroundImage && (
            <MenuItem
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2zM19 5L5 19" />
                </svg>
              }
              label={t('Hintergrundbild entfernen')}
              onClick={async () => {
                if (!currentProjectId) return;
                await updateProject(currentProjectId, {
                  backgroundImage: undefined,
                  backgroundImageWidth: undefined,
                  backgroundImageHeight: undefined,
                });
                showToast(t('Hintergrundbild entfernt'));
                onClose();
              }}
            />
          )}
        </>
      )}

      {/* Divider */}
      <div className="h-px bg-gray-200 my-2" />

      {/* Export */}
      <MenuItem
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        }
        label={t('Exportieren')}
        onClick={() => {
          openModal('exportProject', {});
          onClose();
        }}
      />

      {/* Share */}
      <MenuItem
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        }
        label={t('Teilen')}
        onClick={() => {
          openModal('shareProject', {});
          onClose();
        }}
      />
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}

function MenuItem({ icon, label, active = false, badge, onClick }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:bg-primary-blue/20 ${
        active ? 'bg-primary-blue/10' : 'hover:bg-primary-blue/10'
      }`}
    >
      <span className={active ? 'text-primary-blue' : 'text-ink-soft'}>{icon}</span>
      <span className={`flex-1 font-medium ${active ? 'text-primary-blue' : 'text-ink'}`}>{label}</span>
      {badge !== undefined && (
        <span className="bg-primary-blue text-white text-xs rounded-full px-2 py-0.5">
          {badge}
        </span>
      )}
      {active && (
        <svg className="w-5 h-5 text-primary-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
