/*
 * Notenblock – Bewertungsbildschirm
 *
 * Aufbau (von oben): Kopfzeile mit Klasse (links, antippbar), Datum
 * (antippbar) und Einheit (antippbar, wenn es etwas zu wählen gibt) · Name des Kindes mit Pfeilen und
 * Position · Fächerleiste der Klasse · Umschaltung Stunde | Kompetenzen ·
 * Matrix (Kriterium, Skala 1–6, Beschreibungstext; Kompetenzen nach
 * Lehrplanbereich gruppiert, Fachhinweis einklappbar) · Fußleiste mit
 * Fortschritt, „Fehlt“ und „Weiter“.
 *
 * Bewertet wird jede Unterrichtsstunde einzeln: Eine Bewertungseinheit gehört
 * zu Klasse, Fach, Datum und Stundennummer (Doppelstunde = eine Einheit,
 * Schlüssel ist die erste Stunde). Die Einheit steht immer in der Kopfzeile:
 * bei mehreren Einheiten des Tages antippbar mit Auswahl, bei „Keine Stunde
 * laut Plan“ antippbar für eine Vertretungsstunde (1 bis 10), sonst als feste
 * Angabe. Der Sprung aus dem Kalender setzt die Einheit direkt; ohne
 * Stundenplan gibt es je Klasse, Fach und Tag eine Einheit („Ganzer Tag“).
 *
 * Klassen der Stufe 1–2 werden nicht benotet: die Skala heißt „Stufe“, ohne
 * Wortform („sehr gut“ …) und ohne Notenvorschlag.
 *
 * Statistik am Kind: unter Name und Position eine ruhige Zeile mit dem
 * bisherigen Stand passend zur Ansicht (Stunde: Arbeits- und Sozialverhalten
 * in diesem Fach, Kompetenzen: Fachleistung, jeweils mit Anzahl der Einheiten
 * und in Stufe 3–4 dem Notenvorschlag), je Kriterium ein blasses „Ø“ rechts.
 * Berechnet nur aus anderen Einheiten der Klasse im Fach, nie aus der
 * laufenden Eingabe – so bewegt sich die Zahl beim Schieben nicht; gebündelt
 * für alle Kinder beim Betreten und beim Wechsel von Fach oder Einheit.
 * Abschaltbar unter Darstellung („Bisherigen Durchschnitt anzeigen“).
 *
 * Stunde: die sechs Kriterien zu Mitarbeit, Arbeits- und Sozialverhalten,
 * vorbelegt mit der Standardnote (blass). Jedes lässt sich für die aktuelle
 * Einheit aussetzen – einmal für die ganze Klasse, eingeklappt und blass,
 * ohne Vorbelegung und Übernahme; die nächste Stunde beginnt wieder vollständig. Beim Verlassen eines Kindes – Weiter, Wischen,
 * Pfeile, Verlassen des Bildschirms – werden noch offene Stundenkriterien mit
 * der Standardnote festgeschrieben (Zustand „uebernommen“, zurückhaltender
 * dargestellt); nicht bei „Fehlt“, nicht bei „keine Vorbelegung“.
 * Kompetenzen: starten immer leer und werden nur gespeichert, wenn die
 * Lehrerin sie ausdrücklich setzt – sie werden nicht in jeder Stunde
 * beobachtet, automatische Werte würden jeden Durchschnitt entwerten.
 *
 * Ein Tipp auf den Namen öffnet das Kinderprofil mit dem Fach, in dem gerade
 * bewertet wird; der Zurück-Pfeil führt an dieselbe Stelle zurück.
 *
 * Unter der Kopfzeile steht die Planung der Einheit: zugeklappt nur das Thema,
 * aufgeklappt Verlauf, Material, Hausaufgabe und „Planung fertig“ – direkt
 * bearbeitbar. Der Zustand wird gemerkt, vorbelegt ist eingeklappt, damit das
 * Bewerten schnell bleibt.
 *
 * Wischen links/rechts wechselt das Kind, nicht aber auf einer Reglerzeile.
 * Pfeiltasten wechseln das Kind, Ziffern 1–6 setzen den Wert im fokussierten Regler.
 * Alles speichert sofort. Die Position (Klasse, Fach, Datum, Einheit, Kind) wird gemerkt.
 */
