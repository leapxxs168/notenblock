# Notenblock – Datenschutz in einfachen Worten

Dieses Dokument beschreibt, welche Daten Notenblock speichert, wo sie liegen, wie sie geschützt sind, wie lange sie aufbewahrt werden und wie sie gelöscht werden. Es dient als Grundlage für das Verzeichnis der Verarbeitungstätigkeiten, das die Schulleitung für eine Genehmigung zur Verarbeitung von Schülerdaten auf privaten Geräten benötigt. Die mit „**Von der Schule zu ergänzen**“ gekennzeichneten Stellen enthalten Angaben, die nur die Schule machen kann.

## 1. Was Notenblock ist

Notenblock ist eine Web-App für Grundschullehrkräfte zur Unterrichtsplanung und zur Bewertung einzelner Kinder nach jeder Stunde. Sie läuft im Browser auf Mac, iPad und iPhone und lässt sich wie eine App auf dem Home-Bildschirm ablegen. Es gibt keinen Server, keine Cloud, keine Benutzerkonten, keine Anmeldung, keine Synchronisation und keine Auswertung durch Dritte.

## 2. Verantwortliche Stelle

**Von der Schule zu ergänzen:** Name und Anschrift der Schule, Schulleitung, Datenschutzbeauftragte oder Datenschutzbeauftragter, verantwortliche Lehrkraft.

## 3. Zweck der Verarbeitung

- Planung des Unterrichts (Stundenplan, Tages- und Wochenübersicht, Planung einzelner Stunden).
- Laufende Beobachtung und Bewertung der Leistungen einzelner Kinder als Grundlage für Zeugnisnoten und Elterngespräche.
- Notizen zu Beobachtungen und Absprachen, Aufgabenliste der Lehrkraft.

**Von der Schule zu ergänzen:** Rechtsgrundlage nach dem jeweiligen Landesschulgesetz und der zugehörigen Datenschutzverordnung für Schulen (Verarbeitung personenbezogener Daten von Schülerinnen und Schülern durch Lehrkräfte, Nutzung privater Geräte mit Genehmigung der Schulleitung).

## 4. Betroffene Personen

Schülerinnen und Schüler der von der Lehrkraft unterrichteten Klassen. Mittelbar können in Notizen auch Erziehungsberechtigte erwähnt sein (etwa „Mutter angerufen“).

## 5. Welche Daten gespeichert werden

| Datenart | Inhalt |
|---|---|
| Klassen | Name der Klasse, Stufe (Klasse 1 und 2 oder 3 und 4), Schuljahr, in dem zuletzt unterrichtet wurde, gewählte Fächer und abgeschaltete Kompetenzen, Stundenplan der Klasse (eigene und fremde Stunden mit freier Bezeichnung, Lehrkraft, Raum), Ausfall- und Zusatztermine |
| Kinder | Name (Schreibweise „Nachname, Vorname“) und/oder Kürzel. Wahlweise werden gar keine vollen Namen gespeichert, nur Kürzel. |
| Bewertungen | Je Klasse, Fach, Datum und Unterrichtsstunde (Bewertungseinheit) und je Kind: Werte 1–6 je Kriterium (Kompetenzen des Fachs, Arbeits- und Sozialverhalten) mit Kennzeichen „gesetzt“ oder „übernommen“, Kennzeichen „fehlt“, eine kurze Notiz zur Stunde; je Einheit ausgesetzte Kriterien. Ältere Bewertungen aus einer früheren Fassung bleiben archiviert lesbar. |
| Fächer und Kriterien | Fächer je Stufe mit Kompetenzen nach Lehrplanbereich und Kriterien zum Arbeits- und Sozialverhalten, jeweils mit Beschreibungstexten (keine personenbezogenen Daten) |
| Stundenplan (global) | Uhrzeiten, Schuljahr, A-Woche, Ferien, Feiertage |
| Stundenplanungen | Thema, Verlauf, Material, Hausaufgabe je Stunde (keine personenbezogenen Daten, sofern die Lehrkraft dort keine Namen einträgt) |
| Notizen | Titel, Text, Datum, wahlweise Zuordnung zu Klasse, Kind und Fach |
| Aufgaben | Text, Fälligkeit, wahlweise Klasse |
| Einstellungen | Bedienungseinstellungen, kein Personenbezug |

