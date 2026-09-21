/*
 * Notenblock – Einstellungen: Stundenplan (global)
 *
 * Abschnitt „Stundenplan“ der Einstellungen mit allem, was für alle Klassen
 * gilt: Uhrzeiten je Stundennummer, Schuljahreszeitraum und A-Woche, Ferien,
 * Feiertage. Datumsangaben ausschließlich über den Monatskalender.
 * Die Stundenpläne selbst sowie Ausfall- und Zusatztermine werden je Klasse
 * gepflegt (Klassen → Klasse verwalten → Stundenplan, NB.KlasseStundenplan).
 */
'use strict';
NB.EinstellungenStundenplan = (function () {
  const ES = {};
  const H = NB.Hilfen;
  const M = NB.Modell;
  const N = NB.Navigation;
  const SP = NB.Stundenplan;

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


  function neuZeichnen() {
    NB.Einstellungen.neuZeichnen();
  }

  /* ---------- Abschnitt ---------- */

  ES.rendern = function (inhalt) {
    const klassen = M.klassen();
    const eigene = klassen.reduce((n, k) => n + SP.klassenplan(k).filter(e => e.art !== 'fremd').length, 0);
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach einst-hinweis', text:
      'Die Stundenpläne pflegst du je Klasse: Klassen → Stiftsymbol → Stundenplan. Dein eigener Plan ist die Summe aller eigenen Stunden'
      + (klassen.length ? ' – zurzeit ' + (eigene === 1 ? '1 eigene Stunde' : eigene + ' eigene Stunden') + ' in ' + (klassen.length === 1 ? '1 Klasse' : klassen.length + ' Klassen') + '.' : '.') }));
    uhrzeitenRendern(inhalt);
    schuljahrRendern(inhalt);
    ferienRendern(inhalt);
    feiertageRendern(inhalt);
  };

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

  return ES;
})();
