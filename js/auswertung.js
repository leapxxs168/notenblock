/*
 * Notenblock – Auswertung
 *
 * Die Note entsteht erst hier, aus den einzelnen datierten Einheiten:
 *   Je Kind und Fach: Fachleistung aus den Kompetenzen (nach Lehrplanbereich,
 *   Schnitt je Kompetenz und je Bereich) und der Mündlichen Mitarbeit,
 *   gewichteter Gesamtwert mit einer Nachkommastelle, daraus ein
 *   Notenvorschlag (Rundung laut Einstellung, nicht in Stufe 1–2); Arbeits-
 *   und Sozialverhalten getrennt je Fach mit Schnitt je Kriterium und Verlauf
 *   über die Einheiten, dazu eine fachübergreifende Übersicht (etwa für die
 *   Klassenlehrerin); es fließt nie in die Fachnote ein. Getrennte
 *   Textbausteine für Fachleistung und Verhalten aus den Beschreibungstexten
 *   der überwiegend vergebenen Noten; Notizen mit Zuordnung zu diesem Kind.
 *   Je Klasse und Fach: alle Kinder untereinander mit ihrem Gesamtwert.
 *   Kinderprofil (Bildschirm „kind“): alles zu einem Kind – Fächerleiste der
 *   Klasse, zum gewählten Fach Fachleistung, Arbeits- und Sozialverhalten und
 *   Textbausteine, darunter die fachübergreifende Übersicht und die Notizen.
 *   Die frühere Auswertung je Kind geht darin auf; es gibt nur diesen Weg.
 *   Statistik am Kind (Bewertungsbildschirm): dieselbe Rechnung ohne die
 *   laufende Einheit (optionen.ausser).
 *
 * Übernommene Standardnoten zählen nur, wenn die Einstellung „Übernommene
 * Standardnoten mitzählen“ eingeschaltet ist; sonst nur bewusst gesetzte Werte.
 * Fehlende Kinder werden aus der Stunde herausgenommen.
 *
 * Klassen der Stufe 1–2 werden nicht benotet: kein Notenvorschlag (auch nicht
 * im CSV), Werte heißen „Stufe“, und je Kompetenz erscheint der
 * Beschreibungstext der Stufe, die dem Durchschnitt am nächsten liegt.
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

  /**
   * Auswertung eines Kindes in einem Fach (Übergangsfassung).
   * Fachleistung = Kompetenzen + Stundenkriterien mit fachnote (Mündliche
   * Mitarbeit, Gewicht je Fach). Arbeits- und Sozialverhalten (fachnote false)
   * wird getrennt gemittelt und fließt nie in die Fachnote ein. Für eine Einheit
   * ausgesetzte Kriterien zählen dort nicht.
   */
  A.kind = function (klasse, fach, kindId, optionen) {
    optionen = optionen || {};
    const e = M.einstellungen();
    const einrechnen = e.uebernommeneZaehlen !== false;   // übernommene Standardnoten mitzählen
    const benotet = M.istBenotet(klasse);                 // Stufe 1–2: kein Notenvorschlag
    // Stundenkriterien in der Fassung dieses Fachs (gleiche ids, ggf. eigener Name und Texte)
    const stundenkriterien = M.stundenkriterienImFach(fach.id);
    const kriterien = stundenkriterien.concat(M.kompetenzenAlle(fach, klasse.stufe || null));
    const zaehltZurFachnote = k => !stundenkriterien.some(s => s.id === k.id) || M.istFachnote(k);
    const gewichtIn = k => (stundenkriterien.some(s => s.id === k.id) && M.istFachnote(k)) ? M.mitarbeitGewicht(fach.id, k) : gewicht(k);
    // optionen.ausser: Schlüssel der laufenden Einheit – sie zählt nicht (Statistik am Kind)
    const stunden = A.stunden(klasse.id, fach.id).filter(b => !optionen.ausser || M.einheitSchluesselVon(b) !== optionen.ausser);
    const sammlung = {};
    kriterien.forEach(k => { sammlung[k.id] = { werte: [], verteilung: [0, 0, 0, 0, 0, 0, 0] }; });
    const verlauf = [];
    const verlaufVerhalten = [];
    let anwesend = 0, gefehlt = 0;

    stunden.forEach(function (b) {
      const eintrag = b.kinder ? b.kinder[kindId] : null;
      if (eintrag && eintrag.fehlt) { gefehlt++; return; }
      let summe = 0, gesamtGewicht = 0, vSumme = 0, vGewicht = 0;
      kriterien.forEach(function (k) {
        if (M.ausgesetzt(b, k.id)) return;
        const n = M.notenWert(eintrag, k.id);
        if (!n || (n.art === 'uebernommen' && !einrechnen)) return;
        const note = n.wert;
        sammlung[k.id].werte.push({ datum: b.datum, note: note });
        sammlung[k.id].verteilung[note]++;
        if (!zaehltZurFachnote(k)) { vSumme += note * gewicht(k); vGewicht += gewicht(k); return; }
        summe += note * gewichtIn(k);
        gesamtGewicht += gewichtIn(k);
      });
      if (gesamtGewicht > 0 || vGewicht > 0) anwesend++;
      if (gesamtGewicht > 0) verlauf.push({ datum: b.datum, stunde: b.stunde, wert: summe / gesamtGewicht });
      if (vGewicht > 0) verlaufVerhalten.push({ datum: b.datum, stunde: b.stunde, wert: vSumme / vGewicht });
    });

    let gs = 0, gg = 0, vs = 0, vg = 0;
    const zeilen = kriterien.map(function (k) {
      const d = sammlung[k.id];
      const n = d.werte.length;
      const schnitt = n ? d.werte.reduce((s, w) => s + w.note, 0) / n : null;
      const fachnote = zaehltZurFachnote(k);
      if (schnitt != null) {
        if (fachnote) { gs += schnitt * gewichtIn(k); gg += gewichtIn(k); }
        else { vs += schnitt * gewicht(k); vg += gewicht(k); }
      }
      // Ohne Noten: die Stufe, die dem Durchschnitt am nächsten liegt (mit ihrem
      // Beschreibungstext); bei genau ,5 die bessere Stufe
      const naechsteStufe = (!benotet && schnitt != null) ? H.begrenzen(Math.ceil(schnitt - 0.5), 1, 6) : null;
      return {
        kriterium: k, schnitt: schnitt, anzahl: n, verteilung: d.verteilung,
        ueberwiegend: n ? ueberwiegend(d.verteilung, schnitt) : null,
        fachnote: fachnote, stundenkriterium: stundenkriterien.some(s => s.id === k.id),
        naechsteStufe: naechsteStufe,
        stufenText: naechsteStufe ? ((k.stufen && k.stufen[naechsteStufe - 1]) || '') : ''
      };
    });
    const gesamt = gg > 0 ? gs / gg : null;
    return {
      kriterien: zeilen,
      bereiche: bereicheBilden(zeilen.filter(z => !z.stundenkriterium), fach),
      gesamt: gesamt,
      verhalten: vg > 0 ? vs / vg : null,
      verhaltenAnzahl: verlaufVerhalten.length,
      vorschlag: benotet ? A.notenvorschlag(gesamt, e.rundung) : null,
      benotet: benotet,
      anwesend: anwesend,
      gefehlt: gefehlt,
      stundenGesamt: stunden.length,
      verlauf: verlauf,
      verlaufVerhalten: verlaufVerhalten,
      einrechnen: einrechnen
    };
  };

  /** Kompetenzen nach Lehrplanbereich bündeln, mit gewichtetem Schnitt je Bereich. */
  function bereicheBilden(zeilen, fach) {
    const gruppen = [];
    zeilen.forEach(function (z) {
      const name = z.kriterium.bereich || 'Allgemein';
      let g = gruppen.find(x => x.bereich === name);
      if (!g) { g = { bereich: name, zeilen: [], summe: 0, gewicht: 0, schnitt: null }; gruppen.push(g); }
      g.zeilen.push(z);
      if (z.schnitt != null) {
        const w = (z.stundenkriterium && z.fachnote) ? M.mitarbeitGewicht(fach.id, z.kriterium) : gewicht(z.kriterium);
        g.summe += z.schnitt * w;
        g.gewicht += w;
      }
    });
    gruppen.forEach(g => { g.schnitt = g.gewicht > 0 ? g.summe / g.gewicht : null; });
    return gruppen;
  }

  /**
   * Arbeits- und Sozialverhalten eines Kindes über alle Fächer der Klasse
   * (fachübergreifende Übersicht): Schnitt je Kriterium, Gesamtschnitt,
   * Verlauf über alle Einheiten, beteiligte Fächer. Hier gilt die allgemeine
   * Fassung der Kriterien, weil Werte aus mehreren Fächern zusammenfließen.
   */
  A.verhaltenUebergreifend = function (klasse, kindId, optionen) {
    optionen = optionen || {};
    const e = M.einstellungen();
    const einrechnen = e.uebernommeneZaehlen !== false;
    const kriterien = M.stundenkriterien();   // alle – der Ø unten zählt nur die, die nicht zur Note gehören
    const stunden = M.einheiten(klasse.id).filter(M.bewertungHatInhalt)
      .filter(b => !optionen.ausser || M.einheitSchluesselVon(b) !== optionen.ausser)
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : (Number(a.stunde) || 0) - (Number(b.stunde) || 0)));
    const sammlung = {};
    kriterien.forEach(k => { sammlung[k.id] = { werte: [], verteilung: [0, 0, 0, 0, 0, 0, 0] }; });
    const verlauf = [];
    const faecher = {};
    stunden.forEach(function (b) {
      const eintrag = b.kinder ? b.kinder[kindId] : null;
      if (!eintrag || eintrag.fehlt) return;
      let summe = 0, gesamtGewicht = 0;
      kriterien.forEach(function (k) {
        if (M.ausgesetzt(b, k.id)) return;
        const n = M.notenWert(eintrag, k.id);
        if (!n || (n.art === 'uebernommen' && !einrechnen)) return;
        sammlung[k.id].werte.push({ datum: b.datum, note: n.wert });
        sammlung[k.id].verteilung[n.wert]++;
        if (M.istFachnote(k)) return;            // zählt zur Fachleistung, nicht zum Verhalten
        summe += n.wert * gewicht(k);
        gesamtGewicht += gewicht(k);
      });
      if (gesamtGewicht > 0) {
        verlauf.push({ datum: b.datum, stunde: b.stunde, fachId: b.fachId, wert: summe / gesamtGewicht });
        faecher[b.fachId] = true;
      }
    });
    let vs = 0, vg = 0;
    const zeilen = kriterien.map(function (k) {
      const d = sammlung[k.id];
      const n = d.werte.length;
      const schnitt = n ? d.werte.reduce((s, w) => s + w.note, 0) / n : null;
      if (schnitt != null && !M.istFachnote(k)) { vs += schnitt * gewicht(k); vg += gewicht(k); }
      return { kriterium: k, schnitt: schnitt, anzahl: n, verteilung: d.verteilung, ueberwiegend: n ? ueberwiegend(d.verteilung, schnitt) : null, fachnote: M.istFachnote(k), stundenkriterium: true };
    });
    return {
      kriterien: zeilen,
      verhalten: vg > 0 ? vs / vg : null,
      verhaltenAnzahl: verlauf.length,
      verlauf: verlauf,
      faecher: Object.keys(faecher).map(id => M.fach(id)).filter(Boolean),
      einrechnen: einrechnen
    };
  };

  /** Auswertung aller Kinder einer Klasse in einem Fach. */
  A.klasse = function (klasse, fach) {
    return M.kinderSortiert(klasse).map(function (kind) {
      const a = A.kind(klasse, fach, kind.id);
      return { kind: kind, gesamt: a.gesamt, vorschlag: a.vorschlag, benotet: a.benotet, verhalten: a.verhalten, anwesend: a.anwesend, gefehlt: a.gefehlt };
    });
  };

  /**
   * Textbaustein aus den Beschreibungstexten der überwiegend vergebenen Noten.
   * art 'fachleistung' (Kompetenzen und Mündliche Mitarbeit) oder 'verhalten'
   * (Arbeits- und Sozialverhalten); fach darf bei 'verhalten' fehlen (alle Fächer).
   */
  A.textbaustein = function (kind, fach, auswertung, art) {
    const verhalten = art === 'verhalten';
    const saetze = auswertung.kriterien
      .filter(z => z.ueberwiegend != null && (verhalten ? z.fachnote === false : z.fachnote !== false))
      .map(function (z) {
        const text = (z.kriterium.stufen && z.kriterium.stufen[z.ueberwiegend - 1] || '').trim();
        if (!text) return null;
        return text.replace(/[.\s]+$/, '') + '.';
      })
      .filter(Boolean);
    if (!saetze.length) return '';
    const titel = verhalten ? 'Arbeits- und Sozialverhalten' + (fach ? ' in ' + fach.name : '') : fach.name;
    return M.kindName(kind) + ' – ' + titel + '\n' + saetze.join(' ');
  };

  /* ---------- Darstellung: Bausteine ---------- */

  function noteKlasse(wert) {
    if (wert == null) return '';
    return 'note-' + H.begrenzen(Math.round(wert), 1, 6);
  }

  /** Waagerechter Balken: je besser die Note, desto länger. farbStufe: Farbe abweichend vom gerundeten Wert (Stufe 1–2). */
  function balken(wert, farbStufe) {
    const box = H.el('span', { class: 'aw-balken', 'aria-hidden': 'true' });
    const fuellung = H.el('span', { class: 'aw-balken-fuellung ' + noteKlasse(farbStufe != null ? farbStufe : wert) });
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

  /** Fächerleiste der Klasse (ihre Fächer in ihrer Reihenfolge, wahlweise samt stillgelegten). */
  function faecherLeiste(faecher, aktivId, beiWahl) {
    const leiste = H.el('div', { class: 'bw-faecher aw-faecher', role: 'group', 'aria-label': 'Fach' });
    faecher.forEach(function (fach) {
      leiste.appendChild(H.el('button', {
        type: 'button', class: 'bw-fach' + (fach.aktiv === false ? ' ruht' : ''), text: fach.name + (fach.aktiv === false ? ' (stillgelegt)' : ''),
        'aria-pressed': fach.id === aktivId ? 'true' : 'false',
        onclick: () => beiWahl(fach.id)
      }));
    });
    return leiste;
  }

  /**
   * Fächer für die Auswertung einer Klasse: die gewählten Fächer und – auf
   * Wunsch („auch stillgelegte Fächer zeigen“) – stillgelegte mit Daten.
   */
  function auswertungsFaecher(klasse, mitStillgelegten) {
    const liste = M.klassenFaecher(klasse);
    if (mitStillgelegten) M.klassenFaecherStillgelegt(klasse).forEach(f => { if (!liste.some(x => x.id === f.id)) liste.push(f); });
    return liste;
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

  /**
   * Kinderprofil öffnen. { klasseId, kindId, fachId? } – ohne fachId gilt das
   * erste Fach der Klasse. Der Zurück-Pfeil führt dorthin zurück, wo man
   * hergekommen ist (Klassenübersicht oder laufende Bewertung).
   */
  A.kindOeffnen = function (parameter) {
    if (N.aktiverBereich() !== 'klassen') N.zeigen('klassen');
    N.bildschirmOeffnen('kind', parameter);
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
    const stillgelegt = M.klassenFaecherStillgelegt(klasse);
    // Ein stillgelegtes Fach wurde gezielt angesteuert (etwa vom Kind-Bildschirm): dann mit anzeigen
    if (stillgelegt.some(f => f.id === parameterKlasse.fachId)) parameterKlasse.mitStillgelegten = true;
    const faecher = auswertungsFaecher(klasse, parameterKlasse.mitStillgelegten);
    let fach = faecher.find(f => f.id === parameterKlasse.fachId) || faecher[0];
    if (!fach) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diese Klasse hat noch kein Fach.' })));
      return;
    }
    parameterKlasse.fachId = fach.id;

    // .ohne-noten: Stufe 1–2 zeigt die einfarbige Stufenabstufung statt Notenfarben
    const inhalt = H.el('div', { class: 'karte-inhalt aw' + (M.istBenotet(klasse) ? '' : ' ohne-noten') });
    inhalt.appendChild(H.el('h2', { class: 'aw-titel', text: klasse.name }));
    inhalt.appendChild(faecherLeiste(faecher, fach.id, function (fachId) {
      klasseRendern({ klasseId: klasse.id, fachId: fachId, mitStillgelegten: parameterKlasse.mitStillgelegten });
    }));
    if (stillgelegt.length) {
      const an = !!parameterKlasse.mitStillgelegten;
      inhalt.appendChild(H.el('div', { class: 'aw-stillgelegt' }, H.el('button', {
        type: 'button', class: 'textknopf klein', 'aria-pressed': an ? 'true' : 'false',
        text: an ? 'Stillgelegte Fächer ausblenden' : 'Auch stillgelegte Fächer zeigen (' + stillgelegt.length + ')',
        onclick: function () {
          const neu = !an;
          const bleibt = neu || fach.aktiv !== false;
          klasseRendern({ klasseId: klasse.id, fachId: bleibt ? fach.id : null, mitStillgelegten: neu });
        }
      })));
    }

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
    const benotet = M.istBenotet(klasse);
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach aw-stand', text: (stunden.length === 1 ? '1 bewertete Stunde' : stunden.length + ' bewertete Stunden') + ' · ' + H.datumKurz(stunden[0].datum) + ' bis ' + H.datumKurz(stunden[stunden.length - 1].datum) }));

    const liste = H.el('div', { class: 'aw-liste' });
    zeilen.forEach(function (z) {
      liste.appendChild(H.el('button', {
        type: 'button', class: 'aw-zeile',
        'aria-label': M.kindName(z.kind) + ': Gesamtwert ' + A.zahlText(z.gesamt) + (benotet ? ', Vorschlag ' + A.vorschlagText(z.vorschlag) : ''),
        onclick: () => A.kindOeffnen({ klasseId: klasse.id, fachId: fach.id, kindId: z.kind.id })
      }, [
        H.el('span', { class: 'aw-zeile-name' }, [
          H.el('span', { class: 'aw-name', text: M.kindName(z.kind) }),
          H.el('span', { class: 'text-klein text-schwach', text: (z.anwesend ? (z.anwesend === 1 ? '1 Stunde' : z.anwesend + ' Stunden') : 'keine Einträge') + (z.gefehlt ? ', ' + z.gefehlt + '× gefehlt' : '') })
        ]),
        balken(z.gesamt),
        H.el('span', { class: 'aw-werte' }, [
          H.el('span', { class: 'aw-gesamt', text: A.zahlText(z.gesamt) }),
          benotet ? H.el('span', { class: 'aw-vorschlag ' + noteKlasse(z.vorschlag), text: A.vorschlagText(z.vorschlag), title: 'Notenvorschlag' }) : null
        ])
      ]));
    });
    inhalt.appendChild(liste);
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach aw-hinweis', text: (benotet
      ? 'Gesamtwert und Notenvorschlag (' + rundungText(einstellungen.rundung) + ').'
      : 'Gesamtwert als Durchschnitt der Stufen 1–6; Klasse 1 und 2 wird nicht benotet, daher kein Notenvorschlag.')
      + ' Ein Tipp auf ein Kind zeigt Kriterien, Verlauf, Textbaustein und Notizen.' }));
    inhalt.appendChild(hinweisZaehlung(einstellungen.uebernommeneZaehlen !== false));
    wurzel.appendChild(inhalt);
  }

  function rundungText(r) {
    if (r === 'zugunsten') return 'zugunsten des Kindes gerundet';
    if (r === 'nachkomma') return 'eine Nachkommastelle';
    return 'kaufmännisch gerundet';
  }

  /* ---------- Bildschirm: Kinderprofil ---------- */

  function kindRendern(parameter) {
    parameterKind = Object.assign({}, parameter || {});
    const wurzel = H.$('#bildschirm-kind');
    H.leeren(wurzel);
    const klasse = M.klasse(parameterKind.klasseId);
    const kind = klasse ? M.kind(klasse, parameterKind.kindId) : null;
    if (!klasse || !kind) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Dieses Kind gibt es nicht mehr.' })));
      return;
    }
    // Fächerleiste: alle Fächer der Klasse, unabhängig vom zuvor gewählten
    const faecher = M.klassenFaecher(klasse, { mitStillgelegten: true }).filter(f => f.aktiv !== false || M.anzahlEinheiten(klasse.id, f.id));
    const fach = faecher.find(f => f.id === parameterKind.fachId) || faecher[0];
    if (!fach) {
      wurzel.appendChild(H.el('div', { class: 'karte-inhalt' }, [
        H.el('h2', { class: 'aw-titel', text: M.kindName(kind) }),
        H.el('div', { class: 'leer' }, [
          H.el('p', { class: 'leer-titel', text: 'Diese Klasse hat noch kein Fach' }),
          H.el('p', { text: 'Wähle die Fächer der Klasse, dann erscheinen hier Fachleistung und Verhalten.' })
        ])
      ]));
      return;
    }
    parameterKind.fachId = fach.id;
    const a = A.kind(klasse, fach, kind.id);
    const inhalt = H.el('div', { class: 'karte-inhalt aw' + (a.benotet ? '' : ' ohne-noten') });

    // Kopf: Name, Kürzel, Klasse
    const kopf = H.el('div', { class: 'einst-karte aw-kopf kind-kopf' }, [
      H.el('div', { class: 'aw-kopf-text' }, [
        H.el('div', { class: 'aw-titel', text: M.kindName(kind) }),
        H.el('div', { class: 'text-schwach', text: [kind.name && kind.kuerzel ? kind.kuerzel : null, klasse.name, klasse.stufe ? M.stufe(klasse.stufe).kurz : null].filter(Boolean).join(' · ') })
      ])
    ]);
    kopf.style.setProperty('--klassenfarbe', M.klassenFarbe(klasse));
    inhalt.appendChild(kopf);

    // Fächerleiste der Klasse; das aktive Fach in seiner Farbe
    const leiste = H.el('div', { class: 'bw-faecher kind-faecher', role: 'group', 'aria-label': 'Fach' });
    faecher.forEach(function (f) {
      const aktiv = f.id === fach.id;
      const knopf = H.el('button', {
        type: 'button', class: 'bw-fach' + (f.aktiv === false ? ' ruht' : ''), text: f.name + (f.aktiv === false ? ' (stillgelegt)' : ''),
        'aria-pressed': aktiv ? 'true' : 'false',
        onclick: () => kindRendern(Object.assign({}, parameterKind, { fachId: f.id, verhaltenAlleFaecher: false }))
      });
      knopf.style.setProperty('--fachfarbe', M.fachFarbe(f));
      leiste.appendChild(knopf);
      if (aktiv) setTimeout(function () {
        try { knopf.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* egal */ }
      }, 0);
    });
    inhalt.appendChild(leiste);

    // Stand im gewählten Fach: Gesamtwert, Vorschlag, Zahl der Einheiten
    inhalt.appendChild(H.el('div', { class: 'einst-karte aw-kopf' }, [
      H.el('div', { class: 'aw-kopf-text' }, [
        H.el('div', { class: 'aw-titel klein', text: fach.name }),
        H.el('div', { class: 'text-klein text-schwach', text: a.anwesend
          ? (a.anwesend === 1 ? '1 erfasste Einheit' : a.anwesend + ' erfasste Einheiten') + (a.gefehlt ? ' · ' + a.gefehlt + '× gefehlt' : '')
          : 'Noch keine Einträge' + (a.gefehlt ? ' · ' + a.gefehlt + '× gefehlt' : '') })
      ]),
      H.el('div', { class: 'aw-kopf-werte' }, [
        H.el('div', { class: 'aw-gesamt-gross', text: A.zahlText(a.gesamt) }),
        H.el('div', { class: 'text-klein text-schwach', text: 'Gesamtwert' }),
        a.benotet ? H.el('div', { class: 'aw-vorschlag gross ' + noteKlasse(a.vorschlag), text: A.vorschlagText(a.vorschlag) }) : null,
        a.benotet ? H.el('div', { class: 'text-klein text-schwach', text: 'Vorschlag' }) : null
      ])
    ]));

    // Zeile eines Kriteriums: Name (mit Gewicht), Schnitt · Anzahl, Balken, in Stufe 1–2 der Stufentext
    function kriteriumZeile(z, g, marke) {
      const stufenText = (!a.benotet && !z.stundenkriterium && z.stufenText)
        ? H.el('p', { class: 'text-klein text-schwach aw-stufentext', text: 'Stufe ' + z.naechsteStufe + ': ' + z.stufenText })
        : null;
      return H.el('div', { class: 'aw-kriterium' }, [
        H.el('div', { class: 'aw-kriterium-kopf' }, [
          H.el('span', { class: 'aw-kriterium-name' }, [
            z.kriterium.name + (g !== 1 && !marke ? ' (×' + String(g).replace('.', ',') + ')' : '') + (marke ? ' ' : ''),
            marke ? H.el('span', { class: 'aw-marke text-klein', text: marke }) : null
          ]),
          H.el('span', { class: 'aw-kriterium-wert', text: z.anzahl ? A.zahlText(z.schnitt) + ' · ' + z.anzahl + '×' : '–' })
        ]),
        balken(z.schnitt, z.naechsteStufe),
        stufenText
      ]);
    }

    // Stunde: alle Stundenkriterien; welche davon zur Note zählen, steht dabei.
    // Standardmäßig zählt nur die Mündliche Mitarbeit (Einstellungen → Fächer
    // und Kriterien → „Zählt zur Fachleistung“ je Kriterium).
    const alleFaecher = !!parameterKind.verhaltenAlleFaecher;
    const v = alleFaecher ? A.verhaltenUebergreifend(klasse, kind.id) : a;
    const stundenZeilen = v.kriterien.filter(z => z.stundenkriterium);
    inhalt.appendChild(H.el('h2', { class: 'einst-gruppe-titel', text: 'Stunde' }));
    const stundenKarte = H.el('div', { class: 'einst-karte' });
    const umschalter = H.el('div', { class: 'segment aw-verhalten-sicht', role: 'group', 'aria-label': 'Stundenkriterien' });
    [[false, fach.name], [true, 'Alle Fächer']].forEach(function (o) {
      umschalter.appendChild(H.el('button', {
        type: 'button', text: o[1], 'aria-pressed': alleFaecher === o[0] ? 'true' : 'false',
        onclick: function () {
          if (alleFaecher === o[0]) return;
          kindRendern(Object.assign({}, parameterKind, { verhaltenAlleFaecher: o[0] }));
        }
      }));
    });
    stundenKarte.appendChild(H.el('div', { class: 'aw-verhalten-kopf' }, [
      umschalter,
      H.el('p', { class: 'text-klein text-schwach', text:
        (v.verhalten != null ? 'Arbeits- und Sozialverhalten Ø ' + A.zahlText(v.verhalten) + ' · ' : '')
        + (alleFaecher
          ? (v.verhaltenAnzahl ? (v.verhaltenAnzahl === 1 ? '1 Einheit' : v.verhaltenAnzahl + ' Einheiten') + ' in ' + (v.faecher.length === 1 ? '1 Fach' : v.faecher.length + ' Fächern') + ' – Übersicht für Zeugnisbemerkungen' : 'Noch keine Werte in dieser Klasse')
          : (v.verhaltenAnzahl ? (v.verhaltenAnzahl === 1 ? '1 Einheit' : v.verhaltenAnzahl + ' Einheiten') + ' in ' + fach.name : 'Noch keine Werte in ' + fach.name)) })
    ]));
    stundenZeilen.forEach(function (z) {
      const zaehlt = z.fachnote === true;
      const g = zaehlt ? M.mitarbeitGewicht(fach.id, z.kriterium) : gewicht(z.kriterium);
      stundenKarte.appendChild(kriteriumZeile(z, zaehlt ? g : 1, zaehlt ? (alleFaecher ? 'zählt zur Note' : 'zählt zur Note' + (g !== 1 ? ' ×' + String(g).replace('.', ',') : '')) : null));
    });
    if (!stundenZeilen.length) stundenKarte.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: 'Keine Stundenkriterien.' }));
    inhalt.appendChild(stundenKarte);
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach einst-gruppe-hinweis', text:
      'Das Arbeits- und Sozialverhalten fließt nie in die Fachnote ein. Welche Stundenkriterien zur Note zählen, legst du unter Einstellungen → Fächer und Kriterien fest („Zählt zur Fachleistung“).' }));
    const vVerlauf = alleFaecher ? v.verlauf : a.verlaufVerhalten;
    if (vVerlauf.length) inhalt.appendChild(H.el('div', { class: 'einst-karte aw-verlauf-karte' }, verlaufGrafik(vVerlauf)));

    // Kompetenzen nach Lehrplanbereich, mit Schnitt je Bereich
    inhalt.appendChild(H.el('h2', { class: 'einst-gruppe-titel', text: 'Kompetenzen' }));
    const fachKarte = H.el('div', { class: 'einst-karte' });
    a.bereiche.forEach(function (b) {
      fachKarte.appendChild(H.el('div', { class: 'aw-bereich' }, [
        H.el('span', { class: 'aw-bereich-name', text: b.bereich }),
        H.el('span', { class: 'aw-bereich-wert', text: b.schnitt == null ? '–' : 'Ø ' + A.zahlText(b.schnitt) })
      ]));
      b.zeilen.forEach(z => fachKarte.appendChild(kriteriumZeile(z, gewicht(z.kriterium))));
    });
    if (!a.bereiche.length) fachKarte.appendChild(H.el('p', { class: 'text-schwach einst-leer', text: 'Keine Kompetenzen für diese Stufe.' }));
    inhalt.appendChild(fachKarte);

    // Verlauf der Fachleistung (Kompetenzen und zur Note zählende Stundenkriterien)
    inhalt.appendChild(H.el('h2', { class: 'einst-gruppe-titel', text: 'Verlauf Fachleistung' }));
    if (a.verlauf.length) {
      inhalt.appendChild(H.el('div', { class: 'einst-karte aw-verlauf-karte' }, verlaufGrafik(a.verlauf)));
    } else {
      inhalt.appendChild(H.el('div', { class: 'einst-karte' }, H.el('p', { class: 'text-schwach einst-leer', text: 'Noch kein Verlauf – es liegen keine Werte zur Fachleistung vor.' })));
    }

    // Textbausteine: Fachleistung und Arbeits- und Sozialverhalten getrennt
    function textKarte(text, leerText, hinweis) {
      if (!text) return H.el('div', { class: 'einst-karte' }, H.el('p', { class: 'text-schwach einst-leer', text: leerText }));
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
      return H.el('div', { class: 'einst-karte aw-text-karte' }, [
        feld,
        H.el('p', { class: 'text-klein text-schwach', text: hinweis }),
        H.el('div', { class: 'knopfzeile' }, kopieren)
      ]);
    }
    const wortStufe = a.benotet ? 'Noten' : 'Stufen';
    inhalt.appendChild(H.el('h2', { class: 'einst-gruppe-titel', text: 'Textbaustein Fachleistung' }));
    inhalt.appendChild(textKarte(A.textbaustein(kind, fach, a, 'fachleistung'),
      'Ein Textbaustein entsteht, sobald ' + wortStufe + ' zu Kompetenzen oder Mündlicher Mitarbeit erfasst sind.',
      'Aus den Beschreibungstexten der überwiegend vergebenen ' + wortStufe + ' in ' + fach.name + '. Vor dem Kopieren frei anpassbar; Änderungen werden nicht gespeichert.'));
    inhalt.appendChild(H.el('h2', { class: 'einst-gruppe-titel', text: 'Textbaustein Arbeits- und Sozialverhalten' }));
    inhalt.appendChild(textKarte(A.textbaustein(kind, alleFaecher ? null : fach, v, 'verhalten'),
      'Ein Textbaustein entsteht, sobald Werte zum Arbeits- und Sozialverhalten erfasst sind.',
      'Aus den Beschreibungstexten der überwiegend vergebenen ' + wortStufe + (alleFaecher ? ' über alle Fächer' : ' in ' + fach.name) + '. Vor dem Kopieren frei anpassbar; Änderungen werden nicht gespeichert.'));

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
      kindRendern({ klasseId: klasse.id, fachId: parameterKind.fachId, kindId: ziel.id });
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
  N.bildschirmRegistrieren('kind', {
    titel: function () {
      const klasse = parameterKind && M.klasse(parameterKind.klasseId);
      const kind = klasse && M.kind(klasse, parameterKind.kindId);
      return kind ? M.kindName(kind) : 'Kind';
    },
    zurueck: true,
    kopfRechts: kindKopfRechts,
    zeigen: kindRendern
  });

  return A;
})();
