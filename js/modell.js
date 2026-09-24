/*
 * Notenblock – Fachliches Modell (Datenmodell Version 2)
 *
 * Zwei Arten von Kriterien:
 *   Stunde     – die sechs Kriterien zu Mitarbeit, Arbeits- und Sozialverhalten,
 *                gleicher Satz in jedem Fach und jeder Stufe (Datensatz
 *                'arbeitsverhalten'). Kriterien mit fachnote true (Mündliche
 *                Mitarbeit) fließen in die Fachleistung ein, alle anderen nie.
 *                Je Einheit lässt sich ein Stundenkriterium aussetzen
 *                (einheit.ausgesetzt): keine Vorbelegung, keine Übernahme, zählt nicht.
 *   Kompetenz  – fachliche Kompetenzen des Fachs in der Stufe der Klasse,
 *                gruppiert nach Lehrplanbereich (im Fächerkatalog 'faecher').
 *
 * Bewertet wird jede Unterrichtsstunde einzeln. Eine Bewertungseinheit gehört
 * zu Klasse, Fach, Datum und Stundennummer (bei einer Doppelstunde die erste).
 * Ohne Stundenplan gilt je Klasse, Fach und Tag eine Einheit (Stunde 0).
 *   Einheit: { klasseId, fachId, datum, stunde, stundeBis, kinder: { kindId: {
 *              noten: { kriteriumId: { wert: 1–6, art: 'gesetzt'|'uebernommen' } },
 *              fehlt, beruehrt, notiz } }, archiviert }
 * Drei Zustände je Wert: gesetzt (selbst angetippt), uebernommen (beim
 * Verlassen mit der Standardnote festgeschrieben – nur Stundenkriterien),
 * offen (kein Eintrag). Kompetenzen starten immer leer und werden nur
 * gespeichert, wenn die Lehrerin sie ausdrücklich setzt: Sie werden nicht in
 * jeder Stunde beobachtet, automatische Werte würden jeden Durchschnitt entwerten.
 */
