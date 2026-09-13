import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore, useUIStore, useSettingsStore } from '../stores';
import { ProjectTile, CreateProjectModal } from '../components/projects';
import type { CreateProjectOptions } from '../components/projects/CreateProjectModal';
import { TrashModal } from '../components/projects/TrashModal';
import { SettingsModal } from '../components/projects/SettingsModal';
import { buildBookTemplate } from '../data/bookTemplates';
import { Button, Modal, InfoModal } from '../components/common';
import { useShareImport } from '../hooks';
import { bookService, projectService } from '../services/db/database';
import { duplicateProject } from '../services/projectDuplication';
import { importAnyFile } from '../services/projectFile';
import { templateUrl, type BuiltinTemplate } from '../data/templates';
import type { Project, ProjectKind } from '../types';
import { isNativeApp } from '../utils/nativeBridge';
import { useT } from '../i18n';

// Pinnwand und Buch als Symbol – dieselben Bilder wie früher im Dialog
function PinboardIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
      <rect x="6.5" y="7" width="4" height="3.5" rx="0.8" />
      <rect x="13" y="9.5" width="4.5" height="4" rx="0.8" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5v-15z" />
      <path strokeLinecap="round" d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5" />
      <path strokeLinecap="round" d="M9 8h7M9 11.5h5" />
    </svg>
  );
}

