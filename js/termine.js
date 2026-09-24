/*
 * Notenblock – Termine
 *
 * Alles, was kein Unterricht ist: Ausflüge, Konferenzen, Elternabende,
 * Fortbildungen, Sprechtage. Ein Termin hat Titel, Datum, wahlweise ganztägig
 * oder mit Beginn und Ende, dazu Ort, Notiz, Klasse und Art.
 *
 * Der Schalter „Unterricht fällt an diesem Tag aus“ macht den Tag zum
 * Ausfalltag: mit Klasse nur für diese, ohne Klasse für alle eigenen Stunden.
 * Er ist voreingestellt aus.
 *
 * Termine sind Beiwerk: Sie erscheinen im Kalender ruhiger als der eigene
 * Unterricht – in der Tagesansicht als Band (ganztägig) oder an ihrer Stelle
 * zwischen den Stunden, in der Wochenansicht als Band oben in der Spalte, in
 * der Monatsansicht als Punkt in der Farbe ihrer Art.
 */
'use strict';
NB.Termine = (function () {
  const T = {};
  const H = NB.Hilfen;
  const M = NB.Modell;
  const N = NB.Navigation;

  let parameter = null;   // { id } oder { datum, klasseId } für einen neuen Termin
  let beiSchliessen = null;

  /* ---------- Öffnen ---------- */

  /** Termin bearbeiten oder neu anlegen; beiAenderung wird nach dem Speichern gerufen. */
  T.oeffnen = function (p, beiAenderung) {
    beiSchliessen = beiAenderung || null;
    N.bildschirmOeffnen('termin', p || {});
  };

  T.neu = (datum, klasseId, beiAenderung) => T.oeffnen({ datum: datum, klasseId: klasseId }, beiAenderung);

  /* ---------- Bausteine für andere Bildschirme ---------- */

  /** Kurzer Zeittext eines Termins: „ganztägig“ oder „10:00–12:00“. */
  T.zeitText = function (termin) {
    if (termin.ganztags || !termin.von) return 'ganztägig';
    return termin.von + (termin.bis ? '–' + termin.bis : '');
  };

  /** Untertitel eines Termins: Zeit, Art, Ort, Klasse. */
  T.beschreibung = function (termin, mitKlasse) {
    const klasse = termin.klasseId ? M.klasse(termin.klasseId) : null;
    return [T.zeitText(termin), M.terminArt(termin.art).name, termin.ort, (mitKlasse && klasse) ? klasse.name : null]
      .filter(Boolean).join(' · ');
  };

  /**
   * Termin als flache Karte (Kalender, Klassenübersicht). Ein Tipp öffnet den
   * Termin zum Bearbeiten; neuZeichnen wird nach Änderungen gerufen.
   */
  T.karte = function (termin, neuZeichnen, optionen) {
    optionen = optionen || {};
    const art = M.terminArt(termin.art);
    const karte = H.el('button', {
      type: 'button', class: 'termin-karte' + (optionen.klasse ? ' ' + optionen.klasse : ''),
      'aria-label': 'Termin: ' + (termin.titel || art.name) + ', ' + T.beschreibung(termin, true),
      onclick: () => T.oeffnen({ id: termin.id }, neuZeichnen)
    }, [
      H.el('span', { class: 'termin-punkt', 'aria-hidden': 'true' }),
      H.el('span', { class: 'termin-text' }, [
        H.el('span', { class: 'termin-titel', text: termin.titel || art.name }),
        H.el('span', { class: 'text-klein text-schwach', text: T.beschreibung(termin, optionen.mitKlasse !== false) })
      ]),
      termin.unterrichtFaelltAus ? H.el('span', { class: 'termin-ausfall text-klein', text: 'kein Unterricht' }) : null
    ]);
    karte.style.setProperty('--termin-farbe', art.wert);
    return karte;
  };

  /* ---------- Bildschirm ---------- */

  function rendern(p) {
    parameter = p || {};
    const wurzel = H.$('#bildschirm-termin');
    H.leeren(wurzel);
    const vorhanden = parameter.id ? M.termin(parameter.id) : null;
    if (parameter.id && !vorhanden) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diesen Termin gibt es nicht mehr.' })));
      return;
    }
    const termin = vorhanden
      ? JSON.parse(JSON.stringify(vorhanden))
      : M.neuerTermin(parameter.datum, parameter.klasseId);
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    const fehler = H.el('p', { class: 'fehler', role: 'alert', hidden: true });

    // Titel
    const titelFeld = H.el('input', { type: 'text', value: termin.titel, autocomplete: 'off', placeholder: 'zum Beispiel Ausflug zum Waldlehrpfad', 'aria-label': 'Titel' });
    titelFeld.addEventListener('input', () => { termin.titel = titelFeld.value; });

    // Art
    const artFeld = H.el('select', { 'aria-label': 'Art' });
    M.TERMIN_ARTEN().forEach(a => artFeld.appendChild(H.el('option', { value: a.id, text: a.name })));
    artFeld.value = termin.art;
    artFeld.addEventListener('change', () => { termin.art = artFeld.value; });

    // Datum
    const datumKnopf = H.el('button', { type: 'button', class: 'knopf datumknopf', 'aria-label': 'Datum wählen' },
      H.el('span', { text: H.datumMitWochentag(termin.datum) }));
    datumKnopf.addEventListener('click', function () {
      NB.Kalender.oeffnen({
        datum: termin.datum,
        markierungen: (jahr, monat) => NB.Stundenplan.kalenderMarkierungen(jahr, monat, termin.klasseId),
        beiAuswahl: function (iso) {
          termin.datum = iso;
          datumKnopf.firstChild.textContent = H.datumMitWochentag(iso);
        }
      });
    });

    // Ganztägig oder Uhrzeit
    const vonFeld = H.el('input', { type: 'time', value: termin.von || '', 'aria-label': 'Beginn' });
    const bisFeld = H.el('input', { type: 'time', value: termin.bis || '', 'aria-label': 'Ende' });
    vonFeld.addEventListener('change', () => { termin.von = vonFeld.value; });
    bisFeld.addEventListener('change', () => { termin.bis = bisFeld.value; });
    const zeitZeile = H.el('div', { class: 'einst-zeile einst-zeile-feld' }, [
      H.el('div', { class: 'einst-text' }, H.el('div', { class: 'einst-label', text: 'Uhrzeit' })),
      H.el('div', { class: 'einst-steuerung einst-zeitfelder' }, [vonFeld, H.el('span', { 'aria-hidden': 'true', text: '–' }), bisFeld])
    ]);
    const ganztagsFeld = H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch', 'aria-label': 'Ganztägig' });
    ganztagsFeld.checked = termin.ganztags !== false;
    ganztagsFeld.setAttribute('aria-checked', ganztagsFeld.checked ? 'true' : 'false');
    function zeitAnwenden() {
      zeitZeile.hidden = termin.ganztags !== false;
    }
    ganztagsFeld.addEventListener('change', function () {
      termin.ganztags = ganztagsFeld.checked;
      ganztagsFeld.setAttribute('aria-checked', termin.ganztags ? 'true' : 'false');
      zeitAnwenden();
    });
    zeitAnwenden();

    // Klasse
    const klasseFeld = H.el('select', { 'aria-label': 'Klasse' });
    klasseFeld.appendChild(H.el('option', { value: '', text: 'Keine Klasse (gilt für alle)' }));
    M.klassen().forEach(k => klasseFeld.appendChild(H.el('option', { value: k.id, text: k.name })));
    klasseFeld.value = termin.klasseId || '';
    klasseFeld.addEventListener('change', function () {
      termin.klasseId = klasseFeld.value || null;
      ausfallBeschreibung.textContent = ausfallText();
    });

    // Ort und Notiz
    const ortFeld = H.el('input', { type: 'text', value: termin.ort || '', autocomplete: 'off', placeholder: 'optional', 'aria-label': 'Ort' });
    ortFeld.addEventListener('input', () => { termin.ort = ortFeld.value; });
    const notizFeld = H.el('textarea', { rows: 3, placeholder: 'optional', 'aria-label': 'Notiz' });
    notizFeld.value = termin.notiz || '';
    notizFeld.addEventListener('input', () => { termin.notiz = notizFeld.value; });

    // Unterricht fällt aus
    function ausfallText() {
      return termin.klasseId
        ? 'An: Der Tag gilt für ' + (M.klasse(termin.klasseId) || {}).name + ' als Ausfalltag – ihre Stunden erscheinen nicht im Kalender.'
        : 'An: An diesem Tag fallen alle eigenen Stunden aus (etwa Konferenz- oder Fortbildungstag).';
    }
    const ausfallFeld = H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch', 'aria-label': 'Unterricht fällt an diesem Tag aus' });
    ausfallFeld.checked = termin.unterrichtFaelltAus === true;
    ausfallFeld.setAttribute('aria-checked', ausfallFeld.checked ? 'true' : 'false');
    ausfallFeld.addEventListener('change', function () {
      termin.unterrichtFaelltAus = ausfallFeld.checked;
      ausfallFeld.setAttribute('aria-checked', termin.unterrichtFaelltAus ? 'true' : 'false');
    });
    const ausfallBeschreibung = H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: ausfallText() });

    function zeile(label, beschreibung, steuerung, klasse) {
      return H.el(steuerung && steuerung.tagName !== 'DIV' ? 'label' : 'div', { class: 'einst-zeile' + (klasse ? ' ' + klasse : '') }, [
        H.el('div', { class: 'einst-text' }, [
          H.el('div', { class: 'einst-label', text: label }),
          beschreibung ? H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: beschreibung }) : null
        ]),
        steuerung ? H.el('div', { class: 'einst-steuerung' }, steuerung) : null
      ]);
    }

    inhalt.appendChild(H.el('div', { class: 'einst-karte' }, [
      zeile('Titel', null, titelFeld, 'einst-zeile-feld'),
      zeile('Art', null, artFeld, 'einst-zeile-auswahl'),
      zeile('Datum', null, datumKnopf, 'einst-zeile-feld'),
      H.el('label', { class: 'einst-zeile' }, [
        H.el('div', { class: 'einst-text' }, [
          H.el('div', { class: 'einst-label', text: 'Ganztägig' }),
          H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Aus: mit Beginn und Ende – der Termin steht dann zwischen den Stunden.' })
        ]),
        H.el('div', { class: 'einst-steuerung' }, ganztagsFeld)
      ]),
      zeitZeile,
      zeile('Klasse', 'Nur Termine der gewählten Klasse erscheinen in ihrer Kalendersicht.', klasseFeld, 'einst-zeile-auswahl'),
      zeile('Ort', null, ortFeld, 'einst-zeile-feld'),
      zeile('Notiz', null, notizFeld, 'einst-zeile-feld'),
      H.el('label', { class: 'einst-zeile' }, [
        H.el('div', { class: 'einst-text' }, [
          H.el('div', { class: 'einst-label', text: 'Unterricht fällt an diesem Tag aus' }),
          ausfallBeschreibung
        ]),
        H.el('div', { class: 'einst-steuerung' }, ausfallFeld)
      ])
    ]));
    inhalt.appendChild(fehler);

    async function loeschen() {
      const ok = await NB.Dialog.bestaetigen({
        titel: 'Termin löschen?',
        text: (termin.titel || 'Dieser Termin') + ' am ' + H.datumMitWochentag(termin.datum) + ' wird entfernt. Bewertungen und Stundenpläne bleiben unberührt.',
        bestaetigen: 'Löschen',
        gefaehrlich: true
      });
      if (!ok) return;
      M.terminLoeschen(termin.id);
      if (beiSchliessen) beiSchliessen();
      N.zurueck();
    }

    inhalt.appendChild(H.el('div', { class: 'knopfzeile' }, [
      vorhanden ? H.el('button', { type: 'button', class: 'knopf gefaehrlich', text: 'Löschen', onclick: loeschen }) : null,
      H.el('button', { type: 'button', class: 'knopf primaer', text: 'Speichern', onclick: function () {
        if (!termin.titel.trim()) {
          fehler.textContent = 'Bitte einen Titel eintragen.';
          fehler.hidden = false;
          titelFeld.focus();
          return;
        }
        if (termin.ganztags === false && termin.bis && termin.von && termin.bis < termin.von) {
          fehler.textContent = 'Das Ende liegt vor dem Beginn.';
          fehler.hidden = false;
          return;
        }
        termin.titel = termin.titel.trim();
        termin.ort = (termin.ort || '').trim();
        M.terminSpeichern(termin);
        if (beiSchliessen) beiSchliessen();
        NB.App.meldung('Termin gespeichert.');
        N.zurueck();
      } })
    ]));
    if (!vorhanden) setTimeout(() => titelFeld.focus(), 50);
    wurzel.appendChild(inhalt);
  }

  /* ---------- Registrierung ---------- */

  N.bildschirmRegistrieren('termin', {
    titel: () => (parameter && parameter.id ? 'Termin' : 'Neuer Termin'),
    zurueck: true,
    zeigen: rendern
  });

  return T;
})();