'use strict';
NB.Bewertung = (function () {
  const Bw = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;
  const N = NB.Navigation;

  const ANSICHTEN = [['stunde', 'Stunde'], ['kompetenzen', 'Kompetenzen']];
  const KURZWORTE = ['sehr gut', 'gut', 'befr.', 'ausr.', 'mangelh.', 'ungen.'];

  // Zustand des Bildschirms (wird in 'zustand' gemerkt)
  let z = { klasseId: null, fachId: null, datum: null, datumGewaehltAm: null, stunde: null, stundeBis: null, stundeManuellFuer: null, ansicht: 'stunde', kindIndex: 0, planungOffen: false };
  let kinder = [];        // Kinder der aktuellen Klasse in Anzeigereihenfolge
  let el = null;          // DOM-Referenzen des aufgebauten Bildschirms
  let zuletztHeute = null;
  let verdrahtet = false;
  let datumManuell = false; // in dieser Sitzung bewusst über den Kalender gewählt
  let bereitsGeoeffnet = false;
  let statistik = {};       // bisheriger Stand je Kind (kindId → { fachleistung, verhalten, kriterien, … })

  /* ---------- Zustand ---------- */

  function zustandLaden() {
    const zs = D.holen('zustand', '') || {};
    if (zs.bewertung) Object.assign(z, zs.bewertung);
    if (z.ansicht !== 'stunde' && z.ansicht !== 'kompetenzen') z.ansicht = 'stunde';
    delete z.filter;
  }

  function zustandMerken() {
    const zs = D.holen('zustand', '') || {};
    const positionen = zs.positionen || {};
    if (z.klasseId) positionen[z.klasseId] = { fachId: z.fachId, kindIndex: z.kindIndex };
    N.zustandMerken({ bewertung: Object.assign({}, z), positionen: positionen });
  }

  function einstellungen() { return M.einstellungen(); }
  function klasse() { return M.klasse(z.klasseId); }
  function benotet() { return M.istBenotet(klasse()); }

  /* ---------- Datum und Einheit ---------- */

  /** Gibt es an diesem Datum bereits Einträge für die Klasse (in irgendeinem Fach)? */
  function hatErfasst(datum) {
    return M.einheiten(z.klasseId).some(b => b.datum === datum && M.bewertungHatInhalt(b));
  }

  /** Automatisches Datum laut Stundenplan der Klasse: heute, sonst der letzte Unterrichtstag. */
  function datumAutomatisch() {
    const heute = H.heute();
    const SP = NB.Stundenplan;
    if (!SP.klasseHatPlan(klasse()) || !z.klasseId || !z.fachId) return heute;
    if (SP.istUnterrichtstag(heute, z.klasseId, z.fachId)) return heute;
    return SP.letzterUnterrichtstag(z.klasseId, z.fachId, H.tageAddieren(heute, -1)) || heute;
  }

  /** Datum neu bestimmen; eine bewusste Wahl mit Einträgen bleibt erhalten. */
  function datumNeuBestimmen() {
    if (datumManuell && z.datum && hatErfasst(z.datum)) return false;
    const neu = datumAutomatisch();
    const geaendert = neu !== z.datum;
    z.datum = neu;
    datumManuell = false;
    z.datumGewaehltAm = null;
    return geaendert;
  }

  /**
   * Wählbare Einheiten des Tages: laut Stundenplan der Klasse, dazu bereits
   * gespeicherte Einheiten und eine von Hand gewählte Vertretungsstunde.
   * Ohne Stundenplan gibt es genau eine Einheit je Tag („Ganzer Tag“).
   * Eine leere Liste heißt: Die Klasse hat an diesem Tag laut Plan keine
   * Stunde in diesem Fach.
   */
  function einheitenDesTages() {
    const SP = NB.Stundenplan;
    const k = klasse();
    const liste = k ? SP.einheitenAmTag(k, z.datum, z.fachId).map(e => ({ stunde: e.stunde, stundeBis: e.stundeBis })) : [];
    M.einheitenAmTag(z.klasseId, z.fachId, z.datum).forEach(function (b) {
      if (!liste.some(e => Number(e.stunde) === Number(b.stunde))) liste.push({ stunde: Number(b.stunde), stundeBis: Number(b.stundeBis == null ? b.stunde : b.stundeBis) });
    });
    // Von Hand gewählte Stunde (Vertretung) – nur für dieses Fach an diesem Tag
    if (z.stundeManuellFuer === z.datum + '|' + z.fachId && z.stunde > 0 && !liste.some(e => Number(e.stunde) === Number(z.stunde))) {
      liste.push({ stunde: Number(z.stunde), stundeBis: Number(z.stundeBis || z.stunde) });
    }
    if (!hatPlan() && !liste.some(e => e.stunde === M.OHNE_STUNDE)) {
      liste.push({ stunde: M.OHNE_STUNDE, stundeBis: M.OHNE_STUNDE });
    }
    liste.sort((a, b) => a.stunde - b.stunde);
    return liste;
  }

  /** Hat die Klasse überhaupt einen Stundenplan mit eigenen Stunden? */
  function hatPlan() {
    return NB.Stundenplan.klasseHatPlan(klasse());
  }

  /**
   * Steht an diesem Tag laut Stundenplan keine Stunde dieses Fachs?
   * Dann lässt sich über die Kopfzeile eine Stundennummer wählen – auch wenn
   * dort schon etwas erfasst wurde (etwa als „Ganzer Tag“).
   */
  function keineStundeLautPlan() {
    const k = klasse();
    return hatPlan() && !!k && NB.Stundenplan.einheitenAmTag(k, z.datum, z.fachId).length === 0;
  }

  /**
   * Einheit bestimmen: gewünschte (auch eine Stunde außerhalb des Plans),
   * sonst die bisherige, sonst die aktuelle bzw. zuletzt vergangene.
   * Ohne Stunde laut Plan bleibt es bei der Tages-Einheit, bis die Lehrerin
   * über die Kopfzeile eine Stundennummer wählt.
   */
  function einheitBestimmen(gewuenscht, manuell) {
    const SP = NB.Stundenplan;
    const liste = einheitenDesTages();
    let e = null;
    if (gewuenscht != null) {
      e = liste.find(x => x.stunde === Number(gewuenscht))
        || { stunde: Number(gewuenscht), stundeBis: Number(gewuenscht) };   // Vertretungs- oder Zusatzstunde
      if (manuell) z.stundeManuellFuer = z.datum + '|' + z.fachId;
    }
    if (!e && z.stunde != null) e = liste.find(x => x.stunde === Number(z.stunde)) || null;
    if (!e) {
      const aktuell = klasse() ? SP.aktuelleEinheit(klasse(), z.datum, z.fachId) : null;
      e = aktuell ? liste.find(x => x.stunde === aktuell.stunde) : null;
    }
    if (!e) e = liste.find(x => x.stunde !== M.OHNE_STUNDE) || liste[0] || { stunde: M.OHNE_STUNDE, stundeBis: M.OHNE_STUNDE };
    z.stunde = e.stunde;
    z.stundeBis = e.stundeBis;
  }

  /**
   * Beschriftung der Einheit: „1.–2. Std.“ · „Ganzer Tag“ (ohne Stundenplan) ·
   * „Keine Stunde laut Plan“. In der schmalen Kopfzeile steht die Kurzform
   * „Keine Stunde“; der ganze Satz steht im Hinweis darunter und im Vorlesetext.
   */
  function einheitTextAktuell(kurz) {
    if (!einheitenDesTages().length) return kurz ? 'Keine Stunde' : 'Keine Stunde laut Plan';
    if (z.stunde === M.OHNE_STUNDE) return 'Ganzer Tag';
    return NB.Stundenplan.stundenText(z.stunde, z.stundeBis);
  }

  /** Beim Zurückkehren aus dem Hintergrund: hat sich der Kalendertag geändert? */
  function tagPruefen() {
    const heute = H.heute();
    if (zuletztHeute === heute) return;
    zuletztHeute = heute;
    if (datumNeuBestimmen()) {
      einheitBestimmen();
      zustandMerken();
      if (N.istSichtbar('bewertung')) allesRendern();
    } else if (N.istSichtbar('bewertung')) {
      hinweisAktualisieren();
    }
  }

  function aufHeuteSetzen() {
    kindVerlassen();
    z.datum = H.heute();
    datumManuell = true;
    z.datumGewaehltAm = z.datum;
    einheitBestimmen();
    zustandMerken();
    allesRendern();
  }

  /** Hinweiszeile unter der Kopfzeile (kein Unterrichtstag, letzte Stunde gewählt). */
  function hinweisAktualisieren() {
    if (!el) return;
    const SP = NB.Stundenplan;
    const heute = H.heute();
    el.hinweis.hidden = true;
    H.leeren(el.hinweis);
    const k = klasse();
    if (!SP.klasseHatPlan(k) || !z.klasseId || !z.fachId || !kinder.length) return;
    const fach = M.fach(z.fachId);
    if (!k || !fach) return;
    const istUnterrichtstag = SP.istUnterrichtstag(z.datum, z.klasseId, z.fachId);
    let text = null;
    let knopf = false;
    if (!datumManuell && z.datum !== heute) {
      text = 'Heute ist kein Unterrichtstag für ' + fach.name + ' in der ' + k.name + ' – gewählt ist die letzte Stunde am ' + H.datumKurzOhneJahr(z.datum);
      knopf = true;
    } else if (!istUnterrichtstag) {
      text = (z.datum === heute ? 'Heute hat die ' : 'Am ' + H.datumKurzOhneJahr(z.datum) + ' hat die ') + k.name + ' laut Stundenplan kein ' + fach.name + '. Erfassen ist trotzdem möglich.';
      knopf = z.datum !== heute;
    }
    if (!text) return;
    el.hinweis.appendChild(H.el('span', { text: text }));
    if (knopf) el.hinweis.appendChild(H.el('button', { type: 'button', class: 'textknopf klein', text: 'Auf heute setzen', onclick: aufHeuteSetzen }));
    el.hinweis.hidden = false;
  }

  /* ---------- Öffnen ---------- */

  /**
   * Bewertung öffnen. parameter: { klasseId, fachId, datum, stunde } – fehlende
   * Werte kommen aus der gemerkten Position.
   */
  Bw.oeffnen = function (parameter) {
    parameter = parameter || {};
    zustandLaden();
    const zs = D.holen('zustand', '') || {};
    const klassen = M.klassen();
    if (klassen.length === 0) return;

    let klasseId = parameter.klasseId || z.klasseId;
    if (!M.klasse(klasseId)) klasseId = klassen[0].id;
    const position = (zs.positionen && zs.positionen[klasseId]) || {};
    const klasseGewechselt = klasseId !== z.klasseId;
    if (klasseGewechselt) {
      z.klasseId = klasseId;
      z.fachId = position.fachId || z.fachId;
      z.kindIndex = position.kindIndex || 0;
    }
    if (parameter.fachId) z.fachId = parameter.fachId;
    fachPruefen();
    const heute = H.heute();
    if (parameter.datum) {
      z.datum = parameter.datum;
      datumManuell = true;
      z.datumGewaehltAm = heute;
      einheitBestimmen(parameter.stunde);
    } else {
      // Nach einem Neuladen zählt eine heute getroffene Wahl weiter als bewusst gewählt.
      if (z.datum && z.datumGewaehltAm === heute) datumManuell = true;
      if (klasseGewechselt || !z.datum || !bereitsGeoeffnet) { datumNeuBestimmen(); einheitBestimmen(); }
      else einheitBestimmen();
    }
    bereitsGeoeffnet = true;
    if (parameter.kindIndex != null) z.kindIndex = parameter.kindIndex;
    zuletztHeute = heute;
    if (N.aktiverBereich() !== 'klassen') N.zeigen('klassen');
    N.bildschirmOeffnen('bewertung');
    stufeSicherstellen();
  };

  /** Fach der Klasse prüfen: fehlt das aktive Fach in der Klasse, gilt das erste Fach der Klasse. */
  function fachPruefen() {
    const faecher = M.klassenFaecher(klasse());
    if (!faecher.length) { z.fachId = null; return; }
    if (!faecher.some(f => f.id === z.fachId)) z.fachId = faecher[0].id;
  }

  /**
   * Klasse ohne Stufe (aus einer früheren Fassung): einmalig nach der Stufe
   * fragen und danach die Fächer der Klasse anbieten.
   */
  async function stufeSicherstellen() {
    const k = klasse();
    if (!k || k.stufe) return;
    if (!(await NB.KlasseVerwalten.stufeWaehlen(k))) return;
    if (N.istSichtbar('bewertung')) allesRendern();
    const faecherWaehlen = await NB.Dialog.bestaetigen({
      titel: 'Fächer der ' + k.name + ' festlegen?',
      text: 'Vorerst gelten alle Fächer der Stufe. Du kannst jetzt auswählen, welche Fächer die Klasse hat, und ihre Reihenfolge festlegen – später jederzeit unter „Klasse verwalten“.',
      abbrechen: 'Später',
      bestaetigen: 'Fächer wählen'
    });
    if (faecherWaehlen) NB.KlasseVerwalten.faecher(k.id);
  }

  /* ---------- Statistik am Kind ---------- */

  /** Bisherigen Stand aller Kinder der Klasse im Fach berechnen – ohne die laufende Einheit. */
  function statistikBerechnen() {
    statistik = {};
    if (einstellungen().durchschnittAnzeigen === false) return;
    const k = klasse();
    const fach = M.fach(z.fachId);
    if (!k || !fach || !z.datum) return;
    const ausser = M.einheitSchluessel(z.klasseId, z.fachId, z.datum, z.stunde);
    kinder.forEach(function (kind) {
      const a = NB.Auswertung.kind(k, fach, kind.id, { ausser: ausser });
      const je = {};
      a.kriterien.forEach(function (zeile) { je[zeile.kriterium.id] = zeile.schnitt; });
      statistik[kind.id] = {
        fachleistung: a.gesamt, fachAnzahl: a.verlauf.length, vorschlag: a.vorschlag,
        verhalten: a.verhalten, verhaltenAnzahl: a.verhaltenAnzahl, kriterien: je, benotet: a.benotet
      };
    });
  }

  /** Zeile unter Name und Position: Stand passend zur Ansicht. */
  function statistikRendern(kind) {
    const st = kind ? statistik[kind.id] : null;
    if (!st || einstellungen().durchschnittAnzeigen === false) { el.statistik.hidden = true; return; }
    const A = NB.Auswertung;
    const fach = M.fach(z.fachId);
    // Geschützte Leerzeichen halten die Teile zusammen; umgebrochen wird nur an den Punkten
    const NBSP = '\u00a0';
    const einheiten = n => (n === 1 ? '1' + NBSP + 'Einheit' : n + NBSP + 'Einheiten');
    let text;
    if (z.ansicht === 'stunde') {
      text = st.verhaltenAnzahl
        ? 'Verhalten bisher Ø' + NBSP + A.zahlText(st.verhalten) + ' · ' + einheiten(st.verhaltenAnzahl)
        : 'Noch keine frühere Einheit in ' + (fach ? fach.name : 'diesem Fach');
    } else {
      text = st.fachAnzahl
        ? 'Fachleistung bisher Ø' + NBSP + A.zahlText(st.fachleistung) + ' · ' + einheiten(st.fachAnzahl) + (st.benotet && st.vorschlag != null ? ' · Vorschlag' + NBSP + A.vorschlagText(st.vorschlag) : '')
        : 'Noch keine früheren Werte zur Fachleistung in ' + (fach ? fach.name : 'diesem Fach');
    }
    el.statistik.textContent = text;
    el.statistik.hidden = false;
  }

  /* ---------- Aufbau ---------- */

  function aufbauen() {
    const wurzel = H.$('#bildschirm-bewertung');
    H.leeren(wurzel);
    el = {};

    el.planung = H.el('details', { class: 'bw-planung', hidden: true });
    el.planung.addEventListener('toggle', function () {
      if (!el.planung.hidden) { z.planungOffen = el.planung.open; zustandMerken(); }
    });
    el.hinweis = H.el('div', { class: 'bw-hinweis', hidden: true });

    el.kindname = H.el('button', {
      type: 'button', class: 'bw-kindname', title: 'Profil des Kindes',
      onclick: function () {
        const kind = aktuellesKind();
        if (!kind) return;
        kindVerlassen();
        NB.Auswertung.kindOeffnen({ klasseId: z.klasseId, kindId: kind.id, fachId: z.fachId });
      }
    });
    el.position = H.el('div', { class: 'bw-position text-schwach' });
    el.statistik = H.el('div', { class: 'bw-statistik text-klein text-schwach', hidden: true });
    el.kindzeile = H.el('div', { class: 'bw-kind' }, [
      H.el('button', { type: 'button', class: 'symbolknopf bw-pfeil', 'aria-label': 'Vorheriges Kind', onclick: () => kindWechseln(-1) },
        H.el('span', { 'aria-hidden': 'true', text: '‹' })),
      H.el('div', { class: 'bw-name' }, [el.kindname, el.position, el.statistik]),
      H.el('button', { type: 'button', class: 'symbolknopf bw-pfeil', 'aria-label': 'Nächstes Kind', onclick: () => kindWechseln(1) },
        H.el('span', { 'aria-hidden': 'true', text: '›' }))
    ]);

    el.faecher = H.el('div', { class: 'bw-faecher', role: 'group', 'aria-label': 'Fach' });
    el.ansicht = H.el('div', { class: 'bw-filter', role: 'group', 'aria-label': 'Kriterien' });
    ANSICHTEN.forEach(function (a) {
      el.ansicht.appendChild(H.el('button', {
        type: 'button', dataset: { ansicht: a[0] }, text: a[1], 'aria-pressed': 'false',
        onclick: () => ansichtSetzen(a[0])
      }));
    });

    el.fehltHinweis = H.el('div', { class: 'bw-fehlt-hinweis', hidden: true, text: 'Fehlt in dieser Stunde – keine Bewertung. Ein zweiter Tipp auf „Fehlt“ macht das rückgängig.' });
    el.fachHinweis = H.el('details', { class: 'bw-fachhinweis', hidden: true });
    el.matrix = H.el('div', { class: 'bw-matrix' });

    el.notiz = H.el('input', { type: 'text', class: 'bw-notiz-feld', placeholder: 'Notiz zu diesem Kind für diese Stunde', autocomplete: 'off' });
    el.notiz.addEventListener('input', H.entprellen(notizSpeichern, 400));
    el.notiz.addEventListener('change', notizSpeichern);
    el.notizzeile = H.el('div', { class: 'bw-notiz' }, [
      H.el('label', {}, [H.el('span', { class: 'feld-name text-klein', text: 'Notiz' }), el.notiz])
    ]);

    el.zuruecknehmen = H.el('div', { class: 'bw-zuruecknehmen', hidden: true }, H.el('button', {
      type: 'button', class: 'textknopf klein', text: 'Bewertung zurücknehmen …', onclick: zuruecknehmen
    }));

    el.leer = H.el('div', { class: 'leer', hidden: true });

    H.anhaengen(wurzel, [el.planung, el.hinweis, el.kindzeile, el.faecher, el.ansicht, el.fehltHinweis, el.fachHinweis, el.matrix, el.zuruecknehmen, el.notizzeile, el.leer]);

    // Fußleiste
    el.balken = H.el('span');
    el.zaehler = H.el('div', { class: 'bw-zaehler text-klein text-schwach' });
    el.fehltKnopf = H.el('button', { type: 'button', class: 'knopf bw-fehlt', text: 'Fehlt', 'aria-pressed': 'false', onclick: fehltUmschalten });
    el.weiterKnopf = H.el('button', { type: 'button', class: 'knopf primaer bw-weiter', text: 'Weiter', onclick: weiter });
    el.fuss = H.el('div', { class: 'bw-fuss' }, [
      H.el('div', { class: 'bw-fortschritt' }, [
        H.el('div', { class: 'bw-balken', role: 'progressbar', 'aria-label': 'Fortschritt in der Klasse' }, el.balken),
        el.zaehler
      ]),
      el.fehltKnopf,
      el.weiterKnopf
    ]);

    wischenVerdrahten(wurzel);
  }

  /* ---------- Rendern ---------- */

  function allesRendern() {
    if (!el) aufbauen();
    const k = klasse();
    kinder = M.kinderSortiert(k);
    if (z.kindIndex >= kinder.length) z.kindIndex = Math.max(0, kinder.length - 1);
    fachPruefen();
    statistikBerechnen();
    N.kopfAktualisieren();
    planungRendern();
    hinweisAktualisieren();
    faecherRendern();
    ansichtRendern();
    kindRendern();
    N.fussAktualisieren();
  }

  /**
   * Einzeilige, einklappbare Planung der Einheit unter der Kopfzeile:
   * zugeklappt das Thema (oder „Thema eintragen“), aufgeklappt Verlauf,
   * Material und Hausaufgabe – direkt bearbeitbar, ohne den Bildschirm zu
   * verlassen. Der Zustand wird gemerkt, vorbelegt ist eingeklappt.
   */
  function planungRendern() {
    if (!el) return;
    H.leeren(el.planung);
    el.planung.hidden = !kinder.length || !z.klasseId || !z.fachId || !z.datum;
    if (el.planung.hidden) return;
    const vorhanden = M.planung(z.datum, z.stunde, z.klasseId, z.fachId);
    const thema = (vorhanden && vorhanden.thema || '').trim();
    el.planung.open = z.planungOffen === true;

    const zusammenfassung = H.el('summary', { class: 'bw-planung-kopf' }, [
      H.el('span', { class: 'bw-planung-marke text-klein text-schwach', text: 'Stunde' }),
      H.el('span', { class: 'bw-planung-thema' + (thema ? '' : ' leer'), text: thema || 'Thema eintragen' })
    ]);
    el.planung.appendChild(zusammenfassung);
    if (!el.planung.open) return;   // Felder erst bauen, wenn aufgeklappt

    const p = M.planungOderNeu(z.datum, z.stunde, z.klasseId, z.fachId);
    const speichern = () => M.planungSpeichern(p);
    const speichernVerzoegert = H.entprellen(speichern, 400);
    function feld(name, label, mehrzeilig, platzhalter) {
      const eingabe = mehrzeilig
        ? H.el('textarea', { rows: 3, placeholder: platzhalter || '', autocomplete: 'off', 'aria-label': label })
        : H.el('input', { type: 'text', placeholder: platzhalter || '', autocomplete: 'off', 'aria-label': label });
      eingabe.value = p[name] || '';
      eingabe.addEventListener('input', function () {
        p[name] = eingabe.value;
        speichernVerzoegert();
        if (name === 'thema') H.$('.bw-planung-thema', el.planung).textContent = eingabe.value.trim() || 'Thema eintragen';
      });
      eingabe.addEventListener('change', function () { p[name] = eingabe.value; speichern(); });
      return H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name text-klein', text: label }), eingabe]);
    }
    const fertig = H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch', 'aria-label': 'Planung fertig' });
    fertig.checked = !!p.fertig;
    fertig.setAttribute('aria-checked', fertig.checked ? 'true' : 'false');
    fertig.addEventListener('change', function () {
      p.fertig = fertig.checked;
      fertig.setAttribute('aria-checked', p.fertig ? 'true' : 'false');
      speichern();
    });
    H.anhaengen(el.planung, [
      H.el('div', { class: 'bw-planung-felder' }, [
        feld('thema', 'Thema der Stunde', false, 'zum Beispiel Wortarten: Nomen erkennen'),
        feld('verlauf', 'Verlauf', true, 'Einstieg, Erarbeitung, Sicherung …'),
        feld('material', 'Material', true, 'Arbeitsblätter, Bücher, Geräte …'),
        feld('hausaufgabe', 'Hausaufgabe', false, '')
      ]),
      H.el('label', { class: 'bw-planung-fertig' }, [
        H.el('span', { class: 'text-klein', text: 'Planung fertig' }),
        fertig
      ])
    ]);
  }

  function faecherRendern() {
    H.leeren(el.faecher);
    M.klassenFaecher(klasse()).forEach(function (fach) {
      const aktiv = fach.id === z.fachId;
      const knopf = H.el('button', {
        type: 'button', class: 'bw-fach', text: fach.name, 'aria-pressed': aktiv ? 'true' : 'false',
        onclick: () => fachSetzen(fach.id)
      });
      knopf.style.setProperty('--fachfarbe', M.fachFarbe(fach));   // aktives Fach in seiner Farbe
      el.faecher.appendChild(knopf);
      if (aktiv) setTimeout(function () {
        try { knopf.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* egal */ }
      }, 0);
    });
  }

  function ansichtRendern() {
    H.$$('button', el.ansicht).forEach(function (k) {
      k.setAttribute('aria-pressed', k.dataset.ansicht === z.ansicht ? 'true' : 'false');
    });
  }

  /** Name, Position, Matrix, Notiz und Fußleiste für das aktuelle Kind. */
  function kindRendern() {
    const kind = kinder[z.kindIndex] || null;
    const keineKinder = kinder.length === 0;

    el.kindzeile.hidden = keineKinder;
    el.faecher.hidden = keineKinder;
    el.ansicht.hidden = keineKinder;
    el.matrix.hidden = keineKinder;
    el.notizzeile.hidden = keineKinder || einstellungen().notizfeldAnzeigen === false;
    el.leer.hidden = !keineKinder;

    if (keineKinder) {
      H.leeren(el.leer);
      H.anhaengen(el.leer, [
        H.el('p', { class: 'leer-titel', text: 'Noch keine Kinder in dieser Klasse' }),
        H.el('p', { text: 'Trage die Kinder ein, dann kannst du hier bewerten.' }),
        H.el('button', { type: 'button', class: 'knopf primaer', text: 'Kinder eintragen', onclick: () => NB.BereichKlassen.kinderVerwalten(z.klasseId) })
      ]);
      el.fehltHinweis.hidden = true;
      el.fachHinweis.hidden = true;
      fussAktualisieren();
      return;
    }

    el.kindname.textContent = M.kindName(kind);
    el.kindname.setAttribute('aria-label', M.kindName(kind) + ' – Profil öffnen');
    // Kind ohne Note: Hinweis unter dem Namen, keine Vorbelegung, keine Übernahme
    el.position.classList.toggle('ohne-note', M.kindOhneNote(kind));
    el.position.textContent = (z.kindIndex + 1) + ' von ' + kinder.length + (M.kindOhneNote(kind) ? ' · wird nicht benotet' : '');
    statistikRendern(kind);

    const b = M.einheit(z.klasseId, z.fachId, z.datum, z.stunde);
    const eintrag = b && b.kinder ? b.kinder[kind.id] : null;
    const fehlt = !!(eintrag && eintrag.fehlt);
    el.fehltHinweis.hidden = !fehlt;
    el.zuruecknehmen.hidden = !b || !M.anzahlKinderInEinheit(b);
    el.notiz.value = eintrag && eintrag.notiz ? eintrag.notiz : '';
    fachHinweisRendern();
    matrixRendern(kind, eintrag, fehlt);
    fussAktualisieren();
  }

  /** Einklappbarer Hinweis des Fachs oben in der Kompetenzansicht. */
  function fachHinweisRendern() {
    const k = klasse();
    const fach = M.fach(z.fachId);
    const text = (z.ansicht === 'kompetenzen' && k && k.stufe) ? M.fachHinweis(fach, k.stufe) : '';
    H.leeren(el.fachHinweis);
    el.fachHinweis.hidden = !text;
    if (!text) return;
    H.anhaengen(el.fachHinweis, [
      H.el('summary', { text: 'Hinweis zu ' + fach.name }),
      H.el('p', { class: 'text-klein', text: text })
    ]);
  }

  function matrixRendern(kind, eintrag, fehlt) {
    H.leeren(el.matrix);
    const fach = M.fach(z.fachId);
    const k = klasse();
    const e = einstellungen();
    // Stufe 1–2: einfarbige Stufenabstufung statt Notenfarben (siehe stil.css .ohne-noten)
    el.matrix.classList.toggle('ohne-noten', !benotet());

    if (!fach) {
      el.matrix.appendChild(H.el('p', { class: 'text-schwach bw-leer-hinweis', text: 'Diese Klasse hat noch kein Fach. Fächer lassen sich in der Klassenverwaltung zuordnen.' }));
      return;
    }

    if (z.ansicht === 'kompetenzen' && (!k || !k.stufe)) {
      el.matrix.appendChild(H.el('div', { class: 'bw-leer-hinweis' }, [
        H.el('p', { class: 'text-schwach', text: 'Für Kompetenzen braucht die Klasse eine Stufe (Klasse 1 und 2 oder Klasse 3 und 4).' }),
        H.el('button', { type: 'button', class: 'knopf', text: 'Stufe wählen', onclick: stufeSicherstellen })
      ]));
      return;
    }

    const kriterien = M.kriterienFuer(k, fach, z.ansicht);
    if (kriterien.length === 0) {
      el.matrix.appendChild(H.el('p', { class: 'text-schwach bw-leer-hinweis', text: z.ansicht === 'stunde'
        ? 'Es sind keine Stundenkriterien vorhanden (Einstellungen → Fächer und Kriterien → Arbeits- und Sozialverhalten).'
        : 'In ' + fach.name + ' gibt es für diese Stufe keine aktiven Kompetenzen.' }));
      return;
    }

    const einheit = M.einheit(z.klasseId, z.fachId, z.datum, z.stunde);
    const st = statistik[kind.id];
    const gruppen = z.ansicht === 'kompetenzen' ? M.nachBereich(kriterien) : [{ bereich: null, kriterien: kriterien }];
    gruppen.forEach(function (g) {
      if (g.bereich) el.matrix.appendChild(H.el('h3', { class: 'bw-bereich', text: g.bereich }));
      g.kriterien.forEach(function (krit) {
        const anzeige = M.anzeigeNote(z.klasseId, z.fachId, z.datum, kind.id, krit.id, eintrag, z.stunde, einheit);
        el.matrix.appendChild(zeileBauen(krit, anzeige.wert, anzeige.art, fehlt, e, {
          aussetzbar: z.ansicht === 'stunde',
          ausgesetzt: anzeige.art === 'ausgesetzt',
          schnitt: (st && e.durchschnittAnzeigen !== false && st.kriterien[krit.id] != null) ? st.kriterien[krit.id] : null
        }));
      });
    });
  }

  /**
   * Bewertung zurücknehmen: entweder nur die Werte des aktuellen Kindes in
   * dieser Einheit oder die ganze Stunde. Andere Stunden bleiben unberührt.
   */
  async function zuruecknehmen() {
    const kind = aktuellesKind();
    const b = M.einheit(z.klasseId, z.fachId, z.datum, z.stunde);
    if (!kind || !b) return;
    const anzahl = M.anzahlKinderInEinheit(b);
    const eintrag = b.kinder ? b.kinder[kind.id] : null;
    const kindHatWerte = !!(eintrag && (eintrag.fehlt || (eintrag.notiz && eintrag.notiz.trim()) || (eintrag.noten && Object.keys(eintrag.noten).length)));
    const einheitText = (z.stunde === M.OHNE_STUNDE ? 'Tag' : NB.Stundenplan.stundenText(z.stunde, z.stundeBis)) + ' am ' + H.datumKurzOhneJahr(z.datum);
    const optionen = [];
    if (kindHatWerte) optionen.push({ text: 'Nur ' + M.kindName(kind), untertitel: 'Werte, „Fehlt“ und Notiz dieses Kindes in dieser Stunde', wert: 'kind' });
    optionen.push({ text: 'Ganze Stunde', untertitel: anzahl === 1 ? '1 Kind mit Einträgen' : anzahl + ' Kinder mit Einträgen', wert: 'einheit', klasse: 'auswahl-sekundaer' });
    const wahl = await NB.Dialog.auswahl({ titel: 'Bewertung zurücknehmen – ' + einheitText, optionen: optionen });
    if (!wahl) return;

    if (wahl === 'kind') {
      const ok = await NB.Dialog.bestaetigen({
        titel: 'Bewertung von ' + M.kindName(kind) + ' zurücknehmen?',
        text: 'Alle Werte, „Fehlt“ und die Notiz dieses Kindes in dieser Stunde werden gelöscht. Andere Kinder und andere Stunden bleiben unberührt.',
        bestaetigen: 'Zurücknehmen',
        gefaehrlich: true
      });
      if (!ok) return;
      M.kindBewertungLoeschen(z.klasseId, z.fachId, z.datum, z.stunde, kind.id);
      NB.App.meldung('Bewertung von ' + M.kindName(kind) + ' zurückgenommen.');
    } else {
      const ok = await NB.Dialog.bestaetigen({
        titel: 'Ganze Stunde löschen?',
        text: 'Die Einträge aller Kinder in dieser Stunde (' + einheitText + ') werden gelöscht – Werte, „Fehlt“ und Notizen zur Stunde. Andere Stunden und die Planung bleiben erhalten.',
        bestaetigen: 'Stunde löschen',
        gefaehrlich: true
      });
      if (!ok) return;
      M.einheitLoeschen(z.klasseId, z.fachId, z.datum, z.stunde);
      NB.App.meldung('Stunde gelöscht.');
    }
    statistikBerechnen();
    kindRendern();
    N.fussAktualisieren();
  }

  /** Stundenkriterium für die aktuelle Einheit aussetzen oder wieder aufnehmen – einmal für die ganze Klasse. */
  function aussetzenUmschalten(kriteriumId) {
    const b = einheitOderNeu();
    const jetztAusgesetzt = M.aussetzenUmschalten(b, kriteriumId);
    M.einheitSpeichern(b);
    kindRendern();
    if (jetztAusgesetzt) NB.App.meldung('Für diese Einheit ausgesetzt – gilt für alle Kinder, die nächste Stunde beginnt wieder mit allen Kriterien.');
  }

  /** Beschreibung eines Wertes: Wortform nur bei benoteten Stufen. */
  function wertText(n, art, krit) {
    const woerter = M.notenwoerter();
    if (n == null) return z.ansicht === 'kompetenzen' ? 'Noch nicht bewertet' : 'Noch kein Wert gesetzt';
    const text = (krit.stufen && krit.stufen[n - 1]) || '';
    const vorsatz = (einstellungen().skalenBeschriftung === 'worte' && benotet()) ? woerter[n - 1] + ': ' : '';
    return vorsatz + text;
  }

  /**
   * Eine Kriterienzeile mit Skala. art: 'gesetzt' | 'uebernommen' | 'vorbelegt' | 'offen' | 'ausgesetzt'.
   * optionen.aussetzbar zeigt den Schalter zum Aussetzen (nur Stundenkriterien),
   * optionen.schnitt den bisherigen Durchschnitt des Kindes (blasses „Ø“ rechts).
   */
  function zeileBauen(krit, wert, art, fehlt, e, optionen) {
    optionen = optionen || {};
    const ausgesetzt = !!optionen.ausgesetzt;
    const woerter = M.notenwoerter();
    const mitNoten = benotet();
    const skala = H.el('div', {
      class: 'skala', role: 'slider', tabindex: fehlt ? -1 : 0,
      'aria-label': krit.name, 'aria-valuemin': '1', 'aria-valuemax': '6',
      'aria-disabled': fehlt ? 'true' : 'false'
    });
    const stufen = [];
    for (let w = 1; w <= 6; w++) {
      const stufe = H.el('span', { class: 'stufe', dataset: { wert: String(w) } }, [
        H.el('span', { class: 'stufe-zahl', text: String(w) }),
        (e.skalenBeschriftung === 'worte' && mitNoten) ? H.el('span', { class: 'stufe-wort', text: KURZWORTE[w - 1] }) : null
      ]);
      stufen.push(stufe);
      skala.appendChild(stufe);
    }
    const knopf = H.el('span', { class: 'skala-knopf', 'aria-hidden': 'true' });
    skala.appendChild(knopf);
    const text = H.el('div', { class: 'krit-text' });

    function anzeigen(n, a) {
      skala.dataset.note = n == null ? '' : String(n);
      skala.classList.toggle('standard', a === 'vorbelegt');
      skala.classList.toggle('uebernommen', a === 'uebernommen');
      skala.classList.toggle('ohne-wert', n == null);
      knopf.style.transform = n == null ? '' : 'translateX(' + ((n - 1) * 100) + '%)';
      stufen.forEach(s => s.classList.toggle('aktiv', Number(s.dataset.wert) === n));
      skala.setAttribute('aria-valuenow', n == null ? '' : String(n));
      skala.setAttribute('aria-valuetext', n == null ? 'kein Wert' : (mitNoten ? n + ' – ' + woerter[n - 1] : 'Stufe ' + n) + (a === 'vorbelegt' ? ' (Vorbelegung)' : a === 'uebernommen' ? ' (übernommen)' : ''));
      text.textContent = wertText(n, a, krit);
    }
    anzeigen(wert, art === 'ausgesetzt' ? 'vorbelegt' : art);
    if (ausgesetzt) {
      skala.setAttribute('aria-disabled', 'true');
      skala.tabIndex = -1;
    }

    if (!fehlt && !ausgesetzt) reglerVerdrahten(skala, krit, anzeigen);

    const schalter = optionen.aussetzbar ? H.el('button', {
      type: 'button', class: 'textknopf klein krit-aussetzen', 'aria-pressed': ausgesetzt ? 'true' : 'false',
      'aria-label': (ausgesetzt ? 'Wieder aufnehmen: ' : 'Für diese Einheit aussetzen: ') + krit.name,
      text: ausgesetzt ? 'Wieder aufnehmen' : 'Aussetzen',
      onclick: () => aussetzenUmschalten(krit.id)
    }) : null;

    return H.el('div', { class: 'krit' + (fehlt ? ' gesperrt' : '') + (ausgesetzt ? ' ausgesetzt' : ''), dataset: { krit: krit.id } }, [
      H.el('div', { class: 'krit-kopf' }, [
        H.el('div', { class: 'krit-name', text: krit.name }),
        H.el('div', { class: 'krit-schnitt text-klein text-schwach', hidden: optionen.schnitt == null, text: optionen.schnitt == null ? '' : 'Ø ' + NB.Auswertung.zahlText(optionen.schnitt), title: 'Bisheriger Durchschnitt' }),
        schalter
      ]),
      ausgesetzt ? H.el('div', { class: 'krit-ausgesetzt text-klein text-schwach', text: 'Für diese Einheit ausgesetzt – keine Vorbelegung, zählt nicht.' + (wert != null ? ' Ein gesetzter Wert (' + wert + ') bleibt gespeichert.' : '') }) : null,
      ausgesetzt ? null : skala,
      (ausgesetzt || e.beschreibungenAnzeigen === false) ? null : text
    ]);
  }

  /** Tippen und Ziehen auf der Skala. */
  function reglerVerdrahten(skala, krit, anzeigen) {
    let zeiger = null;

    function wertAusX(x) {
      const r = skala.getBoundingClientRect();
      if (r.width <= 0) return null;
      return H.begrenzen(Math.floor(((x - r.left) / r.width) * 6) + 1, 1, 6);
    }

    function setzen(n) {
      if (n == null) return;
      const geaendert = wertSetzen(krit.id, n);
      anzeigen(n, 'gesetzt');
      if (geaendert && einstellungen().haptik) H.vibrieren(10);
    }

    skala.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      zeiger = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, gezogen: false };
    });
    skala.addEventListener('pointermove', function (ev) {
      if (!zeiger || ev.pointerId !== zeiger.id) return;
      if (!zeiger.gezogen) {
        const dx = Math.abs(ev.clientX - zeiger.x), dy = Math.abs(ev.clientY - zeiger.y);
        if (dx > 8 && dx > dy) {
          zeiger.gezogen = true;
          skala.classList.add('ziehen');
          try { skala.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
        } else {
          return;
        }
      }
      setzen(wertAusX(ev.clientX));
    });
    skala.addEventListener('pointerup', function (ev) {
      if (!zeiger || ev.pointerId !== zeiger.id) return;
      setzen(wertAusX(ev.clientX));
      zeiger = null;
      skala.classList.remove('ziehen');
    });
    skala.addEventListener('pointercancel', function () {
      zeiger = null;
      skala.classList.remove('ziehen');
    });
    skala.addEventListener('keydown', function (ev) {
      if (ev.key >= '1' && ev.key <= '6' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
        ev.preventDefault();
        setzen(Number(ev.key));
      }
    });
  }

  /* ---------- Änderungen ---------- */

  function aktuellesKind() { return kinder[z.kindIndex] || null; }

  function einheitOderNeu() {
    return M.einheitOderNeu(z.klasseId, z.fachId, z.datum, z.stunde, z.stundeBis);
  }

  /** Wert bewusst setzen (Zustand „gesetzt“). Liefert true, wenn sich etwas geändert hat. */
  function wertSetzen(kriteriumId, n) {
    const kind = aktuellesKind();
    if (!kind) return false;
    const b = einheitOderNeu();
    const eintrag = M.kindEintrag(b, kind.id);
    const bisher = M.notenWert(eintrag, kriteriumId);
    if (bisher && bisher.wert === n && bisher.art === 'gesetzt') return false;
    eintrag.noten[kriteriumId] = { wert: n, art: 'gesetzt' };
    eintrag.beruehrt = true;
    M.einheitSpeichern(b);
    fussAktualisieren();
    return true;
  }

  function fehltUmschalten() {
    const kind = aktuellesKind();
    if (!kind) return;
    const b = einheitOderNeu();
    const eintrag = M.kindEintrag(b, kind.id);
    eintrag.fehlt = !eintrag.fehlt;
    eintrag.beruehrt = true;
    M.einheitSpeichern(b);
    kindRendern();
  }

  function notizSpeichern() {
    const kind = aktuellesKind();
    if (!kind || !el) return;
    const wert = el.notiz.value;
    const vorhanden = M.einheit(z.klasseId, z.fachId, z.datum, z.stunde);
    const bisher = vorhanden && vorhanden.kinder && vorhanden.kinder[kind.id] ? (vorhanden.kinder[kind.id].notiz || '') : '';
    if (bisher === wert) return;
    const b = einheitOderNeu();
    const eintrag = M.kindEintrag(b, kind.id);
    eintrag.notiz = wert;
    if (wert.trim()) eintrag.beruehrt = true;
    M.einheitSpeichern(b);
  }

  /** Hat die Lehrerin bei diesem Kind in der Einheit selbst etwas erfasst? */
  function selbstErfasst(kindId) {
    const b = M.einheit(z.klasseId, z.fachId, z.datum, z.stunde);
    const e = b && b.kinder ? b.kinder[kindId] : null;
    if (!e) return false;
    if (e.fehlt || (e.notiz && e.notiz.trim())) return true;
    return !!(e.noten && Object.keys(e.noten).some(id => e.noten[id] && e.noten[id].art === 'gesetzt'));
  }

  /**
   * Beim Verlassen eines Kindes wird die Notiz gesichert. Nur mit
   * uebernehmen = true werden offene Stundenkriterien mit der Standardnote
   * festgeschrieben – das passiert allein über „Weiter“ (und „Zur
   * Auswertung“). Pfeile, Wischen, Fach-, Einheiten-, Klassen- oder
   * Datumswechsel und das Verlassen des Bildschirms überspringen das Kind,
   * ohne etwas festzuschreiben.
   * Steht an diesem Tag laut Plan keine Stunde des Fachs, entsteht ohnehin
   * nichts, solange die Lehrerin nichts gesetzt und keine Stunde gewählt hat.
   */
  function kindVerlassen(uebernehmen) {
    const kind = aktuellesKind();
    if (!kind || !z.klasseId || !z.fachId || !z.datum) return;
    notizSpeichern();
    if (!uebernehmen) return;
    const nurAngesehen = keineStundeLautPlan()
      && z.stundeManuellFuer !== z.datum + '|' + z.fachId
      && !selbstErfasst(kind.id);
    if (nurAngesehen) return;
    const b = einheitOderNeu();
    if (M.vorbelegungUebernehmen(b, kind.id)) M.einheitSpeichern(b);
  }

  /** Zum nächsten oder vorherigen Kind. uebernehmen nur bei „Weiter“. */
  function kindWechseln(richtung, uebernehmen) {
    if (!kinder.length) return;
    const neu = H.begrenzen(z.kindIndex + richtung, 0, kinder.length - 1);
    if (neu === z.kindIndex) return;
    kindVerlassen(uebernehmen);
    z.kindIndex = neu;
    zustandMerken();
    kindRendern();
  }

  /** „Weiter“: Standardnoten festschreiben – das Kind gilt damit als bewertet. */
  function weiter() {
    if (z.kindIndex < kinder.length - 1) {
      kindWechseln(1, true);
    } else {
      kindVerlassen(true);
      N.bildschirmOeffnen('auswertung', { klasseId: z.klasseId, fachId: z.fachId, datum: z.datum });
    }
  }

  function fachSetzen(fachId) {
    if (fachId === z.fachId) return;
    kindVerlassen();
    z.fachId = fachId;
    const datumGeaendert = datumNeuBestimmen();
    einheitBestimmen();
    zustandMerken();
    if (datumGeaendert) {
      allesRendern();
    } else {
      statistikBerechnen();
      N.kopfAktualisieren();
      planungRendern();
      hinweisAktualisieren();
      faecherRendern();
      kindRendern();
    }
  }

  function ansichtSetzen(ansicht) {
    if (ansicht === z.ansicht) return;
    z.ansicht = ansicht;
    zustandMerken();
    ansichtRendern();
    kindRendern();
  }

  /** Einheit wechseln: Werte des Kindes sichern, Einheit setzen, alles neu laden. */
  function einheitSetzen(stunde, manuell) {
    if (Number(stunde) === Number(z.stunde) && !manuell) return;
    kindVerlassen();
    einheitBestimmen(stunde, manuell);
    zustandMerken();
    statistikBerechnen();
    N.kopfAktualisieren();
    planungRendern();
    kindRendern();
    N.fussAktualisieren();
  }

  async function klasseWechseln() {
    const klassen = M.klassen();
    const optionen = klassen.map(k => ({ text: k.name, wert: k.id, aktiv: k.id === z.klasseId, untertitel: (k.kinder || []).length + ' Kinder' + (k.stufe ? ' · ' + M.stufe(k.stufe).kurz : '') }));
    optionen.push({ text: 'Alle Klassen anzeigen', wert: '__liste__', klasse: 'auswahl-sekundaer' });
    const wahl = await NB.Dialog.auswahl({ titel: 'Klasse wechseln', optionen: optionen });
    if (!wahl) return;
    if (wahl === '__liste__') { N.zeigen('klassen'); return; }
    if (wahl === z.klasseId) return;
    kindVerlassen();
    Bw.oeffnen({ klasseId: wahl });
  }

  function datumWaehlen() {
    const SP = NB.Stundenplan;
    function erfassteTage(jahr, monat) {
      const praefix = jahr + '-' + ((monat + 1 < 10) ? '0' : '') + (monat + 1) + '-';
      const tage = {};
      M.einheiten(z.klasseId, z.fachId).forEach(function (b) {
        if (b.datum.indexOf(praefix) === 0 && M.bewertungHatInhalt(b)) tage[b.datum] = true;
      });
      return tage;
    }
    NB.Kalender.oeffnen({
      datum: z.datum,
      markierungen: function (jahr, monat) {
        const m = SP.kalenderMarkierungen(jahr, monat, z.klasseId, z.fachId);
        Object.keys(erfassteTage(jahr, monat)).forEach(function (iso) {
          if (!m[iso]) m[iso] = {};
          m[iso].punkt = true;
        });
        return m;
      },
      fusszeile: function (jahr, monat) {
        if (!SP.klasseHatPlan(klasse())) return '';
        const tage = SP.unterrichtstageImMonat(jahr, monat, z.klasseId, z.fachId);
        const erfasst = erfassteTage(jahr, monat);
        const anzahlErfasst = tage.filter(iso => erfasst[iso]).length;
        return (tage.length === 1 ? '1 Unterrichtstag' : tage.length + ' Unterrichtstage') + ', ' + anzahlErfasst + ' erfasst';
      },
      beiAuswahl: function (iso) {
        if (iso === z.datum && datumManuell) return;
        kindVerlassen();
        z.datum = iso;
        datumManuell = true;
        z.datumGewaehltAm = H.heute();
        einheitBestimmen();
        zustandMerken();
        allesRendern();
      }
    });
  }

  /* ---------- Fußleiste ---------- */

  function fussAktualisieren() {
    if (!el) return;
    const anzahl = kinder.length;
    const kind = aktuellesKind();
    el.balken.style.width = anzahl ? Math.round(((z.kindIndex + 1) / anzahl) * 100) + '%' : '0%';
    const b = M.einheit(z.klasseId, z.fachId, z.datum, z.stunde);
    let angepasst = 0, fehlend = 0;
    if (b && b.kinder) {
      kinder.forEach(function (k) {
        const e = b.kinder[k.id];
        if (!e) return;
        if (e.fehlt) fehlend++;
        else if (e.noten && Object.keys(e.noten).some(id => e.noten[id] && e.noten[id].art === 'gesetzt')) angepasst++;
      });
    }
    const teile = [anzahl ? (z.kindIndex + 1) + ' von ' + anzahl : 'Keine Kinder'];
    if (angepasst) teile.push(angepasst + ' angepasst');
    if (fehlend) teile.push(fehlend + ' fehlt');
    el.zaehler.textContent = teile.join(' · ');
    const eintrag = b && kind && b.kinder ? b.kinder[kind.id] : null;
    el.fehltKnopf.setAttribute('aria-pressed', eintrag && eintrag.fehlt ? 'true' : 'false');
    el.fehltKnopf.disabled = !kind;
    el.weiterKnopf.disabled = !kind;
    el.weiterKnopf.textContent = (anzahl && z.kindIndex === anzahl - 1) ? 'Zur Auswertung' : 'Weiter';
  }

  /* ---------- Wischen und Tastatur ---------- */

  function wischenVerdrahten(wurzel) {
    let wisch = null;
    wurzel.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.skala, .bw-faecher, input, textarea, select, button, .bw-notiz, details')) return;
      wisch = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    });
    wurzel.addEventListener('pointermove', function (ev) {
      if (!wisch || ev.pointerId !== wisch.id) return;
      const dx = ev.clientX - wisch.x, dy = ev.clientY - wisch.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        wisch = null;
        let richtung = dx < 0 ? 1 : -1;
        if (einstellungen().wischrichtungUmkehren) richtung = -richtung;
        kindWechseln(richtung);
      }
    });
    wurzel.addEventListener('pointerup', () => { wisch = null; });
    wurzel.addEventListener('pointercancel', () => { wisch = null; });
  }

  function tastatur(ev) {
    if (!N.istSichtbar('bewertung') || NB.Dialog.istOffen()) return;
    if (ev.target && ev.target.matches && ev.target.matches('input, textarea, select')) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); kindWechseln(1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); kindWechseln(-1); }
  }

  /* ---------- Kopfzeile ---------- */

  function kopfLinks() {
    const k = klasse();
    return H.el('button', { type: 'button', class: 'kopf-knopf', 'aria-label': 'Klasse wechseln', onclick: klasseWechseln }, [
      H.el('span', { class: 'kopf-knopf-text', text: k ? k.name : 'Klasse' }),
      H.el('span', { class: 'kopf-knopf-pfeil', 'aria-hidden': 'true', text: '⌄' })
    ]);
  }

  /**
   * Rechts in der Kopfzeile: Datum und daneben immer die Einheit – in jedem
   * Fach und an jedem Tag. Bei mehreren getrennten Einheiten und bei „Keine
   * Stunde laut Plan“ ist sie antippbar und öffnet eine Auswahl; eine einzelne
   * Einheit und „Ganzer Tag“ stehen unveränderlich da.
   */
  function kopfRechts() {
    const SP = NB.Stundenplan;
    const heute = H.heute();
    const liste = einheitenDesTages();
    const text = einheitTextAktuell(true);
    // Bei langer Einheitsangabe (etwa „Keine Stunde“) das Datum knapp halten
    const datumText = (text.length > 11 ? '' : (z.datum === heute ? 'Heute, ' : H.WOCHENTAGE_KURZ[H.wochentag(z.datum) - 1] + ', ')) + H.datumKurz(z.datum).slice(0, 6);
    const langText = einheitTextAktuell();
    const waehlbar = liste.length !== 1 || keineStundeLautPlan();
    const uhrzeit = (z.stunde && liste.length) ? SP.uhrzeitTextBereich(z.stunde, z.stundeBis) : '';
    return [
      H.el('button', { type: 'button', class: 'kopf-knopf', 'aria-label': 'Datum wählen: ' + H.datumLang(z.datum), onclick: datumWaehlen },
        H.el('span', { class: 'kopf-knopf-text', text: datumText })),
      waehlbar
        ? H.el('button', {
          type: 'button', class: 'kopf-knopf bw-einheit waehlbar',
          'aria-label': (liste.length ? 'Einheit wählen: ' + langText : 'Stunde wählen – ' + langText) + (uhrzeit ? ', ' + uhrzeit : ''), title: uhrzeit || langText,
          onclick: einheitWaehlen
        }, [
          H.el('span', { class: 'kopf-knopf-text', text: text }),
          H.el('span', { class: 'kopf-knopf-pfeil', 'aria-hidden': 'true', text: '⌄' })
        ])
        : H.el('span', { class: 'bw-einheit', 'aria-label': 'Einheit: ' + langText + (uhrzeit ? ', ' + uhrzeit : ''), title: uhrzeit || langText, text: text })
    ];
  }

  /**
   * Auswahl der Einheit: bei mehreren Einheiten die Einheiten des Tages,
   * ohne Stunde laut Plan die Stundennummern 1 bis 10 (Vertretung, Zusatz).
   */
  async function einheitWaehlen() {
    const SP = NB.Stundenplan;
    const liste = einheitenDesTages();
    if (liste.length && !keineStundeLautPlan()) {
      const wahl = await NB.Dialog.auswahl({
        titel: 'Einheit am ' + H.datumKurzOhneJahr(z.datum),
        optionen: liste.map(e => ({
          text: e.stunde === M.OHNE_STUNDE ? 'Ganzer Tag' : SP.stundenText(e.stunde, e.stundeBis),
          untertitel: e.stunde === M.OHNE_STUNDE ? 'Ohne Stundenplan' : (SP.uhrzeitTextBereich(e.stunde, e.stundeBis) || ''),
          wert: String(e.stunde), aktiv: Number(e.stunde) === Number(z.stunde)
        }))
      });
      if (wahl == null) return;
      einheitSetzen(Number(wahl));
      return;
    }
    // Keine Stunde laut Plan: vorhandene Einheiten zuerst, danach die Stundennummern
    const k = klasse();
    const fach = M.fach(z.fachId);
    const optionen = liste.map(e => ({
      text: e.stunde === M.OHNE_STUNDE ? 'Ganzer Tag' : SP.stundenText(e.stunde, e.stundeBis),
      untertitel: 'bereits erfasst',
      wert: String(e.stunde), aktiv: Number(e.stunde) === Number(z.stunde)
    }));
    for (let stunde = 1; stunde <= 10; stunde++) {
      if (optionen.some(o => Number(o.wert) === stunde)) continue;
      const zeit = SP.uhrzeitText(stunde);
      const andere = k ? SP.klassenStundenAmTag(k, z.datum).find(x => Number(x.stunde) === stunde) : null;
      const belegt = andere ? 'laut Plan ' + (andere.art === 'fremd' ? (andere.bezeichnung || 'fremde Stunde') : ((M.fach(andere.fachId) || {}).name || 'eigene Stunde')) : null;
      optionen.push({
        text: stunde + '. Stunde',
        untertitel: [zeit, belegt].filter(Boolean).join(' · '),
        wert: String(stunde), aktiv: Number(z.stunde) === stunde
      });
    }
    const wahl = await NB.Dialog.auswahl({
      titel: (fach ? fach.name : 'Fach') + ' am ' + H.datumKurzOhneJahr(z.datum) + ' erfassen',
      optionen: optionen
    });
    if (wahl == null) return;
    einheitSetzen(Number(wahl), true);
  }

  /* ---------- Registrierung ---------- */

  N.bildschirmRegistrieren('bewertung', {
    titel: '',
    zurueck: false,
    merken: true,
    wiederherstellen: () => Bw.oeffnen({}),
    zeigen: function () {
      if (!verdrahtet) {
        verdrahtet = true;
        document.addEventListener('keydown', tastatur);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible' && D.istEntsperrt() && z.klasseId) tagPruefen();
          if (document.visibilityState === 'hidden' && D.istEntsperrt() && N.istSichtbar('bewertung')) kindVerlassen();
        });
      }
      allesRendern();
    },
    verbergen: function () {
      if (D.istEntsperrt()) kindVerlassen();
    },
    kopfLinks: kopfLinks,
    kopfRechts: kopfRechts,
    fuss: () => (el && kinder.length ? el.fuss : null)
  });

  return Bw;
})();
