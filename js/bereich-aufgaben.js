/*
 * Notenblock – Bereich Aufgaben
 *
 * Eingabe über ein einzelnes Feld am oberen Rand: tippen, Enter, fertig.
 * Liste offener Aufgaben nach Fälligkeit, überfällige oben und hervorgehoben,
 * erledigte unten und blass. Fälligkeit und Klasse lassen sich am Eintrag
 * ergänzen. Aufgaben mit Fälligkeit erscheinen zusätzlich in der Tagesansicht
 * des Kalenders unter dem Stundenplan.
 *
 * Daten: 'aufgabe' → { id, text, faellig, klasseId, erledigt, erledigtAm, angelegtAm }
 */
'use strict';
NB.BereichAufgaben = (function () {
  const B = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;
  const N = NB.Navigation;

  /* ---------- Zugriff und Sortierung ---------- */

  function rang(a, heute) {
    if (a.erledigt) return 4;
    if (!a.faellig) return 3;
    if (a.faellig < heute) return 0;
    if (a.faellig === heute) return 1;
    return 2;
  }

  /** Alle Aufgaben in Anzeigereihenfolge. */
  B.aufgaben = function () {
    const heute = H.heute();
    return D.alle('aufgabe').slice().sort(function (a, b) {
      const ra = rang(a, heute), rb = rang(b, heute);
      if (ra !== rb) return ra - rb;
      if (ra === 4) return (a.erledigtAm || '') < (b.erledigtAm || '') ? 1 : -1;
      if (ra === 3) return (a.angelegtAm || '') < (b.angelegtAm || '') ? 1 : -1;
      if (a.faellig !== b.faellig) return a.faellig < b.faellig ? -1 : 1;
      return (a.angelegtAm || '') < (b.angelegtAm || '') ? -1 : 1;
    });
  };

  function speichern(a) {
    D.setzen('aufgabe', a.id, a);
  }

  function anlegen(text) {
    const a = { id: H.neueId(), text: text, faellig: null, klasseId: null, erledigt: false, erledigtAm: null, angelegtAm: H.jetztIso() };
    speichern(a);
    return a;
  }

  function erledigtSetzen(a, wert) {
    a.erledigt = !!wert;
    a.erledigtAm = a.erledigt ? H.jetztIso() : null;
    speichern(a);
  }

  function faelligText(a, heute) {
    if (!a.faellig) return '';
    if (a.faellig === heute) return 'Heute';
    if (a.faellig === H.tageAddieren(heute, 1)) return 'Morgen';
    if (a.faellig < heute) return 'Überfällig seit ' + H.datumKurzOhneJahr(a.faellig);
    return H.datumKurzOhneJahr(a.faellig);
  }

  /* ---------- Liste ---------- */

  function listeRendern() {
    const wurzel = H.$('#bereich-aufgaben');
    H.leeren(wurzel);

    const eingabe = H.el('input', { type: 'text', class: 'aufgabe-eingabe', placeholder: 'Neue Aufgabe – Enter zum Anlegen', 'aria-label': 'Neue Aufgabe', autocomplete: 'off', enterkeyhint: 'done' });
    eingabe.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const text = eingabe.value.trim();
      if (!text) return;
      anlegen(text);
      eingabe.value = '';
      eintraegeRendern();
    });
    wurzel.appendChild(H.el('div', { class: 'aufgabe-kopf' }, eingabe));

    const liste = H.el('div', { class: 'aufgabe-liste' });
    wurzel.appendChild(liste);

    function eintraegeRendern() {
      H.leeren(liste);
      const alle = B.aufgaben();
      if (!alle.length) {
        liste.appendChild(H.el('div', { class: 'leer' }, [
          H.el('p', { class: 'leer-titel', text: 'Keine Aufgaben' }),
          H.el('p', { text: 'Tippe oben eine Aufgabe ein und drücke Enter. Fälligkeit und Klasse lassen sich danach am Eintrag ergänzen.' })
        ]));
        return;
      }
      const heute = H.heute();
      let trennerGesetzt = false;
      alle.forEach(function (a) {
        if (a.erledigt && !trennerGesetzt) {
          trennerGesetzt = true;
          liste.appendChild(H.el('p', { class: 'aufgabe-trenner text-klein text-schwach', text: 'Erledigt' }));
        }
        liste.appendChild(aufgabeZeile(a, heute, eintraegeRendern));
      });
    }
    eintraegeRendern();
  }

  /** Eine Aufgabenzeile mit Haken, Text und Ergänzungen (Fälligkeit, Klasse). */
  function aufgabeZeile(a, heute, neuZeichnen) {
    const ueberfaellig = !a.erledigt && a.faellig && a.faellig < heute;
    const heuteFaellig = !a.erledigt && a.faellig === heute;

    const haken = H.el('input', { type: 'checkbox', class: 'aufgabe-haken', 'aria-label': 'Erledigt: ' + a.text });
    haken.checked = !!a.erledigt;
    haken.addEventListener('change', function () { erledigtSetzen(a, haken.checked); neuZeichnen(); });

    const textKnopf = H.el('button', { type: 'button', class: 'aufgabe-text', text: a.text, title: 'Text ändern', onclick: async function () {
      const neu = await NB.Dialog.eingabe({ titel: 'Aufgabe ändern', label: 'Text', wert: a.text, bestaetigen: 'Übernehmen' });
      if (neu == null) return;
      a.text = neu;
      speichern(a);
      neuZeichnen();
    } });

    const faelligKnopf = H.el('button', {
      type: 'button', class: 'aufgabe-chip' + (a.faellig ? ' gesetzt' : '') + (ueberfaellig ? ' ueberfaellig' : '') + (heuteFaellig ? ' heute' : ''),
      'aria-label': a.faellig ? 'Fälligkeit ändern: ' + H.datumLang(a.faellig) : 'Fälligkeit setzen',
      text: a.faellig ? faelligText(a, heute) : '+ Fälligkeit',
      onclick: function () {
        NB.Kalender.oeffnen({
          datum: a.faellig || heute,
          markierungen: (jahr, monat) => NB.Stundenplan.kalenderMarkierungen(jahr, monat),
          beiAuswahl: function (iso) { a.faellig = iso; speichern(a); neuZeichnen(); }
        });
      }
    });

    const klasse = a.klasseId ? M.klasse(a.klasseId) : null;
    const klasseKnopf = H.el('button', {
      type: 'button', class: 'aufgabe-chip' + (klasse ? ' gesetzt' : ''),
      'aria-label': klasse ? 'Klasse ändern: ' + klasse.name : 'Klasse zuordnen',
      text: klasse ? klasse.name : '+ Klasse',
      onclick: async function () {
        const optionen = M.klassen().map(k => ({ text: k.name, wert: k.id, aktiv: k.id === a.klasseId }));
        optionen.push({ text: 'Keine Klasse', wert: '__keine__', klasse: 'auswahl-sekundaer' });
        const wahl = await NB.Dialog.auswahl({ titel: 'Klasse', optionen: optionen });
        if (!wahl) return;
        a.klasseId = wahl === '__keine__' ? null : wahl;
        speichern(a);
        neuZeichnen();
      }
    });

    const entfernen = a.faellig ? H.el('button', { type: 'button', class: 'aufgabe-chip', 'aria-label': 'Fälligkeit entfernen', text: '×', onclick: function () {
      a.faellig = null; speichern(a); neuZeichnen();
    } }) : null;

    const loeschKnopf = H.el('button', { type: 'button', class: 'symbolknopf klein gefaehrlich', 'aria-label': 'Aufgabe löschen: ' + a.text, onclick: async function () {
      const ok = await NB.Dialog.bestaetigen({ titel: 'Aufgabe löschen?', text: '„' + a.text + '“ wird endgültig gelöscht.', bestaetigen: 'Löschen', gefaehrlich: true });
      if (!ok) return;
      D.entfernen('aufgabe', a.id);
      neuZeichnen();
    } }, H.el('span', { 'aria-hidden': 'true', text: '×' }));

    return H.el('div', { class: 'aufgabe' + (a.erledigt ? ' erledigt' : '') + (ueberfaellig ? ' ueberfaellig' : '') }, [
      H.el('label', { class: 'aufgabe-hakenfeld' }, haken),
      H.el('div', { class: 'aufgabe-inhalt' }, [
        textKnopf,
        H.el('div', { class: 'aufgabe-chips' }, [faelligKnopf, entfernen, klasseKnopf])
      ]),
      loeschKnopf
    ]);
  }

  /* ---------- Tagesansicht des Kalenders ---------- */

  /** Aufgaben eines Tages unter dem Stundenplan; am heutigen Tag auch überfällige. */
  B.tagesAufgabenRendern = function (behaelter, datum) {
    const heute = H.heute();
    const liste = B.aufgaben().filter(a => a.faellig && (a.faellig === datum || (datum === heute && !a.erledigt && a.faellig < heute)));
    H.leeren(behaelter);
    if (!liste.length) return;
    behaelter.appendChild(H.el('h2', { class: 'kal-aufgaben-titel', text: 'Aufgaben' }));
    const box = H.el('div', { class: 'aufgabe-liste' });
    liste.forEach(function (a) {
      box.appendChild(aufgabeZeile(a, heute, function () { B.tagesAufgabenRendern(behaelter, datum); }));
    });
    behaelter.appendChild(box);
  };

  /* ---------- Registrierung ---------- */

  N.bereichRegistrieren('aufgaben', { titel: 'Aufgaben', zeigen: listeRendern });
  if (NB.BereichKalender) NB.BereichKalender.aufgabenRendern = B.tagesAufgabenRendern;

  return B;
})();
