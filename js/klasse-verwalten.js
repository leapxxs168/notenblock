/*
 * Notenblock – Klasse verwalten
 *
 * Übersicht einer Klasse mit ihren Abschnitten: Stufe, Fächer, Kinder.
 * (Der Stundenplan der Klasse folgt als weiterer Abschnitt.)
 *
 * Fächer der Klasse: Jede Klasse hat ihre eigene Auswahl aus den aktiven
 * Fächern ihrer Stufe, in festlegbarer Reihenfolge – nur diese Fächer stehen
 * in der Fächerleiste. Je Fach lassen sich einzelne Kompetenzen für diese
 * Klasse abschalten (etwa Schwimmen außerhalb des Schwimmjahres).
 * Abwählen eines Fachs und Abschalten einer Kompetenz löschen keine Daten;
 * die Rückfrage nennt die Zahl der betroffenen Einheiten. Stillgelegte Fächer
 * (Einstellungen → Fächer, Schalter „Aktiv“) erscheinen hier nicht.
 *
 * Die Stufe lässt sich später ändern (etwa beim Aufrücken): bisherige
 * Einheiten behalten ihre Kompetenzen, neue Einheiten nutzen die neue Stufe,
 * nichts wird umgerechnet.
 */
'use strict';
NB.KlasseVerwalten = (function () {
  const KV = {};
  const H = NB.Hilfen;
  const M = NB.Modell;
  const N = NB.Navigation;

  let aktuell = null;       // { klasseId } des offenen Bildschirms
  let aktuellesFach = null; // { klasseId, fachId } im Kompetenzen-Bildschirm

  /* ---------- Öffnen ---------- */

  KV.oeffnen = klasseId => N.bildschirmOeffnen('klasse', { klasseId: klasseId });
  KV.faecher = klasseId => N.bildschirmOeffnen('klasse-faecher', { klasseId: klasseId });
  KV.kompetenzen = (klasseId, fachId) => N.bildschirmOeffnen('klasse-kompetenzen', { klasseId: klasseId, fachId: fachId });

  /* ---------- Bausteine ---------- */

  function gruppe(titel, kinder, hinweis) {
    return H.el('section', { class: 'einst-gruppe' }, [
      titel ? H.el('h2', { class: 'einst-gruppe-titel', text: titel }) : null,
      H.el('div', { class: 'einst-karte' }, kinder),
      hinweis ? H.el('p', { class: 'text-klein text-schwach einst-gruppe-hinweis', text: hinweis }) : null
    ]);
  }

  function abschnitt(titel, text, beiKlick) {
    return H.el('button', { type: 'button', class: 'einst-abschnitt', onclick: beiKlick }, [
      H.el('span', { class: 'einst-abschnitt-text' }, [
        H.el('span', { class: 'einst-abschnitt-titel', text: titel }),
        H.el('span', { class: 'text-klein text-schwach', text: text })
      ]),
      H.el('span', { class: 'einst-pfeil', 'aria-hidden': 'true', text: '›' })
    ]);
  }

  /** Ein-/Aus-Schalter mit Rückruf; der Rückruf darf den Schalter bei Abbruch zurücksetzen. */
  function schalter(label, an, beiAenderung) {
    const feld = H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch', 'aria-label': label });
    feld.checked = !!an;
    feld.setAttribute('aria-checked', feld.checked ? 'true' : 'false');
    feld.addEventListener('change', function () {
      feld.setAttribute('aria-checked', feld.checked ? 'true' : 'false');
      beiAenderung(feld.checked, feld);
    });
    return feld;
  }

  function zuruecksetzen(feld, wert) {
    feld.checked = wert;
    feld.setAttribute('aria-checked', wert ? 'true' : 'false');
  }

  function pfeilKnopf(text, richtung, aktiv, beiKlick) {
    return H.el('button', {
      type: 'button', class: 'symbolknopf klein', 'aria-label': text, disabled: !aktiv, onclick: beiKlick
    }, H.el('span', { 'aria-hidden': 'true', text: richtung < 0 ? '↑' : '↓' }));
  }

  function einheitenText(anzahl) {
    return anzahl === 1 ? '1 bewertete Einheit' : anzahl + ' bewertete Einheiten';
  }

  /* ---------- Stufe ---------- */

  /** Stufe wählen oder ändern; liefert true, wenn sich die Stufe geändert hat. */
  KV.stufeWaehlen = async function (klasse) {
    const stufen = M.stufen();
    const wahl = await NB.Dialog.auswahl({
      titel: klasse.stufe ? 'Stufe der Klasse ' + klasse.name + ' ändern' : 'Stufe der Klasse ' + klasse.name,
      optionen: M.STUFEN.map(s => ({
        text: stufen[s].bezeichnung, wert: s, aktiv: s === klasse.stufe,
        untertitel: stufen[s].benotet ? 'Mit Noten' : 'Ohne Noten – Stufen beschreiben den Lernstand'
      }))
    });
    if (!wahl || wahl === klasse.stufe) return false;
    if (klasse.stufe) {
      const anzahl = M.anzahlEinheiten(klasse.id, null);
      const ok = await NB.Dialog.bestaetigen({
        titel: 'Stufe ändern auf ' + stufen[wahl].bezeichnung + '?',
        text: (anzahl ? einheitenText(anzahl) + (anzahl === 1 ? ' bleibt' : ' bleiben') + ' mit den bisherigen Kompetenzen erhalten. ' : '')
          + 'Neue Einheiten nutzen die Kompetenzen der neuen Stufe; nichts wird umgerechnet. Die Fächerauswahl der Klasse bleibt, Fächer außerhalb der neuen Stufe werden ausgeblendet.',
        bestaetigen: 'Stufe ändern'
      });
      if (!ok) return false;
    }
    klasse.stufe = wahl;
    M.klasseSpeichern(klasse);
    M.klassenFaecherFestlegen(klasse);
    NB.App.meldung('Stufe: ' + stufen[wahl].bezeichnung + '.');
    return true;
  };

  /* ---------- Übersicht ---------- */

  function uebersichtRendern(parameter) {
    aktuell = parameter || {};
    const wurzel = H.$('#bildschirm-klasse');
    H.leeren(wurzel);
    const klasse = M.klasse(aktuell.klasseId);
    if (!klasse) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diese Klasse gibt es nicht mehr.' })));
      return;
    }
    const stufe = klasse.stufe ? M.stufe(klasse.stufe) : null;
    const faecher = M.klassenFaecher(klasse);
    const kinder = (klasse.kinder || []).length;
    const liste = H.el('div', { class: 'einst-abschnitte' }, [
      abschnitt('Stufe', stufe ? stufe.bezeichnung + (stufe.benotet ? ' · mit Noten' : ' · ohne Noten') : 'Noch nicht festgelegt – bitte wählen', async function () {
        if (await KV.stufeWaehlen(klasse)) uebersichtRendern(aktuell);
      }),
      abschnitt('Fächer', faecher.length ? faecher.map(f => f.name).join(', ') : 'Noch keine Fächer gewählt', () => KV.faecher(klasse.id)),
      abschnitt('Kinder', kinder === 0 ? 'Noch keine Kinder' : kinder === 1 ? '1 Kind' : kinder + ' Kinder', () => NB.BereichKlassen.kinderVerwalten(klasse.id))
    ]);
    wurzel.appendChild(H.el('div', { class: 'karte-inhalt' }, [
      H.el('h2', { class: 'aw-titel', text: klasse.name }),
      H.el('p', { class: 'text-klein text-schwach', text: klasse.letztesSchuljahr ? 'Zuletzt unterrichtet im Schuljahr ' + klasse.letztesSchuljahr : '' }),
      liste
    ]));
  }

  /* ---------- Fächer der Klasse ---------- */

  function faecherRendern(parameter) {
    aktuell = parameter || {};
    const wurzel = H.$('#bildschirm-klasse-faecher');
    H.leeren(wurzel);
    const klasse = M.klasse(aktuell.klasseId);
    if (!klasse) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diese Klasse gibt es nicht mehr.' })));
      return;
    }
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    inhalt.appendChild(H.el('h2', { class: 'aw-titel', text: klasse.name }));

    if (!klasse.stufe) {
      inhalt.appendChild(H.el('div', { class: 'leer' }, [
        H.el('p', { class: 'leer-titel', text: 'Zuerst die Stufe wählen' }),
        H.el('p', { text: 'Welche Fächer und Kompetenzen gelten, hängt von der Stufe der Klasse ab.' }),
        H.el('button', { type: 'button', class: 'knopf primaer', text: 'Stufe wählen', onclick: async function () {
          if (await KV.stufeWaehlen(klasse)) faecherRendern(aktuell);
        } })
      ]));
      wurzel.appendChild(inhalt);
      return;
    }

    // Ältere Klassen ohne Auswahl bekommen hier ihre Liste (alle aktiven Fächer der Stufe)
    M.klassenFaecherFestlegen(klasse);
    const stufeName = M.stufe(klasse.stufe).kurz;
    const gewaehlt = M.klassenFaecher(klasse);
    const weitere = M.faecherAktiv(klasse.stufe).filter(f => !gewaehlt.some(g => g.id === f.id));
    const nichtVerfuegbar = M.faecherKatalog().filter(f => f.aktiv !== false && !M.fachInStufe(f, klasse.stufe) && M.fachNichtVerfuegbar(f, klasse.stufe));

    function neuRendern() { faecherRendern(aktuell); }

    function kompetenzenText(fach) {
      const alle = M.kompetenzenAlle(fach, klasse.stufe).filter(k => k.aktiv !== false);
      const aktiv = M.kompetenzen(fach, klasse.stufe, klasse).length;
      if (!alle.length) return 'Keine Kompetenzen';
      return aktiv === alle.length ? (alle.length === 1 ? '1 Kompetenz' : alle.length + ' Kompetenzen') : aktiv + ' von ' + alle.length + ' Kompetenzen aktiv';
    }

    // Gewählte Fächer in ihrer Reihenfolge
    const listeGewaehlt = H.el('div', { class: 'einst-liste' });
    if (!gewaehlt.length) listeGewaehlt.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: 'Noch kein Fach gewählt – unten anschalten.' }));
    gewaehlt.forEach(function (fach, i) {
      listeGewaehlt.appendChild(H.el('div', { class: 'einst-eintrag' }, [
        H.el('button', { type: 'button', class: 'einst-eintrag-text', onclick: () => KV.kompetenzen(klasse.id, fach.id) }, [
          H.el('span', { class: 'einst-eintrag-titel', text: fach.name }),
          H.el('span', { class: 'text-klein text-schwach', text: kompetenzenText(fach) })
        ]),
        pfeilKnopf(fach.name + ' nach oben', -1, i > 0, function () { if (M.klasseFachVerschieben(klasse, fach.id, -1)) neuRendern(); }),
        pfeilKnopf(fach.name + ' nach unten', 1, i < gewaehlt.length - 1, function () { if (M.klasseFachVerschieben(klasse, fach.id, 1)) neuRendern(); }),
        H.el('span', { class: 'einst-eintrag-schalter' }, schalter(fach.name + ' in dieser Klasse', true, (an, feld) => fachAbwaehlen(klasse, fach, feld)))
      ]));
    });
    inhalt.appendChild(gruppe('Fächer der Klasse', [listeGewaehlt],
      'Diese Fächer stehen in der Fächerleiste, in dieser Reihenfolge. Ein Tipp auf ein Fach zeigt seine Kompetenzen; einzelne lassen sich für diese Klasse abschalten.'));

    // Weitere aktive Fächer der Stufe
    const listeWeitere = H.el('div', { class: 'einst-liste' });
    if (!weitere.length) listeWeitere.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: 'Alle Fächer der Stufe sind gewählt.' }));
    weitere.forEach(function (fach) {
      listeWeitere.appendChild(H.el('div', { class: 'einst-eintrag ausgeblendet' }, [
        H.el('div', { class: 'einst-eintrag-text' }, [
          H.el('span', { class: 'einst-eintrag-titel', text: fach.name }),
          H.el('span', { class: 'text-klein text-schwach', text: kompetenzenText(fach) + (M.anzahlEinheiten(klasse.id, fach.id) ? ' · ' + einheitenText(M.anzahlEinheiten(klasse.id, fach.id)) + ' vorhanden' : '') })
        ]),
        H.el('span', { class: 'einst-eintrag-schalter' }, schalter(fach.name + ' in dieser Klasse', false, function () {
          M.klasseFachWaehlen(klasse, fach.id, true);
          neuRendern();
        }))
      ]));
    });
    inhalt.appendChild(gruppe('Weitere Fächer ' + stufeName, [listeWeitere],
      nichtVerfuegbar.length ? nichtVerfuegbar.map(f => f.name + ': ' + M.fachNichtVerfuegbar(f, klasse.stufe)).join(' ') : null));

    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Abwählen löscht nichts: Einheiten und Stundenplaneinträge des Fachs bleiben erhalten und erscheinen wieder, sobald das Fach erneut gewählt ist. Neue Fächer legst du unter Einstellungen → Fächer und Kriterien an.' }));
    wurzel.appendChild(inhalt);
  }

  /** Fach aus der Auswahl der Klasse nehmen – mit Rückfrage, wenn Einheiten oder Stundenplaneinträge betroffen sind. */
  async function fachAbwaehlen(klasse, fach, feld) {
    const einheiten = M.anzahlEinheiten(klasse.id, fach.id);
    const stunden = M.anzahlPlanEintraege(klasse, fach.id);
    if (einheiten || stunden) {
      const teile = [];
      if (einheiten) teile.push(einheitenText(einheiten));
      if (stunden) teile.push(stunden === 1 ? '1 Stundenplaneintrag' : stunden + ' Stundenplaneinträge');
      const ok = await NB.Dialog.bestaetigen({
        titel: '„' + fach.name + '“ in der ' + klasse.name + ' abwählen?',
        text: 'Betroffen: ' + teile.join(' und ') + '. Nichts wird gelöscht – das Fach verschwindet aus Fächerleiste und Kalender dieser Klasse und kommt mit allen Daten zurück, sobald es erneut gewählt wird.',
        bestaetigen: 'Abwählen'
      });
      if (!ok) { zuruecksetzen(feld, true); return; }
    }
    M.klasseFachWaehlen(klasse, fach.id, false);
    faecherRendern(aktuell);
  }

  /* ---------- Kompetenzen eines Fachs in der Klasse ---------- */

  function kompetenzenRendern(parameter) {
    aktuellesFach = parameter || {};
    const wurzel = H.$('#bildschirm-klasse-kompetenzen');
    H.leeren(wurzel);
    const klasse = M.klasse(aktuellesFach.klasseId);
    const fach = M.fach(aktuellesFach.fachId);
    if (!klasse || !fach || !klasse.stufe) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Dieses Fach gibt es in der Klasse nicht mehr.' })));
      return;
    }
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    inhalt.appendChild(H.el('h2', { class: 'aw-titel', text: fach.name }));
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: klasse.name + ' · ' + M.stufe(klasse.stufe).bezeichnung }));
    const hinweis = M.fachHinweis(fach, klasse.stufe);
    if (hinweis) inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: hinweis }));

    const abgeschaltet = M.abgeschalteteKompetenzen(klasse, fach.id);
    const kompetenzen = M.kompetenzenAlle(fach, klasse.stufe).filter(k => k.aktiv !== false);
    if (!kompetenzen.length) {
      inhalt.appendChild(gruppe(null, [H.el('p', { class: 'text-schwach einst-leer', text: 'In ' + fach.name + ' gibt es für diese Stufe keine Kompetenzen.' })]));
    }
    M.nachBereich(kompetenzen).forEach(function (g) {
      const liste = H.el('div', { class: 'einst-liste' });
      g.kriterien.forEach(function (k) {
        const aus = abgeschaltet.indexOf(k.id) >= 0;
        liste.appendChild(H.el('div', { class: 'einst-eintrag' + (aus ? ' ausgeblendet' : '') }, [
          H.el('div', { class: 'einst-eintrag-text' }, [
            H.el('span', { class: 'einst-eintrag-titel', text: k.name }),
            aus ? H.el('span', { class: 'text-klein text-schwach', text: 'Abgeschaltet für diese Klasse' }) : null
          ]),
          H.el('span', { class: 'einst-eintrag-schalter' }, schalter(k.name + ' in dieser Klasse', !aus, (an, feld) => kompetenzUmschalten(klasse, fach, k, an, feld)))
        ]));
      });
      inhalt.appendChild(gruppe(g.bereich, [liste]));
    });
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Abgeschaltete Kompetenzen erscheinen in der Erfassung dieser Klasse nicht. Vorhandene Werte bleiben erhalten und zählen weiter in der Auswertung. Texte und Gewichte änderst du unter Einstellungen → Fächer und Kriterien.' }));
    wurzel.appendChild(inhalt);
  }

  /** Kompetenz für die Klasse ab- oder wieder einschalten – Rückfrage, wenn Einheiten Werte enthalten. */
  async function kompetenzUmschalten(klasse, fach, kompetenz, an, feld) {
    if (!an) {
      const anzahl = M.anzahlEinheitenMitKriterien(klasse.id, fach.id, [kompetenz.id]);
      if (anzahl) {
        const ok = await NB.Dialog.bestaetigen({
          titel: '„' + kompetenz.name + '“ abschalten?',
          text: 'In ' + (anzahl === 1 ? '1 Einheit' : anzahl + ' Einheiten') + ' dieser Klasse wurde die Kompetenz bereits bewertet. Die Werte bleiben erhalten und zählen weiter; neue Einheiten zeigen die Kompetenz nicht mehr.',
          bestaetigen: 'Abschalten'
        });
        if (!ok) { zuruecksetzen(feld, true); return; }
      }
    }
    M.kompetenzAbschalten(klasse, fach.id, kompetenz.id, !an);
    kompetenzenRendern(aktuellesFach);
  }

  /* ---------- Registrierung ---------- */

  N.bildschirmRegistrieren('klasse', {
    titel: 'Klasse verwalten',
    zurueck: true,
    zeigen: uebersichtRendern
  });
  N.bildschirmRegistrieren('klasse-faecher', {
    titel: 'Fächer der Klasse',
    zurueck: true,
    zeigen: faecherRendern
  });
  N.bildschirmRegistrieren('klasse-kompetenzen', {
    titel: 'Kompetenzen',
    zurueck: true,
    zeigen: kompetenzenRendern
  });

  return KV;
})();
