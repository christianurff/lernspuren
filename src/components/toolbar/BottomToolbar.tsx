import { useUIStore, useDrawingStore, useZonesStore, useSettingsStore } from '../../stores';
import { useT } from '../../i18n';

interface BottomToolbarProps {
  onShowAddMenu: () => void;
  onShowArrangeMenu: () => void;
  isAddMenuOpen: boolean;
  isArrangeMenuOpen: boolean;
}

// Werkzeug-Akzentfarben (abgeglichen mit iOS CanvasView)
const COLOR_DRAW = '#EAB308';
const COLOR_ZONE = '#6BCB77';
const COLOR_ARRANGE = '#B088F9';

export function BottomToolbar({
  onShowAddMenu,
  onShowArrangeMenu,
  isAddMenuOpen,
  isArrangeMenuOpen,
}: BottomToolbarProps) {
  const { showToast } = useUIStore();
  const t = useT();
  const { isDrawingMode, setDrawingMode } = useDrawingStore();
  const { isCreatingZone, startZoneCreation, endZoneCreation } = useZonesStore();
  // Funktionsumfang Stufe 1 „Einfach": nur Einfügen + Anordnen (wie iOS)
  const { complexityLevel } = useSettingsStore();
  const showTools = complexityLevel >= 2;

  const handleDrawingToggle = () => {
    setDrawingMode(!isDrawingMode);
    showToast(isDrawingMode ? t('Zeichenmodus beendet') : t('Zeichenmodus aktiviert'));
  };

  const handleZoneToggle = () => {
    if (isCreatingZone) {
      endZoneCreation();
      showToast(t('Bereichserstellung beendet'));
    } else {
      startZoneCreation();
      showToast(t('Ziehe auf dem Canvas um einen Bereich zu erstellen'));
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-end gap-1 bg-white/70 backdrop-blur-md rounded-[24px] shadow-lg p-2">
        {/* Zeichnen (Draw) — ab Funktionsumfang Standard */}
        {showTools && (
          <ToolbarButton
            icon={
              <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            }
            label={t('Zeichnen')}
            color={COLOR_DRAW}
            active={isDrawingMode}
            onClick={handleDrawingToggle}
          />
        )}

        {/* Bereich (Zone) — ab Funktionsumfang Standard */}
        {showTools && (
          <ToolbarButton
            icon={
              <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
              </svg>
            }
            label={t('Bereich')}
            color={COLOR_ZONE}
            active={isCreatingZone}
            onClick={handleZoneToggle}
          />
        )}

        {/* Einfügen (Insert) - Primary action */}
        <ToolbarButton
          icon={
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          }
          label={t('Einfügen')}
          primary
          active={isAddMenuOpen}
          onClick={onShowAddMenu}
        />

        {/* Anordnen (Arrange) */}
        <ToolbarButton
          icon={
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          }
          label={t('Anordnen')}
          color={COLOR_ARRANGE}
          active={isArrangeMenuOpen}
          onClick={onShowArrangeMenu}
        />
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  primary?: boolean;
  color?: string;
  onClick: () => void;
}

function ToolbarButton({ icon, label, active = false, primary = false, color = '#5B8DEF', onClick }: ToolbarButtonProps) {
  // Einfügen-Button: dreht sich beim Öffnen des Menüs. Farbgebung wie die
  // Hauptaktion im Buch-Modus (BookToolbar) – gleiche Aktion, gleiche Farbe.
  if (primary) {
    return (
      <button
        className="flex flex-col items-center gap-1"
        onClick={onClick}
        aria-label={label}
      >
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-md transition-all duration-200 active:scale-90 ${
            active ? 'bg-[#4A7CE0] rotate-45' : 'bg-primary-blue hover:brightness-105'
          }`}
        >
          {icon}
        </div>
        <span className="text-[11px] font-semibold text-ink">{label}</span>
      </button>
    );
  }

  // Werkzeug-Buttons: getönter Kreis in Werkzeugfarbe, aktiv = Vollfarbe
  return (
    <button
      className="flex flex-col items-center gap-1"
      onClick={onClick}
      aria-label={label}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90"
        style={{
          backgroundColor: active ? color : `${color}1F`,
          color: active ? '#FFFFFF' : color,
        }}
      >
        {icon}
      </div>
      <span className={`text-[11px] font-semibold ${active ? 'text-ink' : 'text-ink-soft'}`}>
        {label}
      </span>
    </button>
  );
}
