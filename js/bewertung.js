/*
 * Notenblock – Bewertungsbildschirm
 *
 * Aufbau (von oben): Kopfzeile mit Klasse (links, antippbar) und Datum (rechts,
 * antippbar) · Name des Kindes mit Pfeilen und Position · Fächerleiste ·
 * Umschaltung Stunde/Projekt/Alle · Bewertungsmatrix (Kriterium, Skala 1–6,
 * Beschreibungstext) · Fußleiste mit Fortschritt, „Fehlt“ und „Weiter“.
 *
 * Regeln:
 * - Jedes Kind startet mit der Standardnote (Einstellung). Gespeichert wird
 *   nur, was bewusst gesetzt wurde. Unangetastete Standardnoten erscheinen
 *   gedämpft, bewusst gesetzte kräftig.
 * - Die Skala ist Tippfeld und Schieberegler zugleich. Ein Tipp setzt sofort,
 *   ein Ziehen verschiebt den Knopf mitlaufend, der Beschreibungstext folgt.
 *   Vertikales Scrollen bleibt möglich (touch-action: pan-y).
 * - Wischen links/rechts wechselt das Kind, nicht aber auf einer Reglerzeile.
 *   Pfeiltasten wechseln das Kind, Ziffern 1–6 setzen die Note im fokussierten Regler.
 * - Alles speichert sofort. Die Position (Klasse, Fach, Datum, Kind) wird gemerkt.
 */
