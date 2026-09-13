import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/common';
import { useProjectStore } from '../stores';
import { projectService } from '../services/db/database';
import {
  fetchShare,
  fetchShareInfo,
  ShareNotFoundError,
  formatBytes,
  type ShareInfo,
} from '../services/shareService';
import { importAnyFile } from '../services/projectFile';
import { t as translate, useT } from '../i18n';

type Status = 'checking' | 'confirm' | 'loading' | 'error';

/** Merkt sich, welcher geteilte Link schon zu welchem Projekt geworden ist. */
const IMPORTED_KEY = 'dokumentenraum_imported_shares';

function loadImportedShares(): Record<string, string> {
  try {
    const raw = localStorage.getItem(IMPORTED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberImportedShare(shareId: string, projectId: string) {
  try {
    localStorage.setItem(IMPORTED_KEY, JSON.stringify({ ...loadImportedShares(), [shareId]: projectId }));
  } catch {
    // z. B. Private Mode – dann wird beim nächsten Mal eben neu importiert
  }
}

/**
 * Geteilten Link öffnen: erst Name und Größe zeigen und bestätigen lassen, dann die
 * Datei laden, als eigenes Projekt importieren und direkt im Präsentationsmodus
 * (Buch) bzw. auf dem Whiteboard starten. Ein bereits importierter Link öffnet das
 * vorhandene Projekt, statt eine zweite Kopie anzulegen.
 */
export function OpenSharedPage() {
  const t = useT();
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState(() => translate('Wird geladen …'));
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Verhindert Doppelstarts (StrictMode), erlaubt aber einen Neustart bei geänderter ID
  const startedForRef = useRef<string | null>(null);

  /** Öffnet ein Projekt so, wie es zu seiner Art passt (Buch direkt im Lesemodus). */
  const openProject = (projectId: string, kind: string | undefined) => {
    useProjectStore.getState().setCurrentProject(projectId);
    if (kind === 'book') {
      navigate(`/book/${projectId}`, { replace: true, state: { startReading: true } });
    } else {
      navigate(`/canvas/${projectId}`, { replace: true });
    }
  };

  const describeError = (e: unknown): string =>
    e instanceof ShareNotFoundError
      ? e.expired
        ? translate('Dieser Link ist abgelaufen. Die Datei wurde vom Server gelöscht.')
        : translate('Dieser Link ist ungültig oder die Freigabe wurde beendet.')
      : e instanceof Error
        ? e.message
        : translate('Öffnen fehlgeschlagen');

  // Schritt 1: Schon importiert? Sonst nur die Eckdaten holen und nachfragen.
  useEffect(() => {
    if (!shareId || startedForRef.current === shareId) return;
    startedForRef.current = shareId;

    const check = async () => {
      setStatus('checking');
      setError(null);
      try {
        const knownProjectId = loadImportedShares()[shareId];
        if (knownProjectId) {
          const existing = await projectService.getById(knownProjectId);
          if (existing && !existing.isDeleted) {
            await useProjectStore.getState().loadProjects();
            openProject(existing.id, existing.kind);
            return;
          }
        }
        setInfo(await fetchShareInfo(shareId));
        setStatus('confirm');
      } catch (e) {
        // Ungültig/abgelaufen ist ein echter Fehler; alles andere (z. B. HEAD wird
        // unterwegs geblockt) soll das Öffnen nicht verhindern – dann eben ohne Größe.
        if (e instanceof ShareNotFoundError) {
          setError(describeError(e));
          setStatus('error');
          return;
        }
        console.warn('Eckdaten des geteilten Links nicht verfügbar:', e);
        setInfo(null);
        setStatus('confirm');
      }
    };
    void check();
    // openProject/describeError sind stabil genug; entscheidend ist die shareId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, navigate]);

  // Schritt 2: Nach Bestätigung wirklich herunterladen und importieren.
  const handleImport = async () => {
    if (!shareId) return;
    setStatus('loading');
    setError(null);
    setMessage(
      translate('„{name}" wird eingerichtet ({size}) …', {
        name: info?.name || translate('Projekt'),
        size: formatBytes(info?.size ?? 0),
      })
    );
    try {
      const { blob } = await fetchShare(shareId);
      const project = await importAnyFile(blob);
      rememberImportedShare(shareId, project.id);
      await useProjectStore.getState().loadProjects();
      openProject(project.id, project.kind);
    } catch (e) {
      console.error('Geteilter Link konnte nicht geöffnet werden:', e);
      setError(describeError(e));
      setStatus('error');
    }
  };

  const kindLabel = info?.kind === 'canvas' ? t('Pinnwand') : t('Buch');

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-light p-6">
      <div className="text-center max-w-md w-full">
        {(status === 'checking' || status === 'loading') && (
          <>
            <div className="w-10 h-10 border-4 border-primary-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-ink-soft">{status === 'loading' ? message : t('Wird geprüft …')}</p>
          </>
        )}

        {status === 'confirm' && (
          <>
            <h1 className="text-xl font-bold text-ink mb-2">{t('Geteiltes Projekt öffnen?')}</h1>
            {info && (
              <p className="text-ink-soft mb-1">
                {t('{kind} „{name}"', { kind: kindLabel, name: info.name || t('Ohne Titel') })}
              </p>
            )}
            <p className="text-sm text-ink-soft mb-6">
              {info && info.size > 0
                ? t('{size} werden heruntergeladen und als eigene Kopie in deinen Projekten gespeichert.', {
                    size: formatBytes(info.size),
                  })
                : t('Die Datei wird heruntergeladen und als eigene Kopie in deinen Projekten gespeichert.')}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => navigate('/', { replace: true })} className="flex-1">
                {t('Abbrechen')}
              </Button>
              <Button onClick={() => void handleImport()} className="flex-1">
                {t('Öffnen')}
              </Button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-pink/20 flex items-center justify-center text-primary-pink">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-ink mb-2">{t('Konnte nicht geöffnet werden')}</h1>
            <p className="text-ink-soft mb-6">{error}</p>
            <Button onClick={() => navigate('/', { replace: true })}>{t('Zu meinen Projekten')}</Button>
          </>
        )}
      </div>
    </div>
  );
}
