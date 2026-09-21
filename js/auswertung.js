/*
 * Notenblock – Auswertung
 *
 * Die Note entsteht erst hier, aus den einzelnen datierten Einträgen:
 *   Je Kind und Fach: Durchschnitt pro Kriterium, gewichteter Gesamtwert mit
 *   einer Nachkommastelle, daraus ein Notenvorschlag (Rundung laut
 *   Einstellung), Anzahl der erfassten Stunden, Verlauf über die Zeit,
 *   Textbaustein aus den Beschreibungstexten der überwiegend vergebenen Noten,
 *   Notizen mit Zuordnung zu diesem Kind.
 *   Je Klasse und Fach: alle Kinder untereinander mit ihrem Gesamtwert.
 *
 * Standardnoten zählen nur, wenn die Einstellung „Standardnoten in die
 * Auswertung einrechnen“ eingeschaltet ist; sonst nur bewusst gesetzte Werte.
 * Fehlende Kinder werden aus der Stunde herausgenommen.
 */
'use strict';
NB.Auswertung = (function () {
  const A = {};
  const H = NB.Hilfen;
  const M = NB.Modell;
  const N = NB.Navigation;

  let parameterKlasse = null;   // { klasseId, fachId }
  let parameterKind = null;     // { klasseId, fachId, kindId }

  /* ---------- Berechnung ---------- */

  function gewicht(k) { return (typeof k.gewicht === 'number') ? k.gewicht : 1; }

  /** Bewertete Stunden einer Klasse in einem Fach, nach Datum. */
  A.stunden = function (klasseId, fachId) {
    return M.bewertungen(klasseId, fachId).filter(M.bewertungHatInhalt).sort((a, b) => (a.datum < b.datum ? -1 : 1));
  };

  A.eineNachkommastelle = wert => Math.round(wert * 10) / 10;
  A.zahlText = wert => (wert == null ? '–' : String(A.eineNachkommastelle(wert)).replace('.', ','));

  /** Notenvorschlag aus dem auf eine Nachkommastelle gerundeten Gesamtwert. */
  A.notenvorschlag = function (gesamt, rundung) {
    if (gesamt == null) return null;
    const w = A.eineNachkommastelle(gesamt);
    if (rundung === 'nachkomma') return w;
    if (rundung === 'zugunsten') return H.begrenzen(Math.ceil(w - 0.5), 1, 6);
    return H.begrenzen(Math.round(w), 1, 6);
  };

  A.vorschlagText = function (vorschlag) {
    if (vorschlag == null) return '–';
    return Number.isInteger(vorschlag) ? String(vorschlag) : A.zahlText(vorschlag);
  };

  /** Überwiegend vergebene Note: häufigste; bei Gleichstand die dem Schnitt nächste, dann die bessere. */
  function ueberwiegend(verteilung, schnitt) {
    let beste = null, max = 0;
    for (let n = 1; n <= 6; n++) {
      const anzahl = verteilung[n] || 0;
      if (anzahl > max || (anzahl === max && anzahl > 0 && beste != null && Math.abs(n - schnitt) < Math.abs(beste - schnitt))) {
        max = anzahl;
        beste = n;
      }
    }
    return beste;
  }

  /** Auswertung eines Kindes in einem Fach (Übergangsfassung: Stundenkriterien und Kompetenzen gemeinsam). */
  A.kind = function (klasse, fach, kindId) {
    const e = M.einstellungen();
    const einrechnen = e.uebernommeneZaehlen !== false;   // übernommene Standardnoten mitzählen
    const kriterien = M.stundenkriterien().concat(M.kompetenzenAlle(fach, klasse.stufe || null));
    const stunden = A.stunden(klasse.id, fach.id);
    const sammlung = {};
    kriterien.forEach(k => { sammlung[k.id] = { werte: [], verteilung: [0, 0, 0, 0, 0, 0, 0] }; });
    const verlauf = [];
    let anwesend = 0, gefehlt = 0;

    stunden.forEach(function (b) {
      const eintrag = b.kinder ? b.kinder[kindId] : null;
      if (eintrag && eintrag.fehlt) { gefehlt++; return; }
      let summe = 0, gesamtGewicht = 0;
      kriterien.forEach(function (k) {
        const n = M.notenWert(eintrag, k.id);
        if (!n || (n.art === 'uebernommen' && !einrechnen)) return;
        const note = n.wert;
        sammlung[k.id].werte.push({ datum: b.datum, note: note });
        sammlung[k.id].verteilung[note]++;
        summe += note * gewicht(k);
        gesamtGewicht += gewicht(k);
      });
      if (gesamtGewicht > 0) {
        anwesend++;
        verlauf.push({ datum: b.datum, wert: summe / gesamtGewicht });
      }
    });

    let gs = 0, gg = 0;
    const zeilen = kriterien.map(function (k) {
      const d = sammlung[k.id];
      const n = d.werte.length;
      const schnitt = n ? d.werte.reduce((s, w) => s + w.note, 0) / n : null;
      if (schnitt != null) { gs += schnitt * gewicht(k); gg += gewicht(k); }
      return { kriterium: k, schnitt: schnitt, anzahl: n, verteilung: d.verteilung, ueberwiegend: n ? ueberwiegend(d.verteilung, schnitt) : null };
    });
    const gesamt = gg > 0 ? gs / gg : null;
    return {
      kriterien: zeilen,
      gesamt: gesamt,
      vorschlag: A.notenvorschlag(gesamt, e.rundung),
      anwesend: anwesend,
      gefehlt: gefehlt,
      stundenGesamt: stunden.length,
      verlauf: verlauf,
      einrechnen: einrechnen
    };
  };

  /** Auswertung aller Kinder einer Klasse in einem Fach. */
  A.klasse = function (klasse, fach) {
    return M.kinderSortiert(klasse).map(function (kind) {
      const a = A.kind(klasse, fach, kind.id);
      return { kind: kind, gesamt: a.gesamt, vorschlag: a.vorschlag, anwesend: a.anwesend, gefehlt: a.gefehlt };
    });
  };

  /** Textbaustein aus den Beschreibungstexten der überwiegend vergebenen Noten. */
  A.textbaustein = function (kind, fach, auswertung) {
    const saetze = auswertung.kriterien
      .filter(z => z.ueberwiegend != null)
      .map(function (z) {
        const text = (z.kriterium.stufen && z.kriterium.stufen[z.ueberwiegend - 1] || '').trim();
        if (!text) return null;
        return text.replace(/[.\s]+$/, '') + '.';
      })
      .filter(Boolean);
    if (!saetze.length) return '';
    return M.kindName(kind) + ' – ' + fach.name + '\n' + saetze.join(' ');
  };

  /* ---------- Darstellung: Bausteine ---------- */

  function noteKlasse(wert) {
    if (wert == null) return '';
    return 'note-' + H.begrenzen(Math.round(wert), 1, 6);
  }

  /** Waagerechter Balken: je besser die Note, desto länger. */
  function balken(wert) {
    const box = H.el('span', { class: 'aw-balken', 'aria-hidden': 'true' });
    const fuellung = H.el('span', { class: 'aw-balken-fuellung ' + noteKlasse(wert) });
    fuellung.style.width = wert == null ? '0%' : Math.round(((7 - H.begrenzen(wert, 1, 6)) / 6) * 100) + '%';
    box.appendChild(fuellung);
    return box;
  }

  function svg(tag, attribute) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attribute || {}).forEach(k => e.setAttribute(k, String(attribute[k])));
    return e;
  }

  /** Verlauf über die Zeit als kleine Grafik (1 oben, 6 unten). */
  function verlaufGrafik(verlauf) {
    const B = 320, Hh = 110, links = 22, rechts = 8, oben = 8, unten = 22;
    const grafik = svg('svg', { viewBox: '0 0 ' + B + ' ' + Hh, class: 'aw-verlauf', role: 'img', 'aria-label': 'Verlauf über ' + verlauf.length + ' Stunden' });
    const y = wert => oben + ((wert - 1) / 5) * (Hh - oben - unten);
    for (let n = 1; n <= 6; n++) {
      grafik.appendChild(svg('line', { x1: links, x2: B - rechts, y1: y(n), y2: y(n), class: 'aw-gitter' }));
      const t = svg('text', { x: links - 6, y: y(n) + 4, class: 'aw-achse', 'text-anchor': 'end' });
      t.textContent = String(n);
      grafik.appendChild(t);
    }
    const n = verlauf.length;
    const x = i => (n === 1 ? (links + B - rechts) / 2 : links + (i / (n - 1)) * (B - links - rechts));
    if (n > 1) {
      const punkte = verlauf.map((v, i) => x(i) + ',' + y(v.wert)).join(' ');
      grafik.appendChild(svg('polyline', { points: punkte, class: 'aw-linie' }));
    }
    verlauf.forEach(function (v, i) {
      grafik.appendChild(svg('circle', { cx: x(i), cy: y(v.wert), r: n > 30 ? 2.5 : 4, class: 'aw-punkt ' + noteKlasse(v.wert) }));
    });
    const t1 = svg('text', { x: links, y: Hh - 6, class: 'aw-achse' });
    t1.textContent = H.datumKurzOhneJahr(verlauf[0].datum);
    grafik.appendChild(t1);
    if (n > 1) {
      const t2 = svg('text', { x: B - rechts, y: Hh - 6, class: 'aw-achse', 'text-anchor': 'end' });
      t2.textContent = H.datumKurzOhneJahr(verlauf[n - 1].datum);
      grafik.appendChild(t2);
    }
    return grafik;
  }

  function faecherLeiste(aktivId, beiWahl) {
    const leiste = H.el('div', { class: 'bw-faecher aw-faecher', role: 'group', 'aria-label': 'Fach' });
    M.faecher().forEach(function (fach) {
      leiste.appendChild(H.el('button', {
        type: 'button', class: 'bw-fach', text: fach.name, 'aria-pressed': fach.id === aktivId ? 'true' : 'false',
        onclick: () => beiWahl(fach.id)
      }));
    });
    return leiste;
  }

  function hinweisZaehlung(einrechnen) {
    return H.el('p', { class: 'text-klein text-schwach aw-hinweis', text: einrechnen
      ? 'Gesetzte und beim Verlassen übernommene Werte zählen (Einstellung „Bewertung“).'
      : 'Nur selbst gesetzte Werte zählen; übernommene Standardnoten bleiben außen vor (Einstellung „Bewertung“).' });
  }

  /* ---------- Bildschirm: Klasse und Fach ---------- */

  A.oeffnen = function (parameter) {
    if (N.aktiverBereich() !== 'klassen') N.zeigen('klassen');
    N.bildschirmOeffnen('auswertung', parameter);
  };

  function klasseRendern(parameter) {
    parameterKlasse = Object.assign({}, parameter || {});
    const wurzel = H.$('#bildschirm-auswertung');
    H.leeren(wurzel);
    const klasse = M.klasse(parameterKlasse.klasseId) || M.klassen()[0];
    if (!klasse) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Keine Klasse vorhanden.' })));
      return;
    }
    parameterKlasse.klasseId = klasse.id;
    let fach = M.fach(parameterKlasse.fachId) || M.faecher()[0];
    if (!fach) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Es sind keine Fächer angelegt.' })));
      return;
    }
    parameterKlasse.fachId = fach.id;

    const inhalt = H.el('div', { class: 'karte-inhalt aw' });
    inhalt.appendChild(H.el('h2', { class: 'aw-titel', text: klasse.name }));
    inhalt.appendChild(faecherLeiste(fach.id, function (fachId) {
      klasseRendern({ klasseId: klasse.id, fachId: fachId });
    }));

    const stunden = A.stunden(klasse.id, fach.id);
    if (!stunden.length) {
      inhalt.appendChild(H.el('div', { class: 'leer' }, [
        H.el('p', { class: 'leer-titel', text: 'Noch keine bewerteten Stunden in ' + fach.name }),
        H.el('p', { text: 'Sobald Noten erfasst sind, erscheinen hier Gesamtwerte und Notenvorschläge für jedes Kind.' })
      ]));
      wurzel.appendChild(inhalt);
      return;
    }

    const zeilen = A.klasse(klasse, fach);
    const einstellungen = M.einstellungen();
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach aw-stand', text: (stunden.length === 1 ? '1 bewertete Stunde' : stunden.length + ' bewertete Stunden') + ' · ' + H.datumKurz(stunden[0].datum) + ' bis ' + H.datumKurz(stunden[stunden.length - 1].datum) }));

    const liste = H.el('div', { class: 'aw-liste' });
    zeilen.forEach(function (z) {
      liste.appendChild(H.el('button', {
        type: 'button', class: 'aw-zeile',
        'aria-label': M.kindName(z.kind) + ': Gesamtwert ' + A.zahlText(z.gesamt) + ', Vorschlag ' + A.vorschlagText(z.vorschlag),
        onclick: () => N.bildschirmOeffnen('auswertung-kind', { klasseId: klasse.id, fachId: fach.id, kindId: z.kind.id })
      }, [
        H.el('span', { class: 'aw-zeile-name' }, [
          H.el('span', { class: 'aw-name', text: M.kindName(z.kind) }),
          H.el('span', { class: 'text-klein text-schwach', text: (z.anwesend ? (z.anwesend === 1 ? '1 Stunde' : z.anwesend + ' Stunden') : 'keine Einträge') + (z.gefehlt ? ', ' + z.gefehlt + '× gefehlt' : '') })
        ]),
        balken(z.gesamt),
        H.el('span', { class: 'aw-werte' }, [
          H.el('span', { class: 'aw-gesamt', text: A.zahlText(z.gesamt) }),
          H.el('span', { class: 'aw-vorschlag ' + noteKlasse(z.vorschlag), text: A.vorschlagText(z.vorschlag), title: 'Notenvorschlag' })
        ])
      ]));
    });
    inhalt.appendChild(liste);
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach aw-hinweis', text: 'Gesamtwert und Notenvorschlag (' + rundungText(einstellungen.rundung) + '). Ein Tipp auf ein Kind zeigt Kriterien, Verlauf, Textbaustein und Notizen.' }));
    inhalt.appendChild(hinweisZaehlung(einstellungen.uebernommeneZaehlen !== false));
    wurzel.appendChild(inhalt);
  }

  function rundungText(r) {
    if (r === 'zugunsten') return 'zugunsten des Kindes gerundet';
    if (r === 'nachkomma') return 'eine Nachkommastelle';
    return 'kaufmännisch gerundet';
  }

  /* ---------- Bildschirm: Kind ---------- */

  function kindRendern(parameter) {
    parameterKind = Object.assign({}, parameter || {});
    const wurzel = H.$('#bildschirm-auswertung-kind');
    H.leeren(wurzel);
    const klasse = M.klasse(parameterKind.klasseId);
    const fach = M.fach(parameterKind.fachId);
    const kind = klasse ? M.kind(klasse, parameterKind.kindId) : null;
    if (!klasse || !fach || !kind) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Dieses Kind gibt es nicht mehr.' })));
      return;
    }
    const a = A.kind(klasse, fach, kind.id);
    const inhalt = H.el('div', { class: 'karte-inhalt aw' });

    // Kopf: Gesamtwert und Vorschlag
    inhalt.appendChild(H.el('div', { class: 'einst-karte aw-kopf' }, [
      H.el('div', { class: 'aw-kopf-text' }, [
        H.el('div', { class: 'aw-titel', text: M.kindName(kind) }),
        H.el('div', { class: 'text-schwach', text: klasse.name + ' · ' + fach.name }),
        H.el('div', { class: 'text-klein text-schwach', text: a.anwesend
          ? (a.anwesend === 1 ? '1 erfasste Stunde' : a.anwesend + ' erfasste Stunden') + (a.gefehlt ? ' · ' + a.gefehlt + '× gefehlt' : '')
          : 'Noch keine Einträge' + (a.gefehlt ? ' · ' + a.gefehlt + '× gefehlt' : '') })
      ]),
      H.el('div', { class: 'aw-kopf-werte' }, [
        H.el('div', { class: 'aw-gesamt-gross', text: A.zahlText(a.gesamt) }),
        H.el('div', { class: 'text-klein text-schwach', text: 'Gesamtwert' }),
        H.el('div', { class: 'aw-vorschlag gross ' + noteKlasse(a.vorschlag), text: A.vorschlagText(a.vorschlag) }),
        H.el('div', { class: 'text-klein text-schwach', text: 'Vorschlag' })
      ])
    ]));

    // Kriterien
    const kriterien = H.el('div', { class: 'einst-karte' });
    a.kriterien.forEach(function (z) {
      kriterien.appendChild(H.el('div', { class: 'aw-kriterium' }, [
        H.el('div', { class: 'aw-kriterium-kopf' }, [
          H.el('span', { class: 'aw-kriterium-name', text: z.kriterium.name + (gewicht(z.kriterium) !== 1 ? ' (×' + String(gewicht(z.kriterium)).replace('.', ',') + ')' : '') }),
          H.el('span', { class: 'aw-kriterium-wert', text: z.anzahl ? A.zahlText(z.schnitt) + ' · ' + z.anzahl + '×' : '–' })
        ]),
        balken(z.schnitt)
      ]));
    });
    inhalt.appendChild(H.el('h2', { class: 'einst-gruppe-titel', text: 'Kriterien' }));
    inhalt.appendChild(kriterien);

    // Verlauf
    inhalt.appendChild(H.el('h2', { class: 'einst-gruppe-titel', text: 'Verlauf' }));
    if (a.verlauf.length) {
      inhalt.appendChild(H.el('div', { class: 'einst-karte aw-verlauf-karte' }, verlaufGrafik(a.verlauf)));
    } else {
      inhalt.appendChild(H.el('div', { class: 'einst-karte' }, H.el('p', { class: 'text-schwach einst-leer', text: 'Noch kein Verlauf – es liegen keine Einträge vor.' })));
    }

    // Textbaustein
    const text = A.textbaustein(kind, fach, a);
    inhalt.appendChild(H.el('h2', { class: 'einst-gruppe-titel', text: 'Textbaustein' }));
    if (text) {
      const feld = H.el('textarea', { rows: 6, class: 'aw-textfeld', 'aria-label': 'Textbaustein' });
      feld.value = text;
      const kopieren = H.el('button', { type: 'button', class: 'knopf primaer', text: 'Text kopieren', onclick: async function () {
        const wert = feld.value;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(wert);
          else { feld.focus(); feld.select(); document.execCommand('copy'); }
          NB.App.meldung('Text kopiert.');
        } catch (fehler) {
          feld.focus(); feld.select();
          NB.App.meldung('Kopieren nicht möglich – der Text ist markiert, bitte mit Kopieren übernehmen.', 'fehler');
        }
      } });
      inhalt.appendChild(H.el('div', { class: 'einst-karte aw-text-karte' }, [
        feld,
        H.el('p', { class: 'text-klein text-schwach', text: 'Aus den Beschreibungstexten der überwiegend vergebenen Noten. Vor dem Kopieren frei anpassbar; Änderungen werden nicht gespeichert.' }),
        H.el('div', { class: 'knopfzeile' }, kopieren)
      ]));
    } else {
      inhalt.appendChild(H.el('div', { class: 'einst-karte' }, H.el('p', { class: 'text-schwach einst-leer', text: 'Ein Textbaustein entsteht, sobald Noten erfasst sind.' })));
    }

    // Notizen zum Kind
    const notizen = NB.BereichNotizen ? NB.BereichNotizen.notizenZuKind(kind.id) : [];
    inhalt.appendChild(H.el('h2', { class: 'einst-gruppe-titel', text: 'Notizen' }));
    const notizKarte = H.el('div', { class: 'einst-karte' });
    if (!notizen.length) {
      notizKarte.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: 'Keine Notizen zu diesem Kind.' }));
    }
    notizen.forEach(function (n) {
      notizKarte.appendChild(H.el('button', { type: 'button', class: 'einst-eintrag-text aw-notiz', onclick: () => NB.BereichNotizen.oeffnen(n.id) }, [
        H.el('span', { class: 'einst-eintrag-titel', text: (n.titel && n.titel.trim()) ? n.titel : 'Ohne Titel' }),
        H.el('span', { class: 'text-klein text-schwach', text: [n.datum ? H.datumMitWochentag(n.datum) : null, n.fachId && M.fach(n.fachId) ? M.fach(n.fachId).name : null].filter(Boolean).join(' · ') }),
        n.text && n.text.trim() ? H.el('span', { class: 'notiz-vorschau text-klein', text: n.text.trim() }) : null
      ]));
    });
    notizKarte.appendChild(H.el('div', { class: 'einst-eintrag' }, H.el('button', {
      type: 'button', class: 'einst-eintrag-text einst-hinzu', text: '+ Notiz zu ' + M.kindName(kind),
      onclick: () => NB.BereichNotizen.neu({ klasseId: klasse.id, kindId: kind.id, fachId: fach.id })
    })));
    inhalt.appendChild(notizKarte);

    inhalt.appendChild(hinweisZaehlung(a.einrechnen));
    wurzel.appendChild(inhalt);
  }

  /** Pfeile in der Kopfzeile: vorheriges/nächstes Kind. */
  function kindKopfRechts() {
    const klasse = parameterKind && M.klasse(parameterKind.klasseId);
    if (!klasse) return null;
    const kinder = M.kinderSortiert(klasse);
    const i = kinder.findIndex(k => k.id === parameterKind.kindId);
    function springen(richtung) {
      const ziel = kinder[i + richtung];
      if (!ziel) return;
      N.bildschirmOeffnen('auswertung-kind', { klasseId: klasse.id, fachId: parameterKind.fachId, kindId: ziel.id });
    }
    return [
      H.el('button', { type: 'button', class: 'symbolknopf', 'aria-label': 'Vorheriges Kind', disabled: i <= 0, onclick: () => springen(-1) }, H.el('span', { class: 'pfeil-zurueck', 'aria-hidden': 'true', text: '‹' })),
      H.el('button', { type: 'button', class: 'symbolknopf', 'aria-label': 'Nächstes Kind', disabled: i < 0 || i >= kinder.length - 1, onclick: () => springen(1) }, H.el('span', { class: 'pfeil-zurueck', 'aria-hidden': 'true', text: '›' }))
    ];
  }

  /* ---------- Registrierung ---------- */

  N.bildschirmRegistrieren('auswertung', {
    titel: 'Auswertung',
    zurueck: true,
    zeigen: klasseRendern
  });
  N.bildschirmRegistrieren('auswertung-kind', {
    titel: function () {
      const klasse = parameterKind && M.klasse(parameterKind.klasseId);
      const kind = klasse && M.kind(klasse, parameterKind.kindId);
      return kind ? M.kindName(kind) : 'Auswertung';
    },
    zurueck: true,
    kopfRechts: kindKopfRechts,
    zeigen: kindRendern
  });

  return A;
})();
