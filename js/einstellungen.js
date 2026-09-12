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
    { id: 'stundenplan', titel: 'Stundenplan', text: 'Stunden, Uhrzeiten, Schuljahr, Ferien, Ausfälle' },
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

    inhalt.appendChild(gruppe('Standardnote', [
      auswahl('standardNote', 'Standardnote beim Öffnen einer Stunde',
        'Jedes Kind startet mit dieser Note in allen Kriterien. Angetippt wird nur, was davon abweicht.',
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

    inhalt.appendChild(gruppe('Auswertung', [
      schalter('standardnotenEinrechnen', 'Standardnoten in die Auswertung einrechnen',
        'Aus: Nur bewusst gesetzte Noten zählen (empfohlen). Eine automatisch gesetzte Note ist keine Beobachtung und zieht sonst über viele Stunden hinweg jeden Durchschnitt zur Standardnote hin.')
    ]));
  }

  /* ---------- Fächer und Kriterien ---------- */

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

  function faecherRendern(inhalt) {
    const faecher = M.faecher();
    const liste = H.el('div', { class: 'einst-liste' });
    if (!faecher.length) {
      liste.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: 'Noch kein Fach angelegt.' }));
    }
    faecher.forEach(function (fach, i) {
      const anzahl = (fach.kriterien || []).length;
      liste.appendChild(H.el('div', { class: 'einst-eintrag' }, [
        H.el('button', {
          type: 'button', class: 'einst-eintrag-text',
          onclick: () => N.bildschirmOeffnen('einstellungen-fach', { fachId: fach.id })
        }, [
          H.el('span', { class: 'einst-eintrag-titel', text: fach.name }),
          H.el('span', { class: 'text-klein text-schwach', text: anzahl === 1 ? '1 Kriterium' : anzahl + ' Kriterien' })
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
    inhalt.appendChild(gruppe('Fächer', [liste]));
    inhalt.appendChild(H.el('div', { class: 'knopfzeile' }, H.el('button', {
      type: 'button', class: 'knopf primaer', text: 'Fach anlegen', onclick: fachAnlegen
    })));
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Ein Tipp auf ein Fach öffnet seine Kriterien. Die Reihenfolge hier ist auch die Reihenfolge in der Fächerleiste der Bewertung.' }));
  }

  async function fachAnlegen() {
    const name = await NB.Dialog.eingabe({ titel: 'Neues Fach', label: 'Name des Fachs', platzhalter: 'zum Beispiel Werken', bestaetigen: 'Fach anlegen' });
    if (!name) return;
    const faecher = M.faecher();
    const fach = { id: 'fach-' + H.neueId(), name: name, kriterien: [] };
    faecher.push(fach);
    M.faecherSpeichern(faecher);
    N.bildschirmOeffnen('einstellungen-fach', { fachId: fach.id });
  }

  async function fachLoeschen(fach) {
    const anzahl = M.anzahlBewertungen(null, fach.id);
    const ok = await NB.Dialog.bestaetigen({
      titel: '„' + fach.name + '“ löschen?',
      text: (anzahl ? anzahl + (anzahl === 1 ? ' erfasste Stunde' : ' erfasste Stunden') + ' in diesem Fach werden ebenfalls gelöscht. ' : 'In diesem Fach wurden noch keine Stunden erfasst. ')
        + 'Auch Stundenplaneinträge mit diesem Fach werden entfernt.',
      bestaetigen: 'Fach löschen',
      gefaehrlich: true
    });
    if (!ok) return;
    M.fachLoeschen(fach.id);
    abschnittRendern({ abschnitt: 'faecher' });
  }

  /** Bildschirm eines Fachs: Name, Kriterienliste. */
  function fachRendern(parameter) {
    const wurzel = H.$('#bildschirm-einstellungen-fach');
    H.leeren(wurzel);
    const faecher = M.faecher();
    const fach = faecher.find(f => f.id === (parameter && parameter.fachId));
    aktuellesFach = fach || null;
    if (!fach) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Dieses Fach gibt es nicht mehr.' })));
      return;
    }
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });

    const nameFeld = H.el('input', { type: 'text', value: fach.name, autocomplete: 'off', 'aria-label': 'Name des Fachs' });
    nameFeld.addEventListener('input', H.entprellen(function () {
      const wert = nameFeld.value.trim();
      if (!wert) return;
      fach.name = wert;
      M.faecherSpeichern(faecher);
      N.kopfAktualisieren();
    }, 400));
    inhalt.appendChild(gruppe('Fach', [zeile('Name', null, nameFeld, { alsLabel: true, klasse: 'einst-zeile-feld' })]));

    const kriterien = fach.kriterien || [];
    const liste = H.el('div', { class: 'einst-liste' });
    if (!kriterien.length) liste.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: 'Noch kein Kriterium. Lege eines an, damit sich das Fach bewerten lässt.' }));
    kriterien.forEach(function (krit, i) {
      const gewicht = (typeof krit.gewicht === 'number') ? krit.gewicht : 1;
      const info = (krit.typ === 'projekt' ? 'Projekt' : 'Stunde') + ' · Gewicht ' + String(gewicht).replace('.', ',') + (gewicht === 0 ? ' (ausgeblendet)' : '');
      liste.appendChild(H.el('div', { class: 'einst-eintrag' + (gewicht === 0 ? ' ausgeblendet' : '') }, [
        H.el('button', {
          type: 'button', class: 'einst-eintrag-text',
          onclick: () => N.bildschirmOeffnen('einstellungen-kriterium', { fachId: fach.id, kriteriumId: krit.id })
        }, [
          H.el('span', { class: 'einst-eintrag-titel', text: krit.name }),
          H.el('span', { class: 'text-klein text-schwach', text: info })
        ]),
        pfeilKnopf(krit.name + ' nach oben', -1, i > 0, function () {
          if (verschieben(kriterien, i, -1)) { M.faecherSpeichern(faecher); fachRendern(parameter); }
        }),
        pfeilKnopf(krit.name + ' nach unten', 1, i < kriterien.length - 1, function () {
          if (verschieben(kriterien, i, 1)) { M.faecherSpeichern(faecher); fachRendern(parameter); }
        }),
        loeschKnopf(krit.name + ' löschen', () => kriteriumLoeschen(fach, krit, parameter))
      ]));
    });
    inhalt.appendChild(gruppe('Kriterien', [liste]));
    inhalt.appendChild(H.el('div', { class: 'knopfzeile' }, H.el('button', {
      type: 'button', class: 'knopf primaer', text: 'Kriterium anlegen', onclick: () => kriteriumAnlegen(fach)
    })));
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Ein Tipp auf ein Kriterium öffnet Typ, Gewicht und die sechs Beschreibungstexte. Gewicht 0 blendet ein Kriterium aus, ohne Daten zu löschen.' }));
    wurzel.appendChild(inhalt);
  }

  async function kriteriumAnlegen(fach) {
    const name = await NB.Dialog.eingabe({ titel: 'Neues Kriterium', label: 'Name des Kriteriums', platzhalter: 'zum Beispiel Mündliche Mitarbeit', bestaetigen: 'Kriterium anlegen' });
    if (!name) return;
    const faecher = M.faecher();
    const f = faecher.find(x => x.id === fach.id);
    if (!f) return;
    const krit = { id: f.id + '-' + H.neueId(), name: name, typ: 'stunde', gewicht: 1, stufen: ['', '', '', '', '', ''] };
    if (!f.kriterien) f.kriterien = [];
    f.kriterien.push(krit);
    M.faecherSpeichern(faecher);
    N.bildschirmOeffnen('einstellungen-kriterium', { fachId: f.id, kriteriumId: krit.id });
  }

  async function kriteriumLoeschen(fach, krit, parameter) {
    const ok = await NB.Dialog.bestaetigen({
      titel: '„' + krit.name + '“ löschen?',
      text: 'Bereits erfasste Noten in diesem Kriterium werden gelöscht. Soll es nur nicht mehr angezeigt werden, setze stattdessen das Gewicht auf 0 – dann bleiben die Daten erhalten.',
      bestaetigen: 'Kriterium löschen',
      gefaehrlich: true
    });
    if (!ok) return;
    M.kriteriumLoeschen(fach.id, krit.id);
    fachRendern(parameter);
  }

  /** Bildschirm eines Kriteriums: Name, Typ, Gewicht, sechs Beschreibungstexte. */
  function kriteriumRendern(parameter) {
    const wurzel = H.$('#bildschirm-einstellungen-kriterium');
    H.leeren(wurzel);
    const faecher = M.faecher();
    const fach = faecher.find(f => f.id === (parameter && parameter.fachId));
    const krit = fach && (fach.kriterien || []).find(k => k.id === parameter.kriteriumId);
    aktuellesKriterium = krit || null;
    if (!krit) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Dieses Kriterium gibt es nicht mehr.' })));
      return;
    }
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    const speichern = () => M.faecherSpeichern(faecher);

    const nameFeld = H.el('input', { type: 'text', value: krit.name, autocomplete: 'off', 'aria-label': 'Name des Kriteriums' });
    nameFeld.addEventListener('input', H.entprellen(function () {
      const wert = nameFeld.value.trim();
      if (!wert) return;
      krit.name = wert;
      speichern();
      N.kopfAktualisieren();
    }, 400));

    const typ = H.el('div', { class: 'segment', role: 'group', 'aria-label': 'Typ' });
    [['stunde', 'Stunde'], ['projekt', 'Projekt']].forEach(function (t) {
      typ.appendChild(H.el('button', {
        type: 'button', dataset: { wert: t[0] }, text: t[1], 'aria-pressed': krit.typ === t[0] ? 'true' : 'false',
        onclick: function () {
          krit.typ = t[0];
          H.$$('button', typ).forEach(k => k.setAttribute('aria-pressed', k.dataset.wert === t[0] ? 'true' : 'false'));
          speichern();
        }
      }));
    });

    const gewichtFeld = H.el('select', { 'aria-label': 'Gewicht' });
    [0, 0.5, 1, 1.5, 2, 2.5, 3].forEach(function (g) {
      gewichtFeld.appendChild(H.el('option', { value: String(g), text: String(g).replace('.', ',') + (g === 0 ? ' – ausgeblendet' : g === 1 ? ' – normal' : '') }));
    });
    gewichtFeld.value = String((typeof krit.gewicht === 'number') ? krit.gewicht : 1);
    gewichtFeld.addEventListener('change', function () {
      krit.gewicht = Number(gewichtFeld.value);
      speichern();
    });

    inhalt.appendChild(gruppe('Kriterium', [
      zeile('Name', null, nameFeld, { alsLabel: true, klasse: 'einst-zeile-feld' }),
      zeile('Typ', 'Stundenkriterien erscheinen im Alltag, Projektkriterien bei größeren Arbeiten.', typ, { klasse: 'einst-zeile-segment' }),
      zeile('Gewicht', 'Zwischen 0 und 3. Gewicht 0 blendet das Kriterium aus, ohne bisherige Daten zu löschen.', gewichtFeld, { alsLabel: true, klasse: 'einst-zeile-auswahl' })
    ]));

    const woerter = M.notenwoerter();
    const stufenFelder = [];
    if (!Array.isArray(krit.stufen) || krit.stufen.length !== 6) krit.stufen = ['', '', '', '', '', ''];
    for (let n = 1; n <= 6; n++) {
      const feld = H.el('textarea', { rows: 3, 'aria-label': 'Beschreibung für Note ' + n });
      feld.value = krit.stufen[n - 1] || '';
      feld.addEventListener('input', H.entprellen(function () {
        krit.stufen[n - 1] = feld.value;
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
    inhalt.appendChild(gruppe('Beschreibungstexte', [H.el('div', { class: 'einst-stufen' }, stufenFelder)]));
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Die Texte erscheinen unter der Skala und bilden die Grundlage für Textbausteine in der Auswertung.' }));
    wurzel.appendChild(inhalt);
  }

  /* ---------- Darstellung ---------- */

  function darstellungRendern(inhalt) {
    inhalt.appendChild(gruppe('Bewertungsbildschirm', [
      schalter('beschreibungenAnzeigen', 'Beschreibungstexte anzeigen', 'Der Text zur eingestellten Note unter jedem Kriterium.'),
      schalter('notizfeldAnzeigen', 'Notizfeld anzeigen', 'Ein Feld für eine kurze Notiz je Kind und Stunde unter der Matrix.'),
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
      zeile('Auswertung als CSV', 'Gesamtwert und Notenvorschlag je Kind und Fach – unverschlüsselt.',
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
  N.bildschirmRegistrieren('einstellungen-passphrase', { titel: 'Passphrase ändern', zurueck: true, zeigen: passphraseRendern });

  return E;
})();
