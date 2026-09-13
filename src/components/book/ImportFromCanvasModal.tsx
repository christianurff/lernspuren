import { useCallback, useEffect, useState } from 'react';
import { Modal, Button } from '../common';
import { useUIStore } from '../../stores';
import { useBookPageSize, useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { cardService, projectService } from '../../services/db/database';
import { createItemFromCard } from '../../services/bookItemFactory';
import type { NewBookItem } from '../../stores/useBookStore';
import type { Card, Project } from '../../types';
import { useT } from '../../i18n';

function CardPreview({ card }: { card: Card }) {
  const t = useT();
  if (card.type === 'photo' || card.type === 'drawing') {
    const src = card.type === 'photo' ? card.thumbnailData || card.imageData : card.imageData;
    return <img src={src} alt="" className="w-full h-24 object-cover rounded-xl bg-black/5" />;
  }
  if (card.type === 'text') {
    return (
      <div className="w-full h-24 rounded-xl bg-black/5 p-2 text-[11px] leading-snug text-ink overflow-hidden">
        {card.content.slice(0, 60) || t('Leerer Text')}
      </div>
    );
  }
  if (card.type === 'video') {
    return (
      <div className="relative w-full h-24 rounded-xl bg-black/10 overflow-hidden">
        {card.thumbnailData && <img src={card.thumbnailData} alt="" className="w-full h-full object-cover" />}
        <span className="absolute inset-0 flex items-center justify-center text-white">
          <svg className="w-8 h-8 drop-shadow" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>
    );
  }
  // audio
  return (
    <div className="w-full h-24 rounded-xl bg-black/5 flex flex-col items-center justify-center gap-1 text-ink-soft">
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5zM16 9a4 4 0 010 6" />
      </svg>
      <span className="text-[11px] px-2 text-center truncate max-w-full">{card.label || t('Aufnahme')}</span>
    </div>
  );
}

export function ImportFromCanvasModal() {
  const t = useT();
  const capture = useBookUIStore((s) => s.capture);
  const setCapture = useBookUIStore((s) => s.setCapture);

  const pages = useBookStore((s) => s.pages);
  const currentPageIndex = useBookStore((s) => s.currentPageIndex);
  const items = useBookStore((s) => s.items);
  const addItems = useBookStore((s) => s.addItems);
  const pageSize = useBookPageSize();

  const showToast = useUIStore((s) => s.showToast);
  const setLoading = useUIStore((s) => s.setLoading);

  const [projects, setProjects] = useState<{ project: Project; cardCount: number }[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const isOpen = capture === 'import';

  // Pinnwände laden, sobald das Fenster geöffnet wird
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingProjects(true);
    (async () => {
      try {
        const all = await projectService.getAll();
        const boards = all.filter((p) => p.kind !== 'book' && !p.isTemplate);
        const withCounts = await Promise.all(
          boards.map(async (project) => {
            const projectCards = await cardService.getAllByProject(project.id);
            return { project, cardCount: projectCards.filter((c) => c.type !== 'task').length };
          })
        );
        if (!cancelled) setProjects(withCounts);
      } catch (error) {
        console.error('Pinnwände konnten nicht geladen werden:', error);
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setIsLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Zustand beim Schließen zurücksetzen (state-adjust during render)
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setSelectedProject(null);
      setCards([]);
      setSelectedCardIds([]);
    }
  }

  const openProject = useCallback(async (project: Project) => {
    setSelectedProject(project);
    setSelectedCardIds([]);
    setIsLoadingCards(true);
    try {
      const projectCards = await cardService.getAllByProject(project.id);
      setCards(projectCards.filter((c) => c.type !== 'task'));
    } catch (error) {
      console.error('Karten konnten nicht geladen werden:', error);
      setCards([]);
    } finally {
      setIsLoadingCards(false);
    }
  }, []);

  if (!isOpen) return null;

  const page = pages[currentPageIndex];
  const close = () => setCapture(null);

  const toggleCard = (id: string) => {
    setSelectedCardIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleInsert = async () => {
    if (!page || selectedCardIds.length === 0) return;
    const offset = items.filter((it) => it.pageId === page.id).length;
    setLoading(true);
    try {
      const chosen = cards.filter((c) => selectedCardIds.includes(c.id));
      const newItems: NewBookItem[] = [];
      for (let i = 0; i < chosen.length; i++) {
        const item = await createItemFromCard(page.id, pageSize, chosen[i], offset + i);
        if (item) newItems.push(item);
      }
      if (newItems.length > 0) {
        await addItems(newItems);
        showToast(
          newItems.length === 1 ? t('1 Element eingefügt') : t('{n} Elemente eingefügt', { n: newItems.length })
        );
      } else {
        showToast(t('Nichts zum Einfügen'));
      }
    } catch (error) {
      console.error('Import fehlgeschlagen:', error);
      showToast(t('Fehler beim Einfügen'));
    } finally {
      setLoading(false);
      close();
    }
  };

  return (
    <Modal isOpen onClose={close} title={t('Aus Pinnwand einfügen')} size="lg">
      {!selectedProject ? (
        <div className="space-y-3">
          {isLoadingProjects ? (
            <p className="text-ink-soft text-center py-8">{t('Wird geladen …')}</p>
          ) : projects.length === 0 ? (
            <p className="text-ink-soft text-center py-8">
              {t('Du hast noch keine Pinnwände. Lege zuerst eine an, dann kannst du Karten hierher kopieren.')}
            </p>
          ) : (
            <ul className="space-y-2">
              {projects.map(({ project, cardCount }) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => void openProject(project)}
                    className="w-full min-h-[56px] px-4 py-3 rounded-2xl bg-black/5 hover:bg-black/10 transition-colors flex items-center justify-between gap-3 text-left active:scale-[0.99]"
                  >
                    <span className="font-semibold text-ink truncate">{project.name}</span>
                    <span className="text-sm text-ink-soft whitespace-nowrap">
                      {cardCount === 1 ? t('1 Karte') : t('{n} Karten', { n: cardCount })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" onClick={close} className="w-full">
            {t('Abbrechen')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-ink-soft text-sm">
            {t('Tippe die Karten an, die du in dein Buch übernehmen möchtest.')}
          </p>

          {isLoadingCards ? (
            <p className="text-ink-soft text-center py-8">{t('Wird geladen …')}</p>
          ) : cards.length === 0 ? (
            <p className="text-ink-soft text-center py-8">{t('In diesem Projekt gibt es noch keine Karten zum Einfügen.')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 max-h-[45vh] overflow-y-auto">
              {cards.map((card) => {
                const selected = selectedCardIds.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggleCard(card.id)}
                    aria-pressed={selected}
                    className={`relative p-1 rounded-2xl border-2 transition-all duration-200 active:scale-95 ${
                      selected ? 'border-primary-blue bg-primary-blue/10' : 'border-black/10 hover:bg-black/5'
                    }`}
                  >
                    <CardPreview card={card} />
                    {selected && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary-blue text-white flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setSelectedProject(null)} className="flex-1">
              {t('Zurück')}
            </Button>
            <Button onClick={() => void handleInsert()} disabled={selectedCardIds.length === 0} className="flex-1">
              {t('{n} einfügen', { n: selectedCardIds.length })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
