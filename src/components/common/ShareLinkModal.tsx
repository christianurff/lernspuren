import { useState } from 'react';
import { Modal } from './Modal';
import { LazyQRCode } from './LazyQRCode';
import { Button } from './Button';
import { useUIStore } from '../../stores/useUIStore';
import {
  SHARE_EXPIRY_OPTIONS,
  deleteShare,
  formatBytes,
  formatExpiry,
  rememberShare,
  storedSharesForProject,
  uploadShare,
  type ShareExpiryDays,
  type ShareKind,
  type ShareResult,
  type StoredShare,
} from '../../services/shareService';
import { useT } from '../../i18n';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  kind: ShareKind;
  // Erzeugt die zu teilende Datei (EPUB bzw. .lernspur)
  buildFile: () => Promise<Blob>;
}

type Step = 'consent' | 'uploading' | 'done';

const KIND_LABEL: Record<ShareKind, string> = { book: 'Buch', canvas: 'Pinnwand' };

/**
 * Teilen per Link: Hinweis (Daten verlassen das Gerät) → Ablaufdatum → Upload → Link + QR-Code.
 * Wird für Bücher und Pinnwände gleichermaßen verwendet.
 */
export function ShareLinkModal({ isOpen, onClose, projectId, projectName, kind, buildFile }: ShareLinkModalProps) {
  const t = useT();
  const showToast = useUIStore((s) => s.showToast);

  const [step, setStep] = useState<Step>('consent');
  const [days, setDays] = useState<ShareExpiryDays>(30);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'build' | 'upload'>('build');
  const [result, setResult] = useState<ShareResult | null>(null);
  const [existing, setExisting] = useState<StoredShare[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Beim Öffnen zurücksetzen (state-adjust during render)
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setStep('consent');
      setDays(30);
      setProgress(0);
      setResult(null);
      setCopied(false);
      setError(null);
      setExisting(storedSharesForProject(projectId));
    }
  }

  const handleShare = async () => {
    setStep('uploading');
    setError(null);
    setPhase('build');
    setProgress(0);
    try {
      const file = await buildFile();
      setPhase('upload');
      const shared = await uploadShare(file, { kind, days, name: projectName }, setProgress);
      rememberShare({ ...shared, projectId, projectName, createdAt: Date.now() });
      setResult(shared);
      setExisting(storedSharesForProject(projectId));
      setStep('done');
    } catch (e) {
      console.error('Teilen fehlgeschlagen:', e);
      setError(e instanceof Error ? e.message : t('Teilen fehlgeschlagen'));
      setStep('consent');
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t('Kopieren nicht möglich – Link bitte markieren'));
    }
  };

  const handleNativeShare = async (url: string) => {
    try {
      await navigator.share({
        title: projectName,
        text: t('{kind} „{name}" aus Dokumentenraum', { kind: t(KIND_LABEL[kind]), name: projectName }),
        url,
      });
    } catch {
      // abgebrochen
    }
  };

  const handleRevoke = async (share: StoredShare) => {
    try {
      await deleteShare(share.id, share.deleteToken);
      setExisting(storedSharesForProject(projectId));
      if (result?.id === share.id) {
        setResult(null);
        setStep('consent');
      }
      showToast(t('Freigabe beendet'));
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('Freigabe konnte nicht beendet werden'));
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Modal isOpen={isOpen} onClose={step === 'uploading' ? () => undefined : onClose} title={t('Per Link teilen')} size="lg">
      {step === 'consent' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 space-y-2">
            <p className="font-semibold">{t('Bitte beachten, bevor du teilst:')}</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('Alle Inhalte (Fotos, Aufnahmen, Videos, Texte) werden auf einen Server hochgeladen. Die Daten verlassen damit dieses Gerät.')}</li>
              <li>{t('Jede Person, die den Link oder den QR-Code hat, kann alles öffnen und eine eigene Kopie bearbeiten.')}</li>
              <li>{t('Die Datei wird nach dem gewählten Zeitraum automatisch gelöscht. Du kannst die Freigabe jederzeit vorher beenden.')}</li>
              <li>{t('Sind Kinder auf Fotos oder in Aufnahmen zu sehen oder zu hören, braucht es die Einwilligung der Erziehungsberechtigten.')}</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-ink-soft mb-2">{t('Link gültig für')}</p>
            <div className="grid grid-cols-3 gap-2">
              {SHARE_EXPIRY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  aria-pressed={days === option}
                  className={`min-h-[52px] rounded-2xl border-2 font-semibold transition-colors ${
                    days === option ? 'border-primary-blue bg-primary-blue/10 text-ink' : 'border-black/10 bg-white text-ink-soft hover:bg-black/5'
                  }`}
                >
                  {t('{n} Tage', { n: option })}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {existing.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink-soft mb-2">{t('Bereits geteilt')}</p>
              <ul className="space-y-1">
                {existing.map((share) => (
                  <li key={share.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#F5F7FA] px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <button type="button" onClick={() => { setResult(share); setStep('done'); }} className="truncate font-medium text-primary-blue text-left">
                        {t('Link anzeigen')}
                      </button>
                      <p className="text-xs text-ink-soft">{t('gültig bis {date}', { date: formatExpiry(share.expiresAt) })}</p>
                    </div>
                    <button type="button" onClick={() => void handleRevoke(share)} className="shrink-0 text-red-500 font-medium">
                      {t('Beenden')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              {t('Abbrechen')}
            </Button>
            <Button onClick={() => void handleShare()} className="flex-1">
              {t('Verstanden, hochladen')}
            </Button>
          </div>
        </div>
      )}

      {step === 'uploading' && (
        <div className="py-8 flex flex-col items-center gap-4" role="status">
          <div className="w-10 h-10 border-4 border-primary-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-ink">{phase === 'build' ? t('Datei wird vorbereitet …') : t('Wird hochgeladen …')}</p>
          {phase === 'upload' && (
            <div className="w-full max-w-xs h-2 rounded-full bg-black/10 overflow-hidden">
              <div className="h-full bg-primary-blue transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-3 border border-black/10">
              <LazyQRCode value={result.url} size={200} />
            </div>
            <p className="text-xs text-ink-soft text-center">
              {t('Gültig bis {date}', { date: formatExpiry(result.expiresAt) })} · {formatBytes(result.size)}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-[#F5F7FA] px-3 py-2">
            <input
              readOnly
              value={result.url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 bg-transparent text-sm text-ink outline-none"
              aria-label={t('Link zum Teilen')}
            />
            <button type="button" onClick={() => void handleCopy(result.url)} className="shrink-0 text-sm font-semibold text-primary-blue">
              {copied ? t('Kopiert ✓') : t('Kopieren')}
            </button>
          </div>

          <div className="flex gap-3">
            {canNativeShare && (
              <Button variant="secondary" onClick={() => void handleNativeShare(result.url)} className="flex-1">
                {t('Teilen …')}
              </Button>
            )}
            <Button onClick={onClose} className="flex-1">
              {t('Fertig')}
            </Button>
          </div>

          <button
            type="button"
            onClick={() => {
              const stored = existing.find((s) => s.id === result.id);
              if (stored) void handleRevoke(stored);
            }}
            className="w-full text-sm text-red-500 font-medium py-1"
          >
            {t('Freigabe beenden (Datei vom Server löschen)')}
          </button>
        </div>
      )}
    </Modal>
  );
}
