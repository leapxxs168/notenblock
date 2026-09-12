/*
 * Notenblock – Navigation
 *
 * Untere Leiste mit den vier Bereichen Kalender, Klassen, Notizen, Aufgaben.
 * Über einem Bereich können Bildschirme geöffnet werden (etwa die Bewertung
 * oder „Kinder verwalten“); je Bereich gibt es einen Stapel offener
 * Bildschirme. Ein Tipp auf den bereits aktiven Bereich führt zu dessen Anfang.
 *
 * Bereiche:    NB.Navigation.bereichRegistrieren(id, { titel, zeigen, verbergen })
 * Bildschirme: NB.Navigation.bildschirmRegistrieren(id, {
 *                titel (Text oder Funktion), zurueck (false = kein Zurück-Pfeil),
 *                merken (nach Neuladen wiederherstellen), wiederherstellen(),
 *                zeigen(parameter), verbergen(), kopfLinks(), kopfRechts(), fuss()
 *              })
 */
'use strict';
NB.Navigation = (function () {
  const N = {};
  const H = NB.Hilfen;
  const D = NB.Daten;

  const BEREICHE = ['kalender', 'klassen', 'notizen', 'aufgaben'];
  const TITEL = { kalender: 'Kalender', klassen: 'Klassen', notizen: 'Notizen', aufgaben: 'Aufgaben' };
  const bereiche = {};
  const bildschirme = {};
  const stapel = { kalender: [], klassen: [], notizen: [], aufgaben: [] };
  let aktiv = null;

  N.bereichRegistrieren = (id, modul) => { bereiche[id] = modul; };
  N.bildschirmRegistrieren = (id, modul) => { bildschirme[id] = modul; };
  N.aktiverBereich = () => aktiv;

  N.offenerBildschirm = function () {
    const s = aktiv ? stapel[aktiv] : null;
    return s && s.length ? s[s.length - 1].id : null;
  };

  N.istSichtbar = function (bildschirmId) {
    return !H.$('#app').hidden && N.offenerBildschirm() === bildschirmId;
  };

  /* ---------- Darstellung ---------- */

  function zurueckKnopf() {
    return H.el('button', { type: 'button', class: 'symbolknopf', 'aria-label': 'Zurück', onclick: () => N.zurueck() },
      H.el('span', { class: 'pfeil-zurueck', 'aria-hidden': 'true', text: '‹' }));
  }

  function kopfAktualisieren() {
    const links = H.$('#kopf-links'), rechts = H.$('#kopf-rechts'), titel = H.$('#kopf-titel');
    H.leeren(links);
    H.leeren(rechts);
    const oben = N.offenerBildschirm();
    const modul = oben ? bildschirme[oben] : bereiche[aktiv];
    if (oben && modul && modul.zurueck !== false) links.appendChild(zurueckKnopf());
    if (modul && modul.kopfLinks) H.anhaengen(links, modul.kopfLinks());
    let text = modul ? (typeof modul.titel === 'function' ? modul.titel() : modul.titel) : null;
    if (text == null) text = oben ? '' : TITEL[aktiv];
    titel.textContent = text;
    if (modul && modul.kopfRechts) H.anhaengen(rechts, modul.kopfRechts());
  }

  function fussAktualisieren() {
    const fuss = H.$('#fuss');
    H.leeren(fuss);
    const oben = N.offenerBildschirm();
    const modul = oben ? bildschirme[oben] : null;
    const inhalt = modul && modul.fuss ? modul.fuss() : null;
    fuss.hidden = !inhalt;
    if (inhalt) fuss.appendChild(inhalt);
  }

  function sichtbarkeitAnwenden() {
    const oben = N.offenerBildschirm();
    BEREICHE.forEach(function (b) {
      H.$('#bereich-' + b).hidden = !(b === aktiv && !oben);
    });
    H.$$('.bildschirm').forEach(function (el) {
      el.hidden = (el.id !== 'bildschirm-' + oben);
    });
    H.$$('.nav-knopf').forEach(function (knopf) {
      if (knopf.dataset.bereich === aktiv) knopf.setAttribute('aria-current', 'page');
      else knopf.removeAttribute('aria-current');
    });
    kopfAktualisieren();
    fussAktualisieren();
  }

  /** Für Bildschirme, deren Kopfzeile oder Fußleiste sich ändert (z. B. Datum). */
  N.kopfAktualisieren = kopfAktualisieren;
  N.fussAktualisieren = fussAktualisieren;

  /** Ruft zeigen() eines Moduls auf; ein Fehler darin blockiert die Navigation nicht. */
  function sicherZeigen(modul, parameter) {
    if (!modul || !modul.zeigen) return;
    try {
      modul.zeigen(parameter);
    } catch (fehler) {
      console.error('Fehler beim Anzeigen', fehler);
      if (NB.App && NB.App.meldung) NB.App.meldung('Anzeige fehlgeschlagen: ' + (fehler.message || fehler), 'fehler');
    }
  }

  function obenZeigen() {
    const s = stapel[aktiv];
    if (s.length) {
      const e = s[s.length - 1];
      sicherZeigen(bildschirme[e.id], e.parameter);
    } else {
      sicherZeigen(bereiche[aktiv]);
    }
  }

  function zustandMerken(aenderung) {
    if (!D.istEntsperrt()) return;
    const zustand = D.holen('zustand', '') || {};
    Object.assign(zustand, aenderung);
    D.setzen('zustand', '', zustand);
  }
  N.zustandMerken = zustandMerken;

  function navigationMerken() {
    const oben = N.offenerBildschirm();
    zustandMerken({ bereich: aktiv, bildschirm: (oben && bildschirme[oben] && bildschirme[oben].merken) ? oben : null });
  }

  /* ---------- Bereiche ---------- */

  /** Bereich anzeigen. Ein Tipp auf den aktiven Bereich schließt dessen Bildschirme. */
  N.zeigen = function (id) {
    if (BEREICHE.indexOf(id) < 0) id = 'kalender';
    if (aktiv === id) {
      stapel[id].forEach(function (e) {
        const m = bildschirme[e.id];
        if (m && m.verbergen) m.verbergen();
      });
      stapel[id] = [];
    } else {
      if (aktiv) {
        const oben = N.offenerBildschirm();
        if (oben && bildschirme[oben] && bildschirme[oben].verbergen) bildschirme[oben].verbergen();
        else if (bereiche[aktiv] && bereiche[aktiv].verbergen) bereiche[aktiv].verbergen();
      }
      aktiv = id;
    }
    obenZeigen();            // erst Inhalt aufbauen, dann Kopf/Fuß daraus ableiten
    sichtbarkeitAnwenden();
    if (!stapel[id].length) H.$('#inhalt').scrollTop = 0;
    navigationMerken();
  };

  /* ---------- Bildschirme ---------- */

  N.bildschirmOeffnen = function (id, parameter) {
    const modul = bildschirme[id];
    if (!modul || !aktiv) return;
    const s = stapel[aktiv];
    const oben = N.offenerBildschirm();
    if (oben && oben !== id && bildschirme[oben].verbergen) bildschirme[oben].verbergen();
    else if (!oben && bereiche[aktiv] && bereiche[aktiv].verbergen) bereiche[aktiv].verbergen();
    const i = s.findIndex(e => e.id === id);
    if (i >= 0) s.splice(i);
    s.push({ id: id, parameter: parameter });
    sicherZeigen(modul, parameter);
    sichtbarkeitAnwenden();
    H.$('#inhalt').scrollTop = 0;
    navigationMerken();
  };

  N.zurueck = function () {
    const s = stapel[aktiv];
    if (!s.length) return;
    const e = s.pop();
    const m = bildschirme[e.id];
    if (m && m.verbergen) m.verbergen();
    obenZeigen();
    sichtbarkeitAnwenden();
    H.$('#inhalt').scrollTop = 0;
    navigationMerken();
  };

  /* ---------- Start und Fortsetzen ---------- */

  /** Beim Start der Seite: Kalender – oder der gemerkte Bildschirm (z. B. die Bewertung). */
  N.start = function () {
    aktiv = null;
    BEREICHE.forEach(b => { stapel[b] = []; });
    NB.Sperre.bildschirmZeigen('app');
    const zustand = D.holen('zustand', '') || {};
    const merk = zustand.bildschirm && bildschirme[zustand.bildschirm];
    if (merk && merk.wiederherstellen && BEREICHE.indexOf(zustand.bereich) >= 0) {
      N.zeigen(zustand.bereich);
      merk.wiederherstellen();
    } else {
      N.zeigen('kalender');
    }
  };

  /** Nach „Alle Daten löschen“: Navigation vergessen, der nächste Start beginnt beim Kalender. */
  N.zuruecksetzen = function () {
    aktiv = null;
    BEREICHE.forEach(b => { stapel[b] = []; });
  };

  /** Nach dem Entsperren in derselben Sitzung: an derselben Stelle weitermachen. */
  N.fortsetzen = function () {
    if (!aktiv) { N.start(); return; }
    NB.Sperre.bildschirmZeigen('app');
    obenZeigen();
    sichtbarkeitAnwenden();
  };

  N.verdrahten = function () {
    H.$$('.nav-knopf').forEach(function (knopf) {
      knopf.addEventListener('click', () => N.zeigen(knopf.dataset.bereich));
    });
  };

  return N;
})();
