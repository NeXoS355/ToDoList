# ToDoList

Eine GitHub-Issues-ähnliche, **offline-first** TODO-Desktop-App. Lokale SQLite-Datenbank, modernes Dark-UI, plattformübergreifend (Windows / Linux / macOS) via **Tauri 2**.

---

## Features

- **Issues** anlegen, ansehen, bearbeiten, löschen (Titel, Beschreibung, Status, Priorität)
- **Status**: `open` · `in_progress` · `done` · `cancelled`
- **Priorität**: `low` · `medium` · `high` · `critical` (farbcodiert, Liste danach sortiert)
- **Labels** (bug / feature / question / docs) – mehrfach pro Issue
- **Kommentare / Updates** pro Issue (Timeline)
- **Datei-Anhänge** pro Issue – per Datei-Dialog auswählen, herunterladen, löschen
- **Smart Paste**: Outlook-Mail ins Beschreibungsfeld einfügen → Betreff wird automatisch Titel, Body wird übernommen
- **Suche & Filter** (nach Status) in der Seitenleiste
- **Tastenkürzel**: `N` = neues Issue, `Esc` = Dialog schließen, `Strg+Enter` = Kommentar absenden

---

## Tech-Stack

| Bereich     | Technologie |
|-------------|-------------|
| Shell       | Tauri 2 (Rust-Backend, nativer WebView) |
| Frontend    | React 19 + TypeScript |
| Build       | Vite 7 |
| Styling     | Tailwind CSS v4 |
| Animation   | Framer Motion |
| State       | Zustand |
| Datenbank   | SQLite via `tauri-plugin-sql` |
| Paketmanager| pnpm |

---

## Projektstruktur

```
app/
├── src/                          # React-Frontend
│   ├── components/
│   │   ├── IssueList/            # Liste + Suche + Statusfilter
│   │   ├── IssueDetail/          # Detailansicht: Status/Priorität, Anhänge, Kommentare
│   │   ├── NewIssueForm/         # Erstell-Dialog (inkl. Smart Paste)
│   │   └── CommentBox/           # Kommentare anhängen
│   ├── stores/issueStore.ts      # Zustand-Store (alle Aktionen)
│   ├── lib/
│   │   ├── db.ts                 # SQLite-Zugriff (Issues, Comments, Attachments, Labels)
│   │   └── types.ts              # Typen + PRIORITY/STATUS-Config + formatBytes
│   ├── App.tsx                   # Layout (Header + 2-Spalten)
│   └── App.css                   # Tailwind-Import, Design-Tokens, globale Styles
├── src-tauri/                    # Rust-Backend
│   ├── src/lib.rs                # Plugin-Registrierung (sql, opener) + Migrations
│   ├── migrations/001_initial.sql
│   ├── capabilities/default.json # Berechtigungen (sql, opener)
│   └── tauri.conf.json
└── package.json
```

---

## Voraussetzungen

