import { useState } from 'react';
import { Modal, Button } from '../common';
import { useProjectStore, useUIStore } from '../../stores';
import { useBookPageSize, useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { exportBookPdf, exportPagePng } from '../../services/bookExport';
import { buildEpub, exportBookEpub } from '../../services/bookFile';
import { ShareLinkModal } from '../common/ShareLinkModal';
import type { Project } from '../../types';
import { useT } from '../../i18n';

interface ExportPanelProps {
  projectName: string;
}

type ExportMode = 'pdf' | 'png' | 'epub';

function PdfIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16l4.5-4.5a2 2 0 012.8 0L15 16m-2-2l1.6-1.6a2 2 0 012.8 0L21 15" />
      <circle cx="8.5" cy="9.5" r="1.2" />
    </svg>
  );
}

function EpubIcon() {
  return (
    <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A1.5 1.5 0 015.5 4H10a2 2 0 012 2v13a2 2 0 00-2-2H5.5A1.5 1.5 0 014 15.5v-10z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 5.5A1.5 1.5 0 0018.5 4H14a2 2 0 00-2 2v13a2 2 0 012-2h4.5a1.5 1.5 0 001.5-1.5v-10z" />
    </svg>
  );
}

export function ExportPanel({ projectName }: ExportPanelProps) {
  const t = useT();
  const panel = useBookUIStore((s) => s.panel);
  const closePanel = useBookUIStore((s) => s.closePanel);

  const projectId = useBookStore((s) => s.projectId);
  const format = useBookStore((s) => s.format);
  const allItems = useBookStore((s) => s.items);
  const storedProject = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const pages = useBookStore((s) => s.pages);
  const currentPageIndex = useBookStore((s) => s.currentPageIndex);
  const getPageItems = useBookStore((s) => s.getPageItems);
  const pageSize = useBookPageSize();

  const showToast = useUIStore((s) => s.showToast);

  const [mode, setMode] = useState<ExportMode>('pdf');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (panel !== 'export') return null;

  const page = pages[currentPageIndex];
  const canExport = pages.length > 0 && !!page && !isExporting;

  // Beim direkten Aufruf von /book/:id ist die Projektliste evtl. noch leer
  const effectiveProject = (): Project =>
    storedProject ?? {
      id: projectId ?? '',
      name: projectName,
      backgroundColor: '#FFFFFF',
      kind: 'book',
      bookFormat: format,
      pageCount: pages.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cardCount: 0,
    };

  const handleExport = async () => {
    if (!page || pages.length === 0) return;
    setIsExporting(true);
    setProgress(mode === 'png' ? null : { done: 0, total: pages.length });
    try {
      if (mode === 'pdf') {
        await exportBookPdf(
          projectName,
          pages,
          (pageId) => getPageItems(pageId),
          pageSize.width,
          pageSize.height,
          (done, total) => setProgress({ done, total })
        );
        showToast(t('PDF gespeichert'));
      } else if (mode === 'epub') {
        await exportBookEpub(effectiveProject(), pages, allItems, (done, total) =>
          setProgress({ done, total })
        );
        showToast(t('EPUB-Datei gespeichert'));
      } else {
        await exportPagePng(
          projectName,
          currentPageIndex + 1,
          page,
          getPageItems(page.id),
          pageSize.width,
          pageSize.height
        );
        showToast(t('Bild gespeichert'));
      }
      closePanel();
    } catch (error) {
      console.error('Export fehlgeschlagen:', error);
      showToast(t('Export fehlgeschlagen'));
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  };

  const tileClass = (active: boolean) =>
    `min-h-[112px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 font-semibold text-sm transition-all duration-200 active:scale-95 ${
      active ? 'border-primary-blue bg-primary-blue/10 text-ink' : 'border-black/10 bg-white text-ink-soft hover:bg-black/5'
    }`;

  return (
    // Während des Exports darf das Modal nicht per Hintergrund/Escape verschwinden
    <Modal
      isOpen
      onClose={() => {
        if (!isExporting) closePanel();
      }}
      title={t('Buch exportieren')}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button type="button" onClick={() => setMode('pdf')} aria-pressed={mode === 'pdf'} className={tileClass(mode === 'pdf')}>
            <PdfIcon />
            <span>{t('PDF (alle Seiten)')}</span>
          </button>
          <button type="button" onClick={() => setMode('png')} aria-pressed={mode === 'png'} className={tileClass(mode === 'png')}>
            <ImageIcon />
            <span>{t('Bild (diese Seite)')}</span>
          </button>
          <button type="button" onClick={() => setMode('epub')} aria-pressed={mode === 'epub'} className={tileClass(mode === 'epub')}>
            <EpubIcon />
            <span>{t('EPUB-Datei')}</span>
            <span className="text-xs font-normal opacity-80">{t('Zum Weitergeben und Importieren')}</span>
          </button>
          <button type="button" onClick={() => setIsShareOpen(true)} className={tileClass(false)}>
            <ShareIcon />
            <span>{t('Link teilen')}</span>
            <span className="text-xs font-normal opacity-80">{t('QR-Code, mit Ablaufdatum')}</span>
          </button>
        </div>

        {progress && (
          <p className="text-center text-ink-soft text-sm" role="status">
            {t('Seite {n} von {m} …', { n: progress.done, m: progress.total })}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={closePanel} className="flex-1" disabled={isExporting}>
            {t('Abbrechen')}
          </Button>
          <Button onClick={() => void handleExport()} disabled={!canExport} className="flex-1">
            {isExporting ? t('Bitte warten …') : t('Exportieren')}
          </Button>
        </div>
      </div>
      <ShareLinkModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        projectId={projectId ?? ''}
        projectName={projectName}
        kind="book"
        buildFile={() => buildEpub(effectiveProject(), pages, allItems)}
      />
    </Modal>
  );
}

function ShareIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path strokeLinecap="round" d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}
