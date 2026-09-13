// Vorschaubild für die Projektübersicht – gemeinsam für Whiteboard und Buch.
//
// Die Vorschau entsteht beim Arbeiten am Projekt: Ändert sich der Inhalt, wird
// nach kurzer Ruhe neu gerendert und am Projekt gespeichert. Drei Dinge sind
// dabei wichtig und waren einzeln schon Fehlerquellen:
//   1. Solange der Inhalt noch lädt, darf gar nichts gerendert werden – sonst
//      überschreibt ein leeres Bild die vorhandene Vorschau.
//   2. Ein leeres Rendering (`null`) löscht nie eine vorhandene Vorschau.
//   3. Gespeichert wird ohne `updatedAt` (updateSilently), sonst rutschte ein
//      Projekt allein vom Öffnen in der Liste nach oben.
import { useEffect, useRef } from 'react';
import { useProjectStore } from '../stores';
import { projectService } from '../services/db/database';

/** Erst rendern, wenn das Arbeiten zur Ruhe gekommen ist. */
export const COVER_DEBOUNCE_MS = 1500;

/** Was gerade zu sehen wäre: ein Kennzeichen des Inhalts und der Renderer dazu. */
export interface CoverSnapshot {
  /** Ändert es sich, wird neu gerendert. */
  signature: string;
  render: () => Promise<string | null>;
}

export interface CoverThumbnailOptions {
  projectId: string | undefined;
  /** Auf Inhaltsänderungen horchen; gibt die Abmeldung zurück. */
  subscribe: (onChange: () => void) => () => void;
  /** Aktueller Stand – `null`, solange nichts (oder noch nicht alles) da ist. */
  snapshot: () => CoverSnapshot | null;
}

export function useCoverThumbnail({ projectId, subscribe, snapshot }: CoverThumbnailOptions): void {
  // Die Rückrufe werden bei jedem Rendern neu gebaut; der Effekt soll aber nur
  // am Projekt hängen – deshalb über eine Ref immer den neuesten Stand nutzen.
  // Die Zuweisung gehört in einen eigenen Effekt (vor dem unteren deklariert,
  // läuft also zuerst) – während des Renderns dürfen Refs nicht beschrieben werden.
  const rueckrufe = useRef({ subscribe, snapshot });
  useEffect(() => {
    rueckrufe.current = { subscribe, snapshot };
  });

  useEffect(() => {
    if (!projectId) return;
    let letzteSignatur = '';
    let beendet = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const speichere = async (render: () => Promise<string | null>) => {
      try {
        const coverImage = await render();
        if (beendet) return;
        // Kein Bild: die vorhandene Vorschau bleibt lieber stehen, als dass sie
        // wegen eines misslungenen Renderings verschwindet.
        if (!coverImage) return;
        const aktuell = useProjectStore.getState().projects.find((p) => p.id === projectId);
        if (!aktuell || aktuell.coverImage === coverImage) return;
        await projectService.updateSilently(projectId, { coverImage });
        useProjectStore.setState((state) => ({
          projects: state.projects.map((p) => (p.id === projectId ? { ...p, coverImage } : p)),
        }));
      } catch (error) {
        console.error('Vorschau konnte nicht erzeugt werden:', error);
      }
    };

    const plane = () => {
      const stand = rueckrufe.current.snapshot();
      if (!stand || stand.signature === letzteSignatur) return;
      letzteSignatur = stand.signature;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void speichere(stand.render), COVER_DEBOUNCE_MS);
    };

    const abmelden = rueckrufe.current.subscribe(plane);
    // Auch ohne weitere Änderung soll ein Projekt beim Öffnen seine Vorschau
    // bekommen – der Inhalt kann schon geladen sein, bevor das Abo steht.
    plane();
    return () => {
      beendet = true;
      abmelden();
      if (timer) clearTimeout(timer);
    };
  }, [projectId]);
}
