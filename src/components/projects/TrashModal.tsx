import { useCallback, useEffect, useState } from 'react';
import { Modal, CARD_TYPE_LABELS } from '../common';
import { projectService, cardService } from '../../services/db/database';
import { useProjectStore, useUIStore, useCardsStore } from '../../stores';
import type { Project, Card } from '../../types';
import { dateLocale, t as translate, useT } from '../../i18n';

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDeletedAt(deletedAt?: number): string {
  if (!deletedAt) return '';
  return new Date(deletedAt).toLocaleDateString(dateLocale());
}

// Kleines Papierkorb-Icon (Inline-SVG, damit keine Abhängigkeit nötig ist)
function TrashIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

// Zeigende Hand: steht für „lange gedrückt halten"
function TapIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 12.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5.2-3l-2-3.4a1.5 1.5 0 0 1 2.5-1.6L8 14.5" />
    </svg>
  );
}

export function TrashModal({ isOpen, onClose }: TrashModalProps) {
  const t = useT();
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [deletedCards, setDeletedCards] = useState<Card[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const showToast = useUIStore((s) => s.showToast);

  const reload = useCallback(async () => {
    const [projects, cards] = await Promise.all([
      projectService.getDeleted(),
      cardService.getDeleted(),
    ]);
    setDeletedProjects(projects);
    setDeletedCards(cards);

    // Projektnamen für die Kartenzeilen einmalig auflösen (Cache je Projekt-ID)
    const uniqueProjectIds = Array.from(new Set(cards.map((c) => c.projectId)));
    const entries = await Promise.all(
      uniqueProjectIds.map(async (id) => {
        const project = await projectService.getById(id);
        return [id, project?.name ?? ''] as const;
      })
    );
    setProjectNames(Object.fromEntries(entries));
  }, []);

  // Beim Öffnen neu laden; Confirm-Zustand per state-adjust-during-render zurücksetzen
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setConfirmDeleteAll(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      void reload();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, reload]);

  const isEmpty = deletedProjects.length === 0 && deletedCards.length === 0;

  // --- Projekte ---
  const handleRestoreProject = async (project: Project) => {
    await projectService.restore(project.id);
    await reload();
    await useProjectStore.getState().loadProjects();
    showToast(translate('Projekt wiederhergestellt'));
  };

  const handleDeleteProject = async (project: Project) => {
    await projectService.delete(project.id);
    await reload();
    showToast(translate('Endgültig gelöscht'));
  };

  // --- Karten ---
  const handleRestoreCard = async (card: Card) => {
    await cardService.restore(card.id);
    await reload();
    // Ein offenes Projekt sofort aktualisieren
    await useCardsStore.getState().loadCards(card.projectId, true);
    showToast(translate('Karte wiederhergestellt'));
  };

  const handleDeleteCard = async (card: Card) => {
    await cardService.delete(card.id);
    await reload();
    showToast(translate('Endgültig gelöscht'));
  };

  // --- Alle endgültig löschen (zweistufig, kein window.confirm) ---
  const handleDeleteAll = async () => {
    if (!confirmDeleteAll) {
      setConfirmDeleteAll(true);
      return;
    }
    await Promise.all([
      ...deletedProjects.map((p) => projectService.delete(p.id)),
      ...deletedCards.map((c) => cardService.delete(c.id)),
    ]);
    setConfirmDeleteAll(false);
    await reload();
    showToast(translate('Papierkorb geleert'));
  };

  const cardLabel = (card: Card): string => {
    const trimmed = card.label?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : t(CARD_TYPE_LABELS[card.type]);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Papierkorb')} size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-ink-soft">
          {t('Einträge werden nach 30 Tagen automatisch endgültig gelöscht.')}
        </p>

        {/* Wie Projekte überhaupt hierher kommen: Die lange Berührung ist der
            einzige Weg und ohne Hinweis kaum zu finden. */}
        <div className="flex items-start gap-2 rounded-xl bg-[#F5F7FA] px-3 py-2 text-xs text-ink-soft">
          <TapIcon className="mt-0.5 flex-shrink-0 text-primary-blue" />
          <p>
            {t('So löschst du ein Projekt: auf der Startseite lange darauf drücken und „Löschen" wählen. Am Rechner geht auch ein Rechtsklick.')}
          </p>
        </div>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-blue/10">
              <TrashIcon className="text-primary-blue" />
            </div>
            <p className="text-ink-soft">{t('Der Papierkorb ist leer')}</p>
          </div>
        ) : (
          <>
            {deletedProjects.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-ink-soft">{t('Projekte')}</h3>
                <ul className="flex flex-col gap-1">
                  {deletedProjects.map((project) => (
                    <li
                      key={project.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[#F5F7FA] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{project.name}</p>
                        <p className="text-xs text-ink-soft">
                          {t('Gelöscht am {date}', { date: formatDeletedAt(project.deletedAt) })}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          onClick={() => handleRestoreProject(project)}
                          className="text-sm font-medium text-primary-blue hover:brightness-90"
                        >
                          {t('Wiederherstellen')}
                        </button>
                        <button
                          onClick={() => handleDeleteProject(project)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:bg-red-50"
                          aria-label={t('Endgültig löschen')}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {deletedCards.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-ink-soft">{t('Karten')}</h3>
                <ul className="flex flex-col gap-1">
                  {deletedCards.map((card) => (
                    <li
                      key={card.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[#F5F7FA] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {cardLabel(card)}
                          {projectNames[card.projectId] && (
                            <span className="ml-2 text-xs font-normal text-ink-soft">
                              {projectNames[card.projectId]}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {t('Gelöscht am {date}', { date: formatDeletedAt(card.deletedAt) })}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          onClick={() => handleRestoreCard(card)}
                          className="text-sm font-medium text-primary-blue hover:brightness-90"
                        >
                          {t('Wiederherstellen')}
                        </button>
                        <button
                          onClick={() => handleDeleteCard(card)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 hover:bg-red-50"
                          aria-label={t('Endgültig löschen')}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="border-t border-gray-100 pt-3">
              <button
                onClick={handleDeleteAll}
                className="w-full rounded-xl py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
              >
                {confirmDeleteAll ? t('Wirklich alle löschen?') : t('Alle endgültig löschen')}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
