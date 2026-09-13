import { useBookPageSize, useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { useSettingsStore } from '../../stores';
import { createTextItem } from '../../services/bookItemFactory';
import { useT } from '../../i18n';

// --- Icons -------------------------------------------------------------------

function TextIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 6V4h14v2M12 4v16M9 20h6" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M4 20l4.5-1 9.353-9.353a2.5 2.5 0 10-3.536-3.536L5 15.5 4 20z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 11a7 7 0 0014 0M12 18v3M9 21h6" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v4M9 20h6" />
    </svg>
  );
}

// --- Kachel ------------------------------------------------------------------

interface TileProps {
  label: string;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}

function Tile({ label, color, onClick, children }: TileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-2xl text-ink font-semibold text-sm transition-all duration-200 active:scale-95 hover:brightness-95"
      style={{ backgroundColor: color }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

// --- Menü --------------------------------------------------------------------

export function AddItemMenu() {
  const t = useT();
  const panel = useBookUIStore((s) => s.panel);
  const closePanel = useBookUIStore((s) => s.closePanel);
  const setCapture = useBookUIStore((s) => s.setCapture);
  const startPen = useBookUIStore((s) => s.startPen);

  const pages = useBookStore((s) => s.pages);
  const currentPageIndex = useBookStore((s) => s.currentPageIndex);
  const items = useBookStore((s) => s.items);
  const addItem = useBookStore((s) => s.addItem);
  const setEditingItem = useBookStore((s) => s.setEditingItem);
  const pageSize = useBookPageSize();

  const complexityLevel = useSettingsStore((s) => s.complexityLevel);

  if (panel !== 'add') return null;

  const page = pages[currentPageIndex];
  if (!page) return null;

  const offset = items.filter((it) => it.pageId === page.id).length;

  const handleText = () => {
    closePanel();
    void (async () => {
      const item = await addItem(createTextItem(page.id, pageSize, '', offset));
      setEditingItem(item.id);
    })();
  };

  const showAdvanced = complexityLevel >= 2;

  return (
    <>
      {/* Unsichtbares Overlay: Tippen außerhalb schließt das Menü */}
      <button
        type="button"
        aria-label={t('Menü schließen')}
        onClick={closePanel}
        className="fixed inset-0 z-30 cursor-default"
      />

      <div
        className="fixed inset-x-0 bottom-0 z-40 rounded-t-[24px] bg-white shadow-xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-[calc(env(safe-area-inset-top)+72px)] sm:w-[420px] sm:rounded-[24px]"
        role="dialog"
        aria-label={t('Element hinzufügen')}
      >
        <div className="sm:hidden mx-auto mb-3 h-1.5 w-12 rounded-full bg-black/15" />
        <h2 className="text-lg font-bold text-ink mb-3 px-1">{t('Was möchtest du hinzufügen?')}</h2>

        <div className="grid grid-cols-3 gap-3">
          <Tile label={t('Text')} color="var(--color-pastel-blue)" onClick={handleText}>
            <TextIcon />
          </Tile>

          <Tile label={t('Kamera')} color="var(--color-pastel-pink)" onClick={() => setCapture('photo')}>
            <CameraIcon />
          </Tile>

          <Tile label={t('Galerie')} color="var(--color-pastel-green)" onClick={() => setCapture('gallery')}>
            <GalleryIcon />
          </Tile>

          {showAdvanced && (
            <Tile
              label={t('Stift')}
              color="var(--color-pastel-yellow)"
              onClick={() => {
                // Eine Seite hat höchstens eine Stift-Zeichnung: vorhandene weiterbearbeiten
                const existing = items.find((it) => it.pageId === page.id && it.type === 'drawing');
                startPen(existing?.id);
              }}
            >
              <PenIcon />
            </Tile>
          )}

          <Tile label={t('Aufnahme')} color="var(--color-pastel-purple)" onClick={() => setCapture('audio')}>
            <MicIcon />
          </Tile>

          {showAdvanced && (
            <Tile label={t('Video')} color="var(--color-pastel-orange)" onClick={() => setCapture('video')}>
              <VideoIcon />
            </Tile>
          )}

          {showAdvanced && (
            <Tile label={t('Aus Pinnwand')} color="var(--color-pastel-mint)" onClick={() => setCapture('import')}>
              <BoardIcon />
            </Tile>
          )}
        </div>
      </div>
    </>
  );
}
