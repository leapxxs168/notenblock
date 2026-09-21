# Notenblock starten

Notenblock ist eine Web-App: ein Ordner mit Dateien, der im Browser läuft. Es gibt keinen Server im Internet, keine Anmeldung und keine Cloud. Alle Daten liegen ausschließlich auf deinem Gerät und sind mit deiner Passphrase verschlüsselt.

## Warum ein Doppelklick auf `index.html` nicht genügt

Öffnest du `index.html` per Doppelklick, zeigt der Browser eine Adresse, die mit `file://` beginnt. In diesem Modus behandeln Browser die Seite wie eine lose Datei: Der Datenspeicher (IndexedDB) und die Verschlüsselung (Web Crypto) stehen dann nicht zuverlässig zur Verfügung, und Safari lässt das Speichern teilweise ganz aus. Notenblock zeigt in diesem Fall einen Hinweis und startet nicht, damit keine Daten verloren gehen.

Die App braucht deshalb eine „richtige“ Adresse: `http://localhost` auf dem eigenen Rechner oder eine `https://`-Adresse.

## Auf dem Mac

1. Doppelklick auf **`Notenblock starten.command`** im Notenblock-Ordner.
   Beim allerersten Mal fragt macOS eventuell, ob die Datei geöffnet werden darf. Falls sie blockiert wird: Rechtsklick → „Öffnen“ → bestätigen. Falls macOS anbietet, „Befehlszeilen-Werkzeuge“ zu installieren: bestätigen, kurz warten, dann das Skript erneut starten.
2. Es öffnet sich ein Terminalfenster, und der Browser zeigt `http://localhost:8765/`.
3. Das Terminalfenster geöffnet lassen, solange du die App benutzt. Zum Beenden das Fenster einfach schließen.

Beim nächsten Mal wieder Schritt 1. Der Browser merkt sich die Adresse; die Daten bleiben erhalten.

**Wichtig:** Immer genau die Adresse `http://localhost:8765/` verwenden. Der Browser bindet gespeicherte Daten an die Adresse. Eine andere Adresse (anderer Port, `127.0.0.1` statt `localhost`) sieht wie eine leere App aus – die Daten sind dann nicht weg, aber unter der anderen Adresse nicht sichtbar.

**Als eigenes Programm im Dock:** In Safari die Seite öffnen, dann Menü „Ablage“ → „Zum Dock hinzufügen“. Notenblock erscheint als eigenes Fenster ohne Browser-Leisten. Der lokale Server (Schritt 1) muss trotzdem laufen; ist er einmal gelaufen, öffnet sich die App dank des eingebauten Offline-Caches auch ohne ihn.

Ohne das Startskript geht es auch von Hand: Terminal öffnen, in den Ordner wechseln (`cd` gefolgt von einem Leerzeichen, dann den Ordner ins Fenster ziehen, Enter) und eingeben:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Danach im Browser `http://localhost:8765/` öffnen.

## Auf iPad und iPhone

Auf iPad und iPhone gibt es kein `localhost`, auf dem die App liegen könnte. Über das WLAN vom Mac aus (`http://192.168…`) geht es **nicht**: Solche Adressen gelten für den Browser nicht als sicher, und dann steht die Verschlüsselung nicht zur Verfügung – Notenblock startet in diesem Fall bewusst nicht.

Damit die App auf iPad und iPhone läuft, muss der Notenblock-Ordner über eine **`https://`-Adresse** erreichbar sein. Das ist ein reiner Ablageort für die Programmdateien (HTML, CSS, JavaScript) – so wie ein Ordner, den man sich vom Mac herunterlädt. Die App stellt im Betrieb keine einzige Anfrage an diesen Ort oder an einen anderen Server; Noten, Namen und Notizen verlassen das Gerät nie. Geeignet sind Anbieter für statische Webseiten (etwa GitHub Pages) oder ein Schul-Webspace mit https.

**GitHub Pages (eingerichtet):** Die App ist unter **https://leapxxs168.github.io/notenblock/** erreichbar. Quelle ist das öffentliche Repository https://github.com/leapxxs168/notenblock (Branch `main`, Wurzelordner). Dort liegen nur die Programmdateien – keine Daten. Nach Änderungen im Ordner kommt die neue Fassung so online (Terminal, im Notenblock-Ordner):

```bash
git add -A && git commit -m "Änderung beschreiben" && git push
```

