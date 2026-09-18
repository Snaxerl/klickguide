# KlickGuide 1.0.2 aktualisieren

Dieses Update korrigiert den Zeitpunkt automatischer Screenshots, das Ausblenden der Aufnahmeleiste und die Beschriftung zusammengesetzter Links. Websitezugriff, Datenbank und Sicherungsformat bleiben gegenüber 1.0.1 unverändert.

## Bestehende Installation beibehalten

1. Laufende Aufnahme beenden, offene Editoränderungen speichern und wichtige Anleitungen als Projektsicherung exportieren.
2. Das neue **Chrome-ZIP** entpacken. Alle enthaltenen Dateien in den **bisherigen geladenen Erweiterungsordner** kopieren und vorhandene Dateien ersetzen. `manifest.json` muss genau am bisherigen Pfad bleiben. Bei einer Installation aus dem vollständigen Projekt ist das gewöhnlich `klickguide/dist`.
3. `chrome://extensions` öffnen, KlickGuide mit dem kreisförmigen Pfeil neu laden und **Version 1.0.2** prüfen. **Details → Websitezugriff → Auf allen Websites** muss weiterhin eingestellt sein.
4. Auch die aufgenommene Webseite mit **F5** neu laden. Das ersetzt den alten Recorder im bereits geöffneten Tab. Anschließend eine **neue Aufnahme** starten.

Nicht deinstallieren und nicht ungesichert einen anderen Installationsordner auswählen. Das Update sieht keine Datenmigration vor; eine Sicherung ist trotzdem sinnvoll. Der offizielle Aktualisierungsweg für entpackte Erweiterungen und Content Scripts ist in der [Chrome-Anleitung](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#reload) beschrieben.

## Aufnahme ausprobieren

Starte zunächst auf einer Webseite mit erfundenen Daten. Warte auf **„Bild bereit · Nächsten Schritt ausführen“**. Betätige eine Schaltfläche. Nach Navigation, Scrollen oder einem neuen Dialog warte wieder kurz auf die Bereitschaftsanzeige.

Ein automatischer Klickschritt soll das zugehörige Element **vor der Aktion** zeigen. Zum Beispiel muss beim Ablehnen eines Cookie-Dialogs noch der Dialog sichtbar sein. Die Aufnahmeleiste darf nicht im Screenshot erscheinen. Zusammengesetzte Suchergebnislinks sollen bevorzugt ihre Überschrift als Schritttext verwenden.

Die Funktion **Screenshot** ergänzt dagegen bewusst ein Bild des aktuellen Zustands. Sie kann einen bereits geschlossenen Dialog nicht nachträglich aufnehmen.

## Grenzen und alte Aufnahmen

Die Erweiterung hält echte Benutzerklicks nicht an und spielt sie nicht künstlich erneut ab. Bei sehr schnellen Änderungen, stark animierten Seiten oder nicht erkannten Bedienelementen kann weiterhin ein Bild fehlen. Dann bleibt der empfangene Schritt mit einem Prüfhinweis erhalten; ein unpassendes Bild der Folgeseite wird nicht als Ersatz eingefügt.

Bereits vorhandene falsche oder fehlende Bilder werden nicht automatisch repariert. Nimm den betroffenen Ablauf neu auf oder ersetze einzelne Screenshots im Editor. Die automatische Maskierung ersetzt weiterhin nicht die Prüfung auf vertrauliche Inhalte vor einem Export.

## Quellcode aktualisieren

Im Projektordner nach Übernahme der neuen Quelldateien:

```sh
npm ci
npm run check
npm run package
```

Danach die bestehende Erweiterung aus `dist` sowie den Aufnahmetab neu laden. Für die Verwendung des fertigen Chrome-Pakets sind diese Entwicklungsbefehle nicht erforderlich.

## Geprüfter Umfang

204 Node-Kern-/Vertragstests und 13 Chromium-DOM-/Pixel-/Layouttests bestanden. Die DOM-Suite verwendet einen Testtransport und ist keine installierte Erweiterung. Ein nativer Installationstest wurde versucht und scheiterte vor den Testschritten in der gesperrten Browserumgebung. Vollständiger Prüfstand: [VALIDATION.md](VALIDATION.md).
