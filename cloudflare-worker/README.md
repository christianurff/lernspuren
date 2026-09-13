# Lernspuren-Teilen (Cloudflare Worker)

Speichert geteilte Bücher (EPUB) und Whiteboards (.lernspur) mit Ablaufdatum in R2 und
liefert sie über einen nicht erratbaren Link wieder aus. Keine Konten, keine Nutzerdaten
außer der Datei selbst; Löschung automatisch nach 7, 30 oder 90 Tagen.

| Route | Zweck |
|---|---|
| `POST /share` | Datei hochladen (Header `X-Expires-Days` 7/30/90, `X-Kind` book/canvas, `X-Name`) → `{ id, url, deleteToken, expiresAt }` |
| `GET /share/:id` | Datei laden (410 = abgelaufen) |
| `HEAD /share/:id` | nur Metadaten (`X-Kind`, `X-Name`, `X-Expires-At`, `Content-Length`) |
| `DELETE /share/:id` | Freigabe beenden (`Authorization: Bearer <deleteToken>`) |

Maximale Dateigröße: 60 MB. Erlaubt sind nur ZIP-Container (EPUB/.lernspur): Der Worker
prüft Content-Type und die Magic-Bytes `PK\x03\x04` und liefert Dateien immer als
`application/octet-stream` mit `Content-Disposition: attachment` und `X-Content-Type-Options: nosniff`
aus – über diesen Dienst lässt sich also kein HTML hosten.

Uploads sind zusätzlich abgesichert: `Origin`/`Referer` müssen serverseitig zu `ALLOWED_ORIGINS`
passen (CORS allein schützt nur Browser), und das Rate-Limiting-Binding `UPLOAD_LIMITER`
(`[[ratelimits]]` in `wrangler.toml`) erlaubt 10 Uploads pro Minute und IP.

**Lokaler Test:** `ALLOWED_ORIGINS` enthält bewusst keine localhost-Adressen. Für die
Entwicklung beim Start überschreiben:

```bash
npx wrangler dev --port 8799 --local \
  --var ALLOWED_ORIGINS:"http://localhost:5173,http://127.0.0.1:5173"
# in der Web-App:
VITE_SHARE_API_URL=http://localhost:8799 npm run dev
```

**Kostenbremse:** Jede Datei verfällt spätestens nach 90 Tagen (Lifecycle-Regeln je Präfix).
Zusätzlich lehnt der Worker Uploads ab (HTTP 507), sobald `MAX_TOTAL_MB` (Standard 5120 MB)
oder `MAX_OBJECTS` (Standard 1000 Dateien) erreicht sind – das kostenlose R2-Kontingent
(10 GB Speicher, 1 Mio. Schreib- und 10 Mio. Lesezugriffe pro Monat, kein Egress-Entgelt)
wird so nie überschritten.

## Setup (einmalig)

```bash
cd cloudflare-worker

# 1. R2 im Cloudflare-Dashboard aktivieren, dann Bucket mit EU-Jurisdiktion anlegen
npx wrangler r2 bucket create lernspuren-share --jurisdiction eu

# 2. Lifecycle-Regeln: Objekte je Präfix automatisch löschen
npx wrangler r2 bucket lifecycle add lernspuren-share --jurisdiction eu --name expire-7d  --prefix 7d/  --expire-days 7
npx wrangler r2 bucket lifecycle add lernspuren-share --jurisdiction eu --name expire-30d --prefix 30d/ --expire-days 30
npx wrangler r2 bucket lifecycle add lernspuren-share --jurisdiction eu --name expire-90d --prefix 90d/ --expire-days 90

# 3. Deployen
npx wrangler deploy
```

Der Worker läuft danach unter `https://lernspuren-share.urff.workers.dev`; die Web-App
verwendet diese Adresse (`VITE_SHARE_API_URL` in `.env`, Standard siehe `src/services/shareService.ts`).