'use strict';
NB.Modell = (function () {
  const M = {};
  const H = NB.Hilfen;
  const D = NB.Daten;

  M.STUFEN = ['1-2', '3-4'];
  M.OHNE_STUNDE = 0;              // Einheit ohne Stundenplan
  M.UNBEKANNTE_STUNDE = 'unbekannt'; // archivierte Einheiten aus Version 1

  /* ---------- Einstellungen ---------- */

  M.einstellungen = function () {
    return D.holen('einstellungen', '') || NB.Startdaten.einstellungenStandard();
  };

  M.einstellungSetzen = function (name, wert) {
    const e = D.holen('einstellungen', '') || NB.Startdaten.einstellungenStandard();
    e[name] = wert;
    D.setzen('einstellungen', '', e);
  };

  M.notenwoerter = () => NB.Startdaten.notenwoerter();

  /* ---------- Stufen ---------- */

  M.stufen = () => NB.Startdaten.stufenKatalog();
  M.stufe = id => M.stufen()[id] || null;

  /** Klasse mit Noten (Stufe 3–4) oder ohne (Stufe 1–2). Ohne Stufe: benotet. */
  M.istBenotet = function (klasse) {
    const s = klasse && klasse.stufe ? M.stufe(klasse.stufe) : null;
    return s ? s.benotet !== false : true;
  };

  /* ---------- Fächerkatalog ---------- */

  M.faecherKatalog = () => D.holen('faecher', '') || [];
  M.faecherSpeichern = liste => D.setzen('faecher', '', liste);

  M.fach = function (fachId) {
    return M.faecherKatalog().find(f => f.id === fachId) || null;
  };

  /** Aktive Fächer des Katalogs, wahlweise nur die einer Stufe. */
  M.faecherAktiv = function (stufe) {
    return M.faecherKatalog().filter(f => f.aktiv !== false && (!stufe || M.fachInStufe(f, stufe)));
  };

  M.fachInStufe = function (fach, stufe) {
    if (!fach) return false;
    if (Array.isArray(fach.stufen) && fach.stufen.length) return fach.stufen.indexOf(stufe) >= 0;
    return true;
  };

  /** Grund, warum ein Fach in einer Stufe nicht angeboten wird, sonst ''. */
  M.fachNichtVerfuegbar = function (fach, stufe) {
    return (fach && fach.nichtVerfuegbar && fach.nichtVerfuegbar[stufe]) || '';
  };

  M.fachHinweis = function (fach, stufe) {
    return (fach && fach.hinweise && fach.hinweise[stufe]) || '';
  };

  /** Rückwärtskompatibel: alle aktiven Fächer (ohne Stufenbezug). */
  M.faecher = () => M.faecherAktiv(null);

  /* ---------- Fächer einer Klasse ---------- */

  /**
   * Hat die Klasse eine eigene Fächerauswahl? Ja, sobald sie bewusst festgelegt
   * wurde (Merkmal faecherFestgelegt, auch bei leerer Liste) oder die Liste
   * gefüllt ist. Ältere Klassen ohne beides: alle aktiven Fächer ihrer Stufe.
   */
  M.faecherFestgelegt = function (klasse) {
    return !!klasse && (klasse.faecherFestgelegt === true || (Array.isArray(klasse.faecher) && klasse.faecher.length > 0));
  };

  /**
   * Fächer einer Klasse in ihrer Reihenfolge: nur gewählte, in der Stufe der
   * Klasse angebotene und nicht stillgelegte Katalogfächer. Hat die Klasse noch
   * keine Auswahl (ältere Klassen), gelten alle aktiven Fächer ihrer Stufe.
   * optionen.mitStillgelegten: stillgelegte Fächer mit aufführen (Auswertung).
   */
  M.klassenFaecher = function (klasse, optionen) {
    if (!klasse) return [];
    const mitStillgelegten = !!(optionen && optionen.mitStillgelegten);
    const inStufe = f => !klasse.stufe || M.fachInStufe(f, klasse.stufe);
    if (M.faecherFestgelegt(klasse)) {
      return (klasse.faecher || []).map(z => M.fach(z.fachId)).filter(f => f && inStufe(f) && (mitStillgelegten || f.aktiv !== false));
    }
    return M.faecherKatalog().filter(f => inStufe(f) && (mitStillgelegten || f.aktiv !== false));
  };

  /** Stillgelegte Fächer, die eine Klasse gewählt hat oder in denen sie Einheiten besitzt. */
  M.klassenFaecherStillgelegt = function (klasse) {
    if (!klasse) return [];
    const gewaehlt = M.klassenFaecher(klasse, { mitStillgelegten: true }).filter(f => f.aktiv === false);
    M.faecherKatalog().forEach(function (f) {
      if (f.aktiv === false && !gewaehlt.some(g => g.id === f.id) && M.anzahlEinheiten(klasse.id, f.id) > 0) gewaehlt.push(f);
    });
    return gewaehlt;
  };

  /**
   * Fächerauswahl einer Klasse festschreiben: hat sie noch keine, werden alle
   * aktiven Fächer ihrer Stufe eingetragen (Reihenfolge des Katalogs).
   * Liefert true, wenn etwas geschrieben wurde.
   */
  M.klassenFaecherFestlegen = function (klasse) {
    if (!klasse || M.faecherFestgelegt(klasse)) return false;
    klasse.faecher = M.faecherAktiv(klasse.stufe || null).map(f => ({ fachId: f.id, abgeschaltet: [] }));
    klasse.faecherFestgelegt = true;
    M.klasseSpeichern(klasse);
    return true;
  };

  /** Leere Fächerauswahl festschreiben (neue Klasse: die Lehrerin wählt selbst). */
  M.klassenFaecherLeerFestlegen = function (klasse) {
    klasse.faecher = [];
    klasse.faecherFestgelegt = true;
    M.klasseSpeichern(klasse);
  };

  /** Ist ein Fach in der Auswahl der Klasse? */
  M.klasseHatFach = function (klasse, fachId) {
    return !!(klasse && Array.isArray(klasse.faecher) && klasse.faecher.some(z => z.fachId === fachId));
  };

  /** Fach in die Auswahl der Klasse aufnehmen (ans Ende) bzw. daraus entfernen – Daten bleiben erhalten. */
  M.klasseFachWaehlen = function (klasse, fachId, gewaehlt) {
    if (!Array.isArray(klasse.faecher)) klasse.faecher = [];
    klasse.faecherFestgelegt = true;
    const vorhanden = klasse.faecher.some(z => z.fachId === fachId);
    if (gewaehlt && !vorhanden) klasse.faecher.push({ fachId: fachId, abgeschaltet: [] });
    if (!gewaehlt && vorhanden) klasse.faecher = klasse.faecher.filter(z => z.fachId !== fachId);
    M.klasseSpeichern(klasse);
  };

  /** Fach in der Reihenfolge der Klasse verschieben (richtung -1 nach oben, +1 nach unten). */
  M.klasseFachVerschieben = function (klasse, fachId, richtung) {
    const liste = klasse.faecher || [];
    const i = liste.findIndex(z => z.fachId === fachId);
    const j = i + richtung;
    if (i < 0 || j < 0 || j >= liste.length) return false;
    const [eintrag] = liste.splice(i, 1);
    liste.splice(j, 0, eintrag);
    M.klasseSpeichern(klasse);
    return true;
  };

  /** Abgeschaltete Kompetenzen einer Klasse in einem Fach. */
  M.abgeschalteteKompetenzen = function (klasse, fachId) {
    const z = klasse && Array.isArray(klasse.faecher) ? klasse.faecher.find(x => x.fachId === fachId) : null;
    return (z && Array.isArray(z.abgeschaltet)) ? z.abgeschaltet : [];
  };

  /** Kompetenz für eine Klasse in einem Fach abschalten oder wieder einschalten – Daten bleiben erhalten. */
  M.kompetenzAbschalten = function (klasse, fachId, kompetenzId, abgeschaltet) {
    if (!Array.isArray(klasse.faecher)) klasse.faecher = [];
    let z = klasse.faecher.find(x => x.fachId === fachId);
    if (!z) { z = { fachId: fachId, abgeschaltet: [] }; klasse.faecher.push(z); }
    if (!Array.isArray(z.abgeschaltet)) z.abgeschaltet = [];
    const drin = z.abgeschaltet.indexOf(kompetenzId) >= 0;
    if (abgeschaltet && !drin) z.abgeschaltet.push(kompetenzId);
    if (!abgeschaltet && drin) z.abgeschaltet = z.abgeschaltet.filter(id => id !== kompetenzId);
    M.klasseSpeichern(klasse);
  };

  /** Stundenplaneinträge einer Klasse zu einem Fach (für die Rückfrage beim Abwählen). */
  M.anzahlPlanEintraege = function (klasse, fachId) {
    return (klasse && Array.isArray(klasse.stundenplan) ? klasse.stundenplan : []).filter(e => e.art !== 'fremd' && e.fachId === fachId).length;
  };

  /* ---------- Kriterien ---------- */

  M.arbeitsverhalten = function () {
    return D.holen('arbeitsverhalten', '') || NB.Startdaten.arbeitsverhalten();
  };
  M.arbeitsverhaltenSpeichern = a => D.setzen('arbeitsverhalten', '', a);

  function gewichtVon(k) { return (typeof k.gewicht === 'number') ? k.gewicht : 1; }
  M.gewicht = gewichtVon;

  /** Die Stundenkriterien (aktiv, Gewicht > 0) in der allgemeinen Fassung. */
  M.stundenkriterien = function () {
    return (M.arbeitsverhalten().kriterien || []).filter(k => k.aktiv !== false && gewichtVon(k) > 0);
  };

  /* ---------- Fachspezifische Fassungen der Stundenkriterien ---------- */

  /**
   * Fassung eines Stundenkriteriums für ein Fach, sonst null. Eine Fassung ist
   * nur eine andere Beschreibung desselben Kriteriums: gleiche id, wahlweise
   * eigener Name und sechs eigene Stufentexte. Sie gilt für beide Stufen.
   */
  M.fachFassung = function (kriteriumId, fachId) {
    const alle = M.arbeitsverhalten().fachspezifisch || {};
    const jeFach = alle[fachId];
    return (jeFach && jeFach[kriteriumId]) || null;
  };

  /**
   * Stundenkriterium in der Fassung eines Fachs: gleiche id und gleiches
   * Gewicht, aber Name und Texte der Fassung, sofern es eine gibt.
   */
  M.kriteriumImFach = function (kriterium, fachId) {
    if (!kriterium || !fachId) return kriterium;
    const f = M.fachFassung(kriterium.id, fachId);
    if (!f) return kriterium;
    const kopie = Object.assign({}, kriterium);
    if (f.name) kopie.name = f.name;
    if (Array.isArray(f.stufen) && f.stufen.length === 6) kopie.stufen = f.stufen.slice();
    kopie.eigeneFassung = true;
    return kopie;
  };

  /** Stundenkriterien in der Fassung eines Fachs (für Erfassung und Auswertung je Fach). */
  M.stundenkriterienImFach = function (fachId) {
    return M.stundenkriterien().map(k => M.kriteriumImFach(k, fachId));
  };

  /** Fächer, für die ein Kriterium eine eigene Fassung hat: [{ fachId, fach, fassung }]. */
  M.fassungenFuerKriterium = function (kriteriumId) {
    const alle = M.arbeitsverhalten().fachspezifisch || {};
    const liste = [];
    M.faecherKatalog().forEach(function (fach) {
      const f = alle[fach.id] && alle[fach.id][kriteriumId];
      if (f) liste.push({ fachId: fach.id, fach: fach, fassung: f });
    });
    // Fassungen für inzwischen gelöschte Fächer bleiben erhalten, erscheinen aber nicht
    return liste;
  };

  /** Fassung anlegen oder ändern. */
  M.fassungSpeichern = function (kriteriumId, fachId, fassung) {
    const a = M.arbeitsverhalten();
    if (!a.fachspezifisch) a.fachspezifisch = {};
    if (!a.fachspezifisch[fachId]) a.fachspezifisch[fachId] = {};
    a.fachspezifisch[fachId][kriteriumId] = fassung;
    M.arbeitsverhaltenSpeichern(a);
  };

  /** Fassung entfernen – danach gilt für dieses Fach wieder die allgemeine Fassung. */
  M.fassungEntfernen = function (kriteriumId, fachId) {
    const a = M.arbeitsverhalten();
    if (!a.fachspezifisch || !a.fachspezifisch[fachId]) return;
    delete a.fachspezifisch[fachId][kriteriumId];
    if (!Object.keys(a.fachspezifisch[fachId]).length) delete a.fachspezifisch[fachId];
    M.arbeitsverhaltenSpeichern(a);
  };

  /** Fließt ein Stundenkriterium in die Fachleistung ein (etwa Mündliche Mitarbeit)? */
  M.istFachnote = k => !!(k && k.fachnote === true);

  /** Stundenkriterien, die zur Fachleistung zählen. */
  M.fachnoteKriterien = () => M.stundenkriterien().filter(M.istFachnote);

  /** Gewicht eines Fachnote-Kriteriums in der Fachleistung eines Fachs (je Fach überschreibbar). */
  M.mitarbeitGewicht = function (fachId, kriterium) {
    const je = M.einstellungen().mitarbeitGewichtJeFach || {};
    const wert = je[fachId];
    if (typeof wert === 'number' && wert >= 0) return wert;
    return kriterium ? gewichtVon(kriterium) : 1;
  };

  /* ---------- Aussetzen je Einheit (einmal für die ganze Klasse) ---------- */

  M.ausgesetzt = function (einheit, kriteriumId) {
    return !!(einheit && Array.isArray(einheit.ausgesetzt) && einheit.ausgesetzt.indexOf(kriteriumId) >= 0);
  };

  /** Kriterium für diese Einheit aussetzen oder wieder aufnehmen (ohne zu speichern). Werte bleiben erhalten. */
  M.aussetzenUmschalten = function (einheit, kriteriumId) {
    if (!Array.isArray(einheit.ausgesetzt)) einheit.ausgesetzt = [];
    const i = einheit.ausgesetzt.indexOf(kriteriumId);
    if (i >= 0) einheit.ausgesetzt.splice(i, 1);
    else einheit.ausgesetzt.push(kriteriumId);
    return i < 0;
  };

  /**
   * Kompetenzen eines Fachs in einer Stufe, ohne abgeschaltete der Klasse,
   * in Katalogreihenfolge (gruppiert nach Bereich durch M.nachBereich).
   */
  M.kompetenzen = function (fach, stufe, klasse) {
    if (!fach || !Array.isArray(fach.kompetenzen)) return [];
    const abgeschaltet = klasse ? M.abgeschalteteKompetenzen(klasse, fach.id) : [];
    return fach.kompetenzen.filter(k => k.aktiv !== false && gewichtVon(k) > 0 && (!stufe || k.stufe === stufe) && abgeschaltet.indexOf(k.id) < 0);
  };

  /** Alle Kompetenzen eines Fachs, die eine Einheit betreffen können (auch abgeschaltete, für die Auswertung). */
  M.kompetenzenAlle = function (fach, stufe) {
    if (!fach || !Array.isArray(fach.kompetenzen)) return [];
    return fach.kompetenzen.filter(k => !stufe || k.stufe === stufe);
  };

  /** Liste nach Bereich gruppieren: [{ bereich, kriterien }] in Reihenfolge des ersten Auftretens. */
  M.nachBereich = function (liste) {
    const gruppen = [];
    liste.forEach(function (k) {
      const name = k.bereich || 'Allgemein';
      let g = gruppen.find(x => x.bereich === name);
      if (!g) { g = { bereich: name, kriterien: [] }; gruppen.push(g); }
      g.kriterien.push(k);
    });
    return gruppen;
  };

  /**
   * Kriterien für die Erfassung: ansicht 'stunde' → Stundenkriterien,
   * 'kompetenzen' → Kompetenzen des Fachs in der Stufe der Klasse.
   */
  M.kriterienFuer = function (klasse, fach, ansicht) {
    if (ansicht === 'stunde') return M.stundenkriterienImFach(fach ? fach.id : null);
    if (!klasse || !klasse.stufe) return [];
    return M.kompetenzen(fach, klasse.stufe, klasse);
  };

  /** Kriterium nach Id (Stundenkriterium, Kompetenz oder archiviert); fach wählt die Fassung. */
  M.kriterium = function (kriteriumId, fach) {
    const s = (M.arbeitsverhalten().kriterien || []).find(k => k.id === kriteriumId);
    if (s) return fach ? M.kriteriumImFach(s, fach.id) : s;
    const faecher = fach ? [fach] : M.faecherKatalog();
    for (let i = 0; i < faecher.length; i++) {
      const k = (faecher[i].kompetenzen || []).find(x => x.id === kriteriumId);
      if (k) return k;
    }
    return M.archivKriterium(kriteriumId);
  };

  M.istStundenkriterium = function (kriteriumId) {
    return (M.arbeitsverhalten().kriterien || []).some(k => k.id === kriteriumId);
  };

  /* ---------- Archiv (frühere Kriterien aus Version 1) ---------- */

  M.archiv = () => D.holen('archiv', '') || null;

  M.archivKriterium = function (kriteriumId) {
    const a = M.archiv();
    if (!a) return null;
    const alt = (a.arbeitsverhalten || []).find(x => x.id === kriteriumId);
    if (alt) return alt;
    for (let i = 0; i < (a.faecher || []).length; i++) {
      const k = (a.faecher[i].kriterien || []).find(x => x.id === kriteriumId);
      if (k) return k;
    }
    return null;
  };

  /* ---------- Klassen und Kinder ---------- */

  M.klassen = function () {
    return D.alle('klasse').slice().sort((a, b) => H.vergleichText(a.name, b.name));
  };

  M.klasse = klasseId => (klasseId ? D.holen('klasse', klasseId) : null);
  M.klasseSpeichern = klasse => D.setzen('klasse', klasse.id, klasse);

  /** Kinder einer Klasse in Anzeigereihenfolge (Einstellung: Name oder eigene Reihenfolge). */
  M.kinderSortiert = function (klasse) {
    const liste = (klasse && Array.isArray(klasse.kinder)) ? klasse.kinder.slice() : [];
    if (M.einstellungen().kinderSortierung !== 'eigene') {
      liste.sort((a, b) => H.vergleichText(a.name || a.kuerzel, b.name || b.kuerzel));
    }
    return liste;
  };

  /** Anzeigename eines Kindes, je nach Einstellung „nur Kürzel“. */
  M.kindName = function (kind) {
    if (!kind) return '';
    const e = M.einstellungen();
    if ((e.nurKuerzel || !kind.name) && kind.kuerzel) return kind.kuerzel;
    return kind.name || kind.kuerzel || '?';
  };

  M.kind = function (klasse, kindId) {
    if (!klasse || !Array.isArray(klasse.kinder)) return null;
    return klasse.kinder.find(k => k.id === kindId) || null;
  };

  /** Kind aus der Klasse, aus allen Einheiten der Klasse und aus den Notizen entfernen. */
  M.kindEntfernen = function (klasse, kindId) {
    klasse.kinder = (klasse.kinder || []).filter(k => k.id !== kindId);
    D.setzen('klasse', klasse.id, klasse);
    D.alle('bewertung').filter(b => b.klasseId === klasse.id).forEach(function (b) {
      if (b.kinder && b.kinder[kindId]) {
        delete b.kinder[kindId];
        M.einheitSpeichern(b);
      }
    });
    D.alle('notiz').filter(n => n.kindId === kindId).forEach(n => D.entfernen('notiz', n.id));
  };

  /** Klasse samt Einheiten, Planungen, Notizen und Aufgaben löschen. */
  M.klasseLoeschen = function (klasseId) {
    D.alle('bewertung').filter(b => b.klasseId === klasseId).forEach(b => D.entfernen('bewertung', M.einheitSchluesselVon(b)));
    D.alle('planung').filter(p => p.klasseId === klasseId).forEach(p => D.entfernen('planung', p.schluessel));
    D.alle('notiz').filter(n => n.klasseId === klasseId).forEach(n => D.entfernen('notiz', n.id));
    D.alle('aufgabe').filter(a => a.klasseId === klasseId).forEach(a => D.entfernen('aufgabe', a.id));
    D.alle('termin').filter(t => t.klasseId === klasseId).forEach(t => D.entfernen('termin', t.id));
    const zustand = D.holen('zustand', '');
    if (zustand && zustand.positionen && zustand.positionen[klasseId]) {
      delete zustand.positionen[klasseId];
      D.setzen('zustand', '', zustand);
    }
    D.entfernen('klasse', klasseId);
  };

  /** Anzahl der Einheiten (mit Inhalt), die eine Klasse und/oder ein Fach betreffen. */
  M.anzahlEinheiten = function (klasseId, fachId) {
    return D.alle('bewertung').filter(b => !b.archiviert && (!klasseId || b.klasseId === klasseId) && (!fachId || b.fachId === fachId) && M.bewertungHatInhalt(b)).length;
  };
  M.anzahlBewertungen = M.anzahlEinheiten;

  /** Einheiten, in denen bestimmte Kompetenzen bewertet wurden (für Rückfragen beim Abschalten). */
  M.anzahlEinheitenMitKriterien = function (klasseId, fachId, kriteriumIds) {
    return D.alle('bewertung').filter(function (b) {
      if (b.archiviert || (klasseId && b.klasseId !== klasseId) || (fachId && b.fachId !== fachId)) return false;
      return Object.keys(b.kinder || {}).some(function (kindId) {
        const n = b.kinder[kindId] && b.kinder[kindId].noten;
        return n && kriteriumIds.some(id => n[id] != null);
      });
    }).length;
  };

  /** Fach endgültig löschen: samt Einheiten, Planungen, Klassenzuordnungen und Stundenplaneinträgen. */
  M.fachLoeschen = function (fachId) {
    D.alle('bewertung').filter(b => b.fachId === fachId).forEach(b => D.entfernen('bewertung', M.einheitSchluesselVon(b)));
    D.alle('planung').filter(p => p.fachId === fachId).forEach(p => D.entfernen('planung', p.schluessel));
    M.klassen().forEach(function (klasse) {
      let geaendert = false;
      if (Array.isArray(klasse.faecher) && klasse.faecher.some(z => z.fachId === fachId)) { klasse.faecher = klasse.faecher.filter(z => z.fachId !== fachId); geaendert = true; }
      if (Array.isArray(klasse.stundenplan) && klasse.stundenplan.some(e => e.fachId === fachId)) { klasse.stundenplan = klasse.stundenplan.filter(e => e.fachId !== fachId); geaendert = true; }
      if (Array.isArray(klasse.zusatz) && klasse.zusatz.some(e => e.fachId === fachId)) { klasse.zusatz = klasse.zusatz.filter(e => e.fachId !== fachId); geaendert = true; }
      if (geaendert) M.klasseSpeichern(klasse);
    });
    const e = M.einstellungen();
    if (e.standardNoteJeFach && e.standardNoteJeFach[fachId] !== undefined) {
      delete e.standardNoteJeFach[fachId];
      D.setzen('einstellungen', '', e);
    }
    M.faecherSpeichern(M.faecherKatalog().filter(f => f.id !== fachId));
  };

  /** Kompetenz aus dem Fach und aus allen Einheiten des Fachs entfernen. */
  M.kompetenzLoeschen = function (fachId, kompetenzId) {
    const faecher = M.faecherKatalog();
    const fach = faecher.find(f => f.id === fachId);
    if (!fach) return;
    fach.kompetenzen = (fach.kompetenzen || []).filter(k => k.id !== kompetenzId);
    M.faecherSpeichern(faecher);
    M.einheiten(null, fachId).forEach(function (b) {
      let geaendert = false;
      Object.keys(b.kinder || {}).forEach(function (kindId) {
        const e = b.kinder[kindId];
        if (e && e.noten && e.noten[kompetenzId] !== undefined) { delete e.noten[kompetenzId]; geaendert = true; }
      });
      if (geaendert) M.einheitSpeichern(b);
    });
  };
  M.kriteriumLoeschen = M.kompetenzLoeschen;

  /* ---------- Farben von Klassen und Fächern ---------- */

  M.FARBEN = () => NB.Startdaten.FARBEN;

  /** Farbwert zu einer Farb-Id, sonst die erste Farbe der Palette. */
  M.farbwert = function (farbId) {
    const f = NB.Startdaten.FARBEN.find(x => x.id === farbId);
    return (f || NB.Startdaten.FARBEN[0]).wert;
  };

  /** Farbe einer Klasse bzw. eines Fachs (vergibt beim ersten Zugriff keine – siehe farbenErgaenzen). */
  M.klassenFarbe = klasse => M.farbwert(klasse && klasse.farbe);
  M.fachFarbe = fach => M.farbwert(fach && fach.farbe);

  /** Nächste noch freie Farbe der Palette; sind alle belegt, reihum weiter. */
  M.freieFarbe = function (belegt) {
    const palette = NB.Startdaten.FARBEN;
    const frei = palette.find(f => belegt.indexOf(f.id) < 0);
    return (frei || palette[belegt.length % palette.length]).id;
  };

  /**
   * Allen Klassen und Fächern ohne Farbe eine zuweisen (beim Start, rein
   * hinzufügend). Liefert true, wenn etwas vergeben wurde.
   */
  M.farbenErgaenzen = function () {
    let geaendert = false;
    const klassen = M.klassen();
    const belegtK = klassen.map(k => k.farbe).filter(Boolean);
    klassen.forEach(function (k) {
      if (k.farbe) return;
      k.farbe = M.freieFarbe(belegtK);
      belegtK.push(k.farbe);
      M.klasseSpeichern(k);
      geaendert = true;
    });
    const faecher = M.faecherKatalog();
    const belegtF = faecher.map(f => f.farbe).filter(Boolean);
    let fachGeaendert = false;
    faecher.forEach(function (f) {
      if (f.farbe) return;
      f.farbe = M.freieFarbe(belegtF);
      belegtF.push(f.farbe);
      fachGeaendert = true;
    });
    if (fachGeaendert) { M.faecherSpeichern(faecher); geaendert = true; }
    return geaendert;
  };

  /* ---------- Termine ---------- */

  M.TERMIN_ARTEN = () => NB.Startdaten.TERMIN_ARTEN;

  M.terminArt = function (artId) {
    const arten = NB.Startdaten.TERMIN_ARTEN;
    return arten.find(a => a.id === artId) || arten[arten.length - 1];
  };

  /** Alle Termine, nach Datum und Beginn. */
  M.termine = function (klasseId) {
    return D.alle('termin')
      .filter(t => !klasseId || t.klasseId === klasseId)
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : (a.von || '') < (b.von || '') ? -1 : 1));
  };

  M.termin = id => D.holen('termin', id);
  M.terminSpeichern = function (termin) {
    if (!termin.id) termin.id = H.neueId();
    D.setzen('termin', termin.id, termin);
    return termin;
  };
  M.terminLoeschen = id => D.entfernen('termin', id);

  /** Neuer Termin mit Vorgaben. */
  M.neuerTermin = function (datum, klasseId) {
    return {
      id: H.neueId(), titel: '', datum: datum || H.heute(), ganztags: true, von: '', bis: '',
      ort: '', notiz: '', klasseId: klasseId || null, art: 'sonstiges', unterrichtFaelltAus: false
    };
  };

  /**
   * Termine eines Tages. klasseId null = alle („Mein Plan“), sonst nur Termine
   * dieser Klasse. Ganztägige zuerst, danach nach Uhrzeit.
   */
  M.termineAmTag = function (iso, klasseId) {
    return D.alle('termin')
      .filter(t => t.datum === iso && (!klasseId || t.klasseId === klasseId))
      .sort((a, b) => (a.ganztags === b.ganztags ? (a.von || '').localeCompare(b.von || '') : (a.ganztags ? -1 : 1)));
  };

  /** Termine eines Zeitraums (für Wochen- und Monatsansicht sowie die Klassenübersicht). */
  M.termineImZeitraum = function (vonIso, bisIso, klasseId) {
    return M.termine(klasseId).filter(t => t.datum >= vonIso && t.datum <= bisIso);
  };

  /**
   * Fällt an diesem Tag der Unterricht wegen eines Termins aus?
   * Ein Termin ohne Klasse gilt für alle eigenen Stunden, einer mit Klasse nur
   * für diese. Liefert den Termin oder null.
   */
  M.ausfallTermin = function (iso, klasseId) {
    return D.alle('termin').find(t => t.datum === iso && t.unterrichtFaelltAus
      && (!t.klasseId || !klasseId || t.klasseId === klasseId)) || null;
  };

  /* ---------- Stundenplanungen ---------- */

  M.planungSchluessel = (datum, stunde, klasseId, fachId) => datum + '|' + stunde + '|' + klasseId + '|' + fachId;

  M.planung = function (datum, stunde, klasseId, fachId) {
    return D.holen('planung', M.planungSchluessel(datum, stunde, klasseId, fachId));
  };

  M.planungOderNeu = function (datum, stunde, klasseId, fachId) {
    return M.planung(datum, stunde, klasseId, fachId) || {
      schluessel: M.planungSchluessel(datum, stunde, klasseId, fachId),
      datum: datum, stunde: Number(stunde), klasseId: klasseId, fachId: fachId,
      thema: '', verlauf: '', material: '', hausaufgabe: '', fertig: false, angelegtAm: H.jetztIso()
    };
  };

  M.planungHatInhalt = function (p) {
    return !!(p && ((p.thema && p.thema.trim()) || (p.verlauf && p.verlauf.trim()) || (p.material && p.material.trim()) || (p.hausaufgabe && p.hausaufgabe.trim()) || p.fertig));
  };

  M.planungSpeichern = function (p) {
    if (!M.planungHatInhalt(p)) {
      if (D.holen('planung', p.schluessel)) D.entfernen('planung', p.schluessel);
      return;
    }
    p.geaendertAm = H.jetztIso();
    D.setzen('planung', p.schluessel, p);
  };

  M.planungFertig = function (datum, stunde, klasseId, fachId) {
    const p = M.planung(datum, stunde, klasseId, fachId);
    return !!(p && p.fertig);
  };

  M.planungen = function (klasseId, fachId) {
    return D.alle('planung')
      .filter(p => (!klasseId || p.klasseId === klasseId) && (!fachId || p.fachId === fachId))
      .sort((a, b) => (a.datum === b.datum ? b.stunde - a.stunde : (a.datum < b.datum ? 1 : -1)));
  };

  /* ---------- Bewertungseinheiten ---------- */

  M.einheitSchluessel = (klasseId, fachId, datum, stunde) => klasseId + '|' + fachId + '|' + datum + '|' + (stunde == null ? M.OHNE_STUNDE : stunde);
  M.einheitSchluesselVon = b => M.einheitSchluessel(b.klasseId, b.fachId, b.datum, b.stunde == null ? M.OHNE_STUNDE : b.stunde);

  M.einheit = function (klasseId, fachId, datum, stunde) {
    return D.holen('bewertung', M.einheitSchluessel(klasseId, fachId, datum, stunde));
  };

  /** Einheit holen oder – noch ungespeichert – neu aufbauen. */
  M.einheitOderNeu = function (klasseId, fachId, datum, stunde, stundeBis) {
    const vorhanden = M.einheit(klasseId, fachId, datum, stunde);
    if (vorhanden) {
      if (stundeBis != null && vorhanden.stundeBis !== stundeBis) vorhanden.stundeBis = stundeBis;
      return vorhanden;
    }
    return {
      klasseId: klasseId, fachId: fachId, datum: datum,
      stunde: stunde == null ? M.OHNE_STUNDE : stunde,
      stundeBis: stundeBis == null ? (stunde == null ? M.OHNE_STUNDE : stunde) : stundeBis,
      kinder: {}, angelegtAm: H.jetztIso()
    };
  };

  M.einheitSpeichern = function (b) {
    b.geaendertAm = H.jetztIso();
    D.setzen('bewertung', M.einheitSchluesselVon(b), b);
  };
  M.bewertungSpeichern = M.einheitSpeichern;

  /** Eintrag eines Kindes in einer Einheit holen oder anlegen (ohne zu speichern). */
  M.kindEintrag = function (b, kindId) {
    if (!b.kinder) b.kinder = {};
    if (!b.kinder[kindId]) b.kinder[kindId] = { noten: {}, fehlt: false, beruehrt: false, notiz: '' };
    const e = b.kinder[kindId];
    if (!e.noten) e.noten = {};
    return e;
  };

  /** Wert eines Kriteriums aus einem Kind-Eintrag: { wert, art } oder null. */
  M.notenWert = function (eintrag, kriteriumId) {
    if (!eintrag || !eintrag.noten) return null;
    const n = eintrag.noten[kriteriumId];
    if (n == null) return null;
    if (typeof n === 'number') return n >= 1 ? { wert: n, art: 'gesetzt' } : null;   // Version 1
    return (n.wert >= 1) ? { wert: n.wert, art: n.art || 'gesetzt' } : null;
  };

  /** Alle (nicht archivierten) Einheiten, wahlweise je Klasse und Fach. */
  M.einheiten = function (klasseId, fachId) {
    return D.alle('bewertung').filter(b => !b.archiviert && (!klasseId || b.klasseId === klasseId) && (!fachId || b.fachId === fachId));
  };
  M.bewertungen = M.einheiten;

  /** Archivierte Einheiten (frühere Kriterien) je Klasse und Fach. */
  M.archivierteEinheiten = function (klasseId, fachId) {
    return D.alle('bewertung').filter(b => b.archiviert && (!klasseId || b.klasseId === klasseId) && (!fachId || b.fachId === fachId));
  };

  /** Einheiten eines Tages für Klasse und Fach, nach Stunde. */
  M.einheitenAmTag = function (klasseId, fachId, datum) {
    return M.einheiten(klasseId, fachId).filter(b => b.datum === datum).sort((a, b) => Number(a.stunde) - Number(b.stunde));
  };

  /** Hat diese Einheit irgendeinen bewusst gesetzten oder übernommenen Inhalt? */
  M.bewertungHatInhalt = function (b) {
    if (!b || !b.kinder) return false;
    return Object.keys(b.kinder).some(function (id) {
      const k = b.kinder[id];
      return k && (k.beruehrt || k.fehlt || (k.noten && Object.keys(k.noten).length > 0) || (k.notiz && k.notiz.trim()));
    });
  };

  /** Text für eine Einheit, etwa „1. Std.“, „1.–2. Std.“, „Tag“ oder „Stunde unbekannt“. */
  M.einheitText = function (b) {
    if (b.stunde === M.UNBEKANNTE_STUNDE) return 'Stunde unbekannt';
    const von = Number(b.stunde), bis = Number(b.stundeBis == null ? b.stunde : b.stundeBis);
    if (!von) return 'Tag';
    return bis > von ? von + '.–' + bis + '. Std.' : von + '. Std.';
  };

  /* ---------- Standardnote (nur Arbeits- und Sozialverhalten) ---------- */

  /**
   * Standardnote für die Stundenkriterien eines Fachs: Zahl 1–6, 'letzte'
   * (letzte Note des Kindes) oder 'keine' (Skala startet leer). Je Fach
   * überschreibbar. Für Kompetenzen gibt es keine Vorbelegung.
   */
  M.standardNote = function (fachId) {
    const e = M.einstellungen();
    const jeFach = e.standardNoteJeFach || {};
    let wert = jeFach[fachId];
    if (wert === undefined || wert === null || wert === '') wert = e.standardNote;
    if (wert === 'letzte' || wert === 'keine') return wert;
    const n = Number(wert);
    return (n >= 1 && n <= 6) ? n : 3;
  };

  /** Letzte gesetzte oder übernommene Note eines Kindes in einem Stundenkriterium vor einer Einheit. */
  M.letzteNote = function (klasseId, fachId, kindId, kriteriumId, vorDatum, vorStunde) {
    const liste = M.einheiten(klasseId, fachId)
      .filter(b => b.datum < vorDatum || (b.datum === vorDatum && vorStunde != null && Number(b.stunde) < Number(vorStunde)))
      .sort((a, b) => (a.datum === b.datum ? Number(b.stunde) - Number(a.stunde) : (a.datum < b.datum ? 1 : -1)));
    for (let i = 0; i < liste.length; i++) {
      const k = liste[i].kinder && liste[i].kinder[kindId];
      if (!k || k.fehlt) continue;
      const n = M.notenWert(k, kriteriumId);
      if (n) return n.wert;
    }
    return null;
  };

  /**
   * Anzeige eines Kriteriums für ein Kind in einer Einheit:
   * { wert, art: 'gesetzt'|'uebernommen'|'vorbelegt'|'offen' }.
   * Vorbelegung nur für Stundenkriterien; Kompetenzen starten leer.
   */
  M.anzeigeNote = function (klasseId, fachId, datum, kindId, kriteriumId, eintrag, stunde, einheit) {
    const vorhanden = M.notenWert(eintrag, kriteriumId);
    if (einheit && M.ausgesetzt(einheit, kriteriumId)) return { wert: vorhanden ? vorhanden.wert : null, art: 'ausgesetzt' };
    if (vorhanden) return vorhanden;
    if (!M.istStundenkriterium(kriteriumId)) return { wert: null, art: 'offen' };
    const standard = M.standardNote(fachId);
    if (typeof standard === 'number') return { wert: standard, art: 'vorbelegt' };
    if (standard === 'letzte') {
      const l = M.letzteNote(klasseId, fachId, kindId, kriteriumId, datum, stunde);
      return { wert: l, art: l ? 'vorbelegt' : 'offen' };
    }
    return { wert: null, art: 'offen' };
  };

  /**
   * Beim Verlassen eines Kindes: noch offene Stundenkriterien mit der geltenden
   * Standardnote festschreiben (art 'uebernommen'). Nicht bei „Fehlt“, nicht bei
   * „keine Vorbelegung“, nie für Kompetenzen. Liefert true, wenn etwas geschrieben wurde.
   */
  M.vorbelegungUebernehmen = function (b, kindId) {
    const eintrag = b.kinder ? b.kinder[kindId] : null;
    if (eintrag && eintrag.fehlt) return false;
    const standard = M.standardNote(b.fachId);
    if (standard === 'keine') return false;
    let geschrieben = false;
    M.stundenkriterien().forEach(function (k) {
      if (M.ausgesetzt(b, k.id)) return;   // für diese Einheit ausgesetzt: keine Übernahme
      const e = M.kindEintrag(b, kindId);
      if (M.notenWert(e, k.id)) return;
      let wert = typeof standard === 'number' ? standard : M.letzteNote(b.klasseId, b.fachId, kindId, k.id, b.datum, b.stunde);
      if (!wert) return;
      e.noten[k.id] = { wert: wert, art: 'uebernommen' };
      geschrieben = true;
    });
    return geschrieben;
  };

  return M;
})();