export function ProjectsPage() {
  const t = useT();
  const navigate = useNavigate();
  const { projects, isLoading, createProject, deleteProject, setCurrentProject } =
    useProjectStore();
  const { showToast, setLoading } = useUIStore();
  const { showTemplates } = useSettingsStore();

  // Handle share link imports
  const { isImporting } = useShareImport();

  // Was gerade erstellt wird, steht schon vor dem Dialog fest (zwei Knöpfe oben)
  const [createKind, setCreateKind] = useState<ProjectKind | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userTemplates, setUserTemplates] = useState<Project[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadUserTemplates = useCallback(async () => {
    try {
      setUserTemplates(await projectService.getTemplates());
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  }, []);

  useEffect(() => {
    // Call directly from store to avoid dependency issues
    useProjectStore.getState().loadProjects();
    loadUserTemplates();
  }, [loadUserTemplates]);

  const handleCreateProject = async (name: string, options: CreateProjectOptions) => {
    const template = options.template;
    try {
      // Eigene Vorlage: tiefe Kopie, danach direkt hinein
      if (template?.kind === 'user') {
        await handleUseUserTemplate(name, template.template);
        return;
      }

      if (options.kind === 'book') {
        const project = await createProject(name, '#FFFFFF', {
          kind: 'book',
          bookFormat: options.bookFormat,
          pageCount: 1,
        });
        if (template?.kind === 'book') {
          // Das Gerüst der Vorlage als echte Seiten und Elemente anlegen:
          // ab jetzt ist alles ganz normal veränderbar.
          const { pages, items } = buildBookTemplate(template.template, project.id, options.bookFormat, { title: name });
          for (const page of pages) await bookService.createPage(page);
          await bookService.bulkCreateItems(items);
        }
        showToast(t('Buch erstellt'));
        setCurrentProject(project.id);
        navigate(`/book/${project.id}`);
        return;
      }

      if (template?.kind === 'builtin') {
        await handleUseBuiltinTemplate(name, template.template);
        return;
      }

      const project = await createProject(name, options.backgroundColor);
      showToast(t('Pinnwand erstellt'));
      setCurrentProject(project.id);
      navigate(`/canvas/${project.id}`);
    } catch {
      showToast(t('Fehler beim Erstellen'));
    }
  };

  // Projekt aus mitgelieferter Vorlage: PNG laden und als Hintergrundbild setzen
  const handleUseBuiltinTemplate = async (name: string, template: BuiltinTemplate) => {
    try {
      const response = await fetch(templateUrl(template));
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = dataUrl;
      });

      const worldWidth = 1200;
      const worldHeight = worldWidth * (height / width);
      const project = await createProject(name, '#FFFFFF', {
        backgroundImage: dataUrl,
        backgroundImageWidth: worldWidth,
        backgroundImageHeight: worldHeight,
      });
      showToast(t('Projekt aus Vorlage erstellt'));
      setCurrentProject(project.id);
      navigate(`/canvas/${project.id}`);
    } catch (error) {
      console.error('Failed to create project from template:', error);
      showToast(t('Fehler beim Erstellen aus Vorlage'));
    }
  };

  // Projekt aus Nutzer-Vorlage: tiefe Kopie inkl. Karten/Zonen/Verbindungen
  const handleUseUserTemplate = async (name: string, template: Project) => {
    try {
      const project = await duplicateProject(template.id, name, { asTemplate: false });
      if (!project) throw new Error('Template not found');
      await useProjectStore.getState().loadProjects();
      showToast(t('Projekt aus Vorlage erstellt'));
      setCurrentProject(project.id);
      navigate(project.kind === 'book' ? `/book/${project.id}` : `/canvas/${project.id}`);
    } catch (error) {
      console.error('Failed to use template:', error);
      showToast(t('Fehler beim Erstellen aus Vorlage'));
    }
  };

  const handleDeleteUserTemplate = async (id: string) => {
    try {
      await projectService.delete(id);
      await loadUserTemplates();
      showToast(t('Vorlage gelöscht'));
    } catch {
      showToast(t('Fehler beim Löschen'));
    }
  };

  // Buch (.epub) oder Pinnwand (.lernspur) importieren (Round-Trip zum Export)
  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setLoading(true);
    try {
      const project = await importAnyFile(file);
      await useProjectStore.getState().loadProjects();
      const isBook = project.kind === 'book';
      showToast(isBook ? t('Buch importiert') : t('Pinnwand importiert'));
      setCurrentProject(project.id);
      navigate(isBook ? `/book/${project.id}` : `/canvas/${project.id}`);
    } catch (error) {
      console.error('Import fehlgeschlagen:', error);
      showToast(error instanceof Error ? error.message : t('Import fehlgeschlagen'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = (project: Project) => {
    setCurrentProject(project.id);
    navigate(project.kind === 'book' ? `/book/${project.id}` : `/canvas/${project.id}`);
  };

  const handleDeleteProject = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteProject(deleteConfirm);
      showToast(t('Projekt gelöscht'));
    } catch {
      showToast(t('Fehler beim Löschen'));
    }
    setDeleteConfirm(null);
  };

  const projectToDelete = projects.find((p) => p.id === deleteConfirm);

  return (
    // html/body/#root sind global overflow:hidden — die Projektliste scrollt daher
    // in diesem Container (der sticky Header bleibt als direktes Kind wirksam).
    <div className="h-full overflow-y-auto bg-gradient-to-br from-[#F0F4FF] via-[#F8FAFF] to-[#FFF5F7] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 pt-[env(safe-area-inset-top)]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-2">
          {/* Auf schmalen Bildschirmen (iPhone) weicht der Titel zurück, damit
              die Aktionen rechts vollständig sichtbar bleiben. */}
          <h1 className="min-w-0 truncate text-lg sm:text-2xl font-bold text-ink">Dokumentenraum</h1>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {/* Einstellungen */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              aria-label={t('Einstellungen')}
              title={t('Einstellungen')}
              className="w-11 h-11 rounded-full flex items-center justify-center text-primary-blue hover:bg-primary-blue/10 active:scale-90 transition-all"
            >
              <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
            {/* Papierkorb */}
            <button
              onClick={() => setIsTrashOpen(true)}
              aria-label={t('Papierkorb')}
              title={t('Papierkorb')}
              className="w-11 h-11 rounded-full flex items-center justify-center text-primary-blue hover:bg-primary-blue/10 active:scale-90 transition-all"
            >
              <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            {/* Importieren */}
            <button
              onClick={() => importInputRef.current?.click()}
              aria-label={t('Importieren')}
              title={t('Buch oder Pinnwand importieren')}
              className="w-11 h-11 rounded-full flex items-center justify-center text-primary-blue hover:bg-primary-blue/10 active:scale-90 transition-all"
            >
              <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".epub,.lernspur,.zip,application/epub+zip,application/zip"
              className="hidden"
              onChange={(event) => void handleImportFile(event)}
            />
            {/* Zwei Wege statt einer Zwischenfrage: Pinnwand oder Buch */}
            <Button
              onClick={() => setCreateKind('canvas')}
              size="md"
              aria-label={t('Neue Pinnwand')}
              title={t('Neue Pinnwand')}
            >
              <PinboardIcon />
              {/* Beschriftung erst ab Tablet-Breite – sonst wird die Zeile zu eng */}
              <span className="hidden sm:inline">{t('Neue Pinnwand')}</span>
            </Button>
            <Button
              onClick={() => setCreateKind('book')}
              size="md"
              aria-label={t('Neues Buch')}
              title={t('Neues Buch')}
            >
              <BookIcon />
              <span className="hidden sm:inline">{t('Neues Buch')}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-6 w-full">
        {isLoading || isImporting ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-primary-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-4 bg-primary-blue/10 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-primary-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">{t("Los geht's!")}</h2>
            <p className="text-ink-soft mb-6">{t('Sammle auf einer Pinnwand oder erzähle in einem Buch.')}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => setCreateKind('canvas')} size="lg">
                <PinboardIcon />
                {t('Neue Pinnwand')}
              </Button>
              <Button onClick={() => setCreateKind('book')} size="lg">
                <BookIcon />
                {t('Neues Buch')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {projects.map((project) => (
              <ProjectTile
                key={project.id}
                project={project}
                onOpen={() => handleOpenProject(project)}
                onDelete={() => setDeleteConfirm(project.id)}
              />
            ))}
          </div>
        )}

      </main>

      {/* Footer nur im Browser: in der iOS-App entfällt er (keine externen Links, App-Store-Richtlinie für Kinder-Apps) */}
      {!isNativeApp() && (
        <footer className="py-4 px-4 text-center text-xs text-gray-500 border-t border-gray-100 bg-white/50">
          <p>
            {t('Erstellt von Christian Urff')} | {' '}
            <a
              href="https://urff.app"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 underline"
            >
              urff.app
            </a>
            {' '} | {' '}
            <a
              href="https://urff.app/impressum/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 underline"
            >
              {t('Impressum')}
            </a>
            {' '} | {t('Lizenz (CC BY-NC 4.0)')}
          </p>
        </footer>
      )}

      {/* Info Button - Fixed bottom right */}
      <button
        onClick={() => setIsInfoModalOpen(true)}
        className="fixed bottom-16 right-4 w-12 h-12 bg-white/70 backdrop-blur-md hover:bg-white/90 rounded-full shadow-sm border border-white/50 flex items-center justify-center text-ink-soft hover:text-ink transition-colors z-20"
        aria-label={t('Informationen zur App')}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={createKind !== null}
        kind={createKind ?? 'canvas'}
        onClose={() => setCreateKind(null)}
        onCreate={handleCreateProject}
        defaultName={
          createKind === 'book'
            ? t('Buch {n}', { n: projects.length + 1 })
            : t('Pinnwand {n}', { n: projects.length + 1 })
        }
        userTemplates={userTemplates}
        onDeleteUserTemplate={handleDeleteUserTemplate}
        showTemplates={showTemplates}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={t('Projekt löschen?')}
      >
        <p className="text-gray-600 mb-6">
          {t('Möchtest du „{name}" wirklich löschen? Es wandert in den Papierkorb und kann dort 30 Tage lang wiederhergestellt werden.', { name: projectToDelete?.name ?? '' })}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)} className="flex-1">
            {t('Abbrechen')}
          </Button>
          <Button variant="danger" onClick={handleDeleteProject} className="flex-1">
            {t('Löschen')}
          </Button>
        </div>
      </Modal>

      {/* Info Modal */}
      <InfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />

      {/* Papierkorb */}
      <TrashModal
        isOpen={isTrashOpen}
        onClose={() => {
          setIsTrashOpen(false);
          // Wiederhergestellte Vorlagen/Projekte anzeigen
          loadUserTemplates();
        }}
      />

      {/* Einstellungen */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
