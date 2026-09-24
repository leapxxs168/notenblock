/*
 * Notenblock – Klasse verwalten und anlegen
 *
 * Übersicht einer Klasse mit vier Abschnitten: Klasse (Name, Stufe,
 * Schuljahr), Fächer, Stundenplan (NB.KlasseStundenplan), Kinder.
 *
 * Neue Klasse: geführte Anlage in vier Schritten mit Schrittanzeige, Zurück
 * und Weiter – 1 Klasse (Name, Stufe als zwei große Flächen, Schuljahr für
 * die Löschfrist), 2 Fächer, 3 Stundenplan, 4 Schülerliste. Nach Schritt 1
 * ist die Klasse angelegt; die Schritte 2 bis 4 lassen sich überspringen und
 * später als Abschnitte der Klassenverwaltung nachholen. Schritt 2 beginnt
 * ohne vorgewählte Fächer; nur beim Überspringen werden alle aktiven Fächer
 * der Stufe eingetragen.
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
  let anlage = null;        // { klasseId, schritt } der laufenden Klassenanlage

  /* ---------- Öffnen ---------- */

  KV.oeffnen = klasseId => N.bildschirmOeffnen('klasse', { klasseId: klasseId });
  KV.daten = klasseId => N.bildschirmOeffnen('klasse-daten', { klasseId: klasseId });
  KV.faecher = klasseId => N.bildschirmOeffnen('klasse-faecher', { klasseId: klasseId });
  KV.neu = () => { anlage = { klasseId: null, schritt: 1 }; N.bildschirmOeffnen('klasse-neu'); };
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

  /** Zwei große Flächen „Klasse 1 und 2“ und „Klasse 3 und 4“. beiWahl(stufe) wird beim Antippen gerufen. */
  function stufenFlaechen(gewaehlt, beiWahl) {
    const stufen = M.stufen();
    const box = H.el('div', { class: 'stufen-flaechen', role: 'radiogroup', 'aria-label': 'Stufe' });
    M.STUFEN.forEach(function (id) {
      box.appendChild(H.el('button', {
        type: 'button', class: 'stufen-flaeche', role: 'radio', dataset: { stufe: id },
        'aria-checked': gewaehlt === id ? 'true' : 'false',
        onclick: () => beiWahl(id)
      }, [
        H.el('span', { class: 'stufen-flaeche-titel', text: stufen[id].kurz }),
        id === '1-2' ? H.el('span', { class: 'text-klein', text: 'Schuleingangsphase' }) : null,
        H.el('span', { class: 'text-klein', text: stufen[id].benotet ? 'mit Noten' : 'ohne Noten' })
      ]));
    });
    box.markieren = function (id) {
      H.$$('.stufen-flaeche', box).forEach(b => b.setAttribute('aria-checked', b.dataset.stufe === id ? 'true' : 'false'));
    };
    return box;
  }

  /* ---------- Stufe ---------- */

  /** Stufe wählen oder ändern (Auswahldialog); liefert true, wenn sich die Stufe geändert hat. */
  KV.stufeWaehlen = async function (klasse) {
    const stufen = M.stufen();
    const wahl = await NB.Dialog.auswahl({
      titel: klasse.stufe ? 'Stufe der Klasse ' + klasse.name + ' ändern' : 'Stufe der Klasse ' + klasse.name,
      optionen: M.STUFEN.map(s => ({
        text: stufen[s].bezeichnung, wert: s, aktiv: s === klasse.stufe,
        untertitel: stufen[s].benotet ? 'Mit Noten' : 'Ohne Noten – Stufen beschreiben den Lernstand'
      }))
    });
    return KV.stufeSetzen(klasse, wahl);
  };

  /** Stufe setzen – bei einer Änderung mit Rückfrage; liefert true, wenn sich die Stufe geändert hat. */
  KV.stufeSetzen = async function (klasse, wahl) {
    const stufen = M.stufen();
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
    const plan = NB.Stundenplan.klassenplan(klasse);
    const eigene = plan.filter(e => e.art !== 'fremd').length;
    const fremde = plan.length - eigene;
    const planText = !plan.length ? 'Noch kein Stundenplan'
      : (eigene === 1 ? '1 eigene Stunde' : eigene + ' eigene Stunden') + (fremde ? ', ' + (fremde === 1 ? '1 fremde' : fremde + ' fremde') : '');
    const liste = H.el('div', { class: 'einst-abschnitte' }, [
      abschnitt('Klasse', [stufe ? stufe.bezeichnung : 'Stufe noch nicht festgelegt', klasse.letztesSchuljahr ? 'Schuljahr ' + klasse.letztesSchuljahr : null].filter(Boolean).join(' · '), () => KV.daten(klasse.id)),
      abschnitt('Fächer', faecher.length ? faecher.map(f => f.name).join(', ') : 'Noch keine Fächer gewählt', () => KV.faecher(klasse.id)),
      abschnitt('Stundenplan', planText, () => NB.KlasseStundenplan.oeffnen(klasse.id)),
      abschnitt('Kinder', kinder === 0 ? 'Noch keine Kinder' : kinder === 1 ? '1 Kind' : kinder + ' Kinder', () => NB.BereichKlassen.kinderVerwalten(klasse.id))
    ]);
    wurzel.appendChild(H.el('div', { class: 'karte-inhalt' }, [
      H.el('h2', { class: 'aw-titel', text: klasse.name }),
      liste
    ]));
  }

  /* ---------- Abschnitt Klasse: Name, Stufe, Schuljahr ---------- */

  /** Felder für Name, Stufe und Schuljahr in einen Container einfügen (Klassenverwaltung und Schritt 1 der Anlage). */
  function klassenFelderEinfuegen(container, werte, optionen) {
    optionen = optionen || {};
    const nameFeld = H.el('input', { type: 'text', value: werte.name || '', autocomplete: 'off', placeholder: 'zum Beispiel 3a', 'aria-label': 'Klassenname' });
    nameFeld.addEventListener('input', () => { werte.name = nameFeld.value; if (optionen.beiAenderung) optionen.beiAenderung('name'); });
    const schuljahrFeld = H.el('input', { type: 'text', value: werte.letztesSchuljahr || '', autocomplete: 'off', placeholder: NB.Startdaten.aktuellesSchuljahr(), 'aria-label': 'Schuljahr' });
    schuljahrFeld.addEventListener('input', () => { werte.letztesSchuljahr = schuljahrFeld.value; if (optionen.beiAenderung) optionen.beiAenderung('letztesSchuljahr'); });
    const flaechen = stufenFlaechen(werte.stufe, async function (id) {
      const geaendert = optionen.beiStufe ? await optionen.beiStufe(id) : (werte.stufe = id, true);
      if (geaendert !== false) flaechen.markieren(werte.stufe);
    });
    container.appendChild(H.el('div', { class: 'einst-karte' }, [
      H.el('label', { class: 'einst-zeile einst-zeile-feld' }, [
        H.el('div', { class: 'einst-text' }, H.el('span', { class: 'einst-label', text: 'Klassenname' })),
        H.el('div', { class: 'einst-steuerung' }, nameFeld)
      ]),
      H.el('div', { class: 'einst-zeile einst-zeile-feld' }, [
        H.el('div', { class: 'einst-text' }, [
          H.el('div', { class: 'einst-label', text: 'Stufe' }),
          H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Bestimmt Fächer und Kompetenzen. In Klasse 1 und 2 gibt es keine Noten, sondern Stufen.' })
        ]),
        H.el('div', { class: 'einst-steuerung' }, flaechen)
      ]),
      H.el('label', { class: 'einst-zeile einst-zeile-feld' }, [
        H.el('div', { class: 'einst-text' }, [
          H.el('span', { class: 'einst-label', text: 'Zuletzt unterrichtet im Schuljahr' }),
          H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Dient der Löschfrist: Ein Jahr nach Ende des Kalenderjahres, in dem der Unterricht endete, erinnert Notenblock an das Löschen.' })
        ]),
        H.el('div', { class: 'einst-steuerung' }, schuljahrFeld)
      ])
    ]));
    return { nameFeld: nameFeld, schuljahrFeld: schuljahrFeld, flaechen: flaechen };
  }

  function datenRendern(parameter) {
    aktuell = parameter || {};
    const wurzel = H.$('#bildschirm-klasse-daten');
    H.leeren(wurzel);
    const klasse = M.klasse(aktuell.klasseId);
    if (!klasse) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diese Klasse gibt es nicht mehr.' })));
      return;
    }
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    const fehler = H.el('p', { class: 'fehler', role: 'alert', hidden: true });
    const werte = { name: klasse.name, stufe: klasse.stufe, letztesSchuljahr: klasse.letztesSchuljahr || '' };
    const speichern = H.entprellen(function () {
      const name = (werte.name || '').trim();
      if (!name) { fehler.textContent = 'Der Klassenname darf nicht leer sein.'; fehler.hidden = false; return; }
      fehler.hidden = true;
      klasse.name = name;
      klasse.letztesSchuljahr = (werte.letztesSchuljahr || '').trim();
      M.klasseSpeichern(klasse);
      N.kopfAktualisieren();
    }, 400);
    klassenFelderEinfuegen(inhalt, werte, {
      beiAenderung: speichern,
      beiStufe: async function (id) {
        const geaendert = await KV.stufeSetzen(klasse, id);
        if (geaendert) werte.stufe = id;
        return geaendert;
      }
    });
    inhalt.appendChild(fehler);
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach einst-gruppe-hinweis', text: 'Änderungen werden sofort gespeichert. Beim Aufrücken die Stufe ändern: bisherige Einheiten bleiben mit ihren Kompetenzen erhalten, neue nutzen die neue Stufe.' }));
    wurzel.appendChild(inhalt);
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
    faecherEinfuegen(klasse, inhalt, () => faecherRendern(aktuell));
    wurzel.appendChild(inhalt);
  }

  /** Fächerauswahl der Klasse in einen Container einfügen (Bildschirm und Schritt 2 der Anlage). */
  function faecherEinfuegen(klasse, inhalt, neuRendern) {
    if (!klasse.stufe) {
      inhalt.appendChild(H.el('div', { class: 'leer' }, [
        H.el('p', { class: 'leer-titel', text: 'Zuerst die Stufe wählen' }),
        H.el('p', { text: 'Welche Fächer und Kompetenzen gelten, hängt von der Stufe der Klasse ab.' }),
        H.el('button', { type: 'button', class: 'knopf primaer', text: 'Stufe wählen', onclick: async function () {
          if (await KV.stufeWaehlen(klasse)) neuRendern();
        } })
      ]));
      return;
    }

    // Ältere Klassen ohne Auswahl bekommen hier ihre Liste (alle aktiven Fächer der Stufe)
    M.klassenFaecherFestlegen(klasse);
    const stufeName = M.stufe(klasse.stufe).kurz;
    const gewaehlt = M.klassenFaecher(klasse);
    const weitere = M.faecherAktiv(klasse.stufe).filter(f => !gewaehlt.some(g => g.id === f.id));
    const nichtVerfuegbar = M.faecherKatalog().filter(f => f.aktiv !== false && !M.fachInStufe(f, klasse.stufe) && M.fachNichtVerfuegbar(f, klasse.stufe));

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
        H.el('span', { class: 'einst-eintrag-schalter' }, schalter(fach.name + ' in dieser Klasse', true, (an, feld) => fachAbwaehlen(klasse, fach, feld, neuRendern)))
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
  }

  /** Fach aus der Auswahl der Klasse nehmen – mit Rückfrage, wenn Einheiten oder Stundenplaneinträge betroffen sind. */
  async function fachAbwaehlen(klasse, fach, feld, neuRendern) {
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
    neuRendern();
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

  /* ---------- Neue Klasse in vier Schritten ---------- */

  const SCHRITTE = ['Klasse', 'Fächer', 'Stundenplan', 'Kinder'];

  function schrittAnzeige(schritt) {
    return H.el('div', { class: 'anlage-schritte', role: 'list', 'aria-label': 'Schritte' }, SCHRITTE.map((name, i) => H.el('div', {
      class: 'anlage-schritt' + (i + 1 === schritt ? ' aktuell' : i + 1 < schritt ? ' erledigt' : ''), role: 'listitem',
      'aria-current': i + 1 === schritt ? 'step' : null
    }, [H.el('span', { class: 'anlage-schritt-nummer', text: String(i + 1) }), H.el('span', { class: 'anlage-schritt-name', text: name })])));
  }

  function anlageRendern() {
    if (!anlage) anlage = { klasseId: null, schritt: 1 };
    const wurzel = H.$('#bildschirm-klasse-neu');
    H.leeren(wurzel);
    const klasse = anlage.klasseId ? M.klasse(anlage.klasseId) : null;
    if (anlage.schritt > 1 && !klasse) { anlage = { klasseId: null, schritt: 1 }; }
    const inhalt = H.el('div', { class: 'karte-inhalt einst anlage' });
    inhalt.appendChild(schrittAnzeige(anlage.schritt));
    inhalt.appendChild(H.el('h2', { class: 'aw-titel', text: 'Schritt ' + anlage.schritt + ' von 4 · ' + SCHRITTE[anlage.schritt - 1] }));
    const fehler = H.el('p', { class: 'fehler', role: 'alert', hidden: true });

    function knoepfe(weiterText, beiWeiter, ueberspringbar) {
      return H.el('div', { class: 'knopfzeile anlage-knoepfe' }, [
        anlage.schritt > 1 ? H.el('button', { type: 'button', class: 'knopf', text: 'Zurück', onclick: () => { anlage.schritt--; anlageRendern(); H.$('#inhalt').scrollTop = 0; } }) : null,
        ueberspringbar ? H.el('button', { type: 'button', class: 'knopf', text: 'Überspringen', onclick: () => (typeof ueberspringbar === 'function' ? ueberspringbar() : weiterGehen()) }) : null,
        H.el('button', { type: 'button', class: 'knopf primaer', text: weiterText, onclick: beiWeiter })
      ]);
    }

    function weiterGehen() {
      if (anlage.schritt < 4) { anlage.schritt++; anlageRendern(); H.$('#inhalt').scrollTop = 0; return; }
      const k = M.klasse(anlage.klasseId);
      anlage = null;
      NB.App.meldung('Klasse „' + (k ? k.name : '') + '“ angelegt.');
      N.zurueck();
    }

    if (anlage.schritt === 1) {
      const werte = klasse ? { name: klasse.name, stufe: klasse.stufe, letztesSchuljahr: klasse.letztesSchuljahr || '' } : { name: '', stufe: null, letztesSchuljahr: NB.Startdaten.aktuellesSchuljahr() };
      const felder = klassenFelderEinfuegen(inhalt, werte, {
        beiStufe: async function (id) {
          if (klasse && klasse.stufe && klasse.stufe !== id) {
            const geaendert = await KV.stufeSetzen(klasse, id);
            if (geaendert) werte.stufe = id;
            return geaendert;
          }
          werte.stufe = id;
          return true;
        }
      });
      inhalt.appendChild(fehler);
      inhalt.appendChild(knoepfe('Weiter', function () {
        const name = werte.name.trim();
        if (!name) { fehler.textContent = 'Bitte einen Klassennamen eintragen.'; fehler.hidden = false; felder.nameFeld.focus(); return; }
        if (!werte.stufe) { fehler.textContent = 'Bitte die Stufe wählen.'; fehler.hidden = false; return; }
        if (klasse) {
          klasse.name = name;
          klasse.letztesSchuljahr = werte.letztesSchuljahr.trim();
          if (!klasse.stufe) klasse.stufe = werte.stufe;
          M.klasseSpeichern(klasse);
        } else {
          // Ohne vorgewählte Fächer: Schritt 2 beginnt leer
          const neu = NB.Startdaten.leereKlasse(name, werte.stufe);
          neu.letztesSchuljahr = werte.letztesSchuljahr.trim();
          neu.farbe = M.freieFarbe(M.klassen().map(k => k.farbe).filter(Boolean));
          M.klasseSpeichern(neu);
          M.klassenFaecherLeerFestlegen(neu);
          anlage.klasseId = neu.id;
        }
        weiterGehen();
      }, false));
      if (!klasse) setTimeout(() => felder.nameFeld.focus(), 50);
    } else if (anlage.schritt === 2) {
      inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Welche Fächer unterrichtest du in dieser Klasse? Unten anschalten und die Reihenfolge festlegen. „Überspringen“ trägt alle aktiven Fächer der Stufe ein.' }));
      faecherEinfuegen(klasse, inhalt, anlageRendern);
      // Überspringen: nur bei leerer Auswahl alle aktiven Fächer der Stufe eintragen
      inhalt.appendChild(knoepfe('Weiter', weiterGehen, function () {
        if (!M.klassenFaecher(klasse).length) {
          klasse.faecher = M.faecherAktiv(klasse.stufe).map(f => ({ fachId: f.id, abgeschaltet: [] }));
          klasse.faecherFestgelegt = true;
          M.klasseSpeichern(klasse);
        }
        weiterGehen();
      }));
    } else if (anlage.schritt === 3) {
      inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Eigene Stunden (Fach, Raum, Turnus) und fremde Stunden anderer Lehrkräfte. Lässt sich jederzeit unter „Klasse verwalten“ ergänzen.' }));
      NB.KlasseStundenplan.rasterEinfuegen(klasse, inhalt, anlageRendern);
      inhalt.appendChild(knoepfe('Weiter', weiterGehen, true));
    } else {
      const B = NB.BereichKlassen;
      const listeFeld = H.el('textarea', { rows: 10, autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', placeholder: B.nurKuerzel() ? 'MM07' : 'Mustermann, Max | MM07', 'aria-label': 'Kinder' });
      listeFeld.value = B.kinderZuText(klasse.kinder);
      inhalt.appendChild(H.el('div', { class: 'einst-karte' }, H.el('label', { class: 'einst-zeile einst-zeile-feld' }, [
        H.el('div', { class: 'einst-text' }, H.el('span', { class: 'einst-label', text: 'Kinder' })),
        H.el('div', { class: 'einst-steuerung' }, listeFeld)
      ])));
      inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: B.hinweisText() }));
      inhalt.appendChild(fehler);
      inhalt.appendChild(knoepfe('Fertig', async function () {
        fehler.hidden = true;
        const ergebnis = await B.listeUebernehmen(klasse, listeFeld.value);
        if (ergebnis === true) { weiterGehen(); return; }
        if (typeof ergebnis === 'string') { fehler.textContent = ergebnis; fehler.hidden = false; listeFeld.focus(); }
      }, true));
    }
    wurzel.appendChild(inhalt);
  }

  /* ---------- Registrierung ---------- */

  N.bildschirmRegistrieren('klasse-daten', {
    titel: () => { const k = aktuell && M.klasse(aktuell.klasseId); return k ? k.name : 'Klasse'; },
    zurueck: true,
    zeigen: datenRendern
  });
  N.bildschirmRegistrieren('klasse-neu', {
    titel: 'Neue Klasse',
    zurueck: true,
    zeigen: anlageRendern
  });

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