Etwa eine Minute später ist sie unter der Adresse verfügbar; auf den Geräten greift sie nach zweimaligem Öffnen der App.

Dann auf dem iPad/iPhone:

1. Die https-Adresse in Safari öffnen.
2. Teilen-Symbol → **„Zum Home-Bildschirm“** → „Hinzufügen“.
3. Notenblock vom Home-Bildschirm aus starten. Ab dann läuft die App auch offline.

Die Passphrase wird auf jedem Gerät eigens festgelegt; es gibt keinen Abgleich zwischen Geräten.

## Nach einer Aktualisierung

Wenn neue Dateien in den Ordner kommen: die App zweimal neu laden, mit ein paar Sekunden Abstand. Beim ersten Laden holt sich der Offline-Cache die neue Fassung vollständig im Hintergrund, beim zweiten Laden ist sie aktiv. Dateien aus zwei Fassungen werden nie gemischt.

## Wenn etwas nicht klappt

- **Weiße Seite oder „Notenblock kann nicht starten“:** Browser komplett beenden und neu starten; danach die App wieder öffnen. Die Meldung „Der Datenspeicher antwortet nicht“ kommt von einem bekannten Safari-Fehler – die Daten sind unversehrt, ein zweiter Start hilft.
- **„Notenblock muss über einen lokalen Server geöffnet werden“:** Die Datei wurde per Doppelklick geöffnet. Bitte wie oben beschrieben starten.
- **Passphrase vergessen:** Es gibt keinen Weg, die Daten ohne Passphrase zu lesen – auch nicht für den Hersteller. Auf dem Sperrbildschirm führt „Passphrase vergessen?“ zu einem Neuanfang: Nach dem Eintippen von LÖSCHEN werden alle Daten auf dem Gerät gelöscht, und die App beginnt von vorn. Deshalb regelmäßig eine Sicherung erstellen (Einstellungen → Daten) und die Passphrase im Passwortmanager hinterlegen.

## Sicherung

Einstellungen → Daten → „Sicherung erstellen“ erzeugt eine Datei `notenblock-sicherung-JJJJ-MM-TT.json`, verschlüsselt mit einer Passphrase, die dabei abgefragt wird (sie darf dieselbe sein wie die der App). Auf dem Mac landet die Datei im Download-Ordner, auf iPhone und iPad öffnet sich das Teilen-Blatt („In Dateien sichern“). Die Sicherung lässt sich auf jedem Gerät über „Sicherung laden“ wieder einspielen; sie ersetzt dort den gesamten Bestand, die App-Passphrase bleibt. Eine unverschlüsselte Sicherung (Dateiname mit UNVERSCHLUESSELT) gibt es nur nach ausdrücklicher Bestätigung.

## Datenschutz und Löschfristen

`datenschutz.md` beschreibt in einfachen Worten, welche Daten gespeichert werden, wo sie liegen, wie sie verschlüsselt sind, wie lange sie aufbewahrt und wie sie gelöscht werden – als Grundlage für das Verzeichnis der Verarbeitungstätigkeiten der Schule. Die Stellen „Von der Schule zu ergänzen“ sind für die Schulleitung gedacht.

Je Klasse ist unter „Klasse verwalten“ das Schuljahr hinterlegt, in dem zuletzt unterrichtet wurde. Ein Jahr nach Ablauf des Kalenderjahres, in dem der Unterricht endete, erinnert Notenblock beim Start an das Löschen (höchstens einmal am Tag) – gelöscht wird nur auf Tipp.

## Für Fortgeschrittene: Kriterien aktualisieren

Die Startkriterien liegen zweimal vor: lesbar in `notenblock-kriterien.json` und eingebettet in `js/kriterien-daten.js` (damit die App ohne Nachladen auskommt). Änderungen in der JSON vornehmen und die JavaScript-Datei daraus neu erzeugen:

```bash
python3 -c "import json;d=json.load(open('notenblock-kriterien.json',encoding='utf-8'));open('js/kriterien-daten.js','w',encoding='utf-8').write(open('js/kriterien-daten.js',encoding='utf-8').read().split('NB.KRITERIEN_START = ')[0]+'NB.KRITERIEN_START = '+json.dumps(d,ensure_ascii=False,indent=2)+';\n')"
```

Die Startkriterien werden nur beim allerersten Start übernommen. Danach gelten die in der App bearbeiteten Fächer und Kriterien (Einstellungen → Fächer und Kriterien).
