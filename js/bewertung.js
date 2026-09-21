/*
 * Notenblock – Bewertungsbildschirm
 *
 * Aufbau (von oben): Kopfzeile mit Klasse (links, antippbar), Datum und
 * Einheit (rechts, antippbar) · Name des Kindes mit Pfeilen und Position ·
 * Fächerleiste der Klasse · Umschaltung Stunde | Kompetenzen · Matrix
 * (Kriterium, Skala 1–6, Beschreibungstext) · Fußleiste mit Fortschritt,
 * „Fehlt“ und „Weiter“.
 *
 * Bewertet wird jede Unterrichtsstunde einzeln: Eine Bewertungseinheit gehört
 * zu Klasse, Fach, Datum und Stundennummer (Doppelstunde = eine Einheit,
 * Schlüssel ist die erste Stunde). Hat die Klasse am Tag mehrere getrennte
 * Einheiten desselben Fachs, erscheint neben dem Datum eine Auswahl.
 *
 * Stunde: die vier Kriterien des Arbeits- und Sozialverhaltens, vorbelegt mit
 * der Standardnote (blass). Beim Verlassen eines Kindes – Weiter, Wischen,
 * Pfeile, Verlassen des Bildschirms – werden noch offene Stundenkriterien mit
 * der Standardnote festgeschrieben (Zustand „uebernommen“, zurückhaltender
 * dargestellt); nicht bei „Fehlt“, nicht bei „keine Vorbelegung“.
 * Kompetenzen: starten immer leer und werden nur gespeichert, wenn die
 * Lehrerin sie ausdrücklich setzt – sie werden nicht in jeder Stunde
 * beobachtet, automatische Werte würden jeden Durchschnitt entwerten.
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
  let z = { klasseId: null, fachId: null, datum: null, datumGewaehltAm: null, stunde: null, stundeBis: null, ansicht: 'stunde', kindIndex: 0 };
  let kinder = [];        // Kinder der aktuellen Klasse in Anzeigereihenfolge
  let el = null;          // DOM-Referenzen des aufgebauten Bildschirms
  let zuletztHeute = null;
  let verdrahtet = false;
  let datumManuell = false; // in dieser Sitzung bewusst über den Kalender gewählt
  let bereitsGeoeffnet = false;

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
   * Wählbare Einheiten des Tages: laut Stundenplan der Klasse plus bereits
   * gespeicherte Einheiten (etwa „Tag“ ohne Stundenplan).
   */
  function einheitenDesTages() {
    const SP = NB.Stundenplan;
    const k = klasse();
    const liste = k ? SP.einheitenAmTag(k, z.datum, z.fachId).map(e => ({ stunde: e.stunde, stundeBis: e.stundeBis })) : [];
    M.einheitenAmTag(z.klasseId, z.fachId, z.datum).forEach(function (b) {
      if (!liste.some(e => Number(e.stunde) === Number(b.stunde))) liste.push({ stunde: Number(b.stunde), stundeBis: Number(b.stundeBis == null ? b.stunde : b.stundeBis) });
    });
    if (!liste.length || !SP.klasseHatPlan(k)) {
      if (!liste.some(e => e.stunde === M.OHNE_STUNDE)) liste.push({ stunde: M.OHNE_STUNDE, stundeBis: M.OHNE_STUNDE });
    }
    liste.sort((a, b) => a.stunde - b.stunde);
    return liste;
  }

  /** Einheit bestimmen: gewünschte, sonst die bisherige, sonst die aktuelle bzw. zuletzt vergangene. */
  function einheitBestimmen(gewuenscht) {
    const SP = NB.Stundenplan;
    const liste = einheitenDesTages();
    let e = null;
    if (gewuenscht != null) e = liste.find(x => x.stunde === Number(gewuenscht)) || null;
    if (!e && z.stunde != null && gewuenscht == null) e = liste.find(x => x.stunde === Number(z.stunde)) || null;
    if (!e) {
      const aktuell = klasse() ? SP.aktuelleEinheit(klasse(), z.datum, z.fachId) : null;
      e = aktuell ? liste.find(x => x.stunde === aktuell.stunde) : null;
    }
    if (!e) e = liste.find(x => x.stunde !== M.OHNE_STUNDE) || liste[0] || { stunde: M.OHNE_STUNDE, stundeBis: M.OHNE_STUNDE };
    z.stunde = e.stunde;
    z.stundeBis = e.stundeBis;
  }

  function einheitTextAktuell() {
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

  /** Klasse ohne Stufe (aus einer früheren Fassung): einmalig nach der Stufe fragen. */
  async function stufeSicherstellen() {
    const k = klasse();
    if (!k || k.stufe) return;
    const stufen = M.stufen();
    const wahl = await NB.Dialog.auswahl({
      titel: 'Stufe der Klasse ' + k.name,
      optionen: M.STUFEN.map(s => ({ text: stufen[s].bezeichnung, wert: s, untertitel: stufen[s].benotet ? 'Mit Noten' : 'Ohne Noten – Stufen beschreiben den Lernstand' }))
    });
    if (!wahl) return;
    k.stufe = wahl;
    M.klasseSpeichern(k);
    NB.App.meldung('Stufe gesetzt: ' + stufen[wahl].bezeichnung + '. Fächer und Stundenplan der Klasse lassen sich unter „Kinder verwalten“ anpassen.');
    if (N.istSichtbar('bewertung')) allesRendern();
  }

  /* ---------- Aufbau ---------- */

  function aufbauen() {
    const wurzel = H.$('#bildschirm-bewertung');
    H.leeren(wurzel);
    el = {};

    el.hinweis = H.el('div', { class: 'bw-hinweis', hidden: true });

    el.kindname = H.el('div', { class: 'bw-kindname' });
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

    el.leer = H.el('div', { class: 'leer', hidden: true });

    H.anhaengen(wurzel, [el.hinweis, el.kindzeile, el.faecher, el.ansicht, el.fehltHinweis, el.fachHinweis, el.matrix, el.notizzeile, el.leer]);

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
    N.kopfAktualisieren();
    hinweisAktualisieren();
    faecherRendern();
    ansichtRendern();
    kindRendern();
    N.fussAktualisieren();
  }

  function faecherRendern() {
    H.leeren(el.faecher);
    M.klassenFaecher(klasse()).forEach(function (fach) {
      const aktiv = fach.id === z.fachId;
      const knopf = H.el('button', {
        type: 'button', class: 'bw-fach', text: fach.name, 'aria-pressed': aktiv ? 'true' : 'false',
        onclick: () => fachSetzen(fach.id)
      });
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
    el.position.textContent = (z.kindIndex + 1) + ' von ' + kinder.length;

    const b = M.einheit(z.klasseId, z.fachId, z.datum, z.stunde);
    const eintrag = b && b.kinder ? b.kinder[kind.id] : null;
    const fehlt = !!(eintrag && eintrag.fehlt);
    el.fehltHinweis.hidden = !fehlt;
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

    const gruppen = z.ansicht === 'kompetenzen' ? M.nachBereich(kriterien) : [{ bereich: null, kriterien: kriterien }];
    gruppen.forEach(function (g) {
      if (g.bereich) el.matrix.appendChild(H.el('h3', { class: 'bw-bereich', text: g.bereich }));
      g.kriterien.forEach(function (krit) {
        const anzeige = M.anzeigeNote(z.klasseId, z.fachId, z.datum, kind.id, krit.id, eintrag, z.stunde);
        el.matrix.appendChild(zeileBauen(krit, anzeige.wert, anzeige.art, fehlt, e));
      });
    });
  }

  /** Beschreibung eines Wertes: Wortform nur bei benoteten Stufen. */
  function wertText(n, art, krit) {
    const woerter = M.notenwoerter();
    if (n == null) return z.ansicht === 'kompetenzen' ? 'Noch nicht bewertet' : 'Noch kein Wert gesetzt';
    const text = (krit.stufen && krit.stufen[n - 1]) || '';
    const vorsatz = (einstellungen().skalenBeschriftung === 'worte' && benotet()) ? woerter[n - 1] + ': ' : '';
    return vorsatz + text;
  }

  /** Eine Kriterienzeile mit Skala. art: 'gesetzt' | 'uebernommen' | 'vorbelegt' | 'offen' */
  function zeileBauen(krit, wert, art, fehlt, e) {
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
      skala.classList.toggle('leer', n == null);
      knopf.style.transform = n == null ? '' : 'translateX(' + ((n - 1) * 100) + '%)';
      stufen.forEach(s => s.classList.toggle('aktiv', Number(s.dataset.wert) === n));
      skala.setAttribute('aria-valuenow', n == null ? '' : String(n));
      skala.setAttribute('aria-valuetext', n == null ? 'kein Wert' : (mitNoten ? n + ' – ' + woerter[n - 1] : 'Stufe ' + n) + (a === 'vorbelegt' ? ' (Vorbelegung)' : a === 'uebernommen' ? ' (übernommen)' : ''));
      text.textContent = wertText(n, a, krit);
    }
    anzeigen(wert, art);

    if (!fehlt) reglerVerdrahten(skala, krit, anzeigen);

    return H.el('div', { class: 'krit' + (fehlt ? ' gesperrt' : ''), dataset: { krit: krit.id } }, [
      H.el('div', { class: 'krit-kopf' }, [
        H.el('div', { class: 'krit-name', text: krit.name }),
        H.el('div', { class: 'krit-schnitt text-klein text-schwach', hidden: true })
      ]),
      skala,
      e.beschreibungenAnzeigen === false ? null : text
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

  /**
   * Beim Verlassen eines Kindes: Notiz sichern und offene Stundenkriterien mit
   * der Standardnote festschreiben (nur Arbeits- und Sozialverhalten).
   */
  function kindVerlassen() {
    const kind = aktuellesKind();
    if (!kind || !z.klasseId || !z.fachId || !z.datum) return;
    notizSpeichern();
    const b = einheitOderNeu();
    if (M.vorbelegungUebernehmen(b, kind.id)) M.einheitSpeichern(b);
  }

  function kindWechseln(richtung) {
    if (!kinder.length) return;
    const neu = H.begrenzen(z.kindIndex + richtung, 0, kinder.length - 1);
    if (neu === z.kindIndex) return;
    kindVerlassen();
    z.kindIndex = neu;
    zustandMerken();
    kindRendern();
  }

  function weiter() {
    if (z.kindIndex < kinder.length - 1) {
      kindWechseln(1);
    } else {
      kindVerlassen();
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
      N.kopfAktualisieren();
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

  function einheitSetzen(stunde) {
    if (Number(stunde) === Number(z.stunde)) return;
    kindVerlassen();
    einheitBestimmen(stunde);
    zustandMerken();
    N.kopfAktualisieren();
    kindRendern();
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

  async function einheitWaehlen() {
    const liste = einheitenDesTages();
    if (liste.length < 2) return;
    const SP = NB.Stundenplan;
    const wahl = await NB.Dialog.auswahl({
      titel: 'Einheit am ' + H.datumKurzOhneJahr(z.datum),
      optionen: liste.map(e => ({
        text: SP.stundenText(e.stunde, e.stundeBis),
        untertitel: e.stunde ? SP.uhrzeitTextBereich(e.stunde, e.stundeBis) : 'Ohne Stundenplan',
        wert: String(e.stunde), aktiv: Number(e.stunde) === Number(z.stunde)
      }))
    });
    if (wahl == null) return;
    einheitSetzen(Number(wahl));
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

  function kopfRechts() {
    const heute = H.heute();
    const datumText = (z.datum === heute ? 'Heute, ' : H.WOCHENTAGE_KURZ[H.wochentag(z.datum) - 1] + ', ') + H.datumKurz(z.datum).slice(0, 6);
    const liste = einheitenDesTages();
    const mehrere = liste.length > 1;
    const einheitText = (z.stunde === M.OHNE_STUNDE && !mehrere) ? '' : einheitTextAktuell();
    return [
      H.el('button', { type: 'button', class: 'kopf-knopf', 'aria-label': 'Datum wählen: ' + H.datumLang(z.datum), onclick: datumWaehlen },
        H.el('span', { class: 'kopf-knopf-text', text: datumText })),
      einheitText ? H.el('button', {
        type: 'button', class: 'kopf-knopf bw-einheit' + (mehrere ? '' : ' passiv'),
        'aria-label': mehrere ? 'Einheit wählen: ' + einheitText : 'Einheit: ' + einheitText,
        onclick: mehrere ? einheitWaehlen : null
      }, [
        H.el('span', { class: 'kopf-knopf-text', text: einheitText }),
        mehrere ? H.el('span', { class: 'kopf-knopf-pfeil', 'aria-hidden': 'true', text: '⌄' }) : null
      ]) : null
    ];
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
