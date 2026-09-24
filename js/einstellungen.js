/*
 * Notenblock – Einstellungen
 *
 * Erreichbar über das Zahnrad in der Kopfzeile. Ein Einstiegsbildschirm
 * listet die Abschnitte; jeder Abschnitt ist ein eigener Bildschirm:
 *   Bewertung · Fächer und Kriterien · Darstellung · Datenschutz · Daten
 * (Stundenplan folgt in Schritt 4, Sicherung/CSV in Schritt 7.)
 * Jede Einstellung wirkt sofort, ohne Speichern-Knopf.
 */
'use strict';
NB.Einstellungen = (function () {
  const E = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;
  const N = NB.Navigation;

  const ABSCHNITTE = [
    { id: 'bewertung', titel: 'Bewertung', text: 'Standardnote, Skala, Rundung' },
    { id: 'stundenplan', titel: 'Stundenplan', text: 'Uhrzeiten, Schuljahr, A-Woche, Ferien, Feiertage' },
    { id: 'faecher', titel: 'Fächer und Kriterien', text: 'Anlegen, umbenennen, sortieren, Gewichte' },
    { id: 'darstellung', titel: 'Darstellung', text: 'Beschreibungen, Notizfeld, Schriftgröße, Wischen' },
    { id: 'datenschutz', titel: 'Datenschutz', text: 'Kürzel, automatische Sperre, Passphrase' },
    { id: 'daten', titel: 'Daten', text: 'Sicherung, Löschen' }
  ];

  const NOTEN_OPTIONEN = function () {
    const w = M.notenwoerter();
    return [1, 2, 3, 4, 5, 6].map(n => ({ wert: String(n), text: n + ' – ' + w[n - 1] }));
  };

  let aktuellerAbschnitt = null;
  let aktuellesFach = null;
  let aktuellesKriterium = null;
  let aktuelleFassung = null;   // { kriteriumId, fachId } im Fassungs-Bildschirm

  /* ---------- Bausteine ---------- */

  function zeile(label, beschreibung, steuerung, optionen) {
    optionen = optionen || {};
    const text = H.el('div', { class: 'einst-text' }, [
      H.el(optionen.alsLabel ? 'span' : 'div', { class: 'einst-label', text: label }),
      beschreibung ? H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: beschreibung }) : null
    ]);
    return H.el(optionen.alsLabel ? 'label' : 'div', { class: 'einst-zeile' + (optionen.klasse ? ' ' + optionen.klasse : '') }, [
      text, steuerung ? H.el('div', { class: 'einst-steuerung' }, steuerung) : null
    ]);
  }

  function gruppe(titel, kinder) {
    return H.el('section', { class: 'einst-gruppe' }, [
      titel ? H.el('h2', { class: 'einst-gruppe-titel', text: titel }) : null,
      H.el('div', { class: 'einst-karte' }, kinder)
    ]);
  }

  /** Ein-/Aus-Schalter. beiAenderung(wert, element) darf die Speicherung selbst übernehmen. */
  function schalter(name, label, beschreibung, beiAenderung) {
    const e = M.einstellungen();
    const feld = H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch' });
    feld.checked = !!e[name];
    feld.setAttribute('aria-checked', feld.checked ? 'true' : 'false');
    feld.addEventListener('change', function () {
      feld.setAttribute('aria-checked', feld.checked ? 'true' : 'false');
      if (beiAenderung) beiAenderung(feld.checked, feld);
      else einstellungSetzen(name, feld.checked);
    });
    return zeile(label, beschreibung, feld, { alsLabel: true });
  }

  /** Auswahlliste (select). optionen: [{ wert, text }]; wandeln() macht aus dem String den Speicherwert. */
  function auswahl(name, label, beschreibung, optionen, wandeln, aktuell) {
    const e = M.einstellungen();
    const feld = H.el('select', { 'aria-label': label });
    optionen.forEach(o => feld.appendChild(H.el('option', { value: o.wert, text: o.text })));
    const wert = aktuell !== undefined ? aktuell : e[name];
    feld.value = wert == null ? '' : String(wert);
    feld.addEventListener('change', function () {
      einstellungSetzen(name, wandeln ? wandeln(feld.value) : feld.value);
    });
    return zeile(label, beschreibung, feld, { alsLabel: true, klasse: 'einst-zeile-auswahl' });
  }

  /** Segmentierte Auswahl aus wenigen Knöpfen. */
  function segment(name, label, beschreibung, optionen, beiAenderung) {
    const e = M.einstellungen();
    const box = H.el('div', { class: 'segment', role: 'group', 'aria-label': label });
    function markieren(wert) {
      H.$$('button', box).forEach(k => k.setAttribute('aria-pressed', k.dataset.wert === String(wert) ? 'true' : 'false'));
    }
    optionen.forEach(function (o) {
      box.appendChild(H.el('button', {
        type: 'button', dataset: { wert: String(o.wert) }, text: o.text, 'aria-pressed': 'false',
        onclick: function () {
          markieren(o.wert);
          if (beiAenderung) beiAenderung(o.wert);
          else einstellungSetzen(name, o.wert);
        }
      }));
    });
    markieren(e[name]);
    return zeile(label, beschreibung, box, { klasse: 'einst-zeile-segment' });
  }

  function knopfzeile(knoepfe) {
    return H.el('div', { class: 'einst-zeile einst-zeile-knoepfe' }, H.el('div', { class: 'knopfzeile' }, knoepfe));
  }

  function einstellungSetzen(name, wert) {
    M.einstellungSetzen(name, wert);
    NB.App.darstellungAnwenden();
  }

  /* ---------- Einstieg ---------- */

  function wurzelRendern() {
    const wurzel = H.$('#bildschirm-einstellungen');
    H.leeren(wurzel);
    const liste = H.el('div', { class: 'einst-abschnitte' });
    ABSCHNITTE.forEach(function (a) {
      liste.appendChild(H.el('button', {
        type: 'button', class: 'einst-abschnitt',
        onclick: () => N.bildschirmOeffnen('einstellungen-abschnitt', { abschnitt: a.id })
      }, [
        H.el('span', { class: 'einst-abschnitt-text' }, [
          H.el('span', { class: 'einst-abschnitt-titel', text: a.titel }),
          H.el('span', { class: 'text-klein text-schwach', text: a.text })
        ]),
        H.el('span', { class: 'einst-pfeil', 'aria-hidden': 'true', text: '›' })
      ]));
    });
    wurzel.appendChild(H.el('div', { class: 'karte-inhalt' }, [
      liste,
      H.el('p', { class: 'text-klein text-schwach', text: 'Jede Einstellung wirkt sofort. Alle Daten liegen ausschließlich auf diesem Gerät.' }),
      H.el('p', { class: 'text-klein text-schwach', text: 'Notenblock, Fassung ' + NB.App.VERSION + ' · Speicher: ' + (NB.Speicher.backend === 'indexeddb' ? 'IndexedDB' : 'localStorage (Ausweich)') + ' · Adresse: ' + location.origin })
    ]));
  }

  function abschnittRendern(parameter) {
    aktuellerAbschnitt = ABSCHNITTE.find(a => a.id === (parameter && parameter.abschnitt)) || ABSCHNITTE[0];
    const wurzel = H.$('#bildschirm-einstellungen-abschnitt');
    H.leeren(wurzel);
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    wurzel.appendChild(inhalt);
    switch (aktuellerAbschnitt.id) {
      case 'bewertung': bewertungRendern(inhalt); break;
      case 'stundenplan': NB.EinstellungenStundenplan.rendern(inhalt); break;
      case 'faecher': faecherRendern(inhalt); break;
      case 'darstellung': darstellungRendern(inhalt); break;
      case 'datenschutz': datenschutzRendern(inhalt); break;
      case 'daten': datenRendern(inhalt); break;
      default: break;
    }
  }

  /* ---------- Bewertung ---------- */

  function standardNoteWandeln(wert) {
    if (wert === 'letzte' || wert === 'keine') return wert;
    return Number(wert);
  }

  function bewertungRendern(inhalt) {
    const optionen = NOTEN_OPTIONEN().concat([
      { wert: 'letzte', text: 'Letzte Note des Kindes' },
      { wert: 'keine', text: 'Keine Vorbelegung (Skala startet leer)' }
    ]);

    inhalt.appendChild(gruppe('Standardnote für Arbeits- und Sozialverhalten', [
      auswahl('standardNote', 'Standardnote beim Öffnen einer Stunde',
        'Gilt nur für die vier Stundenkriterien: Jedes Kind startet damit vorbelegt, angetippt wird nur, was abweicht. Beim Verlassen des Kindes wird die Vorbelegung festgeschrieben. Kompetenzen starten immer leer.',
        optionen, standardNoteWandeln)
    ]));

    // Je Fach überschreibbar
    const jeFach = [];
    const e = M.einstellungen();
    M.faecher().forEach(function (fach) {
      const feld = H.el('select', { 'aria-label': 'Standardnote für ' + fach.name });
      feld.appendChild(H.el('option', { value: '', text: 'Wie allgemein' }));
      optionen.forEach(o => feld.appendChild(H.el('option', { value: o.wert, text: o.text })));
      const wert = (e.standardNoteJeFach || {})[fach.id];
      feld.value = wert == null ? '' : String(wert);
      feld.addEventListener('change', function () {
        const aktuell = M.einstellungen();
        const je = aktuell.standardNoteJeFach || {};
        if (feld.value === '') delete je[fach.id];
        else je[fach.id] = standardNoteWandeln(feld.value);
        einstellungSetzen('standardNoteJeFach', je);
      });
      jeFach.push(zeile(fach.name, null, feld, { alsLabel: true, klasse: 'einst-zeile-kompakt' }));
    });
    if (jeFach.length) inhalt.appendChild(gruppe('Standardnote je Fach', jeFach));

    inhalt.appendChild(gruppe('Skala und Notenvorschlag', [
      segment('skalenBeschriftung', 'Skalenbeschriftung', 'Ziffern 1–6 oder zusätzlich die Wortform (sehr gut bis ungenügend).',
        [{ wert: 'ziffern', text: 'Ziffern' }, { wert: 'worte', text: 'Wortform' }]),
      auswahl('rundung', 'Rundung des Notenvorschlags', 'Wie aus dem gewichteten Gesamtwert die vorgeschlagene Note entsteht.',
        [
          { wert: 'kaufmaennisch', text: 'Kaufmännisch (2,5 → 3)' },
          { wert: 'zugunsten', text: 'Zugunsten des Kindes (2,5 → 2)' },
          { wert: 'nachkomma', text: 'Eine Nachkommastelle (2,5)' }
        ])
    ]));

    const fachnoteNamen = M.fachnoteKriterien().map(k => k.name).join(', ');
    inhalt.appendChild(gruppe('Auswertung', [
      schalter('uebernommeneZaehlen', 'Übernommene Standardnoten mitzählen',
        'An: Beim Verlassen eines Kindes festgeschriebene Standardnoten des Arbeits- und Sozialverhaltens zählen in der Auswertung mit. Aus: Nur selbst angetippte Werte zählen.'),
      schalter('alleStundenkriterienZaehlen', 'Alle Stundenleistungen in die Note',
        'Aus: In die Fachnote fließen die Kompetenzen' + (fachnoteNamen ? ' und ' + fachnoteNamen : '') + ' ein. An: Auch die übrigen Stundenkriterien zählen mit ihrem Gewicht zur Note. Das Arbeits- und Sozialverhalten wird weiterhin getrennt ausgewiesen.')
    ]));
  }

  /* ---------- Fächer und Kriterien ---------- */

  const ASV_ID = '__asv__';
  let gewaehlteStufe = '3-4';

  function pfeilKnopf(text, richtung, aktiv, beiKlick) {
    return H.el('button', {
      type: 'button', class: 'symbolknopf klein', 'aria-label': text, disabled: !aktiv, onclick: beiKlick
    }, H.el('span', { 'aria-hidden': 'true', text: richtung < 0 ? '↑' : '↓' }));
  }

  function loeschKnopf(text, beiKlick) {
    return H.el('button', { type: 'button', class: 'symbolknopf klein gefaehrlich', 'aria-label': text, onclick: beiKlick },
      H.el('span', { 'aria-hidden': 'true', text: '×' }));
  }

  function verschieben(liste, index, richtung) {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= liste.length) return false;
    const t = liste[index];
    liste[index] = liste[ziel];
    liste[ziel] = t;
    return true;
  }

  /** Abschnitt: Arbeits- und Sozialverhalten, Stufenwahl, Fächer der Stufe. */
  function faecherRendern(inhalt) {
    const asv = M.arbeitsverhalten();
    inhalt.appendChild(gruppe('Stundenkriterien', [
      H.el('div', { class: 'einst-eintrag' }, [
        H.el('button', { type: 'button', class: 'einst-eintrag-text', onclick: () => N.bildschirmOeffnen('einstellungen-fach', { fachId: ASV_ID }) }, [
          H.el('span', { class: 'einst-eintrag-titel', text: asv.name || 'Arbeits- und Sozialverhalten' }),
          H.el('span', { class: 'text-klein text-schwach', text: (asv.kriterien || []).length + ' Kriterien · in jeder Stunde, jedem Fach und jeder Stufe' + (M.fachnoteKriterien().length ? ' · ' + M.fachnoteKriterien().map(k => k.name).join(', ') + ' zählt zur Fachleistung' : '') })
        ]),
        H.el('span', { class: 'einst-pfeil', 'aria-hidden': 'true', text: '›' })
      ])
    ], asv.hinweis || ''));

    inhalt.appendChild(gruppe('Stufe', [
      zeile('Kompetenzen der Stufe', 'Fächer und Kompetenzen unterscheiden sich zwischen Schuleingangsphase und Klasse 3 und 4.',
        (function () {
          const box = H.el('div', { class: 'segment', role: 'group', 'aria-label': 'Stufe' });
          M.STUFEN.forEach(function (st) {
            box.appendChild(H.el('button', { type: 'button', text: M.stufe(st).kurz, 'aria-pressed': gewaehlteStufe === st ? 'true' : 'false', onclick: function () {
              gewaehlteStufe = st;
              abschnittRendern({ abschnitt: 'faecher' });
            } }));
          });
          return box;
        })(), { klasse: 'einst-zeile-segment' })
    ]));

    const faecher = M.faecherKatalog();
    const liste = H.el('div', { class: 'einst-liste' });
    const inStufe = faecher.filter(f => M.fachInStufe(f, gewaehlteStufe));
    if (!inStufe.length) liste.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: 'Kein Fach in dieser Stufe.' }));
    inStufe.forEach(function (fach) {
      const i = faecher.indexOf(fach);
      const anzahl = M.kompetenzenAlle(fach, gewaehlteStufe).length;
      const ruht = fach.aktiv === false;
      const farbPunkt = H.el('span', { class: 'fach-punkt', 'aria-hidden': 'true' });
      farbPunkt.style.background = M.fachFarbe(fach);
      liste.appendChild(H.el('div', { class: 'einst-eintrag' + (ruht ? ' ausgeblendet' : '') }, [
        H.el('button', {
          type: 'button', class: 'einst-eintrag-text mit-punkt',
          onclick: () => N.bildschirmOeffnen('einstellungen-fach', { fachId: fach.id, stufe: gewaehlteStufe })
        }, [
          H.el('span', { class: 'einst-eintrag-titel' }, [farbPunkt, fach.name + (ruht ? ' (stillgelegt)' : '')]),
          H.el('span', { class: 'text-klein text-schwach', text: (anzahl === 1 ? '1 Kompetenz' : anzahl + ' Kompetenzen') + (fach.eigen ? ' · selbst angelegt' : '') })
        ]),
        pfeilKnopf(fach.name + ' nach oben', -1, i > 0, function () {
          if (verschieben(faecher, i, -1)) { M.faecherSpeichern(faecher); abschnittRendern({ abschnitt: 'faecher' }); }
        }),
        pfeilKnopf(fach.name + ' nach unten', 1, i < faecher.length - 1, function () {
          if (verschieben(faecher, i, 1)) { M.faecherSpeichern(faecher); abschnittRendern({ abschnitt: 'faecher' }); }
        }),
        loeschKnopf(fach.name + ' löschen', () => fachLoeschen(fach))
      ]));
    });
    const nichtVerfuegbar = faecher.filter(f => !M.fachInStufe(f, gewaehlteStufe) && M.fachNichtVerfuegbar(f, gewaehlteStufe));
    inhalt.appendChild(gruppe('Fächer ' + M.stufe(gewaehlteStufe).kurz, [liste],
      nichtVerfuegbar.length ? nichtVerfuegbar.map(f => f.name + ': ' + M.fachNichtVerfuegbar(f, gewaehlteStufe)).join(' ') : null));
    inhalt.appendChild(H.el('div', { class: 'knopfzeile' }, H.el('button', {
      type: 'button', class: 'knopf primaer', text: 'Fach anlegen', onclick: fachAnlegen
    })));
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Ein Tipp auf ein Fach öffnet seine Kompetenzen nach Lehrplanbereich. Die Reihenfolge hier ist die Vorgabe für neue Klassen; jede Klasse hat ihre eigene Fächerauswahl.' }));
  }

  async function fachAnlegen() {
    const name = await NB.Dialog.eingabe({ titel: 'Neues Fach', label: 'Name des Fachs', platzhalter: 'zum Beispiel Werken', bestaetigen: 'Weiter' });
    if (!name) return;
    const wahl = await NB.Dialog.auswahl({
      titel: 'Für welche Stufe?',
      optionen: [
        { text: 'Beide Stufen', wert: 'beide' },
        { text: M.stufe('1-2').kurz, wert: '1-2' },
        { text: M.stufe('3-4').kurz, wert: '3-4' }
      ]
    });
    if (!wahl) return;
    const faecher = M.faecherKatalog();
    const fach = { id: 'fach-' + H.neueId(), name: name, aktiv: true, eigen: true, farbe: M.freieFarbe(faecher.map(f => f.farbe).filter(Boolean)), stufen: wahl === 'beide' ? M.STUFEN.slice() : [wahl], hinweise: {}, nichtVerfuegbar: {}, kompetenzen: [] };
    faecher.push(fach);
    M.faecherSpeichern(faecher);
    N.bildschirmOeffnen('einstellungen-fach', { fachId: fach.id, stufe: wahl === 'beide' ? gewaehlteStufe : wahl });
  }

  async function fachLoeschen(fach) {
    const anzahl = M.anzahlEinheiten(null, fach.id);
    const ok = await NB.Dialog.bestaetigen({
      titel: '„' + fach.name + '“ endgültig löschen?',
      text: (anzahl ? anzahl + (anzahl === 1 ? ' bewertete Einheit' : ' bewertete Einheiten') + ' in diesem Fach werden ebenfalls gelöscht. ' : 'In diesem Fach wurden noch keine Einheiten bewertet. ')
        + 'Auch Planungen, Stundenplaneinträge und Klassenzuordnungen des Fachs werden entfernt. Soll das Fach nur ruhen, nutze stattdessen den Schalter „Aktiv“ im Fach – dann bleibt alles erhalten.',
      bestaetigen: 'Endgültig löschen',
      gefaehrlich: true
    });
    if (!ok) return;
    M.fachLoeschen(fach.id);
    abschnittRendern({ abschnitt: 'faecher' });
  }

  /** Fach stilllegen oder wieder aktivieren, mit Rückfrage, was ruht. */
  async function fachAktivSetzen(fach, aktiv, feld) {
    if (aktiv) {
      fach.aktiv = true;
      M.faecherSpeichern(M.faecherKatalog());
      NB.App.meldung('„' + fach.name + '“ ist wieder aktiv.');
      return;
    }
    const klassen = M.klassen().filter(k => Array.isArray(k.faecher) && k.faecher.some(z => z.fachId === fach.id));
    const stunden = M.klassen().reduce((s, k) => s + (k.stundenplan || []).filter(e => e.fachId === fach.id).length, 0);
    const einheiten = M.anzahlEinheiten(null, fach.id);
    const ok = await NB.Dialog.bestaetigen({
      titel: '„' + fach.name + '“ stilllegen?',
      text: 'Das Fach erscheint dann nirgends in der Erfassung: nicht in der Fächerleiste, nicht im Stundenplan, nicht im Kalender, nicht beim Anlegen einer Klasse. Es ruhen: ' + einheiten + (einheiten === 1 ? ' bewertete Einheit, ' : ' bewertete Einheiten, ') + stunden + (stunden === 1 ? ' Stundenplaneintrag, ' : ' Stundenplaneinträge, ') + klassen.length + (klassen.length === 1 ? ' Klassenzuordnung' : ' Klassenzuordnungen') + '. Alles bleibt erhalten und in der Auswertung über „auch stillgelegte Fächer zeigen“ erreichbar.',
      bestaetigen: 'Stilllegen'
    });
    if (!ok) { feld.checked = true; feld.setAttribute('aria-checked', 'true'); return; }
    fach.aktiv = false;
    M.faecherSpeichern(M.faecherKatalog());
    NB.App.meldung('„' + fach.name + '“ ruht.');
  }

  /** Bildschirm eines Fachs (oder des Arbeits- und Sozialverhaltens): Name, Aktiv, Kriterien nach Bereich. */
  function fachRendern(parameter) {
    const wurzel = H.$('#bildschirm-einstellungen-fach');
    H.leeren(wurzel);
    const istAsv = parameter && parameter.fachId === ASV_ID;
    const faecher = M.faecherKatalog();
    const fach = istAsv ? M.arbeitsverhalten() : faecher.find(f => f.id === (parameter && parameter.fachId));
    const stufe = istAsv ? null : ((parameter && parameter.stufe) || gewaehlteStufe);
    aktuellesFach = fach ? { name: fach.name } : null;
    if (!fach) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Dieses Fach gibt es nicht mehr.' })));
      return;
    }
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    const speichern = () => (istAsv ? M.arbeitsverhaltenSpeichern(fach) : M.faecherSpeichern(faecher));

    const nameFeld = H.el('input', { type: 'text', value: fach.name, autocomplete: 'off', 'aria-label': 'Name' });
    nameFeld.addEventListener('input', H.entprellen(function () {
      const wert = nameFeld.value.trim();
      if (!wert) return;
      fach.name = wert;
      aktuellesFach.name = wert;
      speichern();
      N.kopfAktualisieren();
    }, 400));
    const kopfZeilen = [zeile('Name', null, nameFeld, { alsLabel: true, klasse: 'einst-zeile-feld' })];
    if (!istAsv) {
      const aktivFeld = H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch' });
      aktivFeld.checked = fach.aktiv !== false;
      aktivFeld.setAttribute('aria-checked', aktivFeld.checked ? 'true' : 'false');
      aktivFeld.addEventListener('change', function () { aktivFeld.setAttribute('aria-checked', aktivFeld.checked ? 'true' : 'false'); fachAktivSetzen(fach, aktivFeld.checked, aktivFeld); });
      kopfZeilen.push(zeile('Aktiv', 'Aus: Das Fach ruht – es erscheint nicht mehr in der Erfassung, alle Daten bleiben.', aktivFeld, { alsLabel: true }));
      if (fach.eigen) {
        // Selbst angelegte Fächer: einer oder beiden Stufen zugeordnet, später änderbar
        const stufenBox = H.el('div', { class: 'segment', role: 'group', 'aria-label': 'Stufen' });
        const aktuelleWahl = () => (Array.isArray(fach.stufen) && fach.stufen.length === 1 ? fach.stufen[0] : 'beide');
        [['1-2', M.stufe('1-2').kurz], ['3-4', M.stufe('3-4').kurz], ['beide', 'Beide']].forEach(function (o) {
          stufenBox.appendChild(H.el('button', { type: 'button', dataset: { wert: o[0] }, text: o[1], 'aria-pressed': aktuelleWahl() === o[0] ? 'true' : 'false', onclick: function () {
            fach.stufen = o[0] === 'beide' ? M.STUFEN.slice() : [o[0]];
            speichern();
            H.$$('button', stufenBox).forEach(k => k.setAttribute('aria-pressed', k.dataset.wert === o[0] ? 'true' : 'false'));
            NB.App.meldung(o[0] === 'beide' ? 'Fach gilt für beide Stufen.' : 'Fach gilt für ' + M.stufe(o[0]).kurz + ' – in der anderen Stufe wird es nicht mehr angeboten, Daten bleiben.');
          } }));
        });
        kopfZeilen.push(zeile('Stufen', 'In welchen Stufen das Fach angeboten wird. Kompetenzen gehören jeweils zu einer Stufe.', stufenBox, { klasse: 'einst-zeile-segment' }));
      }
      kopfZeilen.push(zeile('Farbe', 'Zur Unterscheidung in der Fächerleiste und in der Auswertung – nie für Noten.',
        NB.KlasseVerwalten.farbwahl(fach.farbe, function (farbId) { fach.farbe = farbId; speichern(); }, 'Farbe des Fachs'), { klasse: 'einst-zeile-feld' }));
      if (M.fachHinweis(fach, stufe)) kopfZeilen.push(zeile('Hinweis aus dem Lehrplan', M.fachHinweis(fach, stufe), null));
      M.fachnoteKriterien().forEach(function (mk) {
        const gewichtFeld = H.el('select', { 'aria-label': 'Gewicht von ' + mk.name + ' in ' + fach.name });
        [0, 0.5, 1, 1.5, 2, 2.5, 3].forEach(g => gewichtFeld.appendChild(H.el('option', { value: String(g), text: String(g).replace('.', ',') + (g === 0 ? ' – zählt nicht' : g === 1 ? ' – wie eine Kompetenz' : '') })));
        gewichtFeld.value = String(M.mitarbeitGewicht(fach.id, mk));
        gewichtFeld.addEventListener('change', function () {
          const e = M.einstellungen();
          const je = e.mitarbeitGewichtJeFach || {};
          je[fach.id] = Number(gewichtFeld.value);
          einstellungSetzen('mitarbeitGewichtJeFach', je);
        });
        kopfZeilen.push(zeile('Gewicht „' + mk.name + '“ in der Fachleistung', 'Anteil der mündlichen Mitarbeit an der Fachleistung dieses Fachs, Standard 1 wie bei einer Kompetenz.', gewichtFeld, { alsLabel: true, klasse: 'einst-zeile-auswahl' }));
      });
    } else if (fach.hinweis) {
      kopfZeilen.push(zeile('Hinweis', fach.hinweis, null));
    }
    inhalt.appendChild(gruppe(istAsv ? 'Arbeits- und Sozialverhalten' : 'Fach', kopfZeilen));

    // Kriterien / Kompetenzen der Stufe nach Bereich
    const alleKriterien = istAsv ? (fach.kriterien || (fach.kriterien = [])) : (fach.kompetenzen || (fach.kompetenzen = []));
    const sichtbar = istAsv ? alleKriterien : alleKriterien.filter(k => k.stufe === stufe);
    const gruppen = M.nachBereich(sichtbar);
    const liste = H.el('div', { class: 'einst-liste' });
    if (!sichtbar.length) liste.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: istAsv ? 'Noch kein Kriterium.' : 'Noch keine Kompetenz in dieser Stufe. Lege eine an, damit sich das Fach bewerten lässt.' }));
    gruppen.forEach(function (g) {
      liste.appendChild(H.el('p', { class: 'einst-bereich', text: g.bereich }));
      g.kriterien.forEach(function (krit) {
        const i = alleKriterien.indexOf(krit);
        const gewicht = M.gewicht(krit);
        const ruht = krit.aktiv === false || gewicht === 0;
        const info = 'Gewicht ' + String(gewicht).replace('.', ',') + (krit.aktiv === false ? ' · ausgeschaltet' : gewicht === 0 ? ' (ausgeblendet)' : '');
        liste.appendChild(H.el('div', { class: 'einst-eintrag' + (ruht ? ' ausgeblendet' : '') }, [
          H.el('button', {
            type: 'button', class: 'einst-eintrag-text',
            onclick: () => N.bildschirmOeffnen('einstellungen-kriterium', { fachId: istAsv ? ASV_ID : fach.id, kriteriumId: krit.id, stufe: stufe })
          }, [
            H.el('span', { class: 'einst-eintrag-titel', text: krit.name }),
            H.el('span', { class: 'text-klein text-schwach', text: info })
          ]),
          pfeilKnopf(krit.name + ' nach oben', -1, i > 0, function () {
            if (verschieben(alleKriterien, i, -1)) { speichern(); fachRendern(parameter); }
          }),
          pfeilKnopf(krit.name + ' nach unten', 1, i < alleKriterien.length - 1, function () {
            if (verschieben(alleKriterien, i, 1)) { speichern(); fachRendern(parameter); }
          }),
          loeschKnopf(krit.name + ' löschen', () => kriteriumLoeschen(fach, krit, istAsv, parameter))
        ]));
      });
    });
    inhalt.appendChild(gruppe(istAsv ? 'Kriterien' : 'Kompetenzen ' + M.stufe(stufe).kurz, [liste]));
    inhalt.appendChild(H.el('div', { class: 'knopfzeile' }, H.el('button', {
      type: 'button', class: 'knopf primaer', text: istAsv ? 'Kriterium anlegen' : 'Kompetenz anlegen', onclick: () => kriteriumAnlegen(fach, istAsv, stufe, parameter)
    })));
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Ein Tipp öffnet Bereich, Gewicht, Aktiv und die sechs Beschreibungstexte. Ausschalten oder Gewicht 0 blendet aus, ohne Daten zu löschen.' }));
    wurzel.appendChild(inhalt);
  }

  /** Neue Kompetenz oder neues Kriterium: Name, dann Bereich (Pflicht) mit Vorschlägen aus dem Fach. */
  async function kriteriumAnlegen(fach, istAsv, stufe, parameter) {
    const name = await NB.Dialog.eingabe({ titel: istAsv ? 'Neues Kriterium' : 'Neue Kompetenz', label: 'Name', platzhalter: istAsv ? 'zum Beispiel Zuverlässigkeit' : 'zum Beispiel Texte überarbeiten', bestaetigen: 'Weiter' });
    if (!name) return;
    const liste = istAsv ? (fach.kriterien || []) : M.kompetenzenAlle(fach, stufe);
    const vorschlaege = [];
    liste.forEach(k => { if (k.bereich && vorschlaege.indexOf(k.bereich) < 0) vorschlaege.push(k.bereich); });
    if (istAsv) ['Arbeitsverhalten', 'Sozialverhalten'].forEach(b => { if (vorschlaege.indexOf(b) < 0) vorschlaege.push(b); });
    let bereich = null;
    if (vorschlaege.length) {
      const wahl = await NB.Dialog.auswahl({
        titel: 'Lehrplanbereich',
        optionen: vorschlaege.map(b => ({ text: b, wert: b })).concat([{ text: 'Neuer Bereich …', wert: '__neu__', klasse: 'auswahl-sekundaer' }])
      });
      if (!wahl) return;
      bereich = wahl === '__neu__' ? null : wahl;
    }
    if (!bereich) {
      bereich = await NB.Dialog.eingabe({ titel: 'Lehrplanbereich', label: 'Bereich (Pflicht)', platzhalter: 'zum Beispiel Schreiben', bestaetigen: 'Anlegen' });
      if (!bereich) return;
    }
    const krit = { id: (istAsv ? 'aus' : fach.id) + '-' + H.neueId(), name: name, bereich: bereich, gewicht: 1, stufen: ['', '', '', '', '', ''], aktiv: true };
    if (!istAsv) krit.stufe = stufe;
    if (istAsv) { fach.kriterien.push(krit); M.arbeitsverhaltenSpeichern(fach); }
    else { fach.kompetenzen.push(krit); M.faecherSpeichern(M.faecherKatalog()); }
    N.bildschirmOeffnen('einstellungen-kriterium', { fachId: istAsv ? ASV_ID : fach.id, kriteriumId: krit.id, stufe: stufe });
  }

  async function kriteriumLoeschen(fach, krit, istAsv, parameter) {
    const anzahl = M.anzahlEinheitenMitKriterien(null, istAsv ? null : fach.id, [krit.id]);
    const ok = await NB.Dialog.bestaetigen({
      titel: '„' + krit.name + '“ löschen?',
      text: (anzahl ? 'In ' + (anzahl === 1 ? '1 Einheit' : anzahl + ' Einheiten') + ' wurden Werte zu diesem Kriterium erfasst – sie werden gelöscht. ' : 'Zu diesem Kriterium wurden noch keine Werte erfasst. ')
        + 'Soll es nur nicht mehr angezeigt werden, schalte es stattdessen aus – dann bleiben die Daten erhalten.',
      bestaetigen: 'Löschen',
      gefaehrlich: true
    });
    if (!ok) return;
    if (istAsv) {
      fach.kriterien = fach.kriterien.filter(k => k.id !== krit.id);
      M.arbeitsverhaltenSpeichern(fach);
      M.einheiten().forEach(function (b) {
        let geaendert = false;
        Object.keys(b.kinder || {}).forEach(function (kindId) {
          const e = b.kinder[kindId];
          if (e && e.noten && e.noten[krit.id] !== undefined) { delete e.noten[krit.id]; geaendert = true; }
        });
        if (geaendert) M.einheitSpeichern(b);
      });
    } else {
      M.kompetenzLoeschen(fach.id, krit.id);
    }
    fachRendern(parameter);
  }

  /** Bildschirm eines Kriteriums: Name, Bereich, Gewicht, Aktiv, sechs Beschreibungstexte. */
  function kriteriumRendern(parameter) {
    const wurzel = H.$('#bildschirm-einstellungen-kriterium');
    H.leeren(wurzel);
    const istAsv = parameter && parameter.fachId === ASV_ID;
    const faecher = M.faecherKatalog();
    const fach = istAsv ? M.arbeitsverhalten() : faecher.find(f => f.id === (parameter && parameter.fachId));
    const liste = fach ? (istAsv ? fach.kriterien : fach.kompetenzen) || [] : [];
    const krit = liste.find(k => k.id === parameter.kriteriumId);
    aktuellesKriterium = krit || null;
    if (!krit) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Dieses Kriterium gibt es nicht mehr.' })));
      return;
    }
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    const speichern = () => (istAsv ? M.arbeitsverhaltenSpeichern(fach) : M.faecherSpeichern(faecher));
    const benotet = istAsv ? true : (krit.stufe !== '1-2');

    const nameFeld = H.el('input', { type: 'text', value: krit.name, autocomplete: 'off', 'aria-label': 'Name' });
    nameFeld.addEventListener('input', H.entprellen(function () {
      const wert = nameFeld.value.trim();
      if (!wert) return;
      krit.name = wert;
      speichern();
      N.kopfAktualisieren();
    }, 400));

    const bereichFeld = H.el('input', { type: 'text', value: krit.bereich || '', autocomplete: 'off', 'aria-label': 'Bereich', list: 'bereich-vorschlaege' });
    const datalist = H.el('datalist', { id: 'bereich-vorschlaege' });
    const vorschlaege = [];
    liste.forEach(k => { if (k.bereich && vorschlaege.indexOf(k.bereich) < 0) vorschlaege.push(k.bereich); });
    vorschlaege.forEach(b => datalist.appendChild(H.el('option', { value: b })));
    bereichFeld.addEventListener('input', H.entprellen(function () {
      const wert = bereichFeld.value.trim();
      if (!wert) return;
      krit.bereich = wert;
      speichern();
    }, 400));

    const gewichtFeld = H.el('select', { 'aria-label': 'Gewicht' });
    [0, 0.5, 1, 1.5, 2, 2.5, 3].forEach(function (g) {
      gewichtFeld.appendChild(H.el('option', { value: String(g), text: String(g).replace('.', ',') + (g === 0 ? ' – ausgeblendet' : g === 1 ? ' – normal' : '') }));
    });
    gewichtFeld.value = String(M.gewicht(krit));
    gewichtFeld.addEventListener('change', function () { krit.gewicht = Number(gewichtFeld.value); speichern(); });

    const aktivFeld = H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch' });
    aktivFeld.checked = krit.aktiv !== false;
    aktivFeld.setAttribute('aria-checked', aktivFeld.checked ? 'true' : 'false');
    aktivFeld.addEventListener('change', function () { krit.aktiv = aktivFeld.checked; aktivFeld.setAttribute('aria-checked', krit.aktiv ? 'true' : 'false'); speichern(); });

    const fachnoteFeld = istAsv ? H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch' }) : null;
    if (fachnoteFeld) {
      fachnoteFeld.checked = krit.fachnote === true;
      fachnoteFeld.setAttribute('aria-checked', fachnoteFeld.checked ? 'true' : 'false');
      fachnoteFeld.addEventListener('change', function () { krit.fachnote = fachnoteFeld.checked; fachnoteFeld.setAttribute('aria-checked', krit.fachnote ? 'true' : 'false'); speichern(); });
    }
    inhalt.appendChild(gruppe(istAsv ? 'Kriterium' : 'Kompetenz' + (krit.stufe ? ' · ' + M.stufe(krit.stufe).kurz : ''), [
      zeile('Name', null, nameFeld, { alsLabel: true, klasse: 'einst-zeile-feld' }),
      zeile(istAsv ? 'Bereich' : 'Lehrplanbereich', istAsv ? 'Etwa Mitarbeit, Arbeitsverhalten oder Sozialverhalten.' : 'Kompetenzen werden nach Bereich gruppiert angezeigt.', bereichFeld, { alsLabel: true, klasse: 'einst-zeile-feld' }),
      zeile('Gewicht', istAsv ? 'Zwischen 0 und 3; bei „zählt zur Fachleistung“ der Standard für alle Fächer, je Fach überschreibbar.' : 'Zwischen 0 und 3. Gewicht 0 blendet aus, ohne bisherige Daten zu löschen.', gewichtFeld, { alsLabel: true, klasse: 'einst-zeile-auswahl' }),
      fachnoteFeld ? zeile('Zählt zur Fachleistung', 'An: fließt wie eine Kompetenz in die Fachleistung des jeweiligen Fachs ein (Mündliche Mitarbeit). Aus: nur Arbeits- und Sozialverhalten, nie in der Fachnote.', fachnoteFeld, { alsLabel: true }) : null,
      zeile('Aktiv', 'Aus: wird in der Erfassung nicht angezeigt, Daten bleiben erhalten.', aktivFeld, { alsLabel: true })
    ]));
    inhalt.appendChild(datalist);

    const woerter = M.notenwoerter();
    const stufenFelder = [];
    if (!Array.isArray(krit.stufen) || krit.stufen.length !== 6) krit.stufen = ['', '', '', '', '', ''];
    for (let n = 1; n <= 6; n++) {
      const feld = H.el('textarea', { rows: 3, 'aria-label': 'Beschreibung für ' + (benotet ? 'Note ' : 'Stufe ') + n });
      feld.value = krit.stufen[n - 1] || '';
      feld.addEventListener('input', H.entprellen(function () {
        krit.stufen[n - 1] = feld.value;
        speichern();
      }, 400));
      stufenFelder.push(H.el('label', { class: 'feld einst-stufe' }, [
        H.el('span', { class: 'feld-name' }, [
          H.el('span', { class: 'notenmarke', dataset: { note: String(n) }, text: String(n) }),
          ' ' + (benotet ? woerter[n - 1] : 'Stufe ' + n)
        ]),
        feld
      ]));
    }
    // Kompetenzen der Stufe 1–2: Notenmarken in der einfarbigen Stufenabstufung
    inhalt.appendChild(gruppe(istAsv ? 'Beschreibungstexte (allgemein)' : 'Beschreibungstexte', [H.el('div', { class: 'einst-stufen' + (benotet ? '' : ' ohne-noten') }, stufenFelder)]));
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Die Texte erscheinen unter der Skala und bilden die Grundlage für Textbausteine in der Auswertung.' }));
    if (istAsv) fassungenEinfuegen(inhalt, krit, parameter);
    wurzel.appendChild(inhalt);
  }

  /**
   * Fachspezifische Fassungen eines Stundenkriteriums: Liste der Fächer mit
   * eigener Fassung und Knopf zum Anlegen. Eine Fassung ist nur eine andere
   * Beschreibung desselben Kriteriums – gleiche id, dieselben Bewertungen.
   */
  function fassungenEinfuegen(inhalt, krit, parameter) {
    const fassungen = M.fassungenFuerKriterium(krit.id);
    const liste = H.el('div', { class: 'einst-liste' });
    if (!fassungen.length) liste.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: 'Keine eigene Fassung – in allen Fächern gilt die allgemeine.' }));
    fassungen.forEach(function (f) {
      liste.appendChild(H.el('div', { class: 'einst-eintrag' }, [
        H.el('button', {
          type: 'button', class: 'einst-eintrag-text',
          onclick: () => N.bildschirmOeffnen('einstellungen-fassung', { kriteriumId: krit.id, fachId: f.fachId })
        }, [
          H.el('span', { class: 'einst-eintrag-titel', text: f.fach.name }),
          H.el('span', { class: 'text-klein text-schwach', text: f.fassung.name ? 'Heißt hier „' + f.fassung.name + '“' : 'Eigene Texte, allgemeiner Name' })
        ]),
        loeschKnopf('Fassung für ' + f.fach.name + ' entfernen', () => fassungEntfernen(krit, f, parameter))
      ]));
    });
    inhalt.appendChild(gruppe('Eigene Fassungen je Fach', [liste]));
    inhalt.appendChild(H.el('div', { class: 'knopfzeile' }, H.el('button', {
      type: 'button', class: 'knopf', text: 'Eigene Fassung für ein Fach anlegen', onclick: () => fassungAnlegen(krit, fassungen)
    })));
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'In diesen Fächern erscheinen Name und Texte der eigenen Fassung – im Bewertungsbildschirm, in der Auswertung des Fachs und in seinem Textbaustein. Bewertet wird weiterhin dasselbe Kriterium; in der fachübergreifenden Übersicht steht der allgemeine Name.' }));
  }

  async function fassungAnlegen(krit, vorhandene) {
    const frei = M.faecherKatalog().filter(f => !vorhandene.some(v => v.fachId === f.id));
    if (!frei.length) {
      await NB.Dialog.hinweis({ titel: 'Alle Fächer haben eine Fassung', text: 'Für jedes Fach gibt es bereits eine eigene Fassung dieses Kriteriums.' });
      return;
    }
    const wahl = await NB.Dialog.auswahl({
      titel: 'Eigene Fassung für welches Fach?',
      optionen: frei.map(f => ({ text: f.name, wert: f.id, untertitel: f.aktiv === false ? 'stillgelegt' : '' }))
    });
    if (!wahl) return;
    // Mit den allgemeinen Texten vorbelegt – zum Überarbeiten
    M.fassungSpeichern(krit.id, wahl, { stufen: (krit.stufen || ['', '', '', '', '', '']).slice() });
    N.bildschirmOeffnen('einstellungen-fassung', { kriteriumId: krit.id, fachId: wahl });
  }

  async function fassungEntfernen(krit, f, parameter) {
    const ok = await NB.Dialog.bestaetigen({
      titel: 'Fassung für ' + f.fach.name + ' entfernen?',
      text: 'In ' + f.fach.name + ' gelten danach wieder Name und Texte der allgemeinen Fassung. Es gehen keine Bewertungen verloren – die Werte gehören zum Kriterium, nicht zur Fassung.',
      bestaetigen: 'Entfernen'
    });
    if (!ok) return;
    M.fassungEntfernen(krit.id, f.fachId);
    kriteriumRendern(parameter);
  }

  /** Bildschirm einer fachspezifischen Fassung: Name und sechs Texte. */
  function fassungRendern(parameter) {
    aktuelleFassung = parameter || {};
    const wurzel = H.$('#bildschirm-einstellungen-fassung');
    H.leeren(wurzel);
    const asv = M.arbeitsverhalten();
    const krit = (asv.kriterien || []).find(k => k.id === aktuelleFassung.kriteriumId);
    const fach = M.fach(aktuelleFassung.fachId);
    const fassung = M.fachFassung(aktuelleFassung.kriteriumId, aktuelleFassung.fachId);
    if (!krit || !fach || !fassung) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diese Fassung gibt es nicht mehr.' })));
      return;
    }
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    const speichern = () => M.fassungSpeichern(krit.id, fach.id, fassung);

    const nameFeld = H.el('input', { type: 'text', value: fassung.name || '', autocomplete: 'off', placeholder: krit.name, 'aria-label': 'Name in ' + fach.name });
    nameFeld.addEventListener('input', H.entprellen(function () {
      const wert = nameFeld.value.trim();
      if (wert) fassung.name = wert; else delete fassung.name;
      speichern();
      N.kopfAktualisieren();
    }, 400));
    inhalt.appendChild(gruppe('Fassung für ' + fach.name, [
      zeile('Name in ' + fach.name, 'Leer lassen, dann gilt der allgemeine Name „' + krit.name + '“.', nameFeld, { alsLabel: true, klasse: 'einst-zeile-feld' }),
      zeile('Kriterium', 'Dieselbe Bewertung wie „' + krit.name + '“ – nur anders beschrieben.', null)
    ]));

    const woerter = M.notenwoerter();
    if (!Array.isArray(fassung.stufen) || fassung.stufen.length !== 6) fassung.stufen = ['', '', '', '', '', ''];
    const stufenFelder = [];
    for (let n = 1; n <= 6; n++) {
      const feld = H.el('textarea', { rows: 3, 'aria-label': 'Beschreibung für Note ' + n + ' in ' + fach.name });
      feld.value = fassung.stufen[n - 1] || '';
      feld.addEventListener('input', H.entprellen(function () {
        fassung.stufen[n - 1] = feld.value;
        speichern();
      }, 400));
      stufenFelder.push(H.el('label', { class: 'feld einst-stufe' }, [
        H.el('span', { class: 'feld-name' }, [
          H.el('span', { class: 'notenmarke', dataset: { note: String(n) }, text: String(n) }),
          ' ' + woerter[n - 1]
        ]),
        feld
      ]));
    }
    inhalt.appendChild(gruppe('Beschreibungstexte in ' + fach.name, [H.el('div', { class: 'einst-stufen' }, stufenFelder)]));
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Die Texte gelten in beiden Stufen. In Klasse 1 und 2 erscheinen sie als Stufen 1 bis 6 ohne Notenwörter.' }));
    wurzel.appendChild(inhalt);
  }

  /* ---------- Darstellung ---------- */

  function darstellungRendern(inhalt) {
    inhalt.appendChild(gruppe('Bewertungsbildschirm', [
      schalter('beschreibungenAnzeigen', 'Beschreibungstexte anzeigen', 'Der Text zur eingestellten Note unter jedem Kriterium.'),
      schalter('notizfeldAnzeigen', 'Notizfeld anzeigen', 'Ein Feld für eine kurze Notiz je Kind und Stunde unter der Matrix.'),
      schalter('durchschnittAnzeigen', 'Bisherigen Durchschnitt anzeigen', 'Unter dem Namen der Stand des Kindes aus früheren Einheiten und je Kriterium ein blasses „Ø“.'),
      segment('schriftgroesse', 'Schriftgröße', null,
        [{ wert: 'klein', text: 'Klein' }, { wert: 'mittel', text: 'Mittel' }, { wert: 'gross', text: 'Groß' }])
    ]));
    inhalt.appendChild(gruppe('Kinder und Bedienung', [
      segment('kinderSortierung', 'Sortierung der Kinder', 'Nach Name oder in der Reihenfolge der Klassenliste.',
        [{ wert: 'name', text: 'Name' }, { wert: 'eigene', text: 'Eigene Reihenfolge' }]),
      schalter('wischrichtungUmkehren', 'Wischrichtung umkehren', 'Aus: nach links wischen führt zum nächsten Kind.'),
      schalter('haptik', 'Haptische Rückmeldung', 'Kurzes Vibrieren beim Setzen einer Note, sofern das Gerät es unterstützt (iPhone und iPad im Browser nicht).')
    ]));
  }

  /* ---------- Datenschutz ---------- */

  function datenschutzRendern(inhalt) {
    inhalt.appendChild(gruppe('Namen', [
      schalter('nurKuerzel', 'Nur Kürzel statt voller Namen anzeigen', 'Kinder ohne Kürzel werden weiterhin mit Namen angezeigt.'),
      schalter('keineVollenNamen', 'Keine vollen Namen speichern', 'Entfernt die Namen aus allen Klassenlisten; es bleiben nur die Kürzel. Voraussetzung: Jedes Kind hat ein Kürzel.', keineVollenNamenSetzen)
    ]));
    inhalt.appendChild(gruppe('Sperre', [
      auswahl('sperreNachMinuten', 'Automatische Sperre', 'Nach dieser Zeit ohne Bedienung sperrt sich Notenblock und verwirft den Schlüssel.',
        [
          { wert: '1', text: 'Nach 1 Minute' },
          { wert: '5', text: 'Nach 5 Minuten' },
          { wert: '15', text: 'Nach 15 Minuten' },
          { wert: '60', text: 'Nach 60 Minuten' },
          { wert: '0', text: 'Nie' }
        ], w => Number(w)),
      schalter('sperreImHintergrund', 'Sperren, sobald die App in den Hintergrund geht', 'Beim Wechsel in eine andere App sofort sperren.'),
      knopfzeile([
        H.el('button', { type: 'button', class: 'knopf', text: 'Passphrase ändern', onclick: () => N.bildschirmOeffnen('einstellungen-passphrase') }),
        H.el('button', { type: 'button', class: 'knopf', text: 'Jetzt sperren', onclick: () => NB.Sperre.sperren() })
      ])
    ]));
  }

  async function keineVollenNamenSetzen(an, feld) {
    if (!an) { einstellungSetzen('keineVollenNamen', false); return; }
    const ohne = [];
    M.klassen().forEach(function (k) {
      (k.kinder || []).forEach(function (kind) {
        if (!kind.kuerzel) ohne.push((kind.name || '?') + ' (' + k.name + ')');
      });
    });
    if (ohne.length) {
      feld.checked = false;
      feld.setAttribute('aria-checked', 'false');
      await NB.Dialog.hinweis({
        titel: 'Zuerst Kürzel vergeben',
        text: 'Diese Kinder haben noch kein Kürzel: ' + ohne.join(', ') + '. Trage in der Klassenliste je Kind ein Kürzel ein („Name | Kürzel“), dann lässt sich die Einstellung einschalten.'
      });
      return;
    }
    const ok = await NB.Dialog.bestaetigen({
      titel: 'Volle Namen entfernen?',
      text: 'Aus allen Klassenlisten werden die Namen entfernt, es bleiben nur die Kürzel. Das lässt sich nicht rückgängig machen – die Namen müssten neu eingetragen werden.',
      bestaetigen: 'Namen entfernen',
      gefaehrlich: true
    });
    if (!ok) {
      feld.checked = false;
      feld.setAttribute('aria-checked', 'false');
      return;
    }
    M.klassen().forEach(function (k) {
      (k.kinder || []).forEach(kind => { kind.name = ''; });
      D.setzen('klasse', k.id, k);
    });
    einstellungSetzen('keineVollenNamen', true);
    NB.App.meldung('Namen entfernt. Es bleiben die Kürzel.');
  }

  /* ---------- Passphrase ändern ---------- */

  function passphraseRendern() {
    const wurzel = H.$('#bildschirm-einstellungen-passphrase');
    H.leeren(wurzel);
    const alt = H.el('input', { type: 'password', autocomplete: 'current-password', autocapitalize: 'off', spellcheck: 'false' });
    const neu1 = H.el('input', { type: 'password', autocomplete: 'new-password', autocapitalize: 'off', spellcheck: 'false' });
    const neu2 = H.el('input', { type: 'password', autocomplete: 'new-password', autocapitalize: 'off', spellcheck: 'false' });
    const staerke = H.el('div', { class: 'staerke' }, [
      H.el('div', { class: 'staerke-balken' }, [H.el('span'), H.el('span'), H.el('span')]),
      H.el('span', { class: 'staerke-text' })
    ]);
    const STAERKE_TEXTE = ['Mindestens zehn Zeichen', 'Schwach – besser länger', 'Mittel', 'Stark'];
    neu1.addEventListener('input', function () {
      const stufe = neu1.value ? NB.Krypto.staerke(neu1.value) : 0;
      staerke.dataset.stufe = String(stufe);
      H.$('.staerke-text', staerke).textContent = neu1.value ? STAERKE_TEXTE[stufe] : '';
    });
    const fehler = H.el('p', { class: 'fehler', role: 'alert', hidden: true });
    const knopf = H.el('button', { type: 'submit', class: 'knopf primaer', text: 'Passphrase ändern' });

    async function absenden(ev) {
      ev.preventDefault();
      fehler.hidden = true;
      if (!alt.value) { fehler.textContent = 'Bitte die aktuelle Passphrase eingeben.'; fehler.hidden = false; alt.focus(); return; }
      if (neu1.value.length < 10) { fehler.textContent = 'Die neue Passphrase muss mindestens zehn Zeichen lang sein.'; fehler.hidden = false; neu1.focus(); return; }
      if (neu1.value !== neu2.value) { fehler.textContent = 'Die beiden neuen Eingaben stimmen nicht überein.'; fehler.hidden = false; neu2.focus(); return; }
      knopf.disabled = true;
      knopf.textContent = 'Wird umgeschlüsselt …';
      try {
        const ok = await D.passphraseAendern(alt.value, neu1.value);
        if (!ok) {
          fehler.textContent = 'Die aktuelle Passphrase ist nicht richtig.';
          fehler.hidden = false;
          alt.focus();
          return;
        }
        alt.value = neu1.value = neu2.value = '';
        await NB.Dialog.hinweis({
          titel: 'Passphrase geändert',
          text: 'Alle Daten wurden mit der neuen Passphrase verschlüsselt. Bitte aktualisiere sie jetzt auch in deinem Passwortmanager.'
        });
        N.zurueck();
      } catch (e) {
        console.error(e);
        fehler.textContent = 'Ändern fehlgeschlagen: ' + (e.message || e) + '. Die alte Passphrase gilt weiterhin.';
        fehler.hidden = false;
      } finally {
        knopf.disabled = false;
        knopf.textContent = 'Passphrase ändern';
      }
    }

    wurzel.appendChild(H.el('div', { class: 'karte-inhalt' }, H.el('form', { novalidate: true, onsubmit: absenden }, [
      H.el('p', { class: 'text-schwach', text: 'Der gesamte Bestand wird mit der neuen Passphrase neu verschlüsselt. Bricht der Vorgang ab, bleibt alles beim Alten.' }),
      H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: 'Aktuelle Passphrase' }), alt]),
      H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: 'Neue Passphrase' }), neu1]),
      staerke,
      H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: 'Neue Passphrase wiederholen' }), neu2]),
      fehler,
      H.el('div', { class: 'knopfzeile' }, knopf)
    ])));
    setTimeout(() => alt.focus(), 50);
  }

  /* ---------- Daten ---------- */

  function datenRendern(inhalt) {
    const e = M.einstellungen();
    inhalt.appendChild(gruppe('Speicherort', [
      zeile('Alle Daten liegen ausschließlich auf diesem Gerät',
        'Verschlüsselt im Browserspeicher dieser Adresse. Kein Server, keine Cloud, kein Abgleich. Letzte Sicherung: ' + (e.letzteSicherung ? H.datumLang(e.letzteSicherung.slice(0, 10)) : 'noch keine') + '.', null)
    ]));
    inhalt.appendChild(gruppe('Sicherung', [
      zeile('Sicherung erstellen', 'Der gesamte Bestand als Datei, standardmäßig verschlüsselt mit einer Passphrase, die beim Erstellen abgefragt wird.',
        H.el('button', { type: 'button', class: 'knopf primaer klein', text: 'Sicherung erstellen', onclick: () => NB.Export.sicherungErstellen() }), { klasse: 'einst-zeile-knopf' }),
      zeile('Sicherung laden', 'Ersetzt alle Daten auf diesem Gerät durch den Inhalt einer Sicherungsdatei – nach Rückfrage.',
        H.el('button', { type: 'button', class: 'knopf klein', text: 'Sicherung laden', onclick: () => NB.Export.sicherungLaden() }), { klasse: 'einst-zeile-knopf' }),
      zeile('Noten als CSV', 'Einzelne Noten je Kind, Stunde und Kriterium – unverschlüsselt, für Tabellenprogramme.',
        H.el('button', { type: 'button', class: 'knopf klein', text: 'Noten als CSV', onclick: () => NB.Export.csvNoten() }), { klasse: 'einst-zeile-knopf' }),
      zeile('Auswertung als CSV', 'Gesamtwert, Notenvorschlag und Arbeits- und Sozialverhalten je Kind und Fach – unverschlüsselt.',
        H.el('button', { type: 'button', class: 'knopf klein', text: 'Auswertung als CSV', onclick: () => NB.Export.csvAuswertung() }), { klasse: 'einst-zeile-knopf' })
    ]));

    const klassen = M.klassen();
    const liste = klassen.map(function (k) {
      const anzahl = M.anzahlBewertungen(k.id);
      return H.el('div', { class: 'einst-eintrag' }, [
        H.el('div', { class: 'einst-eintrag-text' }, [
          H.el('span', { class: 'einst-eintrag-titel', text: k.name }),
          H.el('span', { class: 'text-klein text-schwach', text: (k.kinder || []).length + ' Kinder · ' + anzahl + (anzahl === 1 ? ' erfasste Stunde' : ' erfasste Stunden') })
        ]),
        H.el('button', { type: 'button', class: 'knopf gefaehrlich klein', text: 'Löschen', onclick: () => klasseLoeschen(k) })
      ]);
    });
    if (!liste.length) liste.push(H.el('p', { class: 'text-schwach einst-leer', text: 'Keine Klassen vorhanden.' }));
    inhalt.appendChild(gruppe('Einzelne Klasse löschen', [H.el('div', { class: 'einst-liste' }, liste)]));

    inhalt.appendChild(gruppe('Alles löschen', [
      zeile('Alle Daten löschen', 'Klassen, Kinder, Bewertungen, Notizen, Aufgaben, Stundenplan und Einstellungen. Notenblock beginnt danach bei der Einrichtung.', null),
      knopfzeile([H.el('button', { type: 'button', class: 'knopf gefaehrlich', text: 'Alle Daten löschen', onclick: allesLoeschen })])
    ]));
  }

  async function klasseLoeschen(klasse) {
    const anzahl = M.anzahlBewertungen(klasse.id);
    const ok = await NB.Dialog.bestaetigen({
      titel: '„' + klasse.name + '“ löschen?',
      text: 'Die Klasse mit ' + (klasse.kinder || []).length + ' Kindern, ' + anzahl + (anzahl === 1 ? ' erfassten Stunde' : ' erfassten Stunden') + ', ihren Stundenplaneinträgen, Notizen und Aufgaben wird gelöscht. Das lässt sich nicht rückgängig machen.',
      bestaetigen: 'Klasse löschen',
      gefaehrlich: true
    });
    if (!ok) return;
    M.klasseLoeschen(klasse.id);
    NB.App.meldung('Klasse „' + klasse.name + '“ gelöscht.');
    abschnittRendern({ abschnitt: 'daten' });
  }

  function allesLoeschen() {
    let eintrag;
    const eingabe = H.el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false' });
    const knopf = H.el('button', { type: 'submit', class: 'knopf gefaehrlich', text: 'Alle Daten löschen', disabled: true });
    eingabe.addEventListener('input', function () {
      knopf.disabled = eingabe.value.trim().normalize('NFC') !== 'LÖSCHEN';
    });
    const formular = H.el('form', { novalidate: true, onsubmit: async function (ev) {
      ev.preventDefault();
      if (eingabe.value.trim().normalize('NFC') !== 'LÖSCHEN') return;
      knopf.disabled = true;
      knopf.textContent = 'Wird gelöscht …';
      try {
        await D.allesLoeschen();
        eintrag.schliessen(true);
        N.zuruecksetzen();
        NB.Sperre.einrichtungZeigen();
        NB.App.meldung('Alle Daten wurden gelöscht. Notenblock beginnt von vorn.');
      } catch (e) {
        console.error(e);
        NB.App.meldung('Löschen fehlgeschlagen: ' + (e.message || e), 'fehler');
        knopf.textContent = 'Alle Daten löschen';
        knopf.disabled = false;
      }
    } }, [
      H.el('h2', { text: 'Wirklich alle Daten löschen?' }),
      H.el('p', { text: 'Alle Klassen, Kinder, Bewertungen, Notizen, Aufgaben, der Stundenplan und die Einstellungen werden von diesem Gerät gelöscht. Ohne Sicherung ist das nicht rückgängig zu machen.' }),
      H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: 'Zur Bestätigung LÖSCHEN eintippen' }), eingabe]),
      H.el('div', { class: 'knopfzeile' }, [
        H.el('button', { type: 'button', class: 'knopf', text: 'Abbrechen', onclick: () => eintrag.schliessen(null) }),
        knopf
      ])
    ]);
    eintrag = NB.Dialog.overlayOeffnen(formular, { klasse: 'dialog', fokus: 'input' });
  }

  /* ---------- Öffnen und Registrierung ---------- */

  E.oeffnen = function () {
    if (N.offenerBildschirm() === 'einstellungen') return;
    N.bildschirmOeffnen('einstellungen');
  };

  /** Aktuellen Abschnitt neu zeichnen (nach Änderungen an Listen), Scrollposition bleibt. */
  E.neuZeichnen = function () {
    if (!aktuellerAbschnitt) return;
    const inhalt = H.$('#inhalt');
    const scroll = inhalt.scrollTop;
    abschnittRendern({ abschnitt: aktuellerAbschnitt.id });
    inhalt.scrollTop = scroll;
  };

  N.bildschirmRegistrieren('einstellungen', { titel: 'Einstellungen', zurueck: true, zeigen: wurzelRendern });
  N.bildschirmRegistrieren('einstellungen-abschnitt', {
    titel: () => (aktuellerAbschnitt ? aktuellerAbschnitt.titel : 'Einstellungen'),
    zurueck: true,
    zeigen: abschnittRendern
  });
  N.bildschirmRegistrieren('einstellungen-fach', {
    titel: () => (aktuellesFach ? aktuellesFach.name : 'Fach'),
    zurueck: true,
    zeigen: fachRendern
  });
  N.bildschirmRegistrieren('einstellungen-kriterium', {
    titel: () => (aktuellesKriterium ? aktuellesKriterium.name : 'Kriterium'),
    zurueck: true,
    zeigen: kriteriumRendern
  });
  N.bildschirmRegistrieren('einstellungen-fassung', {
    titel: function () {
      const fach = aktuelleFassung && M.fach(aktuelleFassung.fachId);
      return fach ? 'Fassung · ' + fach.name : 'Fassung';
    },
    zurueck: true,
    zeigen: fassungRendern
  });
  N.bildschirmRegistrieren('einstellungen-passphrase', { titel: 'Passphrase ändern', zurueck: true, zeigen: passphraseRendern });

  return E;
})();
