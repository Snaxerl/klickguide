# KlickGuide

**Einmal vormachen. Klar erklären.**

KlickGuide ist eine lokale Browser-Erweiterung, die aus einem Arbeitsablauf eine bearbeitbare Schritt-für-Schritt-Anleitung macht. Nimm einen Ablauf auf, korrigiere die Schritte und gib eine bewusst geprüfte Anleitung weiter.

Kein Konto. Kein Backend. Keine KI-Dienste. Keine Laufzeit-Abhängigkeiten.

> **Prüfstand 1.0.2:** Typprüfung, Build, **204 Kern-/Vertragstests** und **13 Chromium-DOM-/Pixel-/Layouttests** bestanden. Die DOM-Tests verwenden den echten Recorder mit einem Testtransport; sie sind keine installierte Erweiterung. Ein nativer Erweiterungstest scheiterte bereits beim Start an der hier gesperrten Installation. Native Berechtigungen, vollständige Integration und Druck sind weiterhin im Zielbrowser zu prüfen. [Prüfprotokoll](docs/VALIDATION.md).

## Was enthalten ist

| Bereich | Umsetzung |
| --- | --- |
| Aufnahme | Bewusst gestartete Aufnahme eines aktiven Tabs, Klick- und Feldereignisse, geprüfte Vorher-Bilder, Bereitschaftsanzeige, manuelle Screenshots, Pause und Stopp. |
| Schritttexte | Deterministische deutsche oder englische Beschreibungen aus erkennbaren Beschriftungen. Keine Eingabewerte als Text. |
| Bildschutz | Manuelle Schwärzung im Editor; optionale automatische Schwärzung kann in den Einstellungen aktiviert werden. |
| Editor | Texte, Reihenfolge, Schritte hinzufügen, duplizieren und löschen; PNG/JPEG hochladen, Bilder ersetzen und entfernen. |
| Bildbearbeitung | Rechteckmarkierungen, permanentes Schwärzen und Zuschneiden. Mausbedienung und alternative Prozent-Koordinaten. |
| Bibliothek | Lokale Speicherung, Suche, Tags, Sortierung, Duplikate und Löschung. |
| Dokumente | Titel, Beschreibung, Autor, Akzentfarbe, Sprache und Prüfstatus. |
| Export | Eigenständiges HTML, Markdown mit PNGs als ZIP, editierbare Projektsicherung und Druckansicht für PDF. |
| Datenintegrität | Atomare IndexedDB-Transaktionen, Versionsprüfung bei parallelem Bearbeiten, validierter Import mit neuen IDs. |


## Update 1.0.2: das Bild vor dem Klick

Automatische Klickschritte verwenden jetzt ausschließlich ein geprüftes Bild des Zustands **vor der Aktion**. Während einer gestarteten Aufnahme bereitet der Recorder Bilder vor; **„Bild bereit“** zeigt den bereiten Zustand an. Seitendokument, beobachtete Änderungen, Scrollposition und Zielposition müssen passen. Ein Bild der Folgeseite wird nicht nachträglich einem Navigationsklick zugeordnet.

Die Aufnahmeleiste wird mit einer bestätigten, priorisierten CSS-Regel ausgeblendet. Suchergebnis-Links bevorzugen ihre eigentliche Überschrift statt Herausgeber und URL. Lange Titel werden in der Seitenleiste gekürzt angezeigt; die Bildvorschau passt sich in der Höhe an, ohne das gespeicherte Raster zu verkleinern.

Dauerhafter Websitezugriff und die Fortsetzung im gleichen Tab aus 1.0.1 bleiben erhalten. Es kommen keine Berechtigungen hinzu. Ein manueller Screenshot nimmt bewusst den aktuellen Zustand auf; er ist kein rückwirkendes Bild der letzten Aktion.

**Bereits installiert?** Anleitungen sichern, Dateien im bisherigen Installationsordner ersetzen, Erweiterung und Webseite neu laden. Die Datenbank und das Sicherungsformat bleiben unverändert. Alte falsche oder fehlende Bilder werden nicht automatisch rekonstruiert. [Update-Anleitung](docs/UPDATE-1.0.2.de.md).

## Ein Ablauf

```text
Webseite öffnen → Aufnahme starten → Bild bereit → Aufgabe → Beenden
                                                            ↓
Bibliothek ← lokal speichern ← Schritte und Bilder bearbeiten
                                      ↓
                            Vorschau prüfen → Export
```

Aufgenommene Schritte werden einzeln gespeichert. Änderungen im Editor speicherst du ausdrücklich über **Speichern** oder `Strg+S` / `Cmd+S`. Bildänderungen werden separat mit **Anwenden** bestätigt. Vor jedem Export steht eine vollständige Vorschau mit Prüfbestätigung.

