# KlickGuide installieren und benutzen

## 1. Das passende Paket wählen

**Projekt-ZIP:** Enthält Quellcode, Dokumentation, Tests und die gebaute Erweiterung im Ordner `dist`. Der gesamte Ordner kann als Grundlage für ein eigenes Git-Repository dienen.

**Chrome-ZIP:** Enthält nur die gebaute Erweiterung. Nach dem Entpacken liegt `manifest.json` direkt im ausgewählten Installationsordner. Es ist keine CRX-Datei und keine automatische Installation.

Zum Benutzen der gebauten Erweiterung sind kein Node.js, kein API-Schlüssel und kein Server erforderlich. Der Zielbrowser muss lokale Erweiterungen zulassen. Vorgaben eines verwalteten Unternehmensbrowsers dürfen nicht umgangen werden.

## 2. In Chrome laden

Öffne `chrome://extensions`. Aktiviere rechts oben den Entwicklermodus und wähle **Entpackte Erweiterung laden**.

Beim vollständigen Projekt wählst du `klickguide/dist`. Beim Chrome-Paket wählst du den entpackten Ordner, der unmittelbar die `manifest.json` enthält.

Hefte KlickGuide über das Puzzleteil-Symbol an die Browserleiste. Lass den Installationsordner an einem dauerhaften Speicherort. Lösche ihn nicht nach der Installation.

