/*
 * Notenblock – Startdaten
 *
 * Was beim ersten Start angelegt wird: Standard-Einstellungen, der Fächer-
 * katalog mit Kompetenzen je Stufe und das Arbeits- und Sozialverhalten aus
 * kriterien-daten.js, eine Beispielklasse mit sechs Kindern samt Fächerauswahl
 * und eigenem Stundenplan. Beispielklasse und -stundenplan lassen sich in der
 * App vollständig löschen.
 *
 * Datenmodell (Version 2):
 *   Fach im Katalog: { id, name, aktiv, stufen: ['1-2','3-4'], hinweise: { stufe → Text },
 *                      nichtVerfuegbar: { stufe → Grund }, eigen: true bei selbst angelegten,
 *                      kompetenzen: [{ id, name, bereich, stufe, gewicht, stufen: [6 Texte], aktiv }] }
 *   Arbeits- und Sozialverhalten: { name, hinweis, kriterien: [{ id, name, bereich, gewicht, stufen, aktiv }] }
 *   Klasse: { id, name, stufe: '1-2'|'3-4'|null, kinder, letztesSchuljahr,
 *             faecher: [{ fachId, abgeschaltet: [kompetenzId] }], stundenplan: [Eintrag], ausnahmen, zusatz }
 *   Stundenplaneintrag der Klasse: { id, wochentag, stunde, art: 'eigene'|'fremd', fachId, bezeichnung,
 *                                    lehrkraft, raum, turnus }
 */
