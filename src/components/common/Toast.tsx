import { useUIStore } from '../../stores/useUIStore';

// Kurze Statusmeldung unten mittig (gemeinsam für Canvas und Buch)
export function Toast() {
  const toastMessage = useUIStore((s) => s.toastMessage);

  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-bottom-4 pointer-events-none">
      <div className="bg-ink/90 text-white px-5 py-2.5 rounded-full shadow-lg text-sm font-medium">
        {toastMessage}
      </div>
    </div>
  );
}