'use strict';
NB.Bewertung = (function () {
  const Bw = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;
  const N = NB.Navigation;

  const FILTER = [['stunde', 'Stunde'], ['projekt', 'Projekt'], ['alle', 'Alle']];
  const KURZWORTE = ['sehr gut', 'gut', 'befr.', 'ausr.', 'mangelh.', 'ungen.'];

  // Zustand des Bildschirms (wird in 'zustand' gemerkt)
  let z = { klasseId: null, fachId: null, datum: null, datumGewaehltAm: null, filter: 'stunde', kindIndex: 0 };
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
  }

  function zustandMerken() {
    const zs = D.holen('zustand', '') || {};
    const positionen = zs.positionen || {};
    if (z.klasseId) positionen[z.klasseId] = { fachId: z.fachId, kindIndex: z.kindIndex };
    N.zustandMerken({ bewertung: Object.assign({}, z), positionen: positionen });
  }

  function einstellungen() { return M.einstellungen(); }

  /** Gibt es an diesem Datum bereits Einträge für die Klasse (in irgendeinem Fach)? */
  function hatErfasst(datum) {
    return M.bewertungen(z.klasseId).some(b => b.datum === datum && M.bewertungHatInhalt(b));
  }

  /**
   * Automatisches Datum laut Stundenplan: heute, falls heute ein Unterrichtstag
   * der Kombination Klasse/Fach ist, sonst der letzte zurückliegende
   * Unterrichtstag. Ohne Stundenplan immer heute.
   */
  function datumAutomatisch() {
    const heute = H.heute();
    const SP = NB.Stundenplan;
    if (!SP.hatStundenplan() || !z.klasseId || !z.fachId) return heute;
    if (SP.istUnterrichtstag(heute, z.klasseId, z.fachId)) return heute;
    return SP.letzterUnterrichtstag(z.klasseId, z.fachId, H.tageAddieren(heute, -1)) || heute;
  }

  /**
   * Datum neu bestimmen (Start, Klassen- oder Fachwechsel, Tageswechsel).
   * Eine in dieser Sitzung bewusst getroffene Wahl, unter der schon etwas
   * erfasst wurde, bleibt erhalten – dann erscheint nur der Hinweis.
   */
  function datumNeuBestimmen() {
    if (datumManuell && z.datum && hatErfasst(z.datum)) return false;
    const neu = datumAutomatisch();
    const geaendert = neu !== z.datum;
    z.datum = neu;
    datumManuell = false;
    z.datumGewaehltAm = null;
    return geaendert;
  }

  /** Beim Zurückkehren aus dem Hintergrund: hat sich der Kalendertag geändert? */
  function tagPruefen() {
    const heute = H.heute();
    if (zuletztHeute === heute) return;
    zuletztHeute = heute;
    if (datumNeuBestimmen()) {
      zustandMerken();
      if (N.istSichtbar('bewertung')) allesRendern();
    } else if (N.istSichtbar('bewertung')) {
      hinweisAktualisieren();
    }
  }

  function aufHeuteSetzen() {
    z.datum = H.heute();
    datumManuell = true;
    z.datumGewaehltAm = z.datum;
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
    if (!SP.hatStundenplan() || !z.klasseId || !z.fachId || !kinder.length) return;
    const klasse = M.klasse(z.klasseId);
    const fach = M.fach(z.fachId);
    if (!klasse || !fach) return;
    const istUnterrichtstag = SP.istUnterrichtstag(z.datum, z.klasseId, z.fachId);
    let text = null;
    let knopf = false;
    if (!datumManuell && z.datum !== heute) {
      text = 'Heute ist kein Unterrichtstag für ' + fach.name + ' in der ' + klasse.name + ' – gewählt ist die letzte Stunde am ' + H.datumKurzOhneJahr(z.datum);
      knopf = true;
    } else if (!istUnterrichtstag) {
      text = (z.datum === heute ? 'Heute hat die ' : 'Am ' + H.datumKurzOhneJahr(z.datum) + ' hat die ') + klasse.name + ' laut Stundenplan kein ' + fach.name + '. Erfassen ist trotzdem möglich.';
      knopf = z.datum !== heute;
    }
    if (!text) return;
    el.hinweis.appendChild(H.el('span', { text: text }));
    if (knopf) el.hinweis.appendChild(H.el('button', { type: 'button', class: 'textknopf klein', text: 'Auf heute setzen', onclick: aufHeuteSetzen }));
    el.hinweis.hidden = false;
  }

  /* ---------- Öffnen ---------- */

  /**
   * Bewertung öffnen. parameter: { klasseId, fachId, datum } – fehlende Werte
   * kommen aus der gemerkten Position.
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
    } else {
      // Nach einem Neuladen zählt eine heute getroffene Wahl weiter als bewusst gewählt.
      if (z.datum && z.datumGewaehltAm === heute) datumManuell = true;
      if (klasseGewechselt || !z.datum || !bereitsGeoeffnet) datumNeuBestimmen();
    }
    bereitsGeoeffnet = true;
    if (parameter.kindIndex != null) z.kindIndex = parameter.kindIndex;
    zuletztHeute = heute;
    if (N.aktiverBereich() !== 'klassen') N.zeigen('klassen');
    N.bildschirmOeffnen('bewertung');
  };

  function fachPruefen() {
    const faecher = M.faecher();
    if (!faecher.length) { z.fachId = null; return; }
    if (!M.fach(z.fachId)) z.fachId = faecher[0].id;
  }

  /* ---------- Aufbau ---------- */

  function aufbauen() {
    const wurzel = H.$('#bildschirm-bewertung');
    H.leeren(wurzel);
    el = {};

    el.hinweis = H.el('div', { class: 'bw-hinweis', hidden: true });

    el.kindname = H.el('div', { class: 'bw-kindname' });
    el.position = H.el('div', { class: 'bw-position text-schwach' });
    el.kindzeile = H.el('div', { class: 'bw-kind' }, [
      H.el('button', { type: 'button', class: 'symbolknopf bw-pfeil', 'aria-label': 'Vorheriges Kind', onclick: () => kindWechseln(-1) },
        H.el('span', { 'aria-hidden': 'true', text: '‹' })),
      H.el('div', { class: 'bw-name' }, [el.kindname, el.position]),
      H.el('button', { type: 'button', class: 'symbolknopf bw-pfeil', 'aria-label': 'Nächstes Kind', onclick: () => kindWechseln(1) },
        H.el('span', { 'aria-hidden': 'true', text: '›' }))
    ]);

    el.faecher = H.el('div', { class: 'bw-faecher', role: 'group', 'aria-label': 'Fach' });
    el.filter = H.el('div', { class: 'bw-filter', role: 'group', 'aria-label': 'Kriterien' });
    FILTER.forEach(function (f) {
      el.filter.appendChild(H.el('button', {
        type: 'button', dataset: { filter: f[0] }, text: f[1], 'aria-pressed': 'false',
        onclick: () => filterSetzen(f[0])
      }));
    });

    el.fehltHinweis = H.el('div', { class: 'bw-fehlt-hinweis', hidden: true, text: 'Fehlt in dieser Stunde – keine Bewertung. Ein zweiter Tipp auf „Fehlt“ macht das rückgängig.' });
    el.matrix = H.el('div', { class: 'bw-matrix' });

    el.notiz = H.el('input', { type: 'text', class: 'bw-notiz-feld', placeholder: 'Notiz zu diesem Kind für diese Stunde', autocomplete: 'off' });
    el.notiz.addEventListener('input', H.entprellen(notizSpeichern, 400));
    el.notiz.addEventListener('change', notizSpeichern);
    el.notizzeile = H.el('div', { class: 'bw-notiz' }, [
      H.el('label', {}, [H.el('span', { class: 'feld-name text-klein', text: 'Notiz' }), el.notiz])
    ]);

    el.leer = H.el('div', { class: 'leer', hidden: true });

    H.anhaengen(wurzel, [el.hinweis, el.kindzeile, el.faecher, el.filter, el.fehltHinweis, el.matrix, el.notizzeile, el.leer]);

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
    const klasse = M.klasse(z.klasseId);
    kinder = M.kinderSortiert(klasse);
    if (z.kindIndex >= kinder.length) z.kindIndex = Math.max(0, kinder.length - 1);
    fachPruefen();
    N.kopfAktualisieren();
    hinweisAktualisieren();
    faecherRendern();
    filterRendern();
    kindRendern();
    N.fussAktualisieren();
  }

  function faecherRendern() {
    H.leeren(el.faecher);
    M.faecher().forEach(function (fach) {
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

  function filterRendern() {
    H.$$('button', el.filter).forEach(function (k) {
      k.setAttribute('aria-pressed', k.dataset.filter === z.filter ? 'true' : 'false');
    });
  }

  /** Name, Position, Matrix, Notiz und Fußleiste für das aktuelle Kind. */
  function kindRendern() {
    const kind = kinder[z.kindIndex] || null;
    const keineKinder = kinder.length === 0;

    el.kindzeile.hidden = keineKinder;
    el.faecher.hidden = keineKinder;
    el.filter.hidden = keineKinder;
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
      fussAktualisieren();
      return;
    }

    el.kindname.textContent = M.kindName(kind);
    el.position.textContent = (z.kindIndex + 1) + ' von ' + kinder.length;

    const b = M.bewertung(z.klasseId, z.fachId, z.datum);
    const eintrag = b && b.kinder ? b.kinder[kind.id] : null;
    const fehlt = !!(eintrag && eintrag.fehlt);
    el.fehltHinweis.hidden = !fehlt;
    el.notiz.value = eintrag && eintrag.notiz ? eintrag.notiz : '';
    matrixRendern(kind, eintrag, fehlt);
    fussAktualisieren();
  }

  function matrixRendern(kind, eintrag, fehlt) {
    H.leeren(el.matrix);
    const fach = M.fach(z.fachId);
    const e = einstellungen();
    const kriterien = M.kriterien(fach, z.filter);

    if (!fach) {
      el.matrix.appendChild(H.el('p', { class: 'text-schwach', text: 'Es sind keine Fächer angelegt. Fächer und Kriterien lassen sich in den Einstellungen anlegen.' }));
      return;
    }
    if (kriterien.length === 0) {
      const alle = M.kriterien(fach, 'alle').length;
      el.matrix.appendChild(H.el('p', { class: 'text-schwach bw-leer-hinweis', text: alle
        ? 'In diesem Fach gibt es keine Kriterien vom Typ „' + (z.filter === 'stunde' ? 'Stunde' : 'Projekt') + '“. Umschalten auf „Alle“ zeigt alle Kriterien.'
        : 'Dieses Fach hat noch keine Kriterien.' }));
      return;
    }

    kriterien.forEach(function (krit) {
      const anzeige = M.anzeigeNote(z.klasseId, z.fachId, z.datum, kind.id, krit.id, eintrag);
      el.matrix.appendChild(zeileBauen(krit, anzeige.note, anzeige.standard, fehlt, e));
    });
  }

  /** Eine Kriterienzeile mit Skala. */
  function zeileBauen(krit, note, istStandard, fehlt, e) {
    const woerter = M.notenwoerter();
    const skala = H.el('div', {
      class: 'skala', role: 'slider', tabindex: fehlt ? -1 : 0,
      'aria-label': krit.name, 'aria-valuemin': '1', 'aria-valuemax': '6',
      'aria-disabled': fehlt ? 'true' : 'false'
    });
    const stufen = [];
    for (let w = 1; w <= 6; w++) {
      const stufe = H.el('span', { class: 'stufe', dataset: { wert: String(w) } }, [
        H.el('span', { class: 'stufe-zahl', text: String(w) }),
        e.skalenBeschriftung === 'worte' ? H.el('span', { class: 'stufe-wort', text: KURZWORTE[w - 1] }) : null
      ]);
      stufen.push(stufe);
      skala.appendChild(stufe);
    }
    const knopf = H.el('span', { class: 'skala-knopf', 'aria-hidden': 'true' });
    skala.appendChild(knopf);
    const text = H.el('div', { class: 'krit-text' });

    function anzeigen(n, std) {
      skala.dataset.note = n == null ? '' : String(n);
      skala.classList.toggle('standard', !!std);
      skala.classList.toggle('leer', n == null);
      knopf.style.transform = n == null ? '' : 'translateX(' + ((n - 1) * 100) + '%)';
      stufen.forEach(s => s.classList.toggle('aktiv', Number(s.dataset.wert) === n));
      skala.setAttribute('aria-valuenow', n == null ? '' : String(n));
      skala.setAttribute('aria-valuetext', n == null ? 'keine Note' : n + ' – ' + woerter[n - 1] + (std ? ' (Standard)' : ''));
      if (n == null) text.textContent = 'Noch keine Note gesetzt';
      else text.textContent = (e.skalenBeschriftung === 'worte' ? woerter[n - 1] + ': ' : '') + (krit.stufen[n - 1] || '');
    }
    anzeigen(note, istStandard);

    if (!fehlt) reglerVerdrahten(skala, krit, anzeigen);

    return H.el('div', { class: 'krit' + (fehlt ? ' gesperrt' : ''), dataset: { krit: krit.id } }, [
      H.el('div', { class: 'krit-name', text: krit.name }),
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
      const geaendert = noteSetzen(krit.id, n);
      anzeigen(n, false);
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

  /** Note bewusst setzen. Liefert true, wenn sich etwas geändert hat. */
  function noteSetzen(kriteriumId, n) {
    const kind = aktuellesKind();
    if (!kind) return false;
    const b = M.bewertungOderNeu(z.klasseId, z.fachId, z.datum);
    const eintrag = M.kindEintrag(b, kind.id);
    if (eintrag.noten[kriteriumId] === n) return false;
    eintrag.noten[kriteriumId] = n;
    eintrag.beruehrt = true;
    M.bewertungSpeichern(b);
    fussAktualisieren();
    return true;
  }

  function fehltUmschalten() {
    const kind = aktuellesKind();
    if (!kind) return;
    const b = M.bewertungOderNeu(z.klasseId, z.fachId, z.datum);
    const eintrag = M.kindEintrag(b, kind.id);
    eintrag.fehlt = !eintrag.fehlt;
    eintrag.beruehrt = true;
    M.bewertungSpeichern(b);
    kindRendern();
  }

  function notizSpeichern() {
    const kind = aktuellesKind();
    if (!kind) return;
    const wert = el.notiz.value;
    const b = M.bewertungOderNeu(z.klasseId, z.fachId, z.datum);
    const eintrag = M.kindEintrag(b, kind.id);
    if ((eintrag.notiz || '') === wert) return;
    eintrag.notiz = wert;
    if (wert.trim()) eintrag.beruehrt = true;
    M.bewertungSpeichern(b);
  }

  function kindWechseln(richtung) {
    if (!kinder.length) return;
    const neu = H.begrenzen(z.kindIndex + richtung, 0, kinder.length - 1);
    if (neu === z.kindIndex) return;
    notizSpeichern(); // noch nicht gesicherte Notiz des bisherigen Kindes
    z.kindIndex = neu;
    zustandMerken();
    kindRendern();
  }

  function weiter() {
    if (z.kindIndex < kinder.length - 1) {
      kindWechseln(1);
    } else {
      N.bildschirmOeffnen('auswertung', { klasseId: z.klasseId, fachId: z.fachId, datum: z.datum });
    }
  }

  function fachSetzen(fachId) {
    if (fachId === z.fachId) return;
    z.fachId = fachId;
    const datumGeaendert = datumNeuBestimmen();
    zustandMerken();
    if (datumGeaendert) {
      allesRendern();
    } else {
      hinweisAktualisieren();
      faecherRendern();
      kindRendern();
    }
  }

  function filterSetzen(filter) {
    if (filter === z.filter) return;
    z.filter = filter;
    zustandMerken();
    filterRendern();
    kindRendern();
  }

  async function klasseWechseln() {
    const klassen = M.klassen();
    const optionen = klassen.map(k => ({ text: k.name, wert: k.id, aktiv: k.id === z.klasseId, untertitel: (k.kinder || []).length + ' Kinder' }));
    optionen.push({ text: 'Alle Klassen anzeigen', wert: '__liste__', klasse: 'auswahl-sekundaer' });
    const wahl = await NB.Dialog.auswahl({ titel: 'Klasse wechseln', optionen: optionen });
    if (!wahl) return;
    if (wahl === '__liste__') { N.zeigen('klassen'); return; }
    if (wahl === z.klasseId) return;
    Bw.oeffnen({ klasseId: wahl });
  }

  function datumWaehlen() {
    const SP = NB.Stundenplan;
    function erfassteTage(jahr, monat) {
      const praefix = jahr + '-' + ((monat + 1 < 10) ? '0' : '') + (monat + 1) + '-';
      const tage = {};
      M.bewertungen(z.klasseId, z.fachId).forEach(function (b) {
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
        if (!SP.hatStundenplan()) return '';
        const tage = SP.unterrichtstageImMonat(jahr, monat, z.klasseId, z.fachId);
        const erfasst = erfassteTage(jahr, monat);
        const anzahlErfasst = tage.filter(iso => erfasst[iso]).length;
        return (tage.length === 1 ? '1 Unterrichtstag' : tage.length + ' Unterrichtstage') + ', ' + anzahlErfasst + ' erfasst';
      },
      beiAuswahl: function (iso) {
        if (iso === z.datum && datumManuell) return;
        z.datum = iso;
        datumManuell = true;
        z.datumGewaehltAm = H.heute();
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
    const b = M.bewertung(z.klasseId, z.fachId, z.datum);
    let angepasst = 0, fehlend = 0;
    if (b && b.kinder) {
      kinder.forEach(function (k) {
        const e = b.kinder[k.id];
        if (!e) return;
        if (e.fehlt) fehlend++;
        else if (e.noten && Object.keys(e.noten).length) angepasst++;
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
      if (ev.target.closest('.skala, .bw-faecher, input, textarea, select, button, .bw-notiz')) return;
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
    const klasse = M.klasse(z.klasseId);
    return H.el('button', { type: 'button', class: 'kopf-knopf', 'aria-label': 'Klasse wechseln', onclick: klasseWechseln }, [
      H.el('span', { class: 'kopf-knopf-text', text: klasse ? klasse.name : 'Klasse' }),
      H.el('span', { class: 'kopf-knopf-pfeil', 'aria-hidden': 'true', text: '⌄' })
    ]);
  }

  function kopfRechts() {
    const heute = H.heute();
    const text = (z.datum === heute ? 'Heute, ' : H.WOCHENTAGE_KURZ[H.wochentag(z.datum) - 1] + ', ') + H.datumKurz(z.datum).slice(0, 6);
    return H.el('button', { type: 'button', class: 'kopf-knopf', 'aria-label': 'Datum wählen: ' + H.datumLang(z.datum), onclick: datumWaehlen },
      H.el('span', { class: 'kopf-knopf-text', text: text }));
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
        });
      }
      allesRendern();
    },
    kopfLinks: kopfLinks,
    kopfRechts: kopfRechts,
    fuss: () => (el && kinder.length ? el.fuss : null)
  });

  return Bw;
})();
