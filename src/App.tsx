import { HashRouter, Routes, Route } from 'react-router-dom';
import { ProjectsPage } from './pages/ProjectsPage';
import { Suspense, lazy, useEffect } from 'react';
import { seedDemoContent } from './services/demoContent';
import { useProjectStore } from './stores';

// Nur die Projektliste ist der Einstieg und bleibt statisch. Canvas (Konva) und
// Buch-Editor (jsPDF/JSZip) sind die großen Brocken und werden erst geladen,
// wenn ein Projekt geöffnet wird.
const CanvasPage = lazy(() => import('./pages/CanvasPage').then((m) => ({ default: m.CanvasPage })));
const BookEditorPage = lazy(() => import('./pages/BookEditorPage').then((m) => ({ default: m.BookEditorPage })));
const OpenSharedPage = lazy(() => import('./pages/OpenSharedPage').then((m) => ({ default: m.OpenSharedPage })));

/** Ladeanzeige, während ein Seiten-Bündel nachgeladen wird. */
function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-light" role="status" aria-busy="true">
      <div className="w-10 h-10 border-4 border-primary-blue border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function App() {
  // ?demo=1 legt Beispielinhalte an (Store-Screenshots, erster Eindruck)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') !== '1') return;
    seedDemoContent()
      .then(() => useProjectStore.getState().loadProjects())
      .catch((error) => console.error('Demo-Inhalte konnten nicht angelegt werden:', error));
  }, []);

  return (
    <HashRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/canvas/:projectId" element={<CanvasPage />} />
          <Route path="/book/:projectId" element={<BookEditorPage />} />
          <Route path="/open/:shareId" element={<OpenSharedPage />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}

export default App;