Die Software erfasst sichtbare Ausschnitte, keine Videos und keine komplette Webseite durch automatisches Scrollen. Wurde ein unterstütztes Ereignis empfangen, aber kein passendes Vorher-Bild gefunden, bleibt es als Textschritt mit einem sichtbaren Hinweis erhalten. Reine CSS-Animationen und beliebige Drittseiten lassen sich nicht vollständig über DOM-Prüfungen absichern. Eine automatische Aufnahme kann nicht auf jeder Webseite einen brauchbaren Screenshot garantieren.

## Entwickeln

Voraussetzung: Node.js ab **22.16.0** und npm. Der Compiler ist im Lockfile auf TypeScript 5.8.3 festgelegt. Diese Versionsangabe beschreibt den verwendeten Build, nicht die Behauptung, dies seien die neuesten Releases.

```sh
npm ci
npm run check
npm run package
```

`npm run check` prüft Formatierung, strenge TypeScript-Regeln, Tests und die gebaute Erweiterung. `npm run package` erstellt zusätzlich die Erweiterungs-ZIP und ihre SHA-256-Datei in `release/`.

| Befehl | Zweck |
| --- | --- |
| `npm run build` | Erweiterung nach `dist/` übersetzen. |
| `npm run typecheck` | Typprüfung ohne Ausgabe. |
| `npm test` | Neu bauen und alle Node-Tests ausführen. |
| `npm run test:coverage` | Node-Tests mit Coverage-Bericht. Kein Ersatz für UI-Tests. |
| `npm run format` | TypeScript- und JavaScript-Quelldateien vereinheitlichen. |
| `npm run demo` | Lokale Testseite mit ausschließlich erfundenen Daten starten. |
| `npm run test:dom` | Echter Chromium-DOM und Bildpixel mit Testtransport, ohne Erweiterungsinstallation. |
| `npm run test:browser` | Native Erweiterungsintegration; vorher Python-Abhängigkeiten und Chromium installieren. |

Nach Änderungen erst die Aufnahme beenden, neu bauen, die Erweiterung in Chrome neu laden und anschließend die aufgenommene Webseite neu laden. `dist/` ist ein Build-Ergebnis und wird bei jedem Build ersetzt.

## Projektaufbau

```text
src/
  core/          Modelle, Validierung, Text, Geometrie, Export, ZIP
  background/    Service Worker, Sitzungssteuerung und Aufnahmepipeline
  recorder/      Bewusst injiziertes Content Script
  platform/      Browser-Schnittstellen, IndexedDB und Bildverarbeitung
  ui/            Bibliothek, Popup, Editor, Bildwerkzeuge und Druck
public/          Manifest, HTML, CSS und lokale Icons
scripts/         Build, Prüfung, Formatierung, Tests und Paketierung
tests/
  unit/          Kern- und Vertragstests mit Node
  browser/       Getrennte DOM-/Pixeltests und native Erweiterungstests
  fixtures/      Kleine lokale Demo-Anwendung
examples/        Importierbare Anleitung ohne Bilder oder echte Daten
docs/            Architektur, Datenschutz, Installation und Prüfstand
.github/         CI, Dependency-Updates und Beitragstemplates
```

## Bewusste Grenzen

KlickGuide ist kein Passwortmanager, kein Überwachungswerkzeug, keine vollständige Datenklassifizierung und kein revisionssicheres Archiv. Die optionale automatische Schwärzung erkennt nicht alle vertraulichen Inhalte. Freier Text, Bilder, ungewöhnliche Widgets und geschlossene Shadow-DOM-Bereiche müssen insbesondere manuell geprüft werden.

Schwärzungen ersetzen das gespeicherte Raster der aktuellen Anleitung. Bereits exportierte Dateien, duplizierte Anleitungen und frühere Sicherungen werden nicht nachträglich verändert. Sichere Löschung auf dem physischen Datenträger wird nicht zugesichert.

Eine Anleitung ist auf 300 Schritte begrenzt. Einzelbilder dürfen höchstens 12 MiB und 20 Millionen Pixel haben; Projektsicherungen höchstens 80 MiB. Browser-Speichergrenzen können vorher erreicht werden. Wichtige Dokumente regelmäßig als Projektsicherung exportieren.

## Weiterführendes

[Architektur](docs/ARCHITECTURE.md) · [Datenschutz](docs/PRIVACY.md) · [Tests](docs/TESTING.md) · [Validierung](docs/VALIDATION.md) · [Beiträge](CONTRIBUTING.md) · [Sicherheit](SECURITY.md) · [Änderungen](CHANGELOG.md)

## Lizenz

MIT. Siehe [LICENSE](LICENSE).
