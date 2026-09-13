/**
 * Gemeinsame Maße der Auswahl-Overlays über dem Canvas.
 *
 * Unten sitzt die Werkzeugleiste, darüber klappen ihre Menüs auf (Einfügen,
 * Anordnen, Zeichnen). Die Leisten und Knöpfe der Auswahl halten diesen
 * Streifen frei: Sie lagen sonst über den Menüs und schluckten deren Tipps –
 * „Anordnen" reagierte dann scheinbar gar nicht mehr.
 */

/** Höhe der Aktionsleiste einer Auswahl (wie ItemActionBar im Buch-Modus). */
export const BAR_HEIGHT = 64;

/** Abstand zwischen Karte und Aktionsleiste. */
export const BAR_GAP = 12;

/** Reservierter Streifen am unteren Rand: Werkzeugleiste plus Luft. */
export const BOTTOM_UI_HEIGHT = 118;
