/*
 * Notenblock – Bereich Kalender
 *
 * Tagesansicht: Kopfzeile mit Datum und Pfeilen (Tipp auf das Datum öffnet den
 * Monatskalender, Wischen wechselt den Tag), Stand des Tages, Stundenplan des
 * Tages als Liste mit Haken „Planung fertig“ und Marke „bewertet“,
 * Freistunden als schmale Lücke, Ferien und Feiertage als Hinweis.
 * Wochenansicht: Raster Wochentage × Stunden, geplante Stunden ruhig hinterlegt.
 * Stundenplanung: Thema, Verlauf, Material, Hausaufgabe, „Planung fertig“,
 * „Stunde bewerten“, „Planung übernehmen von“. Alles speichert sofort.
 * Aufgaben mit Fälligkeit werden ab Schritt 6 unter dem Stundenplan gezeigt.
 */
'use strict';
NB.BereichKalender = (function () {
  const B = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;
  const N = NB.Navigation;
  const SP = NB.Stundenplan;

  let z = { ansicht: 'tag', datum: null };   // Zustand des Bereichs
  let heuteVerlassen = false;                // hat die Nutzerin bewusst einen anderen Tag gewählt?
  let zuletztHeute = null;
  let verdrahtet = false;
  let planungParameter = null;

  /* ---------- Zustand ---------- */

  function zustandLaden() {
    const zs = D.holen('zustand', '') || {};
    if (zs.kalender && zs.kalender.ansicht) z.ansicht = zs.kalender.ansicht;
  }

  function zustandMerken() {
    N.zustandMerken({ kalender: { ansicht: z.ansicht } });
  }

  function datumSetzen(iso, bewusst) {
    z.datum = iso;
    if (bewusst) heuteVerlassen = iso !== H.heute();
    N.kopfAktualisieren();
    inhaltRendern();
  }

  /** Beim Zurückkehren aus dem Hintergrund: neuer Tag → auf heute, sofern nicht bewusst woanders. */
  function tagPruefen() {
    const heute = H.heute();
    if (zuletztHeute === heute) return;
    zuletztHeute = heute;
    if (!heuteVerlassen) {
      z.datum = heute;
      if (N.aktiverBereich() === 'kalender' && !N.offenerBildschirm()) { N.kopfAktualisieren(); inhaltRendern(); }
    }
  }

  /* ---------- Hilfen ---------- */

  function klassenName(id) { const k = M.klasse(id); return k ? k.name : 'Klasse fehlt'; }
  function fachName(id) { const f = M.fach(id); return f ? f.name : 'Fach fehlt'; }

  function istBewertet(s, datum) {
    return M.bewertungHatInhalt(M.bewertung(s.klasseId, s.fachId, datum));
  }

  function wochenstart(iso) { return SP.montag(iso); }

  function wochenTitel(iso) {
    const montag = wochenstart(iso);
    const freitag = H.tageAddieren(montag, 4);
    const m = montag.split('-'), f = freitag.split('-');
    const bereich = m[1] === f[1]
      ? Number(m[2]) + '.–' + Number(f[2]) + '.' + Number(f[1]) + '.'
      : Number(m[2]) + '.' + Number(m[1]) + '.–' + Number(f[2]) + '.' + Number(f[1]) + '.';
    return 'KW ' + H.kalenderwoche(iso) + ' · ' + bereich;
  }

  function tagesTitel(iso) {
    return (iso === H.heute() ? 'Heute, ' : H.WOCHENTAGE_KURZ[H.wochentag(iso) - 1] + ', ') + H.datumKurz(iso).slice(0, 6);
  }

  function hakenSymbol(fertig) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '26');
    svg.setAttribute('height', '26');
    svg.setAttribute('aria-hidden', 'true');
    const kreis = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    kreis.setAttribute('cx', '12'); kreis.setAttribute('cy', '12'); kreis.setAttribute('r', '10');
    kreis.setAttribute('fill', fertig ? 'currentColor' : 'none');
    kreis.setAttribute('stroke', 'currentColor');
    kreis.setAttribute('stroke-width', '1.8');
    svg.appendChild(kreis);
    if (fertig) {
      const pfad = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pfad.setAttribute('d', 'M7 12.5l3.2 3.2L17 9');
      pfad.setAttribute('fill', 'none');
      pfad.setAttribute('stroke', '#fff');
      pfad.setAttribute('stroke-width', '2.2');
      pfad.setAttribute('stroke-linecap', 'round');
      pfad.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(pfad);
    }
    return svg;
  }

  /* ---------- Kopfzeile des Bereichs ---------- */

  function kopfLinks() {
    const istWoche = z.ansicht === 'woche';
    return [
      H.el('button', { type: 'button', class: 'symbolknopf', 'aria-label': istWoche ? 'Vorherige Woche' : 'Vorheriger Tag', onclick: () => schritt(-1) },
        H.el('span', { class: 'pfeil-zurueck', 'aria-hidden': 'true', text: '‹' })),
      H.el('button', { type: 'button', class: 'kopf-knopf kal-datum', 'aria-label': 'Datum wählen: ' + H.datumLang(z.datum), onclick: monatOeffnen },
        H.el('span', { class: 'kopf-knopf-text', text: istWoche ? wochenTitel(z.datum) : tagesTitel(z.datum) })),
      H.el('button', { type: 'button', class: 'symbolknopf', 'aria-label': istWoche ? 'Nächste Woche' : 'Nächster Tag', onclick: () => schritt(1) },
        H.el('span', { class: 'pfeil-zurueck', 'aria-hidden': 'true', text: '›' }))
    ];
  }

  function schritt(richtung) {
    datumSetzen(H.tageAddieren(z.datum, richtung * (z.ansicht === 'woche' ? 7 : 1)), true);
  }

  /** Monatskalender mit Markierungen aller Stunden und Punkten für erfasste Tage. */
  function monatOeffnen() {
    function erfassteTage(jahr, monat) {
      const praefix = jahr + '-' + ((monat + 1 < 10) ? '0' : '') + (monat + 1) + '-';
      const tage = {};
      D.alle('bewertung').forEach(function (b) {
        if (b.datum.indexOf(praefix) === 0 && M.bewertungHatInhalt(b)) tage[b.datum] = true;
      });
      return tage;
    }
    NB.Kalender.oeffnen({
      datum: z.datum,
      markierungen: function (jahr, monat) {
        const m = SP.kalenderMarkierungen(jahr, monat);
        Object.keys(erfassteTage(jahr, monat)).forEach(function (iso) {
          if (!m[iso]) m[iso] = {};
          m[iso].punkt = true;
        });
        return m;
      },
      fusszeile: function (jahr, monat) {
        if (!SP.hatStundenplan()) return '';
        const tage = SP.unterrichtstageImMonat(jahr, monat);
        const erfasst = erfassteTage(jahr, monat);
        const anzahl = tage.filter(iso => erfasst[iso]).length;
        return (tage.length === 1 ? '1 Unterrichtstag' : tage.length + ' Unterrichtstage') + ', ' + anzahl + ' erfasst';
      },
      beiAuswahl: iso => datumSetzen(iso, true)
    });
  }

  /* ---------- Inhalt ---------- */

  function inhaltRendern() {
    const wurzel = H.$('#bereich-kalender');
    H.leeren(wurzel);

    // Umschaltung Tag / Woche
    const umschalter = H.el('div', { class: 'bw-filter kal-umschalter', role: 'group', 'aria-label': 'Ansicht' });
    [['tag', 'Tag'], ['woche', 'Woche']].forEach(function (a) {
      umschalter.appendChild(H.el('button', {
        type: 'button', text: a[1], 'aria-pressed': z.ansicht === a[0] ? 'true' : 'false',
        onclick: function () {
          if (z.ansicht === a[0]) return;
          z.ansicht = a[0];
          zustandMerken();
          N.kopfAktualisieren();
          inhaltRendern();
        }
      }));
    });
    wurzel.appendChild(umschalter);

    if (z.ansicht === 'woche') wocheRendern(wurzel);
    else tagRendern(wurzel);
  }

  /* Tagesansicht */
  function tagRendern(wurzel) {
    const datum = z.datum;
    const stunden = SP.stundenAmTag(datum);
    const frei = SP.freierTag(datum);
    const imSchuljahr = SP.imSchuljahr(datum);

    // Stand des Tages
    let geplant = 0, bewertet = 0;
    stunden.forEach(function (s) {
      if (M.planungFertig(datum, s.stunde, s.klasseId, s.fachId)) geplant++;
      if (istBewertet(s, datum)) bewertet++;
    });
    const stand = stunden.length
      ? (stunden.length === 1 ? '1 Stunde' : stunden.length + ' Stunden') + ', ' + geplant + ' geplant, ' + bewertet + ' bewertet'
      : (frei ? frei.text + ' – kein Unterricht' : (!imSchuljahr && SP.hatStundenplan() ? 'Außerhalb des Schuljahres' : 'Keine Stunden an diesem Tag'));
    wurzel.appendChild(H.el('p', { class: 'kal-stand text-schwach', text: stand }));

    if (!SP.hatStundenplan()) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, [
        H.el('p', { class: 'leer-titel', text: 'Noch kein Stundenplan' }),
        H.el('p', { text: 'Lege deine Stunden in den Einstellungen an – danach zeigt der Kalender jeden Tag deinen Unterricht.' }),
        H.el('button', { type: 'button', class: 'knopf primaer', text: 'Stundenplan anlegen', onclick: function () {
          NB.Einstellungen.oeffnen();
          N.bildschirmOeffnen('einstellungen-abschnitt', { abschnitt: 'stundenplan' });
        } })
      ]));
      return;
    }

    if (frei) {
      const zusatz = stunden.length ? ' Unten stehen Zusatztermine.' : '';
      wurzel.appendChild(H.el('div', { class: 'kal-frei-hinweis' }, [
        H.el('p', { class: 'kal-frei-titel', text: frei.text }),
        H.el('p', { class: 'text-schwach text-klein', text: (frei.art === 'ferien' ? 'Ferien – kein regulärer Unterricht.' : frei.art === 'feiertag' ? 'Feiertag – kein regulärer Unterricht.' : 'Der Unterricht fällt aus.') + zusatz })
      ]));
    } else if (!stunden.length) {
      wurzel.appendChild(H.el('div', { class: 'leer kal-leer' }, H.el('p', { text: H.wochentag(datum) >= 6 ? 'Wochenende.' : 'Laut Stundenplan hast du an diesem Tag keine Stunden.' })));
    }

    if (stunden.length) {
      const liste = H.el('div', { class: 'kal-stunden' });
      let vorherige = null;
      stunden.forEach(function (s) {
        if (vorherige != null && s.stunde - vorherige > 1) {
          const anzahl = s.stunde - vorherige - 1;
          liste.appendChild(H.el('div', { class: 'kal-luecke text-klein text-schwach', text: anzahl === 1 ? 'Freistunde' : anzahl + ' Freistunden' }));
        }
        if (vorherige == null || s.stunde !== vorherige) vorherige = s.stunde;
        liste.appendChild(stundenKarte(s, datum));
      });
      wurzel.appendChild(liste);
    }

    // Platz für Aufgaben mit Fälligkeit (Schritt 6)
    const aufgaben = H.el('div', { class: 'kal-aufgaben' });
    if (B.aufgabenRendern) B.aufgabenRendern(aufgaben, datum);
    wurzel.appendChild(aufgaben);
  }

  function stundenKarte(s, datum) {
    const fertig = M.planungFertig(datum, s.stunde, s.klasseId, s.fachId);
    const bewertet = istBewertet(s, datum);
    const planung = M.planung(datum, s.stunde, s.klasseId, s.fachId);
    const zeit = SP.uhrzeitText(s.stunde);
    return H.el('button', {
      type: 'button',
      class: 'kal-stunde' + (fertig ? ' geplant' : ''),
      'aria-label': s.stunde + '. Stunde, ' + klassenName(s.klasseId) + ' ' + fachName(s.fachId) + (fertig ? ', Planung fertig' : ', Planung offen') + (bewertet ? ', bewertet' : ''),
      onclick: () => B.planungOeffnen({ datum: datum, stunde: s.stunde, klasseId: s.klasseId, fachId: s.fachId })
    }, [
      H.el('span', { class: 'kal-stunde-nr' }, [
        H.el('span', { class: 'kal-nr', text: s.stunde + '.' }),
        zeit ? H.el('span', { class: 'kal-zeit text-klein text-schwach', text: zeit }) : null
      ]),
      H.el('span', { class: 'kal-stunde-text' }, [
        H.el('span', { class: 'kal-stunde-titel', text: klassenName(s.klasseId) + ' · ' + fachName(s.fachId) }),
        H.el('span', { class: 'text-klein text-schwach kal-stunde-zeile2' }, [
          bewertet ? H.el('span', { class: 'kal-bewertet', text: 'bewertet' }) : null,
          [s.raum ? SP.raumText(s.raum) : null, s.quelle === 'zusatz' ? 'Zusatztermin' : null, planung && planung.thema ? planung.thema : null].filter(Boolean).join(' · ')
        ])
      ]),
      H.el('span', { class: 'kal-stunde-marken' }, [
        H.el('span', { class: 'kal-haken' + (fertig ? ' fertig' : ''), title: fertig ? 'Planung fertig' : 'Planung offen' }, hakenSymbol(fertig))
      ])
    ]);
  }

  /* Wochenansicht */
  function wocheRendern(wurzel) {
    if (!SP.hatStundenplan()) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, [
        H.el('p', { class: 'leer-titel', text: 'Noch kein Stundenplan' }),
        H.el('p', { text: 'Lege deine Stunden in den Einstellungen an.' })
      ]));
      return;
    }
    const montag = wochenstart(z.datum);
    const tage = [];
    for (let i = 0; i < 7; i++) tage.push(H.tageAddieren(montag, i));
    const stundenJeTag = tage.map(iso => SP.stundenAmTag(iso));
    const wochenende = stundenJeTag[5].length > 0 || stundenJeTag[6].length > 0;
    const spalten = wochenende ? 7 : 5;
    let maxStunde = 0;
    stundenJeTag.forEach(liste => liste.forEach(s => { if (s.stunde > maxStunde) maxStunde = s.stunde; }));
    SP.eintraege().forEach(e => { if (Number(e.stunde) > maxStunde) maxStunde = Number(e.stunde); });
    if (maxStunde < 1) maxStunde = 1;

    const raster = H.el('div', { class: 'wo-raster', role: 'grid' });
    raster.style.gridTemplateColumns = '40px repeat(' + spalten + ', minmax(0, 1fr))';
    raster.appendChild(H.el('div', { class: 'wo-ecke' }));
    const heute = H.heute();
    tage.slice(0, spalten).forEach(function (iso, i) {
      const frei = SP.freierTag(iso);
      raster.appendChild(H.el('button', {
        type: 'button', class: 'wo-tag' + (iso === heute ? ' heute' : '') + (frei ? ' frei' : ''), role: 'columnheader',
        'aria-label': H.datumLang(iso) + (frei ? ', ' + frei.text : ''), title: frei ? frei.text : '',
        onclick: function () { z.ansicht = 'tag'; zustandMerken(); datumSetzen(iso, true); }
      }, [
        H.el('span', { class: 'wo-tag-name', text: H.WOCHENTAGE_KURZ[i] }),
        H.el('span', { class: 'wo-tag-datum', text: String(Number(iso.split('-')[2])) + '.' })
      ]));
    });

    for (let stunde = 1; stunde <= maxStunde; stunde++) {
      const zeit = SP.uhrzeitText(stunde);
      raster.appendChild(H.el('div', { class: 'wo-zeile-kopf', role: 'rowheader' }, [
        H.el('span', { class: 'wo-nr', text: stunde + '.' }),
        zeit ? H.el('span', { class: 'wo-zeit', text: zeit.split('–')[0] }) : null
      ]));
      tage.slice(0, spalten).forEach(function (iso, i) {
        const passende = stundenJeTag[i].filter(s => s.stunde === stunde);
        const frei = SP.freierTag(iso);
        if (!passende.length) {
          raster.appendChild(H.el('div', { class: 'wo-zelle wo-leer' + (frei ? ' frei' : ''), role: 'gridcell' }));
          return;
        }
        const zelle = H.el('div', { class: 'wo-zelle', role: 'gridcell' });
        passende.forEach(function (s) {
          const fertig = M.planungFertig(iso, s.stunde, s.klasseId, s.fachId);
          const bewertet = istBewertet(s, iso);
          zelle.appendChild(H.el('button', {
            type: 'button', class: 'wo-stunde' + (fertig ? ' geplant' : '') + (bewertet ? ' bewertet' : ''),
            'aria-label': H.WOCHENTAGE[i] + ', ' + stunde + '. Stunde, ' + klassenName(s.klasseId) + ' ' + fachName(s.fachId) + (fertig ? ', geplant' : ', ungeplant') + (bewertet ? ', bewertet' : ''),
            onclick: () => B.planungOeffnen({ datum: iso, stunde: s.stunde, klasseId: s.klasseId, fachId: s.fachId })
          }, [
            H.el('span', { class: 'wo-klasse', text: klassenName(s.klasseId) }),
            H.el('span', { class: 'wo-fach', text: fachName(s.fachId) })
          ]));
        });
        raster.appendChild(zelle);
      });
    }
    wurzel.appendChild(raster);
    wurzel.appendChild(H.el('p', { class: 'text-klein text-schwach kal-legende', text: 'Ruhig hinterlegt: Planung fertig. Punkt: Bewertung erfasst. Ein Tipp auf einen Wochentag öffnet die Tagesansicht.' }));
  }

  /* ---------- Wischen und Tastatur ---------- */

  function verdrahten() {
    if (verdrahtet) return;
    verdrahtet = true;
    const wurzel = H.$('#bereich-kalender');
    let wisch = null;
    wurzel.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('input, textarea, select')) return;
      wisch = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    });
    wurzel.addEventListener('pointermove', function (ev) {
      if (!wisch || ev.pointerId !== wisch.id) return;
      const dx = ev.clientX - wisch.x, dy = ev.clientY - wisch.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        wisch = null;
        schritt(dx < 0 ? 1 : -1);
      }
    });
    wurzel.addEventListener('pointerup', () => { wisch = null; });
    wurzel.addEventListener('pointercancel', () => { wisch = null; });

    document.addEventListener('keydown', function (ev) {
      if (N.aktiverBereich() !== 'kalender' || N.offenerBildschirm() || NB.Dialog.istOffen() || H.$('#app').hidden) return;
      if (ev.target && ev.target.matches && ev.target.matches('input, textarea, select')) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === 'ArrowRight') { ev.preventDefault(); schritt(1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); schritt(-1); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && D.istEntsperrt()) tagPruefen();
    });
  }

  /* ---------- Stundenplanung ---------- */

  B.planungOeffnen = function (parameter) {
    if (N.aktiverBereich() !== 'kalender') N.zeigen('kalender');
    N.bildschirmOeffnen('planung', parameter);
  };

  function planungRendern(parameter) {
    planungParameter = parameter;
    const wurzel = H.$('#bildschirm-planung');
    H.leeren(wurzel);
    const p = M.planungOderNeu(parameter.datum, parameter.stunde, parameter.klasseId, parameter.fachId);
    const stundeInfo = SP.stundenAmTag(parameter.datum).find(s => s.stunde === Number(parameter.stunde) && s.klasseId === parameter.klasseId && s.fachId === parameter.fachId);
    const zeit = SP.uhrzeitText(parameter.stunde);

    const speichern = () => M.planungSpeichern(p);
    const speichernVerzoegert = H.entprellen(speichern, 300);

    function feld(name, label, mehrzeilig, platzhalter) {
      const eingabe = mehrzeilig
        ? H.el('textarea', { rows: 4, placeholder: platzhalter || '', autocomplete: 'off' })
        : H.el('input', { type: 'text', placeholder: platzhalter || '', autocomplete: 'off' });
      eingabe.value = p[name] || '';
      eingabe.addEventListener('input', function () { p[name] = eingabe.value; speichernVerzoegert(); });
      eingabe.addEventListener('change', function () { p[name] = eingabe.value; speichern(); });
      return H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: label }), eingabe]);
    }

    const fertigFeld = H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch' });
    fertigFeld.checked = !!p.fertig;
    fertigFeld.setAttribute('aria-checked', p.fertig ? 'true' : 'false');
    fertigFeld.addEventListener('change', function () {
      p.fertig = fertigFeld.checked;
      fertigFeld.setAttribute('aria-checked', p.fertig ? 'true' : 'false');
      speichern();
    });

    const felder = H.el('div', { class: 'planung-felder' }, [
      feld('thema', 'Thema der Stunde', false, 'zum Beispiel Wortarten: Nomen erkennen'),
      feld('verlauf', 'Verlauf', true, 'Einstieg, Erarbeitung, Sicherung …'),
      feld('material', 'Material', true, 'Arbeitsblätter, Bücher, Geräte …'),
      feld('hausaufgabe', 'Hausaufgabe', false, '')
    ]);

    const kopf = H.el('div', { class: 'planung-kopf' }, [
      H.el('div', { class: 'planung-titel', text: klassenName(parameter.klasseId) + ' · ' + fachName(parameter.fachId) }),
      H.el('div', { class: 'text-schwach text-klein', text: H.datumLang(parameter.datum) + ' · ' + parameter.stunde + '. Stunde' + (zeit ? ' · ' + zeit : '') + (stundeInfo && stundeInfo.raum ? ' · ' + SP.raumText(stundeInfo.raum) : '') })
    ]);

    wurzel.appendChild(H.el('div', { class: 'karte-inhalt' }, [
      kopf,
      H.el('div', { class: 'einst-karte planung-karte' }, [
        H.el('div', { class: 'formular' }, felder),
        H.el('label', { class: 'einst-zeile' }, [
          H.el('div', { class: 'einst-text' }, [
            H.el('span', { class: 'einst-label', text: 'Planung fertig' }),
            H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Setzt den Haken in Tages- und Wochenansicht.' })
          ]),
          H.el('div', { class: 'einst-steuerung' }, fertigFeld)
        ])
      ]),
      H.el('div', { class: 'knopfzeile planung-knoepfe' }, [
        H.el('button', { type: 'button', class: 'knopf', text: 'Planung übernehmen von …', onclick: () => uebernehmen(p, felder) }),
        H.el('button', { type: 'button', class: 'knopf primaer', text: 'Stunde bewerten', onclick: function () {
          speichern();
          NB.Bewertung.oeffnen({ klasseId: parameter.klasseId, fachId: parameter.fachId, datum: parameter.datum });
        } })
      ])
    ]));
  }

  /** Inhalt einer früheren Planung derselben Klasse und desselben Fachs übernehmen. */
  async function uebernehmen(p, felder) {
    const kandidaten = M.planungen(p.klasseId, p.fachId)
      .filter(q => q.schluessel !== p.schluessel && ((q.thema && q.thema.trim()) || (q.verlauf && q.verlauf.trim()) || (q.material && q.material.trim()) || (q.hausaufgabe && q.hausaufgabe.trim())))
      .slice(0, 10);
    if (!kandidaten.length) {
      await NB.Dialog.hinweis({ titel: 'Keine frühere Planung', text: 'Für ' + klassenName(p.klasseId) + ' · ' + fachName(p.fachId) + ' gibt es noch keine andere Stunde mit Planungsinhalt.' });
      return;
    }
    const wahl = await NB.Dialog.auswahl({
      titel: 'Planung übernehmen von',
      optionen: kandidaten.map(q => ({
        wert: q.schluessel,
        text: H.datumMitWochentag(q.datum) + ' · ' + q.stunde + '. Stunde',
        untertitel: q.thema ? q.thema : (q.verlauf ? q.verlauf.slice(0, 60) : '')
      }))
    });
    if (!wahl) return;
    const quelle = kandidaten.find(q => q.schluessel === wahl);
    if (!quelle) return;
    const hatInhalt = (p.thema && p.thema.trim()) || (p.verlauf && p.verlauf.trim()) || (p.material && p.material.trim()) || (p.hausaufgabe && p.hausaufgabe.trim());
    if (hatInhalt) {
      const ok = await NB.Dialog.bestaetigen({ titel: 'Vorhandene Einträge ersetzen?', text: 'Thema, Verlauf, Material und Hausaufgabe dieser Stunde werden durch die Planung vom ' + H.datumMitWochentag(quelle.datum) + ' ersetzt.', bestaetigen: 'Ersetzen', gefaehrlich: true });
      if (!ok) return;
    }
    p.thema = quelle.thema || '';
    p.verlauf = quelle.verlauf || '';
    p.material = quelle.material || '';
    p.hausaufgabe = quelle.hausaufgabe || '';
    M.planungSpeichern(p);
    const eingaben = H.$$('input, textarea', felder);
    eingaben[0].value = p.thema;
    eingaben[1].value = p.verlauf;
    eingaben[2].value = p.material;
    eingaben[3].value = p.hausaufgabe;
    NB.App.meldung('Planung übernommen.');
  }

  /* ---------- Registrierung ---------- */

  N.bereichRegistrieren('kalender', {
    titel: '',
    kopfLinks: kopfLinks,
    zeigen: function () {
      verdrahten();
      zustandLaden();
      const heute = H.heute();
      if (!z.datum) { z.datum = heute; heuteVerlassen = false; }
      zuletztHeute = heute;
      inhaltRendern();
    }
  });

  N.bildschirmRegistrieren('planung', {
    titel: 'Stundenplanung',
    zurueck: true,
    zeigen: planungRendern
  });

  return B;
})();
