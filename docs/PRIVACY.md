# Datenschutz und Aufnahmekontrolle

## Was die Anwendung verarbeitet

Bei einer ausdrücklich gestarteten Aufnahme verarbeitet KlickGuide unterstützte Klick- und Feldereignisse, erkennbare Beschriftungen, Positionen von Bedienelementen und sichtbare Screenshots. Daraus entstehen Schritttexte und Bilder. Während die Sitzung aktiv und sichtbar ist, werden zusätzlich geprüfte Zustandsbilder vorbereitet, damit ein Klick später das passende Bild vor der Aktion erhalten kann. Das ist keine Videoaufnahme und beginnt nicht allein durch die Websitefreigabe.

Feldinhalte werden nicht als Ereignistext gesammelt. Trotzdem kann ein Screenshot personenbezogene oder vertrauliche Angaben enthalten. Eine automatisch erkannte Feldmaske ist keine vollständige Inhaltsprüfung.

In einer aktiven Sitzung werden Tab-ID, Fenster-ID, Seitenursprung, Dokumentkennung und Aufnahmestatus vorübergehend im Sitzungsspeicher gehalten. Optional lässt sich die Domain als Schrittmetadatum speichern. Standardmäßig ist dies ausgeschaltet. Pfade, Query-Parameter und URL-Fragmente werden dafür nicht gespeichert. In sichtbaren Webseiteninhalten oder Beschriftungen können solche Informationen unabhängig davon vorkommen.

## Speicherung und Übertragung

Anleitungen und Bilder liegen in IndexedDB der Erweiterung. Einstellungen liegen im lokalen Erweiterungsspeicher. Die Erweiterung selbst enthält keinen Telemetrieclient, kein Konto, keine Synchronisierung und keinen Netzwerkclient. Ihre Erweiterungsseiten verbieten Netzwerkverbindungen über `connect-src 'none'`.

Webseiten, auf denen du arbeitest, können weiterhin eigene Netzwerkverbindungen ausführen. Die Offline-Eigenschaft von KlickGuide macht aus einer fremden Webanwendung keine Offline-Anwendung. Auch Browserdienste, Betriebssystem-Backups und externe Browser-Erweiterungen liegen außerhalb dieser Zusage.

Downloads erfolgen nur durch ausdrücklich gewählte Exporte. HTML, Markdown, PNG und Projektsicherungen sind unverschlüsselt. Wer auf diese Dateien oder dein Browserprofil zugreifen kann, kann gegebenenfalls deren Inhalte lesen.

## Automatischer Bildschutz

Erkannte Eingabefelder, Textbereiche, Auswahlfelder, editierbare Bereiche, Iframes und Elemente mit `data-private` oder `data-sensitive` werden vor der dauerhaften Speicherung maskiert. Canvas- und Videobereiche werden standardmäßig ebenfalls geschützt. Eigene CSS-Selektoren können weitere Bereiche kennzeichnen. Offene Shadow Roots werden bei der Suche berücksichtigt.

Die Schutzbereiche werden vor und nach einem Screenshot ermittelt und gemeinsam maskiert. Seit 1.0.2 werden höchstens vier bereits maskierte Zustandsbilder mit insgesamt höchstens 24 MiB vorübergehend im Arbeitsspeicher des Workers gehalten. Ein Bild wird nur für passende, höchstens 30 Sekunden spätere Aktionen verwendet. Pause, Stopp und eine neue Sitzung leeren diesen Puffer; vor Auswahl für einen Schritt wird er nicht in IndexedDB geschrieben. Der Recorder erneuert ablaufende Zustände nach etwa 25 Sekunden, solange eine sichtbare Aufnahme läuft. Bei nicht verlässlicher Ermittlung wird kein Bild gespeichert. Das Rohbild wird nur vorübergehend im Speicher zur Verarbeitung gehalten.

Nicht zuverlässig automatisch erfasst sind insbesondere sensible freie Texte, Informationen in Bildern, geschlossene Shadow Roots, überlagerte oder stark animierte Inhalte, ungewöhnliche Widgets und nicht sichtbar erkannte Elemente. Auch Beschriftungen können vertraulichen Text enthalten. Deshalb: Aufnahme bei sensiblen Schritten pausieren, geeignete Testdaten nutzen und den gesamten Export manuell prüfen.

## Manuelle Schwärzungen

