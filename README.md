# AI Tools Hub

Vollautomatisierter KI-News-Blog auf Basis von Astro.  
Das Projekt erstellt taeglich automatisch neue Beitraege aus RSS-Quellen und markiert Inhalte sichtbar als KI-generiert.

## Ziel

- 0 EUR Startkosten (GitHub + Free Hosting)
- 3-5 neue News-Beitraege pro Tag
- Transparente Quellenangaben und KI-Hinweise

## Lokale Entwicklung

```sh
npm install
npm run dev
```

## Wichtige Commands

- `npm run generate:news` - erzeugt neue Artikel aus RSS-Quellen
- `npm run build` - Production-Build
- `npm run preview` - lokales Preview

## Automatisierung

Die Datei `.github/workflows/news-pipeline.yml` fuehrt alle 4 Stunden aus:

1. Dependencies installieren
2. `npm run generate:news` ausfuehren
3. neue Inhalte unter `src/content/blog` committen

## Quellen konfigurieren

Die Feed-Liste steht in `scripts/news-sources.json`.

## Rechtliches

Passe vor dem Livegang zwingend an:

- `src/pages/impressum.astro`
- `src/pages/datenschutz.astro`

Die dort enthaltenen Daten sind Vorlagen.
