# Lernspuren – Dokumentenraum

Offene Lern-App (OER) für die Grundschule: Kinder halten fest, was sie entdeckt, gebaut, gerechnet oder erforscht haben – als **Buch** zum Blättern oder auf einer **Pinnwand** zum Sammeln, Ordnen, Verbinden und Präsentieren. Fotos, Texte, Zeichnungen, Sprachaufnahmen und kurze Videos werden zu Karten oder Seiten. Alle Inhalte bleiben auf dem Gerät.

- Web-App: https://lernspuren.urff.app (PWA, offline nutzbar, installierbar)
- iOS-App: https://apps.apple.com/de/app/lernspuren-dokumentenraum/id6759177702 (iPhone und iPad, kostenlos; der native Rahmen ist nicht Teil dieses Repositories)
- Projektseite: https://urff.app/lernspuren/
- Lizenz: Apache 2.0 (Code), CC BY 4.0 (Vorlagen und Demo-Bilder) – siehe [LICENSE](LICENSE) und [NOTICE](NOTICE)

Web-App und iOS-App sind dieselbe Anwendung: Die iOS-App ist ein schlanker nativer Rahmen um diese Web-App, läuft im Vollbild ohne Browser-Bedienelemente und ergänzt Spracherkennung auf dem Gerät und Videoschnitt. Projekte lassen sich als Datei (`.lernspur`, EPUB) oder per Link zwischen beiden austauschen. `src/utils/nativeBridge.ts` beschreibt die Schnittstelle, über die ein solcher Rahmen mit der Web-App spricht; im Browser bleibt sie inaktiv.

## Warum

Viele Dokumentations- und Portfolio-Apps für die Schule speichern Kinderarbeiten auf Servern der Anbieter, verlangen Konten oder werten Nutzung aus. Lernspuren ist als datenschutzfreundliche Alternative gedacht: keine Konten, keine Analyse, keine Werbung, keine Cloud-Speicherung. Nur wer ein Projekt bewusst **per Link teilt**, lädt es nach einem Hinweis auf einen Server in der EU; die Datei ist nur mit dem Link erreichbar und wird nach 7, 30 oder 90 Tagen automatisch gelöscht.

Der Quellcode ist offen, damit Schulen, Hochschulen und Entwicklerinnen die App prüfen, selbst betreiben und weiterentwickeln können.

## Funktionen

**Buch** – Seiten wie in einem Bilderbuch: Text, Foto, Zeichnung, Sprachaufnahme, Video. Sechs Seitengerüste (Forscherbuch, Steckbrief, Bildergeschichte, Schritt für Schritt, Wörterbuch, Lerntagebuch), drei Seitenformate. Lesemodus im Vollbild mit Vorlesen. Export als PDF, Bild und EPUB 3 (verlustfrei wieder importierbar).

**Pinnwand** – Fläche zum Sammeln und Sortieren von Karten, quadratisch oder in freier Größe. Zonen, Gruppen, Stapel, Pfeile zwischen Karten, benannte Anordnungen (Szenen), 18 Vorlagen (Zahlenstrahl, Stellenwerttafel, Venn-Diagramm, Ampel, Lernweg …), eigene Vorlagen. **Entstehung abspielen**: Die Entstehung einer Pinnwand wird aufgezeichnet und lässt sich Schritt für Schritt wiedergeben.

**Für Lehrkräfte** – Lehrkraft-Modus mit Aufgabenkarten, gestuften Tipps und Checklisten; drei Funktionsumfänge (Einfach, Standard, Erweitert); Papierkorb mit 30 Tagen Frist; Rückgängig und Wiederholen.

**Datenschutz** – Speicherung lokal in IndexedDB. Optionales Teilen per Link und QR-Code über einen eigenen kleinen Dienst (`cloudflare-worker/`), der nur die Datei selbst, Name, Ablaufdatum und den Hash eines Lösch-Schlüssels speichert.

## Technik

React 19, TypeScript, Vite, Zustand (Stores in `src/stores/`), Dexie/IndexedDB (`src/services/db/`), Konva (Pinnwand, `src/components/canvas/`), DOM-basierter Bucheditor (`src/components/book/`), Tailwind CSS 4, vite-plugin-pwa. Der Freigabe-Dienst ist in [cloudflare-worker/README.md](cloudflare-worker/README.md) beschrieben.

## Loslegen

```bash
npm install
npm run dev       # Entwicklungsserver
npm test          # Vitest
npm run build     # Produktionsbuild nach dist/
```

Teilen per Link braucht eine eigene Instanz des Cloudflare Workers (Anleitung in `cloudflare-worker/README.md`); die URL kommt in `.env` als `VITE_SHARE_API_URL` (Vorlage: `.env.example`). Ohne Worker funktioniert alles andere.

Auf einen Webspace kommt die App als statische Dateien aus `dist/` (beliebiger Webserver, HTTPS nötig für Kamera und Mikrofon).

## Mitmachen

Fehler, Ideen und Pull Requests sind willkommen. Bitte die Sprache der Oberfläche (Deutsch, mit englischer Übersetzung in `src/i18n/`) und die Grundsätze beibehalten: keine Konten, keine Tracking-Bibliotheken, Daten bleiben auf dem Gerät, Kindgerechtigkeit vor Funktionsfülle.

Wer die App unter eigenem Namen weiterentwickelt oder betreibt: Bitte den Ursprung nennen („basiert auf Lernspuren – Dokumentenraum von Christian Urff, urff.app“), wie in der [NOTICE](NOTICE) beschrieben.

## Hintergrund

Die App entsteht an der Pädagogischen Hochschule Weingarten (Mathematikdidaktik). Fachlich knüpft sie an Arbeiten zum Dokumentieren und Reflektieren im Mathematikunterricht der Grundschule an: Kinder sollen eigene Lernwege festhalten, ordnen, vergleichen und darüber sprechen können – nicht nur Ergebnisse abgeben.

Kontakt: Christian Urff, christian.urff@ph-weingarten.de
