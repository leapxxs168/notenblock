/*
 * Notenblock – Startdaten
 *
 * Was beim ersten Start angelegt wird: Standard-Einstellungen, die Fächer aus
 * kriterien-daten.js, eine Beispielklasse mit sechs Kindern und ein kleiner
 * Beispielstundenplan. Beispielklasse und -stundenplan lassen sich in der App
 * vollständig löschen.
 */
'use strict';
NB.Startdaten = (function () {
  const SD = {};
  const H = NB.Hilfen;

  /** Standardwerte aller Einstellungen (siehe Auftrag, Abschnitt 11). */
  SD.einstellungenStandard = function () {
    return {
      version: 2,                      // Stand der Standardwerte (für Ergänzungen beim Laden)
      // Bewertung
      standardNote: 3,                 // 1–6, 'letzte' (letzte Note des Kindes) oder 'keine'
      standardNoteJeFach: {},          // fachId → Überschreibung
      skalenBeschriftung: 'ziffern',   // 'ziffern' | 'worte'
      rundung: 'kaufmaennisch',        // 'kaufmaennisch' | 'zugunsten' | 'nachkomma'
      standardnotenEinrechnen: false,
      // Darstellung
      beschreibungenAnzeigen: true,
      notizfeldAnzeigen: true,         // Notizfeld je Kind und Stunde in der Bewertung
      schriftgroesse: 'mittel',        // 'klein' | 'mittel' | 'gross'
      kinderSortierung: 'name',        // 'name' | 'eigene'
      wischrichtungUmkehren: false,
      haptik: true,
      // Datenschutz
      nurKuerzel: false,
      keineVollenNamen: false,
      sperreNachMinuten: 5,            // 1, 5, 15, 60 oder 0 (nie)
      sperreImHintergrund: false,
      // Daten
      letzteSicherung: null
    };
  };

  /** Fächer aus dem eingebetteten Startbestand, Gewicht standardmäßig 1. */
  SD.faecher = function () {
    const quelle = NB.KRITERIEN_START || { faecher: [] };
    return quelle.faecher.map(function (fach) {
      return {
        id: fach.id,
        name: fach.name,
        kriterien: (fach.kriterien || []).map(function (k) {
          return {
            id: k.id,
            name: k.name,
            typ: k.typ === 'projekt' ? 'projekt' : 'stunde',
            gewicht: (typeof k.gewicht === 'number') ? k.gewicht : 1,
            stufen: Array.isArray(k.stufen) && k.stufen.length === 6 ? k.stufen.slice() : ['', '', '', '', '', '']
          };
        })
      };
    });
  };

  /** Notenwörter (Wortform der Skala) aus dem Startbestand. */
  SD.notenwoerter = function () {
    const quelle = NB.KRITERIEN_START;
    if (quelle && Array.isArray(quelle.notenwoerter) && quelle.notenwoerter.length === 6) return quelle.notenwoerter.slice();
    return ['sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend'];
  };

  /** Aktuelles Schuljahr als Text, etwa '2026/2027'. */
  SD.aktuellesSchuljahr = function () {
    const jetzt = new Date();
    const start = jetzt.getMonth() >= 7 ? jetzt.getFullYear() : jetzt.getFullYear() - 1;
    return start + '/' + (start + 1);
  };

  /** Zeitraum des Schuljahres: 1. August bis 31. Juli. */
  SD.schuljahr = function () {
    const jetzt = new Date();
    const start = jetzt.getMonth() >= 7 ? jetzt.getFullYear() : jetzt.getFullYear() - 1;
    return {
      von: start + '-08-01',
      bis: (start + 1) + '-07-31',
      ferien: [],          // [{ von, bis, name }]
      feiertage: [],       // ['JJJJ-MM-TT']
      ausnahmen: [],       // ['JJJJ-MM-TT'] – Tage, an denen einzelne Stunden ausfallen
      zusatz: [],          // [{ datum, klasseId, fachId, stunde }] – Zusatztermine
      ankerwocheA: null    // Montag einer A-Woche ('JJJJ-MM-TT'), für Turnus A/B
    };
  };

  /** Uhrzeiten je Stundennummer. */
  SD.stundenzeiten = function () {
    return {
      1: { von: '08:00', bis: '08:45' },
      2: { von: '08:50', bis: '09:35' },
      3: { von: '09:55', bis: '10:40' },
      4: { von: '10:45', bis: '11:30' },
      5: { von: '11:50', bis: '12:35' },
      6: { von: '12:40', bis: '13:25' }
    };
  };

  /** Beispielklasse mit sechs (erfundenen) Kindern. */
  SD.beispielKlasse = function () {
    const kinder = [
      ['Berger, Lina', 'LB'],
      ['Demir, Elif', 'ED'],
      ['Fischer, Jonas', 'JF'],
      ['Kowalski, Mia', 'MK'],
      ['Nguyen, Ben', 'BN'],
      ['Schulz, Paul', 'PS']
    ];
    return {
      id: H.neueId(),
      name: 'Beispielklasse 3a',
      kinder: kinder.map(k => ({ id: H.neueId(), name: k[0], kuerzel: k[1] })),
      letztesSchuljahr: SD.aktuellesSchuljahr(),
      beispiel: true
    };
  };

  /** Beispielstundenplan mit wenigen Einträgen für die Beispielklasse. */
  SD.beispielStundenplan = function (klasseId) {
    const eintraege = [
      [1, 1, 'deutsch', '12'],
      [1, 2, 'mathe', '12'],
      [2, 1, 'mathe', '12'],
      [2, 3, 'sachunterricht', '12'],
      [3, 2, 'deutsch', '12'],
      [4, 1, 'deutsch', '12'],
      [4, 4, 'kunst', 'Kunstraum'],
      [5, 2, 'musik', 'Musikraum']
    ];
    return eintraege.map(e => ({
      id: H.neueId(),
      wochentag: e[0],
      stunde: e[1],
      klasseId: klasseId,
      fachId: e[2],
      raum: e[3],
      turnus: 'jede',
      beispiel: true
    }));
  };

  /**
   * Legt den gesamten Startbestand über die Datenschicht an.
   * Wird nur einmal bei der Einrichtung aufgerufen.
   */
  SD.anlegen = function (Daten) {
    Daten.setzen('einstellungen', '', SD.einstellungenStandard());
    Daten.setzen('faecher', '', SD.faecher());
    Daten.setzen('schuljahr', '', SD.schuljahr());
    Daten.setzen('stundenzeiten', '', SD.stundenzeiten());
    const klasse = SD.beispielKlasse();
    Daten.setzen('klasse', klasse.id, klasse);
    Daten.setzen('stundenplan', '', SD.beispielStundenplan(klasse.id));
    Daten.setzen('zustand', '', { bereich: 'kalender' });
  };

  return SD;
})();