Nach Anwendung und Bestätigung werden gewählte Pixelbereiche durch eine deckende Farbe ersetzt. Die alte Bildversion wird in dieser Anleitung nicht als wiederherstellbares Original gespeichert. Markierungen sind dagegen normale bearbeitbare Rahmen.

Schwärzungen verändern keine früheren Exporte, Sicherungen oder duplizierten Anleitungen. Es wird keine forensisch sichere Löschung von physischen Datenträgern, Browser-Caches oder Backups zugesichert.

## Löschen und Sichern

**Anleitung löschen** entfernt den Datensatz und seine zugehörigen Bilder aus dem Anwendungsspeicher. Exportierte Dateien musst du separat löschen. Browserprofilwechsel, Deinstallation und Datenbereinigung können lokale Daten unzugänglich machen oder entfernen.

Sichere wichtige Dokumente regelmäßig über **Projektsicherung**. Prüfe vor Weitergabe, ob die Empfänger die enthaltenen Informationen sehen dürfen. Nutze für Fehlerberichte ausschließlich erfundene oder bereits sorgfältig bereinigte Beispiele.

## Berechtigungen der ausgelieferten Erweiterung

| Berechtigung | Zweck |
| --- | --- |
| `activeTab` | Zugriff auf die Tab-Metadaten nach Betätigung des Erweiterungssymbols, auch wenn der dauerhafte Websitezugriff noch fehlt. |
| `scripting` | Recorder im Hauptdokument des ausdrücklich ausgewählten Aufnahmetabs verbinden. |
| `storage` | Lokale Einstellungen und vorübergehende Aufnahmesitzung. |
| `host_permissions: ["<all_urls>"]` | Dauerhafte Freigabe für Websitezugriff und sichtbare Screenshots über Domainwechsel hinweg. |

**Seit Version 1.0.1 wird dauerhafter Zugriff auf alle Websites angefordert.** Diese breite Berechtigung ist sensibel: Sie erlaubt der Erweiterung technisch Zugriff auf viele Seiteninhalte. Die Implementierung begrenzt die Aufnahme trotzdem auf eine ausdrücklich gestartete Sitzung und deren ursprünglichen Tab. Ohne Sitzung wird kein Recorder injiziert; Domainwechsel starten keine neue Sitzung. Ein Wechsel zu einem anderen Tab oder Fenster pausiert die Aufnahme. Eine manuelle Pause bleibt bei Navigation erhalten.

`captureVisibleTab` verlangt für dauerhaften Zugriff das Muster `<all_urls>`. Die Anwendung nimmt dennoch ausschließlich freigegebene normale HTTP(S)-Seiten auf. Lokale `file://`-Dokumente, interne Browserseiten, Erweiterungs-Stores, Inkognito und erkannte geteilte Tabs werden vom Aufnahmecode abgelehnt. Es werden keine zusätzlichen Berechtigungen für Zwischenablage, Mikrofon, Kamera oder Cookie-APIs angefordert.

Die Freigabe lässt sich in den Chrome-Erweiterungsdetails ändern. Fehlt sie, wird keine neue Aufnahme gestartet; eine entzogene Freigabe pausiert die laufende Aufnahme. Die Anwendung umgeht keine Browser- oder Organisationsrichtlinien. Dauerhafte Freigabe bedeutet weder Daueraufnahme noch vollständige Vertraulichkeit aller Screenshots.

Die native Browser-Testsuite verwendet eine unveränderte Kopie des Produktionsmanifests, keine erweiterten Testberechtigungen. Zusätzlich gibt es isolierte DOM-/Pixeltests mit einem Testtransport statt nativer Erweiterungs-APIs. Diese prüfen Beispiele mit erfundenen Inhalten und sind kein Nachweis der vollständigen Datenschutzpipeline einer installierten Erweiterung. Der statische Release-Check prüft die konkret vorgesehenen Berechtigungen und untersagt weiterhin automatische All-Sites-Content-Scripts, externe Nachrichtenfreigaben und zusätzliche Hostmuster.

## Einordnung

Dieses Dokument beschreibt die Implementierung. Es ist keine Datenschutzzertifizierung, Sicherheitsgarantie oder juristische Beratung. Vor dem Einsatz in einem konkreten Arbeitsumfeld sind die dort geltenden Regeln für Screenshots, Dokumentation und Datenweitergabe zu prüfen.
