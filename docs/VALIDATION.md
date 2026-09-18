# Prüfprotokoll: KlickGuide 1.0.2

**Datum:** 18. September 2026. Dieses Protokoll unterscheidet tatsächlich ausgeführte Prüfungen, simulierte Schnittstellen und offene Integration. Es ist keine Sicherheitszertifizierung und keine Zusage vollständiger Fehlerfreiheit.

## Ausgeführt und bestanden

| Prüfung | Ergebnis |
| --- | --- |
| Quellcodeformat | Bestanden mit dem projekteeigenen, fest versionierten TypeScript-Formatter. |
| Strenge TypeScript-Prüfung | Bestanden. |
| Build | Manifest-V3-Erweiterung erfolgreich nach `dist` gebaut. |
| Node-Kern-/Vertragstests | **204 bestanden, 0 fehlgeschlagen**; 46 zusätzliche Fälle gegenüber 1.0.1. |
| Chromium-DOM-/Pixel-/Layouttests | **13 bestanden, 0 fehlgeschlagen** mit echtem Chromium auf synthetischen Seiten, jedoch ausdrücklich mit Testtransport statt installierter Erweiterung. |
| Statische Release-Prüfung | Bestanden: konsistente Versionen einschließlich Recorder-Injektionskennung, vorhandene Einstiegspunkte, lokale Importe, unveränderte API-/Hostberechtigungen und keine verbotenen Netzwerk-/HTML-Sinks. |
| Python-Syntax | Beide Testdateien kompiliert. Das allein sagt nichts über deren Testergebnis aus. |
| Paketprüfung | ZIP-Integrität, vollständiger Dateivergleich mit `dist`, Versionskonsistenz und erneuter Build aus dem ausgepackten Quellcode geprüft. |

Rohprotokolle der ausgeführten Prüfungen liegen unter `docs/reports/`. Die Node-Vertragstests verwenden tatsächliche Worker-/Recorder-Module mit Testdoubles für Chrome, IndexedDB und Rasterverarbeitung. Sie prüfen unter anderem Vorher-Bildauswahl, widersprüchliche Dokumente/Ansichten, schwebende Navigationen, Berechtigungen, Rate Limits, capture-spezifisches Wiederherstellen, doppelte Nachrichten und Worker-Neustart.

## Was die 13 Browser-DOM-Tests beweisen und was nicht

Die Tests führen den gebauten Produktions-Recorder und dessen Frame-Auswahl in echtem Chromium aus. Maus-/Tastaturereignisse werden über Playwright im Browser erzeugt. Die Tests prüfen tatsächliche Bildpixel: Der Testdialog ist im gespeicherten Vorher-Bild noch sichtbar, die Aufnahmeleiste nicht. Zusätzlich werden Suchergebnistitel, schnelle unveränderte Klicks, neu gerenderte Ziele, offene Shadow Roots, private Feldbeschriftungen sowie proportionale Editor-Vorschauen geprüft.

**Die Grenze:** Chrome-Nachrichtentransport und Screenshot-API werden durch einen Testadapter ersetzt. Screenshots stammen in dieser Suite von Playwright. IndexedDB und die vollständige native Datenschutzpipeline laufen nicht durch diesen Adapter. Die Seiten werden über `set_content` mit erfundenen Inhalten aufgebaut. Dies ist kein Nachweis einer installierten Erweiterung auf der Webseite aus dem Fehlerbericht und keine vollständige visuelle Abnahme des Editors.

## Native Erweiterungsintegration: Versuch gescheitert, weiterhin offen

Der einzelne native Test `ExtensionTests.test_manual_guide_is_editable_and_persisted` wurde mit einer unveränderten Kopie des Produktionsmanifests versucht. Er scheiterte bereits in der Einrichtung: Nach 12 Sekunden erschien kein Erweiterungs-Service-Worker. **Kein fachlicher Testschritt dieses Falls wurde erreicht.** Das Fehlerprotokoll liegt unter `docs/reports/native-attempt.txt`.

Die vorhandene Umgebung setzt `ExtensionInstallBlocklist: ["*"]`, `URLBlocklist: ["*"]` und deaktivierten Druck. Diese Richtlinien wurden nicht geändert oder umgangen. Der fehlgeschlagene Versuch wird nicht als bestandener oder übersprungener Test umgedeutet. Die übrigen 15 nativen Erweiterungstests wurden hier nicht erneut ausgeführt.

Weiterhin offen: native Chrome-Berechtigungsdialoge, ein reales In-place-Update mit vorhandenen Anleitungen, tatsächliche `captureVisibleTab`-Integration auf Drittwebseiten, Monitor-/Zoomkombinationen, Druck/PDF, vollständige Barrierefreiheit und ein unabhängiger Sicherheitsreview. Die mitgelieferte CI-Konfiguration ist kein Nachweis eines erfolgreichen GitHub-Actions-Laufs.

## Verwendete Umgebung

Node.js 22.16.0, TypeScript 5.8.3, Python 3.13, Playwright 1.57.0, Pillow 12.3.0 und Chromium 144.0.7559.96 auf Linux. Diese Angaben beschreiben den Prüflauf, keine allgemeine Mindestkompatibilität oder Empfehlung bestimmter Versionsstände.

Der vorhandene, zum Lockfile passende TypeScript-Compiler wurde lokal eingebunden. Ein frischer `npm ci`-Download aus der Registry ließ sich in dieser Umgebung nicht verifizieren; auch ein aktueller Dependency-Sicherheitsaudit wurde nicht ausgeführt. Das Paket enthält weder die lokale Compiler-Verknüpfung noch `node_modules`. Python-Abhängigkeiten gehören ausschließlich zur Testsuite, nicht zur Erweiterung.

## Nächste Abnahme auf einem geeigneten Rechner

Das Update nach `UPDATE-1.0.2.de.md` im bisherigen Installationsordner laden, auch die Webseite neu laden und eine neue Aufnahme mit Testdaten erstellen. Auf **Bild bereit** warten, einen Dialog schließen, einen Link öffnen und einen manuellen Screenshot ergänzen. Jeder Klick muss mit dem passenden Vorher-Bild und ohne Aufnahmeleiste dokumentiert sein; bei fehlendem Vorher-Bild muss ein sichtbarer Hinweis erscheinen. Danach die native Suite und die manuelle Checkliste in `TESTING.md` ausführen.

Alte falsche oder fehlende Screenshots lassen sich ohne die ursprünglichen Bilddaten nicht nachträglich reparieren. Die Datenbank und das Sicherungsformat ändern sich nicht; trotzdem vor dem Update Projekte sichern.
