import { useEffect } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useProjectStore, useUIStore } from '../stores';
import { useBookStore } from '../stores/useBookStore';
import { useBookUIStore } from '../stores/useBookUIStore';
import { BOOK_FORMATS } from '../types';
import { BookStage } from '../components/book';
import { ImageCropModal } from '../components/book/ImageCropModal';
import {
  AddItemMenu,
  BookInspector,
  BookMediaCapture,
  BookToolbar,
  ExportPanel,
  ImportFromCanvasModal,
} from '../components/book/chrome';
import { BookReader, PagesOverview } from '../components/book/overview';
import { Toast } from '../components/common/Toast';
import { renderCoverThumbnail } from '../services/bookRenderer';
import { useCoverThumbnail } from '../hooks/useCoverThumbnail';
import { useT } from '../i18n';

export function BookEditorPage() {
  const t = useT();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Geteilter Link (state) oder ?read=1: direkt im Präsentationsmodus starten
  const startReading =
    !!(location.state as { startReading?: boolean } | null)?.startReading || searchParams.get('read') === '1';

  const { projects, loadProjects, setCurrentProject, getCurrentProject, updateProject } = useProjectStore();
  const isLoading = useUIStore((s) => s.isLoading);
  const isBookLoading = useBookStore((s) => s.isLoading);
  const loadedProjectId = useBookStore((s) => s.projectId);
  const isReading = useBookUIStore((s) => s.isReading);

  const project = getCurrentProject();
  const format = project?.bookFormat ?? 'portrait';
  const { width: pageWidth, height: pageHeight } = BOOK_FORMATS[format];

  // Projekt + Buchdaten laden
  useEffect(() => {
    if (!projectId) return;
    setCurrentProject(projectId);
    if (projects.length === 0) {
      loadProjects();
    }
    return () => {
      useBookUIStore.getState().reset();
    };
  }, [projectId, projects.length, setCurrentProject, loadProjects]);

  useEffect(() => {
    if (!project || project.kind !== 'book') return;
    if (loadedProjectId === project.id || useBookStore.getState().isLoading) return;
    useBookUIStore.getState().reset();
    useBookStore.getState().loadBook(project.id, project.bookFormat ?? 'portrait');
  }, [project, loadedProjectId]);

  useEffect(() => {
    if (!startReading || !project || loadedProjectId !== project.id || isBookLoading) return;
    useBookUIStore.getState().startReading();
    // Zustand aus der History entfernen, damit ein Reload wieder im Editor landet
    navigate(location.pathname, { replace: true, state: null });
  }, [startReading, project, loadedProjectId, isBookLoading, navigate, location.pathname]);

  // Cover-Vorschau (Seite 1) verzögert neu rendern und am Projekt speichern
  useCoverThumbnail({
    projectId,
    subscribe: (onChange) => useBookStore.subscribe(onChange),
    snapshot: () => {
      if (!projectId) return null;
      const state = useBookStore.getState();
      // Solange das Buch lädt, gehören die Seiten im Store noch nicht dazu.
      if (state.projectId !== projectId || state.isLoading || state.pages.length === 0) return null;
      const first = state.pages[0];
      const items = state.items.filter((it) => it.pageId === first.id);
      const signature = `${first.id}:${first.updatedAt}:${items.map((it) => `${it.id}@${it.updatedAt}`).join(',')}`;
      const sorted = [...items].sort((a, b) => a.zIndex - b.zIndex);
      return {
        signature,
        render: () => renderCoverThumbnail(first, sorted, pageWidth, pageHeight),
      };
    },
  });

  // Tastaturkürzel: Undo/Redo, Löschen, Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const book = useBookStore.getState();
      const ui = useBookUIStore.getState();
      if (ui.isReading) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (isTyping) return;
        e.preventDefault();
        if (e.shiftKey) book.redo();
        else book.undo();
        return;
      }
      if (e.key === 'Escape') {
        if (ui.panel) ui.closePanel();
        else if (book.editingItemId) book.setEditingItem(null);
        else if (book.selectedItemId) book.selectItem(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping && book.selectedItemId && !book.editingItemId) {
        e.preventDefault();
        book.deleteItem(book.selectedItemId);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleBack = () => {
    useBookStore.getState().selectItem(null);
    navigate('/');
  };

  const handleRename = async (name: string) => {
    if (!project || !name.trim() || name.trim() === project.name) return;
    await updateProject(project.id, { name: name.trim() });
  };

  if (!project || project.kind !== 'book' || isBookLoading || loadedProjectId !== project.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-light">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-ink-soft">{t('Buch wird geladen …')}</p>
        </div>
      </div>
    );
  }

  return (
    // h-screen als Rückfall; 100dvh berücksichtigt die Browserleisten auf Mobilgeräten
    <div
      className="h-screen w-screen overflow-hidden relative bg-[#E9EEF8] flex flex-col"
      style={{ height: '100dvh' }}
    >
      <BookToolbar projectName={project.name} onBack={handleBack} onRename={handleRename} />

      <div className="flex-1 min-h-0 flex relative">
        <BookStage pageWidth={pageWidth} pageHeight={pageHeight} />
        <BookInspector />
        <AddItemMenu />
        <PagesOverview />
      </div>

      {/* Modale Aufnahme / Import / Export */}
      <BookMediaCapture />
      <ImportFromCanvasModal />
      <ExportPanel projectName={project.name} />
      <ImageCropModal />

      {/* Präsentationsmodus */}
      {isReading && <BookReader />}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-[24px] p-6 flex items-center gap-4">
            <div className="w-8 h-8 border-4 border-primary-blue border-t-transparent rounded-full animate-spin" />
            <span className="text-ink">{t('Wird verarbeitet …')}</span>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}
