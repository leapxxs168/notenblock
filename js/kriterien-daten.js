/*
 * Notenblock – Startbestand der Fächer und Kriterien
 *
 * Diese Datei ist eine 1:1-Einbettung von notenblock-kriterien.json, damit die
 * App ohne Server (und ohne fetch) geladen werden kann. Beide Dateien müssen
 * deckungsgleich bleiben. Änderungen bitte in der JSON vornehmen und diese Datei
 * daraus neu erzeugen (siehe START.md, Abschnitt „Kriterien aktualisieren“).
 *
 * Die Daten werden nur beim ersten Start in die Fächerverwaltung übernommen.
 * Danach gelten die in der App gespeicherten (bearbeitbaren) Fächer.
 */
'use strict';
window.NB = window.NB || {};
NB.KRITERIEN_START = {
  "version": 1,
  "skala": [
    1,
    2,
    3,
    4,
    5,
    6
  ],
  "notenwoerter": [
    "sehr gut",
    "gut",
    "befriedigend",
    "ausreichend",
    "mangelhaft",
    "ungenügend"
  ],
  "faecher": [
    {
      "id": "kunst",
      "name": "Kunst",
      "kriterien": [
        {
          "id": "kunst-1",
          "name": "Erfüllen der Aufgabenstellung",
          "typ": "projekt",
          "stufen": [
            "Alle Kriterien vollständig und sehr genau umgesetzt, Aufgabe kreativ erweitert",
            "Alle wichtigen Kriterien erfüllt",
            "Die meisten Kriterien erfüllt, kleinere Abweichungen",
            "Einige Kriterien fehlen oder sind nur teilweise umgesetzt",
            "Viele Kriterien nicht erfüllt",
            "Aufgabe kaum oder gar nicht umgesetzt"
          ]
        },
        {
          "id": "kunst-2",
          "name": "Kreativität und Ideenreichtum",
          "typ": "projekt",
          "stufen": [
            "Sehr kreative, eigenständige und originelle Idee",
            "Gute eigene Ideen erkennbar",
            "Teilweise eigene Ideen",
            "Wenig eigene Ideen, eher einfache Umsetzung",
            "Kaum eigene Ideen",
            "Keine eigene Gestaltung erkennbar"
          ]
        },
        {
          "id": "kunst-3",
          "name": "Technische Umsetzung und Gestaltung",
          "typ": "projekt",
          "stufen": [
            "Sehr sichere und saubere Anwendung der Techniken",
            "Gute Umsetzung der Technik",
            "Technik meist richtig angewendet",
            "Unsicherer Umgang mit der Technik",
            "Technik kaum angewendet",
            "Technik nicht angewendet"
          ]
        },
        {
          "id": "kunst-4",
          "name": "Sorgfalt der Arbeit",
          "typ": "stunde",
          "stufen": [
            "Sehr sauber und sorgfältig gearbeitet",
            "Meist sauber und sorgfältig gearbeitet",
            "Teilweise sauber gearbeitet",
            "Häufig unsauber gearbeitet",
            "Sehr unsauber gearbeitet",
            "Arbeit kaum erkennbar oder beschädigt"
          ]
        },
        {
          "id": "kunst-5",
          "name": "Arbeitsplatz und Aufräumen",
          "typ": "stunde",
          "stufen": [
            "Arbeitsplatz immer geordnet, räumt selbstständig vollständig auf",
            "Arbeitsplatz geordnet, räumt zuverlässig auf",
            "Arbeitsplatz etwas unordentlich, räumt nach Aufforderung auf",
            "Arbeitsplatz häufig unordentlich, räumt nur teilweise auf",
            "Arbeitsplatz sehr unordentlich, räumt nicht auf",
            "Arbeitsplatz bleibt unaufgeräumt, Material bleibt liegen"
          ]
        },
        {
          "id": "kunst-6",
          "name": "Fertigstellung und Zeitnutzung",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr konzentriert und wird vollständig fertig",
            "Arbeit vollständig fertiggestellt",
            "Arbeit weitgehend fertig",
            "Arbeit nur teilweise fertig, arbeitet langsam",
            "Arbeit kaum fertiggestellt",
            "Arbeit nicht begonnen oder nicht abgegeben"
          ]
        },
        {
          "id": "kunst-7",
          "name": "Arbeitsbereitschaft und Motivation",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr motiviert und selbstständig und hilft anderen",
            "Arbeitet motiviert und meist selbstständig",
            "Arbeitet zuverlässig mit, braucht gelegentlich einen Anstoß",
            "Arbeitet wenig und ist kaum motiviert",
            "Arbeitet kaum und ist sehr unmotiviert",
            "Keine Arbeitsbereitschaft und Motivation"
          ]
        },
        {
          "id": "kunst-8",
          "name": "Mündliche Mitarbeit und Gespräch über Kunst",
          "typ": "stunde",
          "stufen": [
            "Bringt viele passende Ideen ein und erklärt die eigene Arbeit sehr gut",
            "Beteiligt sich regelmäßig und sinnvoll",
            "Beteiligt sich gelegentlich",
            "Meldet sich selten",
            "Meldet sich kaum",
            "Keine Beteiligung"
          ]
        }
      ]
    },
    {
      "id": "deutsch",
      "name": "Deutsch",
      "kriterien": [
        {
          "id": "deutsch-1",
          "name": "Lesen",
          "typ": "stunde",
          "stufen": [
            "Liest flüssig und betont, versteht auch schwierige Texte und gibt sie sicher wieder",
            "Liest flüssig und versteht den Inhalt sicher",
            "Liest meist flüssig, versteht den Inhalt in den Grundzügen",
            "Liest stockend, versteht einfache Texte nur mit Hilfe",
            "Liest sehr stockend, versteht den Inhalt kaum",
            "Liest einzelne Wörter nicht, kein Textverständnis"
          ]
        },
        {
          "id": "deutsch-2",
          "name": "Texte schreiben",
          "typ": "projekt",
          "stufen": [
            "Schreibt anschauliche, klar aufgebaute Texte mit passendem Wortschatz",
            "Schreibt verständliche Texte mit erkennbarem Aufbau",
            "Schreibt einfache Texte, Aufbau meist erkennbar",
            "Schreibt kurze Texte mit Hilfe, Aufbau unklar",
            "Schreibt nur einzelne Sätze ohne Zusammenhang",
            "Schreibt keinen eigenen Text"
          ]
        },
        {
          "id": "deutsch-3",
          "name": "Rechtschreibung",
          "typ": "projekt",
          "stufen": [
            "Schreibt geübte Wörter sicher richtig und nutzt Rechtschreibstrategien selbstständig",
            "Schreibt geübte Wörter meist richtig",
            "Schreibt geübte Wörter überwiegend richtig, einzelne Fehler",
            "Macht häufig Fehler, auch bei geübten Wörtern",
            "Macht sehr viele Fehler, nutzt Strategien kaum",
            "Geschriebenes ist kaum lesbar"
          ]
        },
        {
          "id": "deutsch-4",
          "name": "Sprache untersuchen",
          "typ": "projekt",
          "stufen": [
            "Erkennt Wortarten und Satzglieder sicher und überträgt Regeln auf neue Beispiele",
            "Erkennt Wortarten und Satzglieder sicher",
            "Erkennt die Grundlagen, bei schwierigeren Aufgaben unsicher",
            "Erkennt Wortarten und Satzglieder nur mit Hilfe",
            "Kaum Kenntnisse vorhanden",
            "Keine Kenntnisse vorhanden"
          ]
        },
        {
          "id": "deutsch-5",
          "name": "Mündliche Mitarbeit",
          "typ": "stunde",
          "stufen": [
            "Beteiligt sich sehr häufig mit durchdachten Beiträgen, hört zu und geht auf andere ein",
            "Beteiligt sich regelmäßig und sinnvoll",
            "Beteiligt sich gelegentlich",
            "Meldet sich selten, Beiträge bleiben kurz",
            "Meldet sich kaum, auch nach Aufforderung",
            "Keine Beteiligung"
          ]
        },
        {
          "id": "deutsch-6",
          "name": "Arbeitsbereitschaft und Motivation",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr motiviert und selbstständig und hilft anderen",
            "Arbeitet motiviert und meist selbstständig",
            "Arbeitet zuverlässig mit, braucht gelegentlich einen Anstoß",
            "Arbeitet wenig und braucht häufig Aufforderung",
            "Arbeitet kaum und ist sehr unmotiviert",
            "Keine Arbeitsbereitschaft erkennbar"
          ]
        },
        {
          "id": "deutsch-7",
          "name": "Heftführung und Sorgfalt",
          "typ": "stunde",
          "stufen": [
            "Heft vollständig, sehr sauber und übersichtlich geführt",
            "Heft vollständig und sauber geführt",
            "Heft überwiegend vollständig, teilweise unsauber",
            "Heft lückenhaft und häufig unordentlich",
            "Heft sehr unvollständig und unordentlich",
            "Kein Heft geführt"
          ]
        },
        {
          "id": "deutsch-8",
          "name": "Fertigstellung und Zeitnutzung",
          "typ": "stunde",
          "stufen": [
            "Arbeitet konzentriert und wird vollständig fertig",
            "Wird vollständig fertig",
            "Wird weitgehend fertig",
            "Wird nur teilweise fertig",
            "Wird kaum fertig",
            "Beginnt nicht mit der Arbeit"
          ]
        }
      ]
    },
    {
      "id": "mathe",
      "name": "Mathematik",
      "kriterien": [
        {
          "id": "mathe-1",
          "name": "Rechenfertigkeit",
          "typ": "stunde",
          "stufen": [
            "Rechnet sicher, zügig und fehlerfrei, auch bei schwierigen Aufgaben",
            "Rechnet sicher, macht wenige Fehler",
            "Rechnet Grundaufgaben richtig, bei schwierigeren Aufgaben Fehler",
            "Rechnet einfache Aufgaben nur mit Hilfe, häufige Fehler",
            "Rechnet auch mit Hilfe kaum richtig",
            "Löst keine Rechenaufgaben"
          ]
        },
        {
          "id": "mathe-2",
          "name": "Sachaufgaben und Problemlösen",
          "typ": "projekt",
          "stufen": [
            "Erfasst Aufgaben selbstständig, findet eigene Lösungswege und prüft das Ergebnis",
            "Erfasst Aufgaben und löst sie mit passendem Rechenweg",
            "Löst einfache Sachaufgaben, bei mehrschrittigen unsicher",
            "Braucht Hilfe beim Verstehen der Aufgabe",
            "Erfasst die Aufgabenstellung kaum",
            "Bearbeitet Sachaufgaben nicht"
          ]
        },
        {
          "id": "mathe-3",
          "name": "Rechenwege erklären",
          "typ": "stunde",
          "stufen": [
            "Erklärt Rechenwege verständlich, begründet sie und vergleicht verschiedene Wege",
            "Erklärt den eigenen Rechenweg nachvollziehbar",
            "Erklärt den Rechenweg in Ansätzen",
            "Erklärt den Rechenweg nur auf gezielte Nachfrage",
            "Kann den Rechenweg kaum erklären",
            "Keine Erklärung"
          ]
        },
        {
          "id": "mathe-4",
          "name": "Raum, Form und Größen",
          "typ": "projekt",
          "stufen": [
            "Zeichnet und misst sehr genau und nutzt Fachbegriffe sicher",
            "Zeichnet und misst genau",
            "Zeichnet und misst meist richtig",
            "Unsicher im Umgang mit Lineal, Zirkel und Maßeinheiten",
            "Kommt kaum zu richtigen Ergebnissen",
            "Keine Bearbeitung"
          ]
        },
        {
          "id": "mathe-5",
          "name": "Mündliche Mitarbeit",
          "typ": "stunde",
          "stufen": [
            "Beteiligt sich sehr häufig mit durchdachten Beiträgen und geht auf andere Rechenwege ein",
            "Beteiligt sich regelmäßig und sinnvoll",
            "Beteiligt sich gelegentlich",
            "Meldet sich selten",
            "Meldet sich kaum, auch nach Aufforderung",
            "Keine Beteiligung"
          ]
        },
        {
          "id": "mathe-6",
          "name": "Arbeitsbereitschaft und Motivation",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr motiviert und selbstständig und hilft anderen",
            "Arbeitet motiviert und meist selbstständig",
            "Arbeitet zuverlässig mit, braucht gelegentlich einen Anstoß",
            "Arbeitet wenig und braucht häufig Aufforderung",
            "Arbeitet kaum und ist sehr unmotiviert",
            "Keine Arbeitsbereitschaft erkennbar"
          ]
        },
        {
          "id": "mathe-7",
          "name": "Heftführung und Sorgfalt",
          "typ": "stunde",
          "stufen": [
            "Heft vollständig, sehr sauber geführt, Zahlen und Skizzen sehr genau",
            "Heft vollständig und sauber geführt",
            "Heft überwiegend vollständig, teilweise unsauber",
            "Heft lückenhaft und häufig unordentlich",
            "Heft sehr unvollständig und unordentlich",
            "Kein Heft geführt"
          ]
        },
        {
          "id": "mathe-8",
          "name": "Fertigstellung und Zeitnutzung",
          "typ": "stunde",
          "stufen": [
            "Arbeitet konzentriert und wird vollständig fertig",
            "Wird vollständig fertig",
            "Wird weitgehend fertig",
            "Wird nur teilweise fertig",
            "Wird kaum fertig",
            "Beginnt nicht mit der Arbeit"
          ]
        }
      ]
    },
    {
      "id": "religion",
      "name": "Religion",
      "kriterien": [
        {
          "id": "religion-1",
          "name": "Kenntnisse und Inhalte",
          "typ": "projekt",
          "stufen": [
            "Kennt die Inhalte sehr genau und stellt Zusammenhänge selbstständig her",
            "Kennt die Inhalte sicher",
            "Kennt die wichtigsten Inhalte",
            "Kennt einzelne Inhalte, Zusammenhänge fehlen",
            "Kaum Kenntnisse vorhanden",
            "Keine Kenntnisse vorhanden"
          ]
        },
        {
          "id": "religion-2",
          "name": "Gespräch über religiöse und ethische Fragen",
          "typ": "stunde",
          "stufen": [
            "Bringt eigene Gedanken ein, begründet die eigene Meinung und geht auf andere ein",
            "Beteiligt sich regelmäßig mit passenden Beiträgen",
            "Beteiligt sich gelegentlich",
            "Meldet sich selten",
            "Meldet sich kaum, auch nach Aufforderung",
            "Keine Beteiligung"
          ]
        },
        {
          "id": "religion-3",
          "name": "Gestalterische Umsetzung",
          "typ": "projekt",
          "stufen": [
            "Setzt Inhalte kreativ und sorgfältig um, etwa im Bild, im Text oder im Rollenspiel",
            "Setzt Inhalte passend um",
            "Setzt Inhalte einfach um",
            "Setzt Inhalte nur teilweise um",
            "Kaum eigene Umsetzung erkennbar",
            "Keine Umsetzung"
          ]
        },
        {
          "id": "religion-4",
          "name": "Umgang miteinander",
          "typ": "stunde",
          "stufen": [
            "Hält Gesprächsregeln zuverlässig ein, hört zu und achtet andere Meinungen",
            "Hält die Regeln ein und hört anderen zu",
            "Hält die Regeln meist ein",
            "Unterbricht häufig und hört wenig zu",
            "Stört das Gespräch regelmäßig",
            "Nimmt keine Rücksicht auf Regeln und andere"
          ]
        },
        {
          "id": "religion-5",
          "name": "Arbeitsbereitschaft und Motivation",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr motiviert und selbstständig und hilft anderen",
            "Arbeitet motiviert und meist selbstständig",
            "Arbeitet zuverlässig mit, braucht gelegentlich einen Anstoß",
            "Arbeitet wenig und braucht häufig Aufforderung",
            "Arbeitet kaum und ist sehr unmotiviert",
            "Keine Arbeitsbereitschaft erkennbar"
          ]
        },
        {
          "id": "religion-6",
          "name": "Heftführung und Sorgfalt",
          "typ": "stunde",
          "stufen": [
            "Mappe vollständig, sehr sauber und übersichtlich geführt",
            "Mappe vollständig und sauber geführt",
            "Mappe überwiegend vollständig, teilweise unsauber",
            "Mappe lückenhaft und häufig unordentlich",
            "Mappe sehr unvollständig und unordentlich",
            "Keine Mappe geführt"
          ]
        }
      ]
    },
    {
      "id": "englisch",
      "name": "Englisch",
      "kriterien": [
        {
          "id": "englisch-1",
          "name": "Hörverstehen",
          "typ": "stunde",
          "stufen": [
            "Versteht Aufträge und Geschichten sicher und reagiert passend",
            "Versteht Aufträge und einfache Texte",
            "Versteht Bekanntes, braucht bei Neuem Wiederholungen",
            "Versteht nur mit Gesten und Bildern",
            "Versteht auch mit Hilfen kaum etwas",
            "Kein Verständnis erkennbar"
          ]
        },
        {
          "id": "englisch-2",
          "name": "Sprechen und Aussprache",
          "typ": "stunde",
          "stufen": [
            "Spricht frei in einfachen Sätzen mit sehr guter Aussprache",
            "Spricht in einfachen Sätzen mit guter Aussprache",
            "Antwortet mit einzelnen Sätzen, Aussprache meist richtig",
            "Antwortet mit einzelnen Wörtern",
            "Spricht kaum, auch nach Aufforderung",
            "Spricht nicht"
          ]
        },
        {
          "id": "englisch-3",
          "name": "Wortschatz",
          "typ": "projekt",
          "stufen": [
            "Nutzt den Wortschatz sicher und auch in neuen Zusammenhängen",
            "Nutzt den geübten Wortschatz sicher",
            "Nutzt den wichtigsten Wortschatz",
            "Nutzt einzelne Wörter nur mit Hilfe",
            "Kaum Wortschatz vorhanden",
            "Kein Wortschatz erkennbar"
          ]
        },
        {
          "id": "englisch-4",
          "name": "Lesen und Schreiben",
          "typ": "projekt",
          "stufen": [
            "Liest und schreibt geübte Wörter und Sätze sicher",
            "Liest und schreibt geübte Wörter richtig",
            "Liest und schreibt geübte Wörter überwiegend richtig",
            "Schreibt Wörter nur mit Vorlage",
            "Schreibt Wörter kaum richtig ab",
            "Keine Bearbeitung"
          ]
        },
        {
          "id": "englisch-5",
          "name": "Mitmachen bei Liedern, Spielen und Rollenspielen",
          "typ": "stunde",
          "stufen": [
            "Macht sehr aktiv mit und übernimmt gern Sprechrollen",
            "Macht regelmäßig aktiv mit",
            "Macht meist mit",
            "Macht zurückhaltend mit",
            "Macht kaum mit",
            "Macht nicht mit"
          ]
        },
        {
          "id": "englisch-6",
          "name": "Arbeitsbereitschaft und Motivation",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr motiviert und selbstständig und hilft anderen",
            "Arbeitet motiviert und meist selbstständig",
            "Arbeitet zuverlässig mit, braucht gelegentlich einen Anstoß",
            "Arbeitet wenig und braucht häufig Aufforderung",
            "Arbeitet kaum und ist sehr unmotiviert",
            "Keine Arbeitsbereitschaft erkennbar"
          ]
        },
        {
          "id": "englisch-7",
          "name": "Heftführung und Sorgfalt",
          "typ": "stunde",
          "stufen": [
            "Heft vollständig, sehr sauber und übersichtlich geführt",
            "Heft vollständig und sauber geführt",
            "Heft überwiegend vollständig, teilweise unsauber",
            "Heft lückenhaft und häufig unordentlich",
            "Heft sehr unvollständig und unordentlich",
            "Kein Heft geführt"
          ]
        }
      ]
    },
    {
      "id": "sachunterricht",
      "name": "Sachunterricht",
      "kriterien": [
        {
          "id": "sachunterricht-1",
          "name": "Fachwissen und Erfüllen der Aufgabenstellung",
          "typ": "projekt",
          "stufen": [
            "Bearbeitet alle Aufgaben vollständig und genau und stellt eigene Zusammenhänge her",
            "Bearbeitet die wichtigen Aufgaben vollständig",
            "Bearbeitet die meisten Aufgaben, kleinere Lücken",
            "Bearbeitet Aufgaben nur teilweise",
            "Bearbeitet viele Aufgaben nicht",
            "Bearbeitet die Aufgaben nicht"
          ]
        },
        {
          "id": "sachunterricht-2",
          "name": "Beobachten, Untersuchen, Experimentieren",
          "typ": "stunde",
          "stufen": [
            "Beobachtet sehr genau, arbeitet planvoll und zieht eigene Schlüsse",
            "Beobachtet genau und arbeitet nach Anleitung sicher",
            "Beobachtet und experimentiert meist richtig",
            "Braucht bei Versuchen häufig Hilfe",
            "Beteiligt sich kaum an Versuchen",
            "Keine Beteiligung"
          ]
        },
        {
          "id": "sachunterricht-3",
          "name": "Dokumentation, etwa Heft, Plakat oder Protokoll",
          "typ": "projekt",
          "stufen": [
            "Dokumentiert vollständig, übersichtlich und mit Fachbegriffen",
            "Dokumentiert vollständig und verständlich",
            "Dokumentiert die wichtigsten Ergebnisse",
            "Dokumentiert lückenhaft",
            "Dokumentiert kaum",
            "Keine Dokumentation"
          ]
        },
        {
          "id": "sachunterricht-4",
          "name": "Mündliche Mitarbeit",
          "typ": "stunde",
          "stufen": [
            "Beteiligt sich sehr häufig mit durchdachten Beiträgen und stellt eigene Fragen",
            "Beteiligt sich regelmäßig und sinnvoll",
            "Beteiligt sich gelegentlich",
            "Meldet sich selten",
            "Meldet sich kaum, auch nach Aufforderung",
            "Keine Beteiligung"
          ]
        },
        {
          "id": "sachunterricht-5",
          "name": "Zusammenarbeit in der Gruppe",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr gut mit, übernimmt Verantwortung und bezieht andere ein",
            "Arbeitet gut mit anderen zusammen",
            "Arbeitet meist gut mit",
            "Arbeitet nur mit einzelnen Kindern zusammen",
            "Arbeitet kaum mit anderen zusammen",
            "Keine Zusammenarbeit"
          ]
        },
        {
          "id": "sachunterricht-6",
          "name": "Arbeitsbereitschaft und Motivation",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr motiviert und selbstständig und hilft anderen",
            "Arbeitet motiviert und meist selbstständig",
            "Arbeitet zuverlässig mit, braucht gelegentlich einen Anstoß",
            "Arbeitet wenig und braucht häufig Aufforderung",
            "Arbeitet kaum und ist sehr unmotiviert",
            "Keine Arbeitsbereitschaft erkennbar"
          ]
        },
        {
          "id": "sachunterricht-7",
          "name": "Ordnung und Sorgfalt",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr sorgfältig, Material und Arbeitsplatz sind immer in Ordnung",
            "Arbeitet sorgfältig, Arbeitsplatz ist in Ordnung",
            "Arbeitet meist sorgfältig, Arbeitsplatz etwas unordentlich",
            "Arbeitet häufig unsorgfältig, Arbeitsplatz unordentlich",
            "Arbeitet sehr unsorgfältig, räumt nicht auf",
            "Kein sorgfältiges Arbeiten erkennbar, räumt nicht auf"
          ]
        }
      ]
    },
    {
      "id": "sport",
      "name": "Sport",
      "kriterien": [
        {
          "id": "sport-1",
          "name": "Bewegungsausführung und Technik",
          "typ": "projekt",
          "stufen": [
            "Führt Bewegungen sehr sicher, kontrolliert und sauber aus",
            "Führt Bewegungen sicher aus",
            "Führt Bewegungen meist richtig aus",
            "Führt Bewegungen unsicher aus",
            "Führt Bewegungen kaum aus",
            "Keine Bewegungsausführung erkennbar"
          ]
        },
        {
          "id": "sport-2",
          "name": "Anstrengungsbereitschaft und Ausdauer",
          "typ": "stunde",
          "stufen": [
            "Strengt sich immer an und hält auch bei Anstrengung durch",
            "Strengt sich an und hält meist durch",
            "Strengt sich meist an, lässt zwischendurch nach",
            "Strengt sich wenig an und gibt schnell auf",
            "Strengt sich kaum an",
            "Verweigert die Mitarbeit"
          ]
        },
        {
          "id": "sport-3",
          "name": "Regeln und Fairness",
          "typ": "stunde",
          "stufen": [
            "Hält Regeln zuverlässig ein, verhält sich fair und akzeptiert Entscheidungen",
            "Hält Regeln ein und spielt fair",
            "Hält Regeln meist ein",
            "Hält Regeln nur nach Ermahnung ein",
            "Verstößt häufig gegen Regeln",
            "Hält Regeln nicht ein und gefährdet damit andere"
          ]
        },
        {
          "id": "sport-4",
          "name": "Zusammenarbeit im Team",
          "typ": "stunde",
          "stufen": [
            "Arbeitet mit allen sehr gut zusammen und unterstützt schwächere Kinder",
            "Arbeitet gut mit anderen zusammen",
            "Arbeitet meist gut mit",
            "Arbeitet nur mit einzelnen Kindern zusammen",
            "Arbeitet kaum mit anderen zusammen",
            "Keine Zusammenarbeit"
          ]
        },
        {
          "id": "sport-5",
          "name": "Umgang mit Geräten und Sicherheit",
          "typ": "stunde",
          "stufen": [
            "Baut selbstständig sicher auf und ab und achtet auf sich und andere",
            "Hilft beim Auf- und Abbau und geht sicher mit Geräten um",
            "Hilft nach Aufforderung mit",
            "Hilft selten, muss an Sicherheitsregeln erinnert werden",
            "Beteiligt sich kaum und missachtet Sicherheitsregeln",
            "Gefährdet sich oder andere"
          ]
        },
        {
          "id": "sport-6",
          "name": "Selbstständigkeit und Sportzeug",
          "typ": "stunde",
          "stufen": [
            "Hat immer Sportzeug dabei und zieht sich schnell und selbstständig um",
            "Hat Sportzeug dabei und zieht sich selbstständig um",
            "Vergisst das Sportzeug selten, braucht beim Umziehen etwas länger",
            "Vergisst das Sportzeug häufiger und braucht beim Umziehen lange",
            "Vergisst das Sportzeug regelmäßig",
            "Nimmt wegen fehlendem Sportzeug fast nie teil"
          ]
        }
      ]
    },
    {
      "id": "musik",
      "name": "Musik",
      "kriterien": [
        {
          "id": "musik-1",
          "name": "Singen",
          "typ": "stunde",
          "stufen": [
            "Singt sicher, in richtiger Tonhöhe und mit gutem Ausdruck",
            "Singt sicher mit",
            "Singt meist mit, Melodie überwiegend richtig",
            "Singt leise und unsicher mit",
            "Singt kaum mit",
            "Singt nicht mit"
          ]
        },
        {
          "id": "musik-2",
          "name": "Musizieren und Rhythmus",
          "typ": "stunde",
          "stufen": [
            "Hält den Rhythmus sicher und spielt Instrumente sehr sicher",
            "Hält den Rhythmus und spielt sicher",
            "Hält den Rhythmus meist",
            "Unsicher im Rhythmus und im Umgang mit Instrumenten",
            "Kaum rhythmisches Spiel erkennbar",
            "Keine Beteiligung am Musizieren"
          ]
        },
        {
          "id": "musik-3",
          "name": "Musik hören und beschreiben",
          "typ": "stunde",
          "stufen": [
            "Beschreibt Musik genau mit Fachbegriffen und begründet den eigenen Eindruck",
            "Beschreibt Musik passend",
            "Beschreibt Musik in einfachen Worten",
            "Beschreibt Musik nur auf Nachfrage",
            "Bringt kaum Beiträge ein",
            "Keine Beiträge"
          ]
        },
        {
          "id": "musik-4",
          "name": "Bewegung zur Musik",
          "typ": "stunde",
          "stufen": [
            "Setzt Musik sehr sicher und mit eigenen Ideen in Bewegung um",
            "Setzt Musik passend in Bewegung um",
            "Macht die Bewegungen meist richtig mit",
            "Macht zurückhaltend mit",
            "Macht kaum mit",
            "Macht nicht mit"
          ]
        },
        {
          "id": "musik-5",
          "name": "Notenkenntnisse und Fachbegriffe",
          "typ": "projekt",
          "stufen": [
            "Kennt Noten und Fachbegriffe sicher und wendet sie selbstständig an",
            "Kennt Noten und Fachbegriffe",
            "Kennt die wichtigsten Begriffe",
            "Kennt nur einzelne Begriffe",
            "Kaum Kenntnisse vorhanden",
            "Keine Kenntnisse vorhanden"
          ]
        },
        {
          "id": "musik-6",
          "name": "Arbeitsbereitschaft und Motivation",
          "typ": "stunde",
          "stufen": [
            "Arbeitet sehr motiviert und selbstständig und hilft anderen",
            "Arbeitet motiviert und meist selbstständig",
            "Arbeitet zuverlässig mit, braucht gelegentlich einen Anstoß",
            "Arbeitet wenig und braucht häufig Aufforderung",
            "Arbeitet kaum und ist sehr unmotiviert",
            "Keine Arbeitsbereitschaft erkennbar"
          ]
        },
        {
          "id": "musik-7",
          "name": "Umgang mit Instrumenten und Material",
          "typ": "stunde",
          "stufen": [
            "Geht mit Instrumenten sehr sorgfältig um und räumt selbstständig auf",
            "Geht sorgfältig mit Instrumenten um und räumt auf",
            "Geht meist sorgfältig um, räumt nach Aufforderung auf",
            "Geht häufig unachtsam mit Instrumenten um",
            "Geht sehr unachtsam um und räumt nicht auf",
            "Beschädigt Material oder verweigert den Umgang damit"
          ]
        }
      ]
    }
  ]
};
