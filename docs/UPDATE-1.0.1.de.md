# Update auf KlickGuide 1.0.1

## Was die Meldung verursacht hat

Version 1.0.0 hatte nur vorübergehenden `activeTab`-Zugriff. Zusätzlich pausierte der Aufnahmecode bei einem neuen Seitenursprung ausdrücklich. Deshalb konnte allein eine Einstellung im bisherigen Paket das Problem nicht dauerhaft beheben.

Version 1.0.1 deklariert `host_permissions: ["<all_urls>"]` und verbindet den Recorder nach normaler Navigation im selben Aufnahmetab neu. Auch `captureVisibleTab` benötigt für dauerhaften Zugriff dieses Hostmuster. Manuelle Pausen und Pausen beim Tab-/Fensterwechsel bleiben bestehen.

## Vorhandene Installation aktualisieren

1. **Laufende Aufnahme beenden und wichtige Anleitungen als Projektsicherung exportieren.** Alle geöffneten KlickGuide-Editoren speichern und schließen.
2. Das neue **Chrome-ZIP** in einen separaten temporären Ordner entpacken.
3. Den **Inhalt** dieses Ordners in den bisher von Chrome geladenen Erweiterungsordner kopieren. Vorhandene Dateien ersetzen. Die neue `manifest.json` muss die bisherige `manifest.json` an genau demselben Pfad ersetzen. Keinen zusätzlichen Unterordner dazwischenschieben.
4. `chrome://extensions` öffnen, bei KlickGuide auf das kreisförmige **Neu-laden-Symbol** klicken und prüfen, dass **Version 1.0.1** angezeigt wird. Neue Berechtigungsabfragen gegebenenfalls bestätigen.
5. Unter **Details → Websitezugriff** die Einstellung **Auf allen Websites** wählen. Alternativ den Button **Zugriff auf alle Websites erlauben** im KlickGuide-Popup nutzen. Eine Freigabe startet noch keine Aufnahme.
6. **Auch die Webseite neu laden**, auf der aufgenommen werden soll. So wird die alte Aufnahmeleiste aus dem Dokument entfernt.
7. Eine neue Aufnahme mit Testdaten starten und im selben Tab eine andere normale Website öffnen. Nach dem Laden soll die Sitzung ohne erneute Freigabe verbunden sein.

**Nicht deinstallieren und nicht ungesichert in einen neuen Installationsordner umziehen.** Gespeicherte Anleitungen liegen im Browserprofil der Erweiterung, nicht im Quellcode-Ordner. Dieses Update ändert weder Datenbankschema noch Backup-Format. Eine Sicherung schützt trotzdem vor Verlust durch eine versehentliche Neuinstallation oder ein anderes Browserprofil.

Beim ursprünglichen vollständigen Projektpaket ist der geladene Erweiterungsordner üblicherweise `klickguide/dist`. Beim ursprünglichen Chrome-Paket ist es der Ordner, in dem `manifest.json` direkt liegt.

## Auch den Quellcode aktualisieren

Das vollständige Projekt-ZIP enthält den passenden Quellcode, Tests und die bereits gebaute Erweiterung in `dist`. Übernimm die aktualisierten Projektdateien in dein Repository; ersetze dabei nicht einen vorhandenen `.git`-Ordner. Nach einem eigenen Build:

```sh
npm ci
npm run check
npm run build
```

Danach dieselbe Erweiterungsinstallation und die Webseite neu laden. **Nicht nur `dist/manifest.json` ändern**: Der alte Aufnahmecode würde weiterhin bei Domainwechseln pausieren, und der nächste Build würde manuelle Änderungen an `dist` überschreiben.

## Grenzen

Die Aufnahme läuft weiterhin nur nach einem bewussten Start und nur im ausgewählten Tab. Normale HTTP(S)-Webseiten sind vorgesehen; Browser-Einstellungsseiten, Erweiterungs-Stores, lokale Dateien, Inkognito und erkannte geteilte Tabs bleiben ausgeschlossen. Der Wechsel in einen anderen Tab ist etwas anderes als ein Domainwechsel im Aufnahmetab und pausiert weiterhin.

Bei gesperrtem Websitezugriff oder verwalteten Browserrichtlinien deren Vorgaben prüfen, nicht umgehen. Das Update verspricht keine zuverlässige Erkennung jeder Sonderoberfläche und keine vollständige automatische Schwärzung aller vertraulichen Angaben.

## Plattformreferenzen

- [Chrome: activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome: sichtbare Screenshots](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab)
- [Chrome: Berechtigungen prüfen und anfordern](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Chrome-Hilfe: Websitezugriff](https://support.google.com/chrome/answer/2664769?hl=de)