Die Schritte entsprechen der [offiziellen Anleitung zum Laden entpackter Erweiterungen](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

### Einmaliger Websitezugriff

Öffne bei KlickGuide in `chrome://extensions` **Details → Websitezugriff** und wähle **Auf allen Websites**. Bestätige eine gegebenenfalls angezeigte neue Berechtigung. Fehlt die Freigabe, zeigt das KlickGuide-Popup **Zugriff auf alle Websites erlauben** sowie einen Weg zu den Erweiterungsdetails.

Diese Freigabe ermöglicht Aufnahmen über Domainwechsel hinweg; sie startet keine Aufnahme. KlickGuide injiziert den Recorder nur für eine ausdrücklich gestartete Sitzung in deren ausgewählten Tab. Browserrichtlinien werden nicht umgangen. Die Einstellung wird in der [Chrome-Hilfe zum Websitezugriff](https://support.google.com/chrome/answer/2664769?hl=de) beschrieben.

## 3. Einen ersten Ablauf aufnehmen

Öffne eine normale HTTP- oder HTTPS-Webseite. Für den ersten Versuch keine Anwendung mit vertraulichen Daten verwenden.

Klicke auf das KlickGuide-Symbol, gib einen Titel ein und wähle **Aufnahme starten**. Auf der Seite erscheint eine kleine Leiste. Warte vor dem ersten Klick auf **„Bild bereit · Nächsten Schritt ausführen“**. Nach einer Navigation, einem neuen Dialog oder dem Scrollen wird der neue Ausschnitt vorbereitet. Führe den nächsten Schritt aus, sobald das Bild bereit ist. **Pause** unterbricht die Aufnahme, **Screenshot** ergänzt einen sichtbaren Ausschnitt und **Fertig** beendet die Sitzung und öffnet die Anleitung.

Ein automatischer Klickschritt verwendet das geprüfte Bild **vor dem Klick**. So soll zum Beispiel „Alle ablehnen“ noch den Cookie-Dialog zeigen. „Screenshot“ nimmt dagegen ausdrücklich den aktuellen Zustand auf. Fehlt ein passendes Vorher-Bild, wird nicht ersatzweise ein Bild der Folgeseite eingesetzt.

Erfasst werden unterstützte semantische Klickziele wie Schaltflächen und Links sowie Änderungen an Feldern. Eingabewerte werden nicht als Schrittbeschreibung übernommen. Reine Mausbewegungen, Scrollen, Drag-and-drop und beliebige Canvas-Interaktionen werden nicht als verlässliche Arbeitsschritte interpretiert.

Auf einem neuen Tab oder in einem anderen Fenster wird pausiert. Normale Domainwechsel und Neuladen im selben Aufnahmetab verbinden die laufende Aufnahme erneut, ohne eine weitere Freigabe anzufordern. Eine zuvor manuell pausierte Aufnahme bleibt dabei pausiert. Eine Aufnahme kann nicht auf Browser-Einstellungsseiten, Erweiterungs-Stores, in Inkognito oder in erkannten geteilten Tabs gestartet werden.

Die Leiste kann je nach Gestaltung und Sicherheitsregeln der Webseite anders dargestellt werden. Das Popup in der Browserleiste bleibt der zweite Bedienweg.

## 4. Schritte bearbeiten

Links stehen die Schritte. Wähle einen Schritt, um Titel, Beschreibung und Bild zu bearbeiten. Über die Pfeile veränderst du die Reihenfolge. Zusätzliche Schritte, Duplikate und Löschungen sind ebenfalls möglich.

Ein Hinweis **Bild prüfen** bedeutet, dass der Screenshot ausgelassen wurde oder nicht zuverlässig aufgenommen werden konnte. Ergänze ein Bild oder einen verständlichen Text und entferne den Hinweis erst nach Prüfung.

**Text und Struktur speicherst du mit Speichern oder Strg+S / Cmd+S.** Der Editor ist nicht auf unsichtbares Autosave angewiesen. Beim Verlassen mit offenen Änderungen warnt er. Eine gleichzeitig geöffnete zweite Bearbeitungsansicht darf einen neueren gespeicherten Stand nicht still überschreiben; in diesem Fall erscheint ein Konflikthinweis. Kopiere noch benötigte eigene Texte vor dem Neuladen.

## 5. Bildbereiche markieren, schwärzen und zuschneiden

Wähle ein Werkzeug und ziehe auf dem Bild einen Bereich auf. Alternativ öffnest du **Bereich per Tastatur festlegen** und trägst X, Y, Breite und Höhe in Prozent ein.

**Markieren** erzeugt einen farbigen Rahmen. **Schwärzen** entfernt nach Bestätigung die Bildinformation im gewählten Rechteck aus dem gespeicherten Raster. **Zuschneiden** speichert nur den gewählten Bildausschnitt.

Klicke auf **Anwenden**. Bei Schwärzung und Zuschnitt wird zusätzlich bestätigt, dass das bisherige Raster ersetzt wird. Unangewendete Änderungen lassen sich zurücknehmen oder verwerfen. Bereits angewendete Schwärzungen lassen sich aus dieser Anleitung nicht rückgängig machen.

Frühere Exporte, Sicherungen und Kopien bleiben unverändert. Automatische Schwärzung ist standardmäßig ausgeschaltet und kann in den Einstellungen aktiviert werden. Manuelles Schwärzen bleibt im Bildeditor verfügbar.

## 6. Export und Sicherung

Öffne **Prüfen & exportieren**, scrolle durch die gesamte Vorschau und bestätige die Prüfung. Danach stehen vier Wege zur Verfügung:

| Format | Verwendung |
| --- | --- |
| HTML | Eine eigenständige Datei mit eingebetteten Bildern. Ohne Konto im Browser lesbar. Enthält einfache Abhakfelder; deren Zustand ist kein gespeicherter Lernfortschritt. |
| Markdown ZIP | `README.md` und zugehörige PNGs. ZIP vor der Verwendung vollständig entpacken. |
| Projektsicherung | `.klickguide.json` zum späteren Import und Weiterbearbeiten. Markierungen bleiben bearbeitbar, entfernte Bildinhalte nicht. |
| PDF / Drucken | Öffnet eine eigene Druckvorschau. Erneut prüfen und den Browser-Druckdialog öffnen; dort gegebenenfalls **Als PDF speichern** wählen. Kein unabhängiger PDF-Generator. |

Alle Exporte sind unverschlüsselte Dateien. Lege sie nur an geeigneten Orten ab. In der Bibliothek kannst du Projektsicherungen über **Importieren** zurückholen. Jeder Import erhält neue IDs und überschreibt keine vorhandene Anleitung.

## 7. Lokal mit Beispieldaten testen

Im vollständigen Quellcode-Paket:

```sh
npm ci
npm run demo
```

Öffne die im Terminal angezeigte Adresse, standardmäßig `http://127.0.0.1:4177`. Die Seite „Fieldnotes“ enthält ausschließlich erfundene Aufgaben und Testfelder. Mit `Strg+C` beendest du den lokalen Server.

Ohne Node.js kannst du in der Bibliothek die Datei `examples/first-guide.klickguide.json` importieren oder eine Anleitung manuell anlegen. Die Aufnahme auf einer lokal als `file://` geöffneten HTML-Datei ist bewusst nicht vorgesehen.

## Häufige Fragen

**Meine Bibliothek ist leer.** Prüfe, ob du dieselbe Browserinstallation, dasselbe Profil und dieselbe Erweiterungsinstallation verwendest. Daten werden nicht synchronisiert. Das Verschieben eines entpackten Erweiterungsordners kann zu einer anderen Erweiterungs-ID führen. Sichere Anleitungen vor einem Umzug oder einer Neuinstallation.

**Ein Klick hat kein Bild.** Ein neu eingeblendeter oder noch veränderlicher Seitenzustand war möglicherweise noch nicht geprüft. Warte bei einer neuen Aufnahme auf „Bild bereit“. Die Erweiterung fügt absichtlich kein Bild der falschen Folgeseite ein. Der empfangene Textschritt bleibt erhalten und kann im Editor ergänzt werden. Der manuelle Screenshot-Knopf stellt keine verschwundenen Dialoge wieder her.

**Das alte Bild ist nach dem Update immer noch falsch.** Das Update verändert bestehende Anleitungen nicht automatisch und kann fehlende ursprüngliche Bilddaten nicht rekonstruieren. Nimm den betroffenen Ablauf neu auf oder ersetze einzelne Bilder im Editor.

**Der Browser hat die Aufnahme nicht freigegeben.** Prüfe Version **1.0.2** und **Details → Websitezugriff → Auf allen Websites**. Lade nach einem Update auch die Webseite neu. Wiederholtes Anklicken des Symbols ersetzt diese dauerhafte Berechtigung nicht. Bei einer weiterhin fehlgeschlagenen Verbindung können Browserrichtlinien oder geschützte Seiten den Zugriff verhindern.

**Ein Bild ist zu groß.** Verkleinere es vor dem Import. Unterstützt werden PNG und JPEG, höchstens 12 MiB und 20 Millionen Pixel je Bild. SVG wird nicht angenommen.

**Wie aktualisiere ich?** Zuerst Projekte sichern und die Aufnahme beenden. Die gebauten Dateien aus dem Chrome-Paket in den bisherigen Installationsordner kopieren oder die Quelldateien aktualisieren und neu bauen. Dann KlickGuide in `chrome://extensions` neu laden, neue Berechtigungen bestätigen und die Webseite ebenfalls neu laden. Details stehen in der [Update-Anleitung](UPDATE-1.0.2.de.md). Daten sollten im selben Erweiterungsprofil erhalten bleiben; eine Sicherung ist trotzdem erforderlich.