Auf **jedem** Rechner: [Node.js LTS](https://nodejs.org), [Rust](https://rustup.rs) (MSVC- bzw. System-Toolchain) und **pnpm** (`corepack enable && corepack prepare pnpm@latest --activate`).

Zusätzlich plattformspezifisch:

- **Windows**: Visual Studio Build Tools mit Workload *„Desktop development with C++"* + WebView2-Runtime (auf Win 10/11 i.d.R. vorinstalliert).
- **Linux (Debian/Ubuntu)**: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- **macOS**: Xcode Command Line Tools (`xcode-select --install`).

---

## Entwicklung

Alle Befehle im Ordner `app/`.

```bash
pnpm install
```

**App im Dev-Modus starten** (Vite + Rust-Backend + Fenster, mit Hot-Reload):

```bash
pnpm tauri:dev
```

Funktioniert plattformübergreifend (Windows / Linux / macOS) – das Script setzt via `cross-env` die Variable `WEBKIT_DISABLE_DMABUF_RENDERER=1` (nötig für manche Linux-Setups, auf Windows/macOS harmlos ignoriert). Alternativ direkt: `pnpm tauri dev`.

Nur das Frontend im Browser (ohne Tauri-Backend, DB-Aufrufe schlagen dann fehl):

```bash
pnpm dev            # http://localhost:1420
```

---

## Build (Installer / Binary)

Der Build muss **auf dem jeweiligen Zielsystem** laufen (kein einfaches Cross-Compiling). Ergebnis liegt unter `app/src-tauri/target/release/bundle/`, das nackte Binary unter `app/src-tauri/target/release/`.

| Plattform | Befehl |
|-----------|--------|
| Windows   | `pnpm tauri build` |
| macOS     | `pnpm tauri build` |
| Linux     | `pnpm build:linux` (umgeht das AppImage-/FUSE-Problem) |

> Das Release-Profil (`[profile.release]` in `Cargo.toml`: LTO, `opt-level="s"`, `strip`) erzeugt ein kleines, schnell ladendes Binary. Unter Linux nutzt der Build zusätzlich den `lld`-Linker (`src-tauri/.cargo/config.toml`).

### Windows – exakte Schritte

1. Tools installieren (PowerShell):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Rustlang.Rustup
   winget install --id Microsoft.VisualStudio.2022.BuildTools `
     --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   winget install Microsoft.EdgeWebView2Runtime
   ```
2. **PowerShell neu öffnen**, dann:
   ```powershell
   rustup default stable-msvc
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
3. Projekt kopieren (**ohne** `app/node_modules` und `app/src-tauri/target` – die sind plattformspezifisch), dann:
   ```powershell
   cd C:\Pfad\zu\ToDoList\app
   pnpm install
   pnpm tauri build
   ```

**Ergebnis:**

| Artefakt        | Pfad |
|-----------------|------|
| MSI-Installer   | `src-tauri\target\release\bundle\msi\ToDoList_0.1.0_x64_en-US.msi` |
| EXE-Installer   | `src-tauri\target\release\bundle\nsis\ToDoList_0.1.0_x64-setup.exe` |
| Standalone-EXE  | `src-tauri\target\release\ToDoList.exe` (braucht WebView2) |

**Häufige Fehler:** `link.exe not found` → C++ Build Tools fehlen oder Terminal nicht neu gestartet. `toolchain ...windows-gnu` → `rustup default stable-msvc` vergessen. Hängende Altartefakte → `target` + `node_modules` löschen, neu bauen.

### Linux

```bash
pnpm build:linux
```

Das Script setzt `APPIMAGE_EXTRACT_AND_RUN=1` und `NO_STRIP=1` (via `cross-env`). Hintergrund: `linuxdeploy` ist selbst ein AppImage und kann sich auf FUSE-eingeschränkten / Wayland-Systemen nicht per FUSE mounten → `pnpm tauri build` bricht sonst mit `failed to run linuxdeploy` ab. `APPIMAGE_EXTRACT_AND_RUN=1` lässt die AppImage-Tools entpacken statt mounten.

**Ergebnis** (`src-tauri/target/release/`):

| Artefakt       | Pfad |
|----------------|------|
| AppImage       | `bundle/appimage/ToDoList_0.1.0_amd64.AppImage` |
| Debian-Paket   | `bundle/deb/ToDoList_0.1.0_amd64.deb` |
| RPM-Paket      | `bundle/rpm/ToDoList-0.1.0-1.x86_64.rpm` |
| Standalone     | `ToDoList` (direkt startbar) |

> **Nur AppImage/deb/rpm?** Dann reicht z. B. `pnpm tauri build --bundles deb,rpm` (überspringt linuxdeploy ganz).

**Wayland-Hinweis:** Die App setzt beim Start intern `WEBKIT_DISABLE_DMABUF_RENDERER=1` (siehe `src-tauri/src/lib.rs`, nur Linux). Ohne das stürzt WebKitGTK auf manchen Compositors (KWin/Wayland) mit `Error 71 (Protocol error) dispatching to Wayland display` ab. Überschreibbar durch Setzen einer eigenen Env-Var vor dem Start.

### macOS

```bash
pnpm tauri build
```

Voraussetzung: Xcode Command Line Tools (`xcode-select --install`). **Ergebnis** (`src-tauri/target/release/bundle/`):

| Artefakt | Pfad |
|----------|------|
| DMG      | `dmg/ToDoList_0.1.0_<arch>.dmg` |
| App-Bundle | `macos/ToDoList.app` |

(`<arch>` = `aarch64` auf Apple Silicon, `x64` auf Intel. Für signierte/notarisierte Builds zusätzlich Apple-Developer-Zertifikate nötig.)

---

## Daten & Speicherort

Die SQLite-Datenbank `todolist.db` liegt im App-Konfig-Verzeichnis (eigene, leere DB pro Rechner):

- **Windows**: `%APPDATA%\com.nexos355.todolist\`
- **Linux**: `~/.config/com.nexos355.todolist/`
- **macOS**: `~/Library/Application Support/com.nexos355.todolist/`

Datei-Anhänge werden **base64-kodiert direkt in der DB** gespeichert (in der `attachments`-Tabelle). Vorteil: keine externen Dateien, alles in einer DB. Nachteil: große Dateien blähen die DB auf – für Screenshots/Dokumente unkritisch.

Das Schema wird beim ersten Start automatisch per Migration (`migrations/001_initial.sql`) angelegt.

---

## Entwicklungs-Hinweise

- **Tailwind v4 `@source` (`src/App.css`):** Diese Setup-Version scannt **keine** Wildcard-Unterverzeichnisse (`**` oder `*/`). Jeder Komponentenordner ist einzeln gelistet. **Beim Anlegen eines neuen Ordners unter `src/components/` eine passende `@source`-Zeile ergänzen**, sonst werden dessen Tailwind-Klassen nicht generiert (Elemente erscheinen ungestylt/„gestaucht").
- **Typecheck**: `pnpm exec tsc --noEmit`
- **Tauri-Berechtigungen**: in `src-tauri/capabilities/default.json` (aktuell `sql:*` und `opener:default`).

---

## Lizenz / Status

Privates Projekt, Version 0.1.0. Roadmap-Ideen (Outlook-/Teams-Integration via `todolist://`-Protokoll, Sync, Mobile) siehe `../PLAN.md`.
