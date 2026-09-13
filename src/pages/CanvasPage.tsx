import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProjectStore, useUIStore, useCardsStore, useZonesStore, useConnectionsStore, useHistoryStore, useScenesStore } from '../stores';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useBackgroundTextsStore } from '../stores/useBackgroundTextsStore';
import { CanvasStage, InlineEditOverlay, MediaPlayerOverlay, ScenesPanel } from '../components/canvas';
import type { CanvasStageHandle } from '../components/canvas';
import { CanvasToolbar } from '../components/toolbar';
import { PlaybackToolbar } from '../components/toolbar/PlaybackToolbar';
import { TextEditor, VideoEditor, AudioEditor, PhotoEditor, DrawingEditorModal, TaskEditorModal, AddCardModal, CardOptionsModal, ExportModal, GroupsPanel, ShareModal } from '../components/editors';
import { BackgroundTextEditor } from '../components/editors/BackgroundTextEditor';
import type { TextCard, VideoCard, AudioCard, PhotoCard, DrawingCard, TaskCard, Card, BackgroundText, Position } from '../types';
import { renderCanvasThumbnail } from '../services/canvasRenderer';
import { useCoverThumbnail } from '../hooks/useCoverThumbnail';
import { useT } from '../i18n';

export function CanvasPage() {
  const t = useT();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<CanvasStageHandle>(null);

  const projects = useProjectStore((state) => state.projects);
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const modalType = useUIStore((state) => state.modalType);
  const modalData = useUIStore((state) => state.modalData);
  const isLoading = useUIStore((state) => state.isLoading);
  const setSelectedCard = useCardsStore((state) => state.setSelectedCard);
  const isPlaybackActive = usePlaybackStore((state) => state.isActive);

  const project = projects.find((p) => p.id === currentProjectId);

  // Track viewport dimensions
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (projectId) {
      useProjectStore.getState().setCurrentProject(projectId);
      if (useProjectStore.getState().projects.length === 0) {
        useProjectStore.getState().loadProjects();
      }
      // Load zones, groups and connections for this project (call directly from store to avoid dependency issues)
      useZonesStore.getState().loadZones(projectId);
      useCardsStore.getState().loadGroups(projectId);
      useConnectionsStore.getState().loadConnections(projectId);
      useScenesStore.getState().loadScenes(projectId);
      useBackgroundTextsStore.getState().loadBackgroundTexts(projectId);
      usePlaybackStore.getState().loadEventInfo(projectId);
      // Undo-Verlauf gehört immer zum aktuellen Projekt
      useHistoryStore.getState().clear();
    }
    return () => {
      // Wiedergabe beim Verlassen des Projekts beenden
      usePlaybackStore.getState().stop();
    };
    // Bewusst nur von der Projekt-ID abhängig: sonst würde jedes Laden der
    // Projektliste den Undo-Verlauf erneut leeren.
  }, [projectId]);

  // Vorschau für die Projektübersicht: verzögert neu rendern und am Projekt
  // speichern. Wie beim Buch entsteht sie beim Arbeiten am Projekt — bestehende
  // Whiteboards bekommen ihre Vorschau also beim nächsten Öffnen.
  useCoverThumbnail({
    projectId,
    subscribe: (onChange) => {
      const abmelden = [
        useCardsStore.subscribe(onChange),
        useZonesStore.subscribe(onChange),
        useConnectionsStore.subscribe(onChange),
        useProjectStore.subscribe(onChange),
      ];
      return () => {
        for (const ab of abmelden) ab();
      };
    },
    snapshot: () => {
      if (!projectId) return null;
      // Solange die Karten noch laden, zeigt der Store die des vorigen Projekts
      // (oder gar keine) – daraus darf keine Vorschau entstehen.
      const cardsState = useCardsStore.getState();
      if (cardsState.isLoading || cardsState.lastLoadedProjectId !== projectId) return null;
      const aktuell = useProjectStore.getState().projects.find((p) => p.id === projectId);
      if (!aktuell) return null;

      const cards = cardsState.cards.filter((c) => c.projectId === projectId && !c.isDeleted);
      const zones = useZonesStore.getState().zones.filter((z) => z.projectId === projectId);
      const connections = useConnectionsStore
        .getState()
        .connections.filter((c) => c.projectId === projectId);
      // Alles, was das Bild verändern kann: Karten, Zonen, Verbindungen und die
      // Darstellung des Projekts selbst.
      const signature = [
        cards.map((c) => `${c.id}@${c.updatedAt}`).join(','),
        zones.map((z) => `${z.id}@${z.updatedAt}`).join(','),
        connections.map((c) => `${c.id}@${c.updatedAt}`).join(','),
        `${aktuell.cardLayout ?? 'square'}|${aktuell.backgroundColor ?? ''}|${aktuell.backgroundImage ?? ''}`,
      ].join('|');

      return {
        signature,
        render: () => renderCanvasThumbnail({ project: aktuell, cards, zones, connections }),
      };
    },
  });

  const handleBack = () => {
    setSelectedCard(null);
    navigate('/');
  };

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-light">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-ink-soft">{t('Projekt wird geladen...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh w-screen overflow-hidden relative bg-surface-canvas">
      {/* Canvas */}
      <CanvasStage
        ref={canvasRef}
        projectId={project.id}
        backgroundColor={project.backgroundColor}
        backgroundImage={project.backgroundImage}
        backgroundImageWidth={project.backgroundImageWidth}
        backgroundImageHeight={project.backgroundImageHeight}
      />

      {/* Empty-State-Hinweis auf leerem Canvas (wie iOS "Los geht's!") */}
      <EmptyCanvasHint projectId={project.id} />

      {/* Inline Edit Overlay */}
      <InlineEditOverlay />

      {/* Media Player Overlay */}
      <MediaPlayerOverlay />

      {/* Toolbar (während der Wiedergabe ausgeblendet) */}
      {!isPlaybackActive ? (
        <CanvasToolbar
          onBack={handleBack}
          projectName={project.name}
          viewportWidth={dimensions.width}
          viewportHeight={dimensions.height}
        />
      ) : (
        <PlaybackToolbar projectId={project.id} />
      )}

      {/* Scenes Panel */}
      <ScenesPanel />

      {/* Modals */}
      {modalType === 'textEditor' && modalData ? (
        <TextEditor card={modalData as TextCard} />
      ) : null}

      {modalType === 'videoEditor' && modalData ? (
        <VideoEditor card={modalData as VideoCard} />
      ) : null}

      {modalType === 'audioEditor' && modalData ? (
        <AudioEditor card={modalData as AudioCard} />
      ) : null}

      {modalType === 'photoEditor' && modalData ? (
        <PhotoEditor card={modalData as PhotoCard} />
      ) : null}

      {modalType === 'drawingEditor' ? (
        <DrawingEditorModal card={modalData as DrawingCard | undefined} />
      ) : null}

      {modalType === 'taskEditor' ? (
        <TaskEditorModal card={modalData as TaskCard | undefined} />
      ) : null}

      {modalType === 'backgroundTextEditor' ? (
        <BackgroundTextEditor
          projectId={project.id}
          text={
            modalData && typeof modalData === 'object' && 'id' in (modalData as object)
              ? (modalData as BackgroundText)
              : undefined
          }
          defaultPosition={
            modalData && typeof modalData === 'object' && 'defaultPosition' in (modalData as object)
              ? (modalData as { defaultPosition: Position }).defaultPosition
              : undefined
          }
        />
      ) : null}

      {modalType === 'addCard' && modalData ? (
        <AddCardModal type={(modalData as { type: 'photo' | 'text' | 'video' | 'audio' | 'drawing' }).type} />
      ) : null}

      {modalType === 'cardOptions' && modalData ? (
        <CardOptionsModal card={modalData as Card} />
      ) : null}

      {modalType === 'exportProject' ? (
        <ExportModal stageRef={canvasRef} />
      ) : null}

      {modalType === 'groupsPanel' ? (
        <GroupsPanel />
      ) : null}

      {modalType === 'shareProject' ? (
        <ShareModal />
      ) : null}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-[24px] p-6 flex items-center gap-4">
            <div className="w-8 h-8 border-4 border-primary-blue border-t-transparent rounded-full animate-spin" />
            <span className="text-ink">{t('Wird verarbeitet...')}</span>
          </div>
        </div>
      )}

      {/* Toast */}
      <Toast />
    </div>
  );
}

function EmptyCanvasHint({ projectId }: { projectId: string }) {
  const t = useT();
  const cards = useCardsStore((state) => state.cards);
  const zones = useZonesStore((state) => state.zones);

  const hasContent =
    cards.some((c) => c.projectId === projectId) ||
    zones.some((z) => z.projectId === projectId);

  if (hasContent) return null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center gap-4">
      <div className="w-24 h-24 rounded-full bg-primary-blue/10 flex items-center justify-center">
        <svg className="w-11 h-11 text-primary-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-xl font-bold text-ink">{t("Los geht's!")}</p>
        <p className="text-sm text-ink-soft mt-1">
          {t('Tippe unten auf')} <span className="font-semibold text-primary-blue">{t('Einfügen')}</span>{t(', um deine erste Karte zu erstellen')}
        </p>
      </div>
    </div>
  );
}

function Toast() {
  const { toastMessage } = useUIStore();

  if (!toastMessage) return null;

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-ink/90 text-white px-5 py-2.5 rounded-full shadow-lg text-sm font-medium">
        {toastMessage}
      </div>
    </div>
  );
}
