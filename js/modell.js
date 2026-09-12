/*
 * Notenblock – Fachliches Modell
 *
 * Gemeinsame Zugriffe auf Fächer, Klassen, Kinder und Bewertungen, damit
 * Bewertungsbildschirm, Auswertung und Kalender dieselben Regeln verwenden.
 *
 * Eine Bewertung ist ein datierter Eintrag je Klasse, Fach und Datum:
 *   { klasseId, fachId, datum, kinder: { kindId: { noten, fehlt, beruehrt, notiz } } }
 * `noten` enthält nur bewusst gesetzte Werte (kriteriumId → 1–6). Die
 * Standardnote wird nicht gespeichert – sie entsteht erst bei Anzeige und
 * Auswertung. `beruehrt` kennzeichnet ein bewusst bearbeitetes Kind.
 */
'use strict';
NB.Modell = (function () {
  const M = {};
  const H = NB.Hilfen;
  const D = NB.Daten;

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

  /* ---------- Fächer und Kriterien ---------- */

  M.faecher = () => D.holen('faecher', '') || [];

  M.fach = function (fachId) {
    return M.faecher().find(f => f.id === fachId) || null;
  };

  /**
   * Kriterien eines Fachs für die Anzeige. filter: 'stunde', 'projekt' oder
   * 'alle'. Kriterien mit Gewicht 0 sind ausgeblendet, ihre Daten bleiben.
   */
  M.kriterien = function (fach, filter) {
    if (!fach || !Array.isArray(fach.kriterien)) return [];
    return fach.kriterien.filter(function (k) {
      const gewicht = (typeof k.gewicht === 'number') ? k.gewicht : 1;
      if (gewicht <= 0) return false;
      return !filter || filter === 'alle' || k.typ === filter;
    });
  };

  /* ---------- Klassen und Kinder ---------- */

  M.klassen = function () {
    return D.alle('klasse').slice().sort((a, b) => H.vergleichText(a.name, b.name));
  };

  M.klasse = klasseId => (klasseId ? D.holen('klasse', klasseId) : null);

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

  /** Kind aus der Klasse, aus allen Bewertungen der Klasse und aus den Notizen entfernen. */
  M.kindEntfernen = function (klasse, kindId) {
    klasse.kinder = (klasse.kinder || []).filter(k => k.id !== kindId);
    D.setzen('klasse', klasse.id, klasse);
    M.bewertungen(klasse.id).forEach(function (b) {
      if (b.kinder && b.kinder[kindId]) {
        delete b.kinder[kindId];
        M.bewertungSpeichern(b);
      }
    });
    D.alle('notiz').filter(n => n.kindId === kindId).forEach(n => D.entfernen('notiz', n.id));
  };

  /** Zusatz- und Ausfalltermine entfernen, auf die ein Prüfkriterium zutrifft. */
  function schuljahrBereinigen(trifftZu) {
    const sj = D.holen('schuljahr', '');
    if (!sj) return;
    let geaendert = false;
    ['zusatz', 'ausnahmen'].forEach(function (name) {
      if (!Array.isArray(sj[name])) return;
      const rest = sj[name].filter(e => !trifftZu(e));
      if (rest.length !== sj[name].length) { sj[name] = rest; geaendert = true; }
    });
    if (geaendert) D.setzen('schuljahr', '', sj);
  }

  /** Klasse samt Bewertungen, Stundenplaneinträgen, Notizen und Aufgaben löschen. */
  M.klasseLoeschen = function (klasseId) {
    D.alle('bewertung').filter(b => b.klasseId === klasseId)
      .forEach(b => D.entfernen('bewertung', M.bewertungSchluessel(b.klasseId, b.fachId, b.datum)));
    D.alle('planung').filter(p => p.klasseId === klasseId)
      .forEach(p => D.entfernen('planung', p.schluessel));
    D.alle('notiz').filter(n => n.klasseId === klasseId).forEach(n => D.entfernen('notiz', n.id));
    D.alle('aufgabe').filter(a => a.klasseId === klasseId).forEach(a => D.entfernen('aufgabe', a.id));
    const plan = D.holen('stundenplan', '');
    if (Array.isArray(plan) && plan.some(e => e.klasseId === klasseId)) {
      D.setzen('stundenplan', '', plan.filter(e => e.klasseId !== klasseId));
    }
    schuljahrBereinigen(e => e.klasseId === klasseId);
    const zustand = D.holen('zustand', '');
    if (zustand && zustand.positionen && zustand.positionen[klasseId]) {
      delete zustand.positionen[klasseId];
      D.setzen('zustand', '', zustand);
    }
    D.entfernen('klasse', klasseId);
  };

  /** Anzahl der Bewertungen, die eine Klasse betreffen. */
  M.anzahlBewertungen = function (klasseId, fachId) {
    return D.alle('bewertung').filter(b => (!klasseId || b.klasseId === klasseId) && (!fachId || b.fachId === fachId)).length;
  };

  /** Fach samt Bewertungen und Stundenplaneinträgen löschen. */
  M.fachLoeschen = function (fachId) {
    D.alle('bewertung').filter(b => b.fachId === fachId)
      .forEach(b => D.entfernen('bewertung', M.bewertungSchluessel(b.klasseId, b.fachId, b.datum)));
    D.alle('planung').filter(p => p.fachId === fachId).forEach(p => D.entfernen('planung', p.schluessel));
    const plan = D.holen('stundenplan', '');
    if (Array.isArray(plan) && plan.some(e => e.fachId === fachId)) {
      D.setzen('stundenplan', '', plan.filter(e => e.fachId !== fachId));
    }
    schuljahrBereinigen(e => e.fachId === fachId);
    const e = M.einstellungen();
    if (e.standardNoteJeFach && e.standardNoteJeFach[fachId] !== undefined) {
      delete e.standardNoteJeFach[fachId];
      D.setzen('einstellungen', '', e);
    }
    D.setzen('faecher', '', M.faecher().filter(f => f.id !== fachId));
  };

  /** Kriterium aus dem Fach und aus allen Bewertungen des Fachs entfernen. */
  M.kriteriumLoeschen = function (fachId, kriteriumId) {
    const faecher = M.faecher();
    const fach = faecher.find(f => f.id === fachId);
    if (!fach) return;
    fach.kriterien = (fach.kriterien || []).filter(k => k.id !== kriteriumId);
    D.setzen('faecher', '', faecher);
    M.bewertungen(null, fachId).forEach(function (b) {
      let geaendert = false;
      Object.keys(b.kinder || {}).forEach(function (kindId) {
        const e = b.kinder[kindId];
        if (e && e.noten && e.noten[kriteriumId] !== undefined) { delete e.noten[kriteriumId]; geaendert = true; }
      });
      if (geaendert) M.bewertungSpeichern(b);
    });
  };

  M.faecherSpeichern = liste => D.setzen('faecher', '', liste);

  /* ---------- Stundenplanungen ---------- */

  M.planungSchluessel = (datum, stunde, klasseId, fachId) => datum + '|' + stunde + '|' + klasseId + '|' + fachId;

  M.planung = function (datum, stunde, klasseId, fachId) {
    return D.holen('planung', M.planungSchluessel(datum, stunde, klasseId, fachId));
  };

  /** Planung holen oder – noch ungespeichert – neu aufbauen. */
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

  /** Speichert; eine vollständig leere Planung wird entfernt. */
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

  /** Alle Planungen einer Klasse und eines Fachs, neueste zuerst. */
  M.planungen = function (klasseId, fachId) {
    return D.alle('planung')
      .filter(p => (!klasseId || p.klasseId === klasseId) && (!fachId || p.fachId === fachId))
      .sort((a, b) => (a.datum === b.datum ? b.stunde - a.stunde : (a.datum < b.datum ? 1 : -1)));
  };

  /* ---------- Bewertungen ---------- */

  M.bewertungSchluessel = (klasseId, fachId, datum) => klasseId + '|' + fachId + '|' + datum;

  M.bewertung = function (klasseId, fachId, datum) {
    return D.holen('bewertung', M.bewertungSchluessel(klasseId, fachId, datum));
  };

  /** Bewertung holen oder – noch ungespeichert – neu aufbauen. */
  M.bewertungOderNeu = function (klasseId, fachId, datum) {
    return M.bewertung(klasseId, fachId, datum) || {
      klasseId: klasseId, fachId: fachId, datum: datum, kinder: {}, angelegtAm: H.jetztIso()
    };
  };

  M.bewertungSpeichern = function (b) {
    b.geaendertAm = H.jetztIso();
    D.setzen('bewertung', M.bewertungSchluessel(b.klasseId, b.fachId, b.datum), b);
  };

  /** Eintrag eines Kindes in einer Bewertung holen oder anlegen (ohne zu speichern). */
  M.kindEintrag = function (b, kindId) {
    if (!b.kinder) b.kinder = {};
    if (!b.kinder[kindId]) b.kinder[kindId] = { noten: {}, fehlt: false, beruehrt: false, notiz: '' };
    const e = b.kinder[kindId];
    if (!e.noten) e.noten = {};
    return e;
  };

  /** Alle Bewertungen einer Klasse, wahlweise eines Fachs. */
  M.bewertungen = function (klasseId, fachId) {
    return D.alle('bewertung').filter(b => (!klasseId || b.klasseId === klasseId) && (!fachId || b.fachId === fachId));
  };

  /** Hat diese Bewertung irgendeinen bewusst gesetzten Inhalt? */
  M.bewertungHatInhalt = function (b) {
    if (!b || !b.kinder) return false;
    return Object.keys(b.kinder).some(function (id) {
      const k = b.kinder[id];
      return k && (k.beruehrt || k.fehlt || (k.noten && Object.keys(k.noten).length > 0) || (k.notiz && k.notiz.trim()));
    });
  };

  /**
   * Standardnote für ein Fach: Zahl 1–6, 'letzte' (letzte Note des Kindes)
   * oder 'keine' (Skala startet leer). Je Fach überschreibbar.
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

  /** Letzte bewusst gesetzte Note eines Kindes in einem Kriterium vor einem Datum. */
  M.letzteNote = function (klasseId, fachId, kindId, kriteriumId, vorDatum) {
    const liste = M.bewertungen(klasseId, fachId)
      .filter(b => b.datum < vorDatum)
      .sort((a, b) => (a.datum < b.datum ? 1 : -1));
    for (let i = 0; i < liste.length; i++) {
      const k = liste[i].kinder && liste[i].kinder[kindId];
      if (k && !k.fehlt && k.noten && k.noten[kriteriumId] >= 1) return k.noten[kriteriumId];
    }
    return null;
  };

  /**
   * Anzeige-Note eines Kindes für ein Kriterium: bewusst gesetzt oder
   * Standard. Liefert { note: 1–6 oder null, standard: true/false }.
   */
  M.anzeigeNote = function (klasseId, fachId, datum, kindId, kriteriumId, eintrag) {
    const explizit = eintrag && eintrag.noten && eintrag.noten[kriteriumId] >= 1 ? eintrag.noten[kriteriumId] : null;
    if (explizit) return { note: explizit, standard: false };
    const standard = M.standardNote(fachId);
    if (typeof standard === 'number') return { note: standard, standard: true };
    if (standard === 'letzte') {
      const l = M.letzteNote(klasseId, fachId, kindId, kriteriumId, datum);
      return { note: l, standard: true };
    }
    return { note: null, standard: true };
  };

  return M;
})();
