/*
 * Notenblock – Einstellungen: Stundenplan
 *
 * Abschnitt „Stundenplan“ der Einstellungen: Stunden je Wochentag (Klasse,
 * Fach, Raum, Turnus), Uhrzeiten je Stundennummer, Schuljahreszeitraum,
 * Ferien, Feiertage, einzelne Ausfalltermine und Zusatztermine.
 * Datumsangaben ausschließlich über den Monatskalender.
 */
'use strict';
NB.EinstellungenStundenplan = (function () {
  const ES = {};
  const H = NB.Hilfen;
  const M = NB.Modell;
  const N = NB.Navigation;
  const SP = NB.Stundenplan;

  let stundeParameter = null;   // Parameter des Stundeneditors (für den Titel)

  /* ---------- Bausteine ---------- */

  function gruppe(titel, kinder, hinweis) {
    return H.el('section', { class: 'einst-gruppe' }, [
      H.el('h2', { class: 'einst-gruppe-titel', text: titel }),
      H.el('div', { class: 'einst-karte' }, kinder),
      hinweis ? H.el('p', { class: 'text-klein text-schwach einst-hinweis', text: hinweis }) : null
    ]);
  }

  function eintrag(titel, untertitel, beiTipp, beiLoeschen) {
    const text = [
      H.el('span', { class: 'einst-eintrag-titel', text: titel }),
      untertitel ? H.el('span', { class: 'text-klein text-schwach', text: untertitel }) : null
    ];
    return H.el('div', { class: 'einst-eintrag' }, [
      beiTipp
        ? H.el('button', { type: 'button', class: 'einst-eintrag-text', onclick: beiTipp }, text)
        : H.el('div', { class: 'einst-eintrag-text' }, text),
      beiLoeschen ? H.el('button', { type: 'button', class: 'symbolknopf klein gefaehrlich', 'aria-label': titel + ' entfernen', onclick: beiLoeschen },
        H.el('span', { 'aria-hidden': 'true', text: '×' })) : null
    ]);
  }

  /** Knopf, der ein Datum zeigt und den Monatskalender öffnet. */
  function datumKnopf(wert, leerText, beiAuswahl, label) {
    const knopf = H.el('button', { type: 'button', class: 'knopf datumknopf', 'aria-label': label || 'Datum wählen' },
      H.el('span', { text: wert ? H.datumMitWochentag(wert) : leerText }));
    knopf.addEventListener('click', function () {
      NB.Kalender.oeffnen({
        datum: wert || H.heute(),
        markierungen: (jahr, monat) => SP.kalenderMarkierungen(jahr, monat),
        beiAuswahl: function (iso) {
          wert = iso;
          knopf.firstChild.textContent = H.datumMitWochentag(iso);
          beiAuswahl(iso);
        }
      });
    });
    /** Wert von außen setzen (etwa das Ende auf den Beginn vorbelegen). */
    knopf.setzen = function (iso) {
      wert = iso;
      knopf.firstChild.textContent = iso ? H.datumMitWochentag(iso) : leerText;
    };
    return knopf;
  }

  function klassenName(id) { const k = M.klasse(id); return k ? k.name : 'Klasse fehlt'; }
  function fachName(id) { const f = M.fach(id); return f ? f.name : 'Fach fehlt'; }

  function stundenText(s) {
    const zeit = SP.uhrzeitText(s.stunde);
    return s.stunde + '. Stunde' + (zeit ? ' · ' + zeit : '');
  }

  function neuZeichnen() {
    NB.Einstellungen.neuZeichnen();
  }

  /* ---------- Abschnitt ---------- */

  ES.rendern = function (inhalt) {
    const klassen = M.klassen();
    const faecher = M.faecher();
    if (!klassen.length || !faecher.length) {
      inhalt.appendChild(H.el('p', { class: 'fehler', text: 'Für Stundenplaneinträge werden mindestens eine Klasse und ein Fach benötigt.' }));
    }
    wochentageRendern(inhalt);
    uhrzeitenRendern(inhalt);
    schuljahrRendern(inhalt);
    ferienRendern(inhalt);
    feiertageRendern(inhalt);
    ausfallRendern(inhalt);
    zusatzRendern(inhalt);
  };

  /* Wochentage mit Stunden */
  function wochentageRendern(inhalt) {
    const eintraege = SP.eintraege();
    for (let wt = 1; wt <= 7; wt++) {
      const amTag = eintraege.filter(e => Number(e.wochentag) === wt).sort((a, b) => a.stunde - b.stunde);
      if (wt >= 6 && amTag.length === 0) continue; // Wochenende nur zeigen, wenn belegt
      const zeilen = amTag.map(e => eintrag(
        stundenText(e),
        klassenName(e.klasseId) + ' · ' + fachName(e.fachId) + (e.raum ? ' · ' + SP.raumText(e.raum) : '') + (e.turnus && e.turnus !== 'jede' ? ' · ' + SP.turnusText(e.turnus) : ''),
        () => N.bildschirmOeffnen('einstellungen-stunde', { id: e.id }),
        () => stundeEntfernen(e)
      ));
      zeilen.push(H.el('div', { class: 'einst-eintrag' }, H.el('button', {
        type: 'button', class: 'einst-eintrag-text einst-hinzu', text: '+ Stunde am ' + H.WOCHENTAGE[wt - 1],
        onclick: () => N.bildschirmOeffnen('einstellungen-stunde', { wochentag: wt })
      })));
      inhalt.appendChild(gruppe(H.WOCHENTAGE[wt - 1], zeilen));
    }
    if (!eintraege.some(e => Number(e.wochentag) >= 6)) {
      inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach einst-hinweis' }, [
        'Samstag und Sonntag: ',
        H.el('button', { type: 'button', class: 'textknopf klein', text: 'Stunde am Samstag', onclick: () => N.bildschirmOeffnen('einstellungen-stunde', { wochentag: 6 }) }),
        ' · ',
        H.el('button', { type: 'button', class: 'textknopf klein', text: 'Stunde am Sonntag', onclick: () => N.bildschirmOeffnen('einstellungen-stunde', { wochentag: 7 }) })
      ]));
    }
  }

  async function stundeEntfernen(e) {
    const ok = await NB.Dialog.bestaetigen({
      titel: 'Stunde entfernen?',
      text: H.WOCHENTAGE[Number(e.wochentag) - 1] + ', ' + e.stunde + '. Stunde: ' + klassenName(e.klasseId) + ' · ' + fachName(e.fachId) + '. Bereits erfasste Bewertungen bleiben erhalten.',
      bestaetigen: 'Entfernen',
      gefaehrlich: true
    });
    if (!ok) return;
    const klasse = M.klasse(e.klasseId);
    if (klasse) SP.eintragEntfernen(klasse, e.id);
    neuZeichnen();
  }

  /* Uhrzeiten je Stundennummer */
  function uhrzeitenRendern(inhalt) {
    const zeiten = SP.stundenzeiten();
    const max = Math.max(8, SP.maxStunde());
    const zeilen = [];
    for (let s = 1; s <= max; s++) {
      const z = zeiten[String(s)] || { von: '', bis: '' };
      const von = H.el('input', { type: 'time', value: z.von || '', 'aria-label': s + '. Stunde von' });
      const bis = H.el('input', { type: 'time', value: z.bis || '', 'aria-label': s + '. Stunde bis' });
      const speichern = function () {
        const aktuell = SP.stundenzeiten();
        if (von.value || bis.value) aktuell[String(s)] = { von: von.value, bis: bis.value };
        else delete aktuell[String(s)];
        SP.stundenzeitenSpeichern(aktuell);
      };
      von.addEventListener('change', speichern);
      bis.addEventListener('change', speichern);
      zeilen.push(H.el('div', { class: 'einst-zeile einst-zeit' }, [
        H.el('div', { class: 'einst-text' }, H.el('div', { class: 'einst-label', text: s + '. Stunde' })),
        H.el('div', { class: 'einst-steuerung einst-zeitfelder' }, [von, H.el('span', { 'aria-hidden': 'true', text: '–' }), bis])
      ]));
    }
    inhalt.appendChild(gruppe('Uhrzeiten', zeilen, 'Die Uhrzeiten erscheinen in der Tagesansicht des Kalenders. Leer lassen, wenn sie nicht gebraucht werden.'));
  }

  /* Schuljahr und Ankerwoche */
  function schuljahrRendern(inhalt) {
    const sj = SP.schuljahr();
    const von = datumKnopf(sj.von, 'Beginn wählen', function (iso) { const s = SP.schuljahr(); s.von = iso; SP.schuljahrSpeichern(s); }, 'Schuljahresbeginn');
    const bis = datumKnopf(sj.bis, 'Ende wählen', function (iso) { const s = SP.schuljahr(); s.bis = iso; SP.schuljahrSpeichern(s); }, 'Schuljahresende');
    const anker = datumKnopf(sj.ankerwocheA, 'Erste Schulwoche (automatisch)', function (iso) {
      const s = SP.schuljahr();
      s.ankerwocheA = SP.montag(iso);
      SP.schuljahrSpeichern(s);
      neuZeichnen();
    }, 'Beginn einer A-Woche');
    const ankerZurueck = sj.ankerwocheA ? H.el('button', { type: 'button', class: 'textknopf klein', text: 'Zurücksetzen', onclick: function () {
      const s = SP.schuljahr(); s.ankerwocheA = null; SP.schuljahrSpeichern(s); neuZeichnen();
    } }) : null;
    inhalt.appendChild(gruppe('Schuljahr', [
      H.el('div', { class: 'einst-zeile einst-zeile-feld' }, [
        H.el('div', { class: 'einst-text' }, H.el('div', { class: 'einst-label', text: 'Zeitraum' })),
        H.el('div', { class: 'einst-steuerung einst-datumspaar' }, [von, H.el('span', { class: 'text-schwach', text: 'bis' }), bis])
      ]),
      H.el('div', { class: 'einst-zeile einst-zeile-feld' }, [
        H.el('div', { class: 'einst-text' }, [
          H.el('div', { class: 'einst-label', text: 'A-Woche beginnt am' }),
          H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Nur für Stunden mit Turnus A oder B. Ab dieser Woche wechseln sich A und B ab; gewählt wird der Montag der Woche. Aktuell ist die ' + SP.wochenTyp(H.heute()) + '-Woche.' })
        ]),
        H.el('div', { class: 'einst-steuerung einst-datumspaar' }, [anker, ankerZurueck])
      ])
    ]));
  }

  /* Ferien */
  function ferienRendern(inhalt) {
    const sj = SP.schuljahr();
    const zeilen = sj.ferien.slice().sort((a, b) => (a.von < b.von ? -1 : 1)).map(f => eintrag(
      f.name || 'Ferien', H.datumKurz(f.von) + ' – ' + H.datumKurz(f.bis), null,
      function () { const s = SP.schuljahr(); s.ferien = s.ferien.filter(x => x.id !== f.id); SP.schuljahrSpeichern(s); neuZeichnen(); }
    ));
    // Eingabezeile
    const neu = { name: '', von: null, bis: null };
    const nameFeld = H.el('input', { type: 'text', placeholder: 'zum Beispiel Herbstferien', autocomplete: 'off', 'aria-label': 'Name der Ferien' });
    nameFeld.addEventListener('input', () => { neu.name = nameFeld.value; });
    const vonKnopf = datumKnopf(null, 'Von', iso => { neu.von = iso; if (!neu.bis || neu.bis < iso) { neu.bis = iso; bisKnopf.setzen(iso); } }, 'Ferienbeginn');
    const bisKnopf = datumKnopf(null, 'Bis', iso => { neu.bis = iso; }, 'Ferienende');
    const fehler = H.el('p', { class: 'fehler', hidden: true });
    const hinzu = H.el('button', { type: 'button', class: 'knopf primaer', text: 'Ferien hinzufügen', onclick: function () {
      if (!neu.von || !neu.bis) { fehler.textContent = 'Bitte Beginn und Ende wählen.'; fehler.hidden = false; return; }
      if (neu.bis < neu.von) { fehler.textContent = 'Das Ende liegt vor dem Beginn.'; fehler.hidden = false; return; }
      const s = SP.schuljahr();
      s.ferien.push({ id: H.neueId(), name: nameFeld.value.trim(), von: neu.von, bis: neu.bis });
      SP.schuljahrSpeichern(s);
      neuZeichnen();
    } });
    zeilen.push(H.el('div', { class: 'einst-zeile einst-zeile-feld einst-formular' }, [
      H.el('div', { class: 'einst-text' }, H.el('div', { class: 'einst-label', text: 'Ferien hinzufügen' })),
      H.el('div', { class: 'einst-steuerung einst-formular-felder' }, [nameFeld, H.el('div', { class: 'einst-datumspaar' }, [vonKnopf, H.el('span', { class: 'text-schwach', text: 'bis' }), bisKnopf]), fehler, hinzu])
    ]));
    inhalt.appendChild(gruppe('Ferien', zeilen));
  }

  /* Feiertage */
  function feiertageRendern(inhalt) {
    const sj = SP.schuljahr();
    const zeilen = sj.feiertage.slice().sort((a, b) => (a.datum < b.datum ? -1 : 1)).map(f => eintrag(
      H.datumMitWochentag(f.datum), f.name || 'Feiertag', null,
      function () { const s = SP.schuljahr(); s.feiertage = s.feiertage.filter(x => x.id !== f.id); SP.schuljahrSpeichern(s); neuZeichnen(); }
    ));
    const neu = { datum: null };
    const nameFeld = H.el('input', { type: 'text', placeholder: 'zum Beispiel Tag der Deutschen Einheit', autocomplete: 'off', 'aria-label': 'Name des Feiertags' });
    const datum = datumKnopf(null, 'Datum wählen', iso => { neu.datum = iso; }, 'Feiertag');
    const fehler = H.el('p', { class: 'fehler', hidden: true });
    const hinzu = H.el('button', { type: 'button', class: 'knopf primaer', text: 'Feiertag hinzufügen', onclick: function () {
      if (!neu.datum) { fehler.textContent = 'Bitte ein Datum wählen.'; fehler.hidden = false; return; }
      const s = SP.schuljahr();
      s.feiertage.push({ id: H.neueId(), datum: neu.datum, name: nameFeld.value.trim() });
      SP.schuljahrSpeichern(s);
      neuZeichnen();
    } });
    zeilen.push(H.el('div', { class: 'einst-zeile einst-zeile-feld einst-formular' }, [
      H.el('div', { class: 'einst-text' }, H.el('div', { class: 'einst-label', text: 'Feiertag hinzufügen' })),
      H.el('div', { class: 'einst-steuerung einst-formular-felder' }, [nameFeld, datum, fehler, hinzu])
    ]));
    inhalt.appendChild(gruppe('Feiertage', zeilen));
  }

  /* Ausfalltermine: ganzer Tag oder eine einzelne Stunde */
  function ausfallText(a) {
    if (!a.stunde) return 'Ganzer Tag';
    return a.stunde + '. Stunde';
  }

  function klassenAuswahl(label) {
    const feld = H.el('select', { 'aria-label': label });
    M.klassen().forEach(k => feld.appendChild(H.el('option', { value: k.id, text: k.name })));
    return feld;
  }

  function ausfallRendern(inhalt) {
    const klassen = M.klassen();
    const alle = [];
    klassen.forEach(k => (k.ausnahmen || []).forEach(a => alle.push({ klasse: k, a: a })));
    const zeilen = alle.sort((x, y) => (x.a.datum < y.a.datum ? -1 : 1)).map(x => eintrag(
      H.datumMitWochentag(x.a.datum) + ' · ' + x.klasse.name, ausfallText(x.a) + (x.a.grund ? ' · ' + x.a.grund : ''), null,
      function () { x.klasse.ausnahmen = (x.klasse.ausnahmen || []).filter(y => y.id !== x.a.id); M.klasseSpeichern(x.klasse); neuZeichnen(); }
    ));
    const neu = { datum: null };
    const klasseFeld = klassenAuswahl('Klasse');
    const umfang = H.el('select', { 'aria-label': 'Was fällt aus', hidden: true });
    function umfangFuellen() {
      H.leeren(umfang);
      umfang.appendChild(H.el('option', { value: 'tag', text: 'Ganzer Tag' }));
      const k = M.klasse(klasseFeld.value);
      if (k && neu.datum) SP.klassenStundenAmTag(k, neu.datum).forEach(function (s) {
        umfang.appendChild(H.el('option', { value: String(s.stunde), text: s.stunde + '. Stunde · ' + (s.art === 'fremd' ? (s.bezeichnung || 'fremde Stunde') : fachName(s.fachId)) }));
      });
      umfang.hidden = !neu.datum;
    }
    klasseFeld.addEventListener('change', umfangFuellen);
    const datum = datumKnopf(null, 'Datum wählen', iso => { neu.datum = iso; umfangFuellen(); }, 'Ausfalltermin');
    const grundFeld = H.el('input', { type: 'text', placeholder: 'Grund (optional), zum Beispiel Wandertag', autocomplete: 'off', 'aria-label': 'Grund' });
    const fehler = H.el('p', { class: 'fehler', hidden: true });
    const hinzu = H.el('button', { type: 'button', class: 'knopf primaer', text: 'Ausfall hinzufügen', onclick: function () {
      const k = M.klasse(klasseFeld.value);
      if (!k) { fehler.textContent = 'Bitte eine Klasse wählen.'; fehler.hidden = false; return; }
      if (!neu.datum) { fehler.textContent = 'Bitte ein Datum wählen.'; fehler.hidden = false; return; }
      const a = { id: H.neueId(), datum: neu.datum, stunde: (umfang.value && umfang.value !== 'tag') ? Number(umfang.value) : null, grund: grundFeld.value.trim() };
      if (!Array.isArray(k.ausnahmen)) k.ausnahmen = [];
      k.ausnahmen.push(a);
      M.klasseSpeichern(k);
      neuZeichnen();
    } });
    zeilen.push(H.el('div', { class: 'einst-zeile einst-zeile-feld einst-formular' }, [
      H.el('div', { class: 'einst-text' }, [
        H.el('div', { class: 'einst-label', text: 'Ausfall hinzufügen' }),
        H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Je Klasse: ein ganzer Tag (etwa Wandertag) oder eine einzelne Stunde dieses Tages.' })
      ]),
      H.el('div', { class: 'einst-steuerung einst-formular-felder' }, [klasseFeld, datum, umfang, grundFeld, fehler, hinzu])
    ]));
    inhalt.appendChild(gruppe('Ausfalltermine', zeilen));
  }

  /* Zusatztermine */
  function zusatzRendern(inhalt) {
    const alle = [];
    M.klassen().forEach(k => (k.zusatz || []).forEach(z => alle.push({ klasse: k, z: z })));
    const zeilen = alle.sort((x, y) => (x.z.datum < y.z.datum ? -1 : x.z.datum > y.z.datum ? 1 : x.z.stunde - y.z.stunde)).map(x => eintrag(
      H.datumMitWochentag(x.z.datum) + ' · ' + x.z.stunde + '. Stunde',
      x.klasse.name + ' · ' + fachName(x.z.fachId) + (x.z.raum ? ' · ' + SP.raumText(x.z.raum) : ''),
      () => N.bildschirmOeffnen('einstellungen-stunde', { zusatzId: x.z.id, klasseId: x.klasse.id }),
      function () { x.klasse.zusatz = (x.klasse.zusatz || []).filter(y => y.id !== x.z.id); M.klasseSpeichern(x.klasse); neuZeichnen(); }
    ));
    zeilen.push(H.el('div', { class: 'einst-eintrag' }, H.el('button', {
      type: 'button', class: 'einst-eintrag-text einst-hinzu', text: '+ Zusatztermin',
      onclick: () => N.bildschirmOeffnen('einstellungen-stunde', { zusatz: true })
    })));
    inhalt.appendChild(gruppe('Zusatztermine', zeilen, 'Eine zusätzliche Stunde an einem bestimmten Tag, etwa eine Vertretung oder eine verlegte Stunde. Zusatztermine gelten immer als Unterrichtstag.'));
  }

  /* ---------- Stundeneditor (Plan-Eintrag oder Zusatztermin) ---------- */

  function stundeRendern(parameter) {
    stundeParameter = parameter || {};
    const wurzel = H.$('#bildschirm-einstellungen-stunde');
    H.leeren(wurzel);
    const istZusatz = !!(stundeParameter.zusatz || stundeParameter.zusatzId);
    const sj = SP.schuljahr();
    let vorlage = null;
    let vorlageKlasse = null;
    if (stundeParameter.id) {
      M.klassen().forEach(function (k) {
        const e = SP.klassenplan(k).find(x => x.id === stundeParameter.id);
        if (e) { vorlage = Object.assign({}, e, { klasseId: k.id }); vorlageKlasse = k; }
      });
    }
    if (stundeParameter.zusatzId) {
      const k = M.klasse(stundeParameter.klasseId);
      const z = k ? (k.zusatz || []).find(x => x.id === stundeParameter.zusatzId) : null;
      if (z) { vorlage = Object.assign({}, z, { klasseId: k.id }); vorlageKlasse = k; }
    }

    const klassen = M.klassen();
    const startKlasse = M.klasse((vorlage && vorlage.klasseId) || stundeParameter.klasseId) || klassen[0] || null;
    let faecher = startKlasse ? M.klassenFaecher(startKlasse) : M.faecher();
    if (!faecher.length) faecher = M.faecher();
    const werte = {
      wochentag: vorlage && vorlage.wochentag ? Number(vorlage.wochentag) : (stundeParameter.wochentag || 1),
      datum: vorlage && vorlage.datum ? vorlage.datum : (stundeParameter.datum || null),
      stunde: vorlage ? Number(vorlage.stunde) : 1,
      klasseId: vorlage ? vorlage.klasseId : (klassen[0] ? klassen[0].id : ''),
      fachId: vorlage ? vorlage.fachId : (faecher[0] ? faecher[0].id : ''),
      raum: vorlage ? (vorlage.raum || '') : '',
      turnus: vorlage && vorlage.turnus ? vorlage.turnus : 'jede'
    };

    const felder = [];

    if (istZusatz) {
      const datum = datumKnopf(werte.datum, 'Datum wählen', iso => { werte.datum = iso; }, 'Datum des Zusatztermins');
      felder.push(zeileFeld('Datum', datum));
    } else {
      const wtFeld = H.el('select', { 'aria-label': 'Wochentag' });
      H.WOCHENTAGE.forEach((name, i) => wtFeld.appendChild(H.el('option', { value: String(i + 1), text: name })));
      wtFeld.value = String(werte.wochentag);
      wtFeld.addEventListener('change', () => { werte.wochentag = Number(wtFeld.value); });
      felder.push(zeileFeld('Wochentag', wtFeld));
    }

    const stundeFeld = H.el('select', { 'aria-label': 'Stunde' });
    for (let s = 1; s <= 10; s++) {
      const zeit = SP.uhrzeitText(s);
      stundeFeld.appendChild(H.el('option', { value: String(s), text: s + '. Stunde' + (zeit ? ' (' + zeit + ')' : '') }));
    }
    stundeFeld.value = String(werte.stunde);
    stundeFeld.addEventListener('change', () => { werte.stunde = Number(stundeFeld.value); });
    felder.push(zeileFeld('Stunde', stundeFeld));

    const klasseFeld = H.el('select', { 'aria-label': 'Klasse' });
    klassen.forEach(k => klasseFeld.appendChild(H.el('option', { value: k.id, text: k.name })));
    if (werte.klasseId) klasseFeld.value = werte.klasseId;
    klasseFeld.addEventListener('change', () => { werte.klasseId = klasseFeld.value; });
    felder.push(zeileFeld('Klasse', klasseFeld));

    const fachFeld = H.el('select', { 'aria-label': 'Fach' });
    faecher.forEach(f => fachFeld.appendChild(H.el('option', { value: f.id, text: f.name })));
    if (werte.fachId) fachFeld.value = werte.fachId;
    fachFeld.addEventListener('change', () => { werte.fachId = fachFeld.value; });
    felder.push(zeileFeld('Fach', fachFeld));

    const raumFeld = H.el('input', { type: 'text', value: werte.raum, placeholder: 'zum Beispiel 12', autocomplete: 'off', 'aria-label': 'Raum' });
    raumFeld.addEventListener('input', () => { werte.raum = raumFeld.value; });
    felder.push(zeileFeld('Raum', raumFeld));

    if (!istZusatz) {
      const turnus = H.el('div', { class: 'segment', role: 'group', 'aria-label': 'Turnus' });
      [['jede', 'Jede Woche'], ['A', 'A-Woche'], ['B', 'B-Woche']].forEach(function (t) {
        turnus.appendChild(H.el('button', {
          type: 'button', dataset: { wert: t[0] }, text: t[1], 'aria-pressed': werte.turnus === t[0] ? 'true' : 'false',
          onclick: function () {
            werte.turnus = t[0];
            H.$$('button', turnus).forEach(k => k.setAttribute('aria-pressed', k.dataset.wert === t[0] ? 'true' : 'false'));
          }
        }));
      });
      felder.push(H.el('div', { class: 'einst-zeile einst-zeile-segment' }, [
        H.el('div', { class: 'einst-text' }, [
          H.el('div', { class: 'einst-label', text: 'Turnus' }),
          H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Bei A- und B-Wochen zählt die Ankerwoche aus dem Abschnitt Schuljahr.' })
        ]),
        H.el('div', { class: 'einst-steuerung' }, turnus)
      ]));
    }

    const fehler = H.el('p', { class: 'fehler', role: 'alert', hidden: true });

    function speichern(ev) {
      ev.preventDefault();
      fehler.hidden = true;
      if (!werte.klasseId || !werte.fachId) { fehler.textContent = 'Bitte Klasse und Fach wählen.'; fehler.hidden = false; return; }
      if (istZusatz && !werte.datum) { fehler.textContent = 'Bitte ein Datum wählen.'; fehler.hidden = false; return; }
      const zielKlasse = M.klasse(werte.klasseId);
      if (!zielKlasse) { fehler.textContent = 'Bitte eine Klasse wählen.'; fehler.hidden = false; return; }
      if (istZusatz) {
        if (vorlageKlasse && vorlageKlasse.id !== zielKlasse.id) {
          vorlageKlasse.zusatz = (vorlageKlasse.zusatz || []).filter(x => x.id !== vorlage.id);
          M.klasseSpeichern(vorlageKlasse);
        }
        if (!Array.isArray(zielKlasse.zusatz)) zielKlasse.zusatz = [];
        const neu = { id: vorlage ? vorlage.id : H.neueId(), datum: werte.datum, stunde: werte.stunde, fachId: werte.fachId, raum: werte.raum.trim() };
        const i = zielKlasse.zusatz.findIndex(x => x.id === neu.id);
        if (i >= 0) zielKlasse.zusatz[i] = neu; else zielKlasse.zusatz.push(neu);
        M.klasseSpeichern(zielKlasse);
      } else {
        // Gleiche Klasse, gleicher Tag, gleiche Stunde: Konflikt, wenn sich die Turnusse überschneiden
        const doppelt = SP.klassenplan(zielKlasse).find(function (e) {
          if (e.id === (vorlage && vorlage.id)) return false;
          if (Number(e.wochentag) !== werte.wochentag || Number(e.stunde) !== werte.stunde) return false;
          const t = e.turnus || 'jede';
          return t === werte.turnus || t === 'jede' || werte.turnus === 'jede';
        });
        if (doppelt) {
          fehler.textContent = 'Für diese Klasse gibt es am ' + H.WOCHENTAGE[werte.wochentag - 1] + ' in der ' + werte.stunde + '. Stunde bereits einen Eintrag (' + (doppelt.art === 'fremd' ? (doppelt.bezeichnung || 'fremde Stunde') : fachName(doppelt.fachId)) + (doppelt.turnus && doppelt.turnus !== 'jede' ? ', ' + SP.turnusText(doppelt.turnus) : '') + ').';
          fehler.hidden = false;
          return;
        }
        if (vorlageKlasse && vorlageKlasse.id !== zielKlasse.id) SP.eintragEntfernen(vorlageKlasse, vorlage.id);
        const eintrag = { id: vorlage ? vorlage.id : H.neueId(), art: 'eigene', wochentag: werte.wochentag, stunde: werte.stunde, fachId: werte.fachId, raum: werte.raum.trim(), turnus: werte.turnus };
        const konflikte = SP.ueberschneidungen(zielKlasse, eintrag).filter(k => k.id !== eintrag.id);
        SP.eintragSpeichern(zielKlasse, eintrag);
        if (konflikte.length) NB.App.meldung('Hinweis: Zur selben Zeit steht bereits ' + konflikte.map(k => k.klasseName + ' · ' + fachName(k.fachId)).join(', ') + ' in deinem Plan.');
      }
      N.zurueck();
    }

    wurzel.appendChild(H.el('div', { class: 'karte-inhalt einst' }, H.el('form', { novalidate: true, onsubmit: speichern }, [
      H.el('div', { class: 'einst-karte' }, felder),
      fehler,
      H.el('div', { class: 'knopfzeile' }, H.el('button', { type: 'submit', class: 'knopf primaer', text: istZusatz ? 'Zusatztermin speichern' : 'Stunde speichern' }))
    ])));
  }

  function zeileFeld(label, feld) {
    return H.el('label', { class: 'einst-zeile einst-zeile-feld' }, [
      H.el('div', { class: 'einst-text' }, H.el('span', { class: 'einst-label', text: label })),
      H.el('div', { class: 'einst-steuerung' }, feld)
    ]);
  }

  N.bildschirmRegistrieren('einstellungen-stunde', {
    titel: function () {
      if (!stundeParameter) return 'Stunde';
      if (stundeParameter.zusatz || stundeParameter.zusatzId) return stundeParameter.zusatzId ? 'Zusatztermin bearbeiten' : 'Neuer Zusatztermin';
      return stundeParameter.id ? 'Stunde bearbeiten' : 'Neue Stunde';
    },
    zurueck: true,
    zeigen: stundeRendern
  });

  return ES;
})();
