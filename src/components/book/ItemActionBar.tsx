import { useCallback, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useBookStore } from '../../stores/useBookStore';
import { useBookUIStore } from '../../stores/useBookUIStore';
import { ttsService } from '../../services/ttsService';
import type { ItemActionBarProps } from './types';
import { useT } from '../../i18n';

const BAR_GAP = 12; // Abstand zwischen Item und Leiste (Bildschirmpixel)
const BAR_HEIGHT = 64;

interface ActionProps {
  label: string;
  onPress: () => void;
  danger?: boolean;
  children: ReactNode;
}

function Action({ label, onPress, danger = false, children }: ActionProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onPress}
      className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 transition-all duration-150 active:scale-90 ${
        danger ? 'text-primary-pink hover:bg-pink-50' : 'text-ink hover:bg-surface-light'
      }`}
    >
      {children}
      <span className="text-[11px] font-medium leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/**
 * Schwebende Aktionsleiste über (oder unter) dem ausgewählten Element.
 * Liegt bewusst außerhalb des skalierten Seiten-Containers, damit Text scharf bleibt.
 */
export function ItemActionBar({ item, scale, pageWidth, pageHeight }: ItemActionBarProps) {
  const t = useT();
  const duplicateItem = useBookStore((s) => s.duplicateItem);
  const bringForward = useBookStore((s) => s.bringForward);
  const sendBackward = useBookStore((s) => s.sendBackward);
  const deleteItem = useBookStore((s) => s.deleteItem);
  const startCrop = useBookUIStore((s) => s.startCrop);

  const [barWidth, setBarWidth] = useState(0);
  // Breite messen, damit die Leiste innerhalb der Seite bleibt.
  // Der key unten sorgt dafür, dass bei anderem Elementtyp (andere Buttons) neu gemessen wird.
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    if (el) setBarWidth(el.offsetWidth);
  }, []);

  const stageWidth = pageWidth * scale;
  const stageHeight = pageHeight * scale;
  const itemTop = item.y * scale;
  const itemBottom = (item.y + item.height) * scale;
  const above = itemTop - BAR_GAP - BAR_HEIGHT >= 0;
  const top = above ? itemTop - BAR_GAP - BAR_HEIGHT : Math.min(itemBottom + BAR_GAP, stageHeight - BAR_HEIGHT);

  const half = barWidth / 2 || 120;
  const centerX = (item.x + item.width / 2) * scale;
  const left = Math.min(Math.max(centerX, half + 4), Math.max(half + 4, stageWidth - half - 4));

  const handleDelete = () => {
    ttsService.stop();
    void deleteItem(item.id);
  };

  const stop = (e: ReactPointerEvent<HTMLDivElement>) => e.stopPropagation();

  return (
    <div
      key={item.type}
      ref={measureRef}
      onPointerDown={stop}
      style={{ position: 'absolute', left, top, transform: 'translateX(-50%)', height: BAR_HEIGHT, zIndex: 30 }}
      className="flex items-center gap-1 rounded-2xl border border-white/60 bg-white px-2 shadow-[0_6px_20px_rgba(30,58,95,0.18)]"
    >
      <Action label={t('Duplizieren')} onPress={() => void duplicateItem(item.id)}>
        <svg {...iconProps}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      </Action>

      <Action label={t('Nach vorn')} onPress={() => void bringForward(item.id)}>
        <svg {...iconProps}>
          <path d="M12 4v13" />
          <path d="m6 10 6-6 6 6" />
        </svg>
      </Action>

      <Action label={t('Nach hinten')} onPress={() => void sendBackward(item.id)}>
        <svg {...iconProps}>
          <path d="M12 20V7" />
          <path d="m6 14 6 6 6-6" />
        </svg>
      </Action>

      {item.type === 'image' && (
        <Action label={t('Zuschneiden')} onPress={() => startCrop(item.id)}>
          <svg {...iconProps}>
            <path d="M6 2v14a2 2 0 0 0 2 2h14" />
            <path d="M18 22V8a2 2 0 0 0-2-2H2" />
          </svg>
        </Action>
      )}

      {item.type === 'text' && (
        <Action label={t('Vorlesen')} onPress={() => ttsService.speak(item.text)}>
          <svg {...iconProps}>
            <path d="M11 5 6 9H3v6h3l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        </Action>
      )}

      <div className="mx-0.5 h-8 w-px bg-black/10" />

      <Action label={t('Löschen')} onPress={handleDelete} danger>
        <svg {...iconProps}>
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      </Action>
    </div>
  );
}