Nicht gespeichert werden: Geburtsdaten, Adressen, Kontaktdaten, Fotos, Gesundheitsdaten oder andere besondere Kategorien. Notizen sind Freitext; die Lehrkraft entscheidet, was sie einträgt.

Die Note als solche wird nicht gespeichert. Gespeichert werden einzelne, datierte Einträge; Durchschnitte, Gesamtwerte und Notenvorschläge entstehen erst bei der Auswertung.

## 6. Wo die Daten liegen

- Ausschließlich im Browserspeicher (IndexedDB, ersatzweise localStorage) des Geräts, auf dem Notenblock geöffnet wurde. Die Daten sind an die Adresse gebunden, unter der die App läuft.
- Notenblock stellt im Betrieb keine einzige Anfrage an fremde Server. Eine Content Security Policy im Programm erzwingt das technisch: Der Browser blockiert jede Verbindung zu anderen Adressen.
- Es gibt keine Übertragung zwischen Geräten. Wer die App auf Mac und iPad nutzt, hat zwei getrennte Bestände.
- Werden die Programmdateien über einen Webhoster (etwa GitHub Pages) bereitgestellt, liegen dort nur die Programmdateien (HTML, CSS, JavaScript). Personenbezogene Daten gelangen nicht dorthin.

## 7. Wie die Daten geschützt sind

**Verschlüsselung.** Alle Daten werden verschlüsselt gespeichert:

- Aus der Passphrase der Lehrkraft wird mit PBKDF2 (SHA-256, 300 000 Runden, zufälliges 16-Byte-Salt) ein Schlüssel abgeleitet.
- Jeder Datensatz wird einzeln mit AES-GCM (256 Bit) verschlüsselt, mit einem frischen Initialisierungsvektor (12 Byte) bei jedem Schreibvorgang.
- Der abgeleitete Schlüssel liegt nur im Arbeitsspeicher, nie im Speicher des Geräts. Beim Sperren wird er verworfen.
- Die Passphrase selbst wird nirgends gespeichert, auch kein Hash davon. Zur Prüfung dient ein verschlüsselter Kontrollwert.
- Im Klartext gespeichert sind nur: das Salt, der Kontrollwert, die Zahl der Fehlversuche und eine Wartezeit. Aus ihnen lässt sich ohne Passphrase nichts über die Inhalte ableiten.
- Ohne Passphrase ist der Bestand auch bei vollem Zugriff auf das Gerät nicht lesbar. Es gibt keine Möglichkeit, eine vergessene Passphrase zurückzusetzen – dann bleibt nur der Neuanfang mit Löschung aller Daten.

**Zugangsschutz.**

- Sperrbildschirm beim Start und nach jeder Sperre.
- Automatische Sperre nach 1, 5, 15 oder 60 Minuten ohne Bedienung (Standard: 5 Minuten), wahlweise sofort beim Wechsel in den Hintergrund.
- Nach fünf Fehlversuchen eine Wartezeit, die sich mit jedem weiteren Versuch verdoppelt. Daten werden dabei nie gelöscht.

**Pseudonymisierung.** Die Anzeige kann auf Kürzel umgestellt werden. Zusätzlich kann festgelegt werden, gar keine vollen Namen zu speichern; dann enthält der Bestand nur Kürzel.

**Sicherungen und Exporte.**

- Sicherungsdateien sind standardmäßig verschlüsselt (gleiche Verfahren, Passphrase wird beim Erstellen abgefragt). Eine unverschlüsselte Sicherung ist nur nach ausdrücklicher Bestätigung möglich; die Datei trägt dann den Namenszusatz UNVERSCHLUESSELT.
- CSV-Dateien (Noten, Auswertung) sind unverschlüsselt, weil sie in Tabellenprogrammen geöffnet werden. Die App weist vor dem Erstellen darauf hin, dass sie personenbezogene Daten enthalten. Für ihren Schutz und ihre Löschung ist die Lehrkraft verantwortlich.

**Gerät.** Der Schutz der App ergänzt den Schutz des Geräts (Gerätesperre, aktuelle Systemversion, keine gemeinsame Nutzung des Browsers mit anderen Personen). **Von der Schule zu ergänzen:** Vorgaben für private Geräte.

## 8. Wie lange die Daten aufbewahrt werden

