/**
 * Tastatur beim Inline-Bearbeiten (iOS).
 *
 * Safari und WKWebView öffnen die Bildschirmtastatur nur, wenn `focus()` direkt
 * in der Nutzergeste läuft – also im selben Tipp. Ein Feld, das erst nach einem
 * Zustandswechsel gerendert und danach fokussiert wird, steht ohne Tastatur da:
 * Man sieht „Text eingeben…", muss aber noch einmal hineintippen.
 *
 * Deshalb hängen die beiden Eingabefelder dauerhaft im DOM (unsichtbar geparkt,
 * siehe `InlineEditOverlay`). Wer eine Bearbeitung startet, ruft im selben Tipp
 * `focusInlineEditField()` auf: der Fokus sitzt sofort auf dem echten Feld, die
 * Tastatur fährt hoch, und React schiebt das Feld danach nur noch an die
 * richtige Stelle. Der Knoten bleibt derselbe, der Fokus bleibt bestehen.
 */
import type { InlineEditField } from '../../stores/useCardsStore';

type Field = HTMLInputElement | HTMLTextAreaElement;

const fields = new Map<InlineEditField, Field>();

/** Wird vom Overlay beim Anlegen der Felder aufgerufen. */
export function registerInlineEditField(field: InlineEditField, element: Field | null): void {
  if (element) fields.set(field, element);
  else fields.delete(field);
}

/**
 * Feld vorbelegen und fokussieren. Muss synchron in der Geste laufen (Tipp,
 * Klick), sonst bleibt die Tastatur auf iOS unten.
 */
export function focusInlineEditField(
  field: InlineEditField,
  value: string,
  selection: 'end' | 'all' = 'end'
): void {
  const element = fields.get(field);
  if (!element) return;

  // Läuft die Bearbeitung schon in diesem Feld, bleibt Getipptes stehen:
  // Der Aufruf aus dem Overlay holt nur den Fokus nach (Maus, Tastatur).
  if (document.activeElement !== element) {
    element.value = value;
  }

  element.focus({ preventScroll: true });
  if (selection === 'all') element.select();
  else element.setSelectionRange(element.value.length, element.value.length);
}

/** Fokus abgeben, wenn keine Bearbeitung mehr läuft (Feld wird geparkt). */
export function blurInlineEditFields(): void {
  for (const element of fields.values()) {
    if (document.activeElement === element) element.blur();
  }
}
