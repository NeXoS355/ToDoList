# ToDoList App — Detailplan

## Vision

GitHub Issues-ähnliche TODO App. Offline-first, multiplatform, modern UI.
Hauptquellen für neue Tasks: **Outlook 2024** und **Microsoft Teams**.

---

## Outlook & Teams Integration

### Kernstrategie: Custom URL Protocol

Tauri registriert `todolist://` als Systemprotokoll (Windows Registry / Linux .desktop).
Alle Integrationen feuern einfach eine URL — kein laufender Server nötig.

```
todolist://new?title=BETREFF&body=MAILTEXT&source=outlook&from=sender@firma.de
```

Tauri fängt ab, App öffnet sich (oder kommt in den Vordergrund), Formular ist vorbefüllt.

### Integration: Smart Paste (Fallback, immer verfügbar)

Wenn User Outlook-Mail oder Teams-Nachricht kopiert und in die App einfügt:

- App parst Clipboard auf bekannte Muster:
  - Outlook: `Von: ... Betreff: ... Datum: ...` → extrahiert Felder
  - Teams: `[Name] [Zeit]: Nachrichtentext` → extrahiert Felder
- Zeigt Preview: "Task aus Mail erstellen?" mit vorbefülltem Formular
- Bilder/Attachments aus Clipboard direkt als Anhang übernehmen

Kein Add-in nötig, funktioniert sofort out-of-the-box.

---

### Empfohlener Workflow (Outlook)

1. Mail öffnen
2. Ribbon: **[Als Task speichern]** klicken
3. ToDoList App springt in Vordergrund
4. Formular zeigt: Betreff als Titel, Mail-Body als Beschreibung, Anhänge gelistet
5. Priorität wählen (ein Klick)
6. **Enter** → gespeichert
7. Zurück zu Outlook in <10 Sekunden

---

### Datenmodell-Ergänzung

```sql
ALTER TABLE issues ADD COLUMN source TEXT;        -- 'outlook' | 'teams' | 'manual'
ALTER TABLE issues ADD COLUMN source_id TEXT;     -- Message-ID / Mail-ID für Deduplizierung
ALTER TABLE issues ADD COLUMN source_meta TEXT;   -- JSON: { from, date, thread_id }
```

---

## Technologie-Stack

### Framework: Tauri 2 + React + TypeScript

**Warum Tauri statt Electron?**
- 10–20x kleinere Binary (Electron ~150MB, Tauri ~5MB)
- Nativer WebView statt Chromium-Bundle
- Rust-Backend = sicherer, schneller
- Später: Tauri Mobile (iOS/Android) möglich

**Frontend:**
- React 19 + TypeScript
- Tailwind CSS v4 (utility-first, kein CSS-Chaos)
- Framer Motion (Animationen)
- Radix UI (zugängliche Basiskomponenten)

**Datenbank:**
- SQLite via `tauri-plugin-sql`
- Lokale Datei: `~/.config/todolist/data.db`
- Schema versioniert → Migration zu Postgres/Supabase später möglich

**Build/Tooling:**
- Vite (Frontend-Bundler, sehr schnell)
- pnpm (Package Manager)

---

## Architektur

```
todolist/
├── src/                    # React Frontend
│   ├── components/
│   │   ├── IssueList/      # Liste aller Todos
│   │   ├── IssueDetail/    # Einzelnes Todo (mit Kommentaren)
│   │   ├── NewIssueForm/   # Erstellen-Dialog
│   │   ├── CommentBox/     # Kommentar/Info anhängen
│   │   └── AttachmentZone/ # Drag & Drop / Paste
│   ├── stores/             # Zustand (Zustand-Library)
│   ├── hooks/              # Custom React Hooks
│   └── lib/
│       └── db.ts           # SQLite-Wrapper
├── src-tauri/              # Rust Backend
│   ├── src/
│   │   ├── commands/       # Tauri-Commands (DB, Dateisystem)
│   │   └── migrations/     # SQL-Migrations
│   └── tauri.conf.json
└── package.json
```

---

## Datenmodell (SQLite)

```sql
-- Haupt-Ticket
CREATE TABLE issues (
  id          TEXT PRIMARY KEY,  -- UUID
  title       TEXT NOT NULL,
  body        TEXT,              -- Markdown
  priority    TEXT CHECK(priority IN ('low','medium','high','critical')),
  status      TEXT CHECK(status IN ('open','in_progress','done','cancelled')),
  created_at  INTEGER NOT NULL,  -- Unix timestamp
  updated_at  INTEGER NOT NULL
);

-- Kommentare / Zusatzinfos (wie GitHub Issue Comments)
CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  issue_id    TEXT REFERENCES issues(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,     -- Markdown
  created_at  INTEGER NOT NULL
);

-- Anhänge (Dateien / Bilder)
CREATE TABLE attachments (
  id          TEXT PRIMARY KEY,
  issue_id    TEXT,              -- NULL = belongs to comment
  comment_id  TEXT,
  filename    TEXT NOT NULL,
  mime_type   TEXT,
  data        BLOB,              -- Datei-Bytes direkt in DB
  size_bytes  INTEGER,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE,
  FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- Labels (optional, erweiterbar)
CREATE TABLE labels (
  id    TEXT PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE issue_labels (
  issue_id  TEXT REFERENCES issues(id) ON DELETE CASCADE,
  label_id  TEXT REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, label_id)
);
```