- Je Klasse ist das Schuljahr hinterlegt, in dem zuletzt unterrichtet wurde.
- Ein Jahr nach Ablauf des Kalenderjahres, in dem der Unterricht endete, weist Notenblock beim Start darauf hin und bietet das Löschen der Klasse an. Beispiel: Schuljahr 2025/2026 – Hinweis ab dem 1. Januar 2028.
- Notenblock löscht niemals von selbst. Die Entscheidung trifft die Lehrkraft.

**Von der Schule zu ergänzen:** die an der Schule geltende Aufbewahrungsfrist für Notizen und Bewertungsunterlagen von Lehrkräften, falls sie von dieser Regel abweicht.

## 9. Wie gelöscht wird

- Einzelne Klasse löschen (Einstellungen → Daten): entfernt die Klasse mit allen Kindern, Bewertungen, Notizen, Aufgaben und Stundenplaneinträgen.
- Einzelnes Kind aus der Klassenliste streichen: entfernt nach Rückfrage auch seine Bewertungen und Notizen.
- Alle Daten löschen (Einstellungen → Daten, Bestätigung durch Eintippen von LÖSCHEN): entfernt den gesamten Bestand; die App beginnt bei der Einrichtung.
- „Passphrase vergessen?“ auf dem Sperrbildschirm: gleicher Vorgang, ebenfalls mit LÖSCHEN zu bestätigen.
- Zusätzlich lassen sich die Website-Daten der Adresse im Browser löschen.
- Sicherungs- und CSV-Dateien liegen außerhalb der App (Download-Ordner, Dateien-App, Cloud-Ablage des Geräts) und müssen dort eigens gelöscht werden.

Gelöschte Daten sind nicht wiederherstellbar, außer aus einer zuvor erstellten Sicherung.

## 10. Empfänger und Übermittlung

Es gibt keine Empfänger. Daten verlassen das Gerät nur, wenn die Lehrkraft aktiv eine Sicherung oder eine CSV-Datei erstellt und diese weitergibt. Eine Übermittlung in Drittländer findet nicht statt.

## 11. Technische und organisatorische Maßnahmen (Kurzfassung)

| Maßnahme | Umsetzung |
|---|---|
| Vertraulichkeit | AES-GCM-256-Verschlüsselung aller Datensätze, Schlüssel nur im Arbeitsspeicher, Sperrbildschirm, automatische Sperre, Wartezeit nach Fehlversuchen, Kürzel statt Namen möglich |
| Integrität | AES-GCM prüft jeden Datensatz beim Entschlüsseln auf Unversehrtheit; unlesbare Datensätze werden gemeldet |
| Verfügbarkeit | Verschlüsselte Sicherungsdateien durch die Lehrkraft; Hinweis auf die letzte Sicherung in der App |
| Datensparsamkeit | Nur bewusst gesetzte Noten werden gespeichert; keine Kontakt- oder Stammdaten; wahlweise nur Kürzel |
| Zweckbindung | Keine Verbindung zu anderen Diensten, keine Analyse, keine Werbung |
| Transparenz | Dieses Dokument; Hinweise in der App vor unverschlüsselten Exporten und beim Erreichen der Löschfrist |
| Trennung | Getrennte Bestände je Gerät und je Browseradresse |

## 12. Was Notenblock nicht tut

- Keine Anmeldung, keine Benutzerkonten, keine E-Mail-Adresse.
- Keine Verbindung zu Servern, keine Cloud, kein Abgleich.
- Keine Analysedienste, keine Fehlerberichte an Dritte, keine Schriftarten oder Bibliotheken von fremden Servern.
- Kein automatisches Löschen, kein automatisches Versenden.

## 13. Hinweise für die Genehmigung

- Die App verarbeitet Daten ausschließlich lokal und verschlüsselt; die Lehrkraft ist die einzige Person mit Zugriff.
- Die Passphrase sollte im Passwortmanager der Lehrkraft hinterlegt sein; ihr Verlust bedeutet den Verlust der Daten.
- Sicherungen sollten verschlüsselt und auf einem von der Schule gebilligten Speicherort abgelegt werden.
- CSV-Exporte sollten nur erstellt werden, wenn sie gebraucht werden, und danach gelöscht werden.

Stand dieses Dokuments: Fassung 1.0 von Notenblock.