'use strict';
NB.Startdaten = (function () {
  const SD = {};
  const H = NB.Hilfen;

  SD.DATENMODELL = 2.2;
  SD.STUFEN = ['1-2', '3-4'];

  /** Standardwerte aller Einstellungen. */
  SD.einstellungenStandard = function () {
    return {
      version: 3,                      // Stand der Standardwerte (für Ergänzungen beim Laden)
      datenmodell: SD.DATENMODELL,     // Aufbau des Bestands; 2 = Stufen, Kompetenzen, Einheiten je Stunde; 2.1 = Stundenkriterien mit fachnote; 2.2 = siebtes Kriterium und fachspezifische Fassungen
      // Bewertung – gilt nur für das Arbeits- und Sozialverhalten
      standardNote: 3,                 // 1–6, 'letzte' (letzte Note des Kindes) oder 'keine'
      standardNoteJeFach: {},          // fachId → Überschreibung
      skalenBeschriftung: 'ziffern',   // 'ziffern' | 'worte'
      rundung: 'kaufmaennisch',        // 'kaufmaennisch' | 'zugunsten' | 'nachkomma'
      uebernommeneZaehlen: true,       // beim Verlassen festgeschriebene Standardnoten in der Auswertung mitzählen
      mitarbeitGewichtJeFach: {},      // fachId → Gewicht der mündlichen Mitarbeit in der Fachleistung (Standard: Gewicht des Kriteriums)
      // Darstellung
      beschreibungenAnzeigen: true,
      notizfeldAnzeigen: true,
      durchschnittAnzeigen: true,      // bisheriger Durchschnitt des Kindes im Bewertungsbildschirm
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

  function quelle() { return NB.KRITERIEN_START || { stufen: {}, arbeits_und_sozialverhalten: { kriterien: [] } }; }

  /** Katalog der Stufen: { '1-2': { bezeichnung, benotet, hinweis }, '3-4': … } */
  SD.stufenKatalog = function () {
    const k = {};
    const q = quelle();
    SD.STUFEN.forEach(function (stufe) {
      const s = (q.stufen && q.stufen[stufe]) || {};
      k[stufe] = {
        id: stufe,
        bezeichnung: s.bezeichnung || (stufe === '1-2' ? 'Klasse 1 und 2' : 'Klasse 3 und 4'),
        kurz: stufe === '1-2' ? 'Klasse 1 und 2' : 'Klasse 3 und 4',
        benotet: s.benotet !== false,
        hinweis: s.hinweis || ''
      };
    });
    return k;
  };

  /**
   * Fächerkatalog aus dem Startbestand: ein Fach je id über beide Stufen,
   * Kompetenzen als flache Liste mit Angabe der Stufe.
   */
  SD.faecher = function () {
    const q = quelle();
    const faecher = [];
    const nachId = {};
    SD.STUFEN.forEach(function (stufe) {
      const s = (q.stufen && q.stufen[stufe]) || {};
      (s.faecher || []).forEach(function (f) {
        let fach = nachId[f.id];
        if (!fach) {
          fach = { id: f.id, name: f.name, aktiv: true, stufen: [], hinweise: {}, nichtVerfuegbar: {}, eigen: false, kompetenzen: [] };
          nachId[f.id] = fach;
          faecher.push(fach);
        }
        fach.stufen.push(stufe);
        if (f.hinweis) fach.hinweise[stufe] = f.hinweis;
        (f.kompetenzen || []).forEach(function (k) {
          fach.kompetenzen.push({
            id: k.id,
            name: k.name,
            bereich: k.bereich || 'Allgemein',
            stufe: stufe,
            gewicht: (typeof k.gewicht === 'number') ? k.gewicht : 1,
            stufen: Array.isArray(k.stufen) && k.stufen.length === 6 ? k.stufen.slice() : ['', '', '', '', '', ''],
            aktiv: true
          });
        });
      });
      (s.nicht_verfuegbar || []).forEach(function (nv) {
        // Fächer, die es in dieser Stufe nicht gibt – Grund am Fach der anderen Stufe vermerken
        const treffer = faecher.find(f => f.name === nv.name);
        if (treffer) treffer.nichtVerfuegbar[stufe] = nv.grund || '';
        else nachId['__nv_' + nv.name] = { name: nv.name, stufe: stufe, grund: nv.grund };
      });
    });
    // Nachträglich: nicht verfügbare Fächer, die erst in der späteren Stufe auftauchen
    Object.keys(nachId).filter(k => k.indexOf('__nv_') === 0).forEach(function (k) {
      const nv = nachId[k];
      const treffer = faecher.find(f => f.name === nv.name);
      if (treffer && !treffer.nichtVerfuegbar[nv.stufe]) treffer.nichtVerfuegbar[nv.stufe] = nv.grund || '';
    });
    return faecher;
  };

  /**
   * Stundenkriterien (Mitarbeit, Arbeits- und Sozialverhalten): sechs Kriterien,
   * gültig für beide Stufen. fachnote true (Mündliche Mitarbeit) fließt in die
   * Fachleistung ein, alle anderen nie.
   */
  SD.arbeitsverhalten = function () {
    const a = quelle().arbeits_und_sozialverhalten || {};
    return {
      name: a.name || 'Mitarbeit, Arbeits- und Sozialverhalten',
      hinweis: a.hinweis || '',
      kriterien: (a.kriterien || []).map(k => ({
        id: k.id,
        name: k.name,
        bereich: k.bereich || 'Arbeitsverhalten',
        fachnote: k.fachnote === true,
        gewicht: (typeof k.gewicht === 'number') ? k.gewicht : 1,
        stufen: Array.isArray(k.stufen) && k.stufen.length === 6 ? k.stufen.slice() : ['', '', '', '', '', ''],
        aktiv: true
      })),
      fachspezifisch: SD.fachspezifisch()
    };
  };

  /**
   * Fachspezifische Fassungen der Stundenkriterien aus dem Startbestand:
   * { fachId: { kriteriumId: { name?, stufen: [6 Texte] } } } – dieselbe
   * Kriteriums-id, nur andere Beschreibung. Gilt für beide Stufen.
   */
  SD.fachspezifisch = function () {
    const quellFassungen = (quelle().arbeits_und_sozialverhalten || {}).fachspezifisch || {};
    const ergebnis = {};
    Object.keys(quellFassungen).forEach(function (fachId) {
      const jeKriterium = quellFassungen[fachId] || {};
      Object.keys(jeKriterium).forEach(function (kritId) {
        const f = jeKriterium[kritId] || {};
        if (!Array.isArray(f.stufen) || f.stufen.length !== 6) return;
        if (!ergebnis[fachId]) ergebnis[fachId] = {};
        ergebnis[fachId][kritId] = f.name ? { name: f.name, stufen: f.stufen.slice() } : { stufen: f.stufen.slice() };
      });
    });
    return ergebnis;
  };

  /** Notenwörter (Wortform der Skala) aus dem Startbestand. */
  SD.notenwoerter = function () {
    const q = quelle();
    if (Array.isArray(q.notenwoerter) && q.notenwoerter.length === 6) return q.notenwoerter.slice();
    return ['sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend'];
  };

  /** Aktuelles Schuljahr als Text, etwa '2026/2027'. */
  SD.aktuellesSchuljahr = function () {
    const jetzt = new Date();
    const start = jetzt.getMonth() >= 7 ? jetzt.getFullYear() : jetzt.getFullYear() - 1;
    return start + '/' + (start + 1);
  };

  /** Schuljahr: Zeitraum, Ferien, Feiertage, Ankerwoche (global). */
  SD.schuljahr = function () {
    const jetzt = new Date();
    const start = jetzt.getMonth() >= 7 ? jetzt.getFullYear() : jetzt.getFullYear() - 1;
    return {
      von: start + '-08-01',
      bis: (start + 1) + '-07-31',
      ferien: [],          // [{ id, name, von, bis }]
      feiertage: [],       // [{ id, datum, name }]
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

  /** Leere Klasse im neuen Aufbau. */
  SD.leereKlasse = function (name, stufe) {
    return {
      id: H.neueId(),
      name: name || '',
      stufe: stufe || null,
      kinder: [],
      letztesSchuljahr: SD.aktuellesSchuljahr(),
      faecher: [],          // [{ fachId, abgeschaltet: [kompetenzId] }] in Reihenfolge
      faecherFestgelegt: false, // true, sobald die Auswahl bewusst getroffen wurde (auch wenn leer)
      stundenplan: [],      // Einträge dieser Klasse (eigene und fremde Stunden)
      ausnahmen: [],        // [{ id, datum, stunde?, grund }] – Ausfalltermine dieser Klasse
      zusatz: []            // [{ id, datum, stunde, fachId, raum }] – Zusatztermine dieser Klasse
    };
  };

  /** Beispielklasse (Stufe 3–4) mit sechs erfundenen Kindern, Fächern und Stundenplan. */
  SD.beispielKlasse = function () {
    const kinder = [
      ['Berger, Lina', 'LB'],
      ['Demir, Elif', 'ED'],
      ['Fischer, Jonas', 'JF'],
      ['Kowalski, Mia', 'MK'],
      ['Nguyen, Ben', 'BN'],
      ['Schulz, Paul', 'PS']
    ];
    const klasse = SD.leereKlasse('Beispielklasse 3a', '3-4');
    klasse.kinder = kinder.map(k => ({ id: H.neueId(), name: k[0], kuerzel: k[1] }));
    klasse.faecher = ['deutsch', 'mathe', 'sachunterricht', 'kunst', 'musik'].map(id => ({ fachId: id, abgeschaltet: [] }));
    klasse.beispiel = true;
    const eigene = [
      [1, 1, 'deutsch', '12'],
      [1, 2, 'mathe', '12'],
      [2, 1, 'mathe', '12'],
      [2, 3, 'sachunterricht', '12'],
      [3, 2, 'deutsch', '12'],
      [4, 1, 'deutsch', '12'],
      [4, 2, 'deutsch', '12'],
      [4, 4, 'kunst', 'Kunstraum'],
      [5, 2, 'musik', 'Musikraum']
    ];
    klasse.stundenplan = eigene.map(e => ({
      id: H.neueId(), wochentag: e[0], stunde: e[1], art: 'eigene', fachId: e[2], raum: e[3], turnus: 'jede', beispiel: true
    }));
    // Eine fremde Stunde zur Übersicht: wird weder bewertet noch geplant
    klasse.stundenplan.push({ id: H.neueId(), wochentag: 1, stunde: 3, art: 'fremd', bezeichnung: 'Sport', lehrkraft: 'Frau Beispiel', raum: 'Turnhalle', turnus: 'jede', beispiel: true });
    return klasse;
  };

  /**
   * Legt den gesamten Startbestand über die Datenschicht an.
   * Wird nur einmal bei der Einrichtung aufgerufen.
   */
  SD.anlegen = function (Daten) {
    Daten.setzen('einstellungen', '', SD.einstellungenStandard());
    Daten.setzen('faecher', '', SD.faecher());
    Daten.setzen('arbeitsverhalten', '', SD.arbeitsverhalten());
    Daten.setzen('schuljahr', '', SD.schuljahr());
    Daten.setzen('stundenzeiten', '', SD.stundenzeiten());
    const klasse = SD.beispielKlasse();
    Daten.setzen('klasse', klasse.id, klasse);
    Daten.setzen('zustand', '', { bereich: 'kalender' });
  };

  return SD;
})();