---

## Feature-Implementierung

### 1. Neues Todo erstellen (inkl. Copy/Paste)

- Tastenkürzel `N` öffnet Modal mit Markdown-Editor
- Paste-Handler auf dem Editor:
  - Text → direkt einsetzen
  - Bild/Datei → `attachments`-Tabelle, Inline-Preview im Markdown (`![name](attachment://id)`)
- Drag & Drop über `AttachmentZone`-Komponente
- Priorität als Segmented Control (Low / Medium / High / Critical) mit Farb-Coding

### 2. Zusatzinfos anhängen (Issue-Comments)

- Issue-Detail-Seite zeigt Timeline: Erstell-Event + alle Kommentare chronologisch
- Unten: `CommentBox` mit eigenem Markdown-Editor
- Kommentare können ebenfalls Anhänge haben
- Inline-Edit per Doppelklick auf vorhandenen Kommentar

### 3. Priorität-Klassifizierung

- 4 Level: `low` (grau) / `medium` (blau) / `high` (orange) / `critical` (rot)
- Icons + Farbe in der Liste sichtbar
- Filter + Sortierung nach Priorität in der Seitenleiste

### 4. UI / Animationen

- Layout: 2-spaltig (Liste links, Detail rechts) — GitHub Issues Style
- Framer Motion:
  - Liste: `AnimatePresence` für Ein-/Ausblenden von Items
  - Detail: Slide-in von rechts
  - Status-Änderung: kurze Konfetti-Animation bei "Done"
  - Kommentare: sequentiell einfaden beim Laden
- Dark Mode out-of-the-box (CSS custom properties + Tailwind)
- Tastatur-Navigation: `j/k` zum Navigieren, `Enter` öffnet Detail

### 5. Multiplatform

- Tauri baut für:
  - Linux (AppImage, .deb)
  - Windows (.msi, .exe)
  - macOS (.dmg, .app)
  - Später: iOS/Android via Tauri Mobile
- CI/CD: GitHub Actions Matrix-Build für alle 3 Plattformen
- Kein plattformspezifischer Code nötig (Tauri abstrahiert Dateisystem, etc.)

### 6. Offline-first / Zukunftssicherheit

- Aktuell: 100% lokal, keine Netzwerkanfragen
- Datenbank-Schema bleibt kompatibel mit Postgres (SQLite-Dialekt bewusst einfach gehalten)
- Später erweiterbar: Tauri → Web-App (React-Code wiederverwendbar), DB → Supabase/PocketBase

---

## Entwicklungs-Roadmap

### Phase 1 — MVP (Kernfunktionen)
- [ ] Projekt-Setup (Tauri + React + Tailwind)
- [ ] SQLite-Integration + Migrations-System
- [ ] Issue erstellen / anzeigen / schließen
- [ ] Priorität setzen
- [ ] Basis-UI (Liste + Detail)

### Phase 2 — Vollständige Features
- [ ] Markdown-Editor mit Preview
- [ ] Copy/Paste von Dateien & Bildern
- [ ] Kommentar-System
- [ ] Labels
- [ ] Filter & Suche

### Phase 3 — Polish
- [ ] Animationen (Framer Motion)
- [ ] Dark Mode
- [ ] Tastatur-Navigation
- [ ] Auto-Update via Tauri Updater

### Phase 4 — Optional / Zukunft
- [ ] Sync via eigenen Server (PocketBase = 1 Binary, selbst hostbar)
- [ ] Mobile (Tauri Mobile)
- [ ] Import/Export (JSON, Markdown)

---

## Abhängigkeiten (package.json Kern)

```json
{
  "dependencies": {
    "react": "^19",
    "framer-motion": "^11",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-sql": "^2",
    "zustand": "^5",
    "@radix-ui/react-dialog": "latest",
    "@radix-ui/react-select": "latest",
    "tailwindcss": "^4"
  }
}
```

---

## Nächste Schritte

1. `pnpm create tauri-app` — Projekt initialisieren
2. SQLite-Plugin einrichten + erste Migration
3. Issue-Datenmodell implementieren
4. Basis-UI aufbauen
