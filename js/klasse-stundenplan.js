/*
 * Notenblock – Stundenplan je Klasse
 *
 * Jede Klasse hat ihre Stundenpläne als Wochenraster (Stunden × Tage) –
 * nacheinander, jeder mit einem „gilt ab“. Gezeigt und bearbeitet wird immer
 * genau einer; die Leiste über dem Raster sagt welcher und blättert durch die
 * Geschichte. Bearbeiten ändert den gezeigten Plan für seinen Zeitraum, für
 * eine echte Umstellung legt man mit „+ Neuer Plan ab …“ einen neuen an.
 * Ein Eintrag ist entweder eine eigene Stunde (Fach aus den Klassenfächern,
 * Raum, Turnus jede/A/B) oder eine fremde Stunde (freie Bezeichnung, optional
 * Lehrkraft und Raum), die nur der Übersicht dient und weder bewertet noch
 * geplant wird. Zwei unmittelbar aufeinanderfolgende eigene Stunden desselben
 * Fachs erscheinen als ein zusammenhängender Block (Doppelstunde).
 *
 * Der Plan der Lehrerin wird nicht eigens gepflegt: Er ist die Summe aller
 * eigenen Stunden aller Klassen. Überschneidet sich eine eigene Stunde mit
 * einer eigenen Stunde einer anderen Klasse, erscheint beim Eintragen ein
 * Hinweis. Ausfall- und Zusatztermine werden ebenfalls je Klasse gepflegt.
 * Uhrzeiten, Schuljahr, A-Woche, Ferien und Feiertage bleiben global
 * (Einstellungen → Stundenplan).
 *
 * Bausteine: KS.rasterEinfuegen(klasse, container) baut Raster, Ausfälle und
 * Zusatztermine in einen Container – genutzt vom Bildschirm der Klasse und vom
 * Schritt 3 der Klassenanlage.
 */
'use strict';
NB.KlasseStundenplan = (function () {
  const KS = {};
  const H = NB.Hilfen;
  const M = NB.Modell;
  const N = NB.Navigation;
  const SP = NB.Stundenplan;

  const HOECHSTE_STUNDE = 10;
  let aktuell = null;        // { klasseId } des offenen Bildschirms
  let stundeParameter = null; // Parameter des Stundeneditors

  /* ---------- Öffnen ---------- */

  KS.oeffnen = klasseId => N.bildschirmOeffnen('klasse-stundenplan', { klasseId: klasseId });

  /* ---------- Bausteine ---------- */

  function gruppe(titel, kinder, hinweis) {
    return H.el('section', { class: 'einst-gruppe' }, [
      titel ? H.el('h2', { class: 'einst-gruppe-titel', text: titel }) : null,
      H.el('div', { class: 'einst-karte' }, kinder),
      hinweis ? H.el('p', { class: 'text-klein text-schwach einst-gruppe-hinweis', text: hinweis }) : null
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
  function datumKnopf(wert, leerText, beiAuswahl, label, klasse) {
    const knopf = H.el('button', { type: 'button', class: 'knopf datumknopf', 'aria-label': label || 'Datum wählen' },
      H.el('span', { text: wert ? H.datumMitWochentag(wert) : leerText }));
    knopf.addEventListener('click', function () {
      NB.Kalender.oeffnen({
        datum: wert || H.heute(),
        markierungen: (jahr, monat) => SP.kalenderMarkierungen(jahr, monat, klasse ? klasse.id : null),
        beiAuswahl: function (iso) {
          wert = iso;
          knopf.firstChild.textContent = H.datumMitWochentag(iso);
          beiAuswahl(iso);
        }
      });
    });
    return knopf;
  }

  function fachName(id) { const f = M.fach(id); return f ? f.name : 'Fach fehlt'; }

  /** Kurztext eines Plan-Eintrags („Deutsch“, „Sport / Frau Beispiel“). */
  function eintragText(e) {
    if (e.art === 'fremd') return (e.bezeichnung || 'Fremde Stunde') + (e.lehrkraft ? ' / ' + e.lehrkraft : '');
    return fachName(e.fachId);
  }

  function zeileFeld(label, feld, beschreibung) {
    return H.el('label', { class: 'einst-zeile einst-zeile-feld' }, [
      H.el('div', { class: 'einst-text' }, [
        H.el('span', { class: 'einst-label', text: label }),
        beschreibung ? H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: beschreibung }) : null
      ]),
      H.el('div', { class: 'einst-steuerung' }, feld)
    ]);
  }

  /* ---------- Wochenraster ---------- */

  /** Einträge eines Tages je Stunde: { '1': [eintrag, …] } */
  function tagBelegung(eintraege, wochentag) {
    const je = {};
    eintraege.forEach(function (e) {
      if (Number(e.wochentag) !== wochentag) return;
      const s = String(e.stunde);
      if (!je[s]) je[s] = [];
      je[s].push(e);
    });
    Object.keys(je).forEach(s => je[s].sort((a, b) => (a.turnus || 'jede').localeCompare(b.turnus || 'jede')));
    return je;
  }

  /** Setzt eine eigene Stunde die vorige fort (gleiches Fach, gleicher Turnus)? Dann ist es eine Doppelstunde. */
  function istFortsetzung(vorige, aktuelle) {
    if (!vorige || !aktuelle || vorige.length !== 1 || aktuelle.length !== 1) return false;
    const a = vorige[0], b = aktuelle[0];
    return a.art !== 'fremd' && b.art !== 'fremd' && a.fachId === b.fachId && (a.turnus || 'jede') === (b.turnus || 'jede');
  }

  /** Raster eines Plans (Stunden × Tage). Tage 6 und 7 nur, wenn belegt. */
  function rasterBauen(klasse, beiZelle, eintraege) {
    const plan = eintraege || [];
    let hoechste = 6;
    plan.forEach(e => { if (Number(e.stunde) > hoechste) hoechste = Number(e.stunde); });
    const stunden = Math.min(HOECHSTE_STUNDE, hoechste + (hoechste < HOECHSTE_STUNDE ? 1 : 0));
    const tage = [1, 2, 3, 4, 5];
    if (plan.some(e => Number(e.wochentag) === 6)) tage.push(6);
    if (plan.some(e => Number(e.wochentag) === 7)) tage.push(7);

    const raster = H.el('div', { class: 'plan-raster', role: 'grid', 'aria-label': 'Stundenplan der ' + klasse.name });
    raster.style.gridTemplateColumns = '26px repeat(' + tage.length + ', minmax(0, 1fr))';

    // Kopfzeile
    raster.appendChild(H.el('div', { class: 'plan-ecke', role: 'columnheader' }));
    tage.forEach(function (wt) {
      raster.appendChild(H.el('div', { class: 'plan-tag', role: 'columnheader', text: H.WOCHENTAGE_KURZ[wt - 1] }));
    });

    const belegung = {};
    tage.forEach(wt => { belegung[wt] = tagBelegung(plan, wt); });

    for (let s = 1; s <= stunden; s++) {
      const zeit = SP.uhrzeitText(s);
      raster.appendChild(H.el('div', { class: 'plan-stunde', role: 'rowheader', text: s + '.', title: zeit || undefined, 'aria-label': s + '. Stunde' + (zeit ? ', ' + zeit : '') }));
      tage.forEach(function (wt) {
        const eintraege = belegung[wt][String(s)] || [];
        const fortsetzung = istFortsetzung(belegung[wt][String(s - 1)], eintraege);
        const weiter = istFortsetzung(eintraege, belegung[wt][String(s + 1)]);
        const klassen = ['plan-zelle'];
        if (!eintraege.length) klassen.push('frei');
        else if (eintraege.every(e => e.art === 'fremd')) klassen.push('fremd');
        else klassen.push('eigene');
        if (fortsetzung) klassen.push('fortsetzung');
        if (weiter) klassen.push('weiter');
        const inhalt = [];
        if (eintraege.length && !fortsetzung) {
          eintraege.forEach(function (e) {
            inhalt.push(H.el('span', { class: 'plan-zelle-text', text: eintragText(e) + (e.turnus && e.turnus !== 'jede' ? ' ' + e.turnus : '') }));
          });
          const raum = eintraege.length === 1 ? eintraege[0].raum : '';
          if (raum) inhalt.push(H.el('span', { class: 'plan-zelle-raum', text: raum }));
        }
        const beschreibung = eintraege.length
          ? eintraege.map(e => eintragText(e) + (e.raum ? ', ' + SP.raumText(e.raum) : '') + (e.turnus && e.turnus !== 'jede' ? ', ' + SP.turnusText(e.turnus) : '')).join('; ')
          : 'frei';
        raster.appendChild(H.el('button', {
          type: 'button', class: klassen.join(' '), role: 'gridcell',
          'aria-label': H.WOCHENTAGE[wt - 1] + ', ' + s + '. Stunde: ' + beschreibung,
          onclick: () => beiZelle(wt, s, eintraege)
        }, inhalt));
      });
    }
    return { raster: raster, tage: tage };
  }

  /**
   * Kompaktes Wochenraster nur zur Ansicht (Klassenübersicht): keine Zelle ist
   * ein eigenes Ziel, der ganze Block führt zum Bearbeiten.
   */
  KS.rasterAnsicht = function (klasse) {
    const gebaut = rasterBauen(klasse, function () { KS.oeffnen(klasse.id); }, SP.klassenplan(klasse, H.heute()));
    gebaut.raster.classList.add('nur-ansicht');
    H.$$('.plan-zelle', gebaut.raster).forEach(function (zelle) {
      zelle.tabIndex = -1;
      zelle.setAttribute('aria-hidden', 'true');
    });
    return gebaut.raster;
  };

  /**
   * Raster, Ausfall- und Zusatztermine der Klasse in einen Container einfügen.
   * neuZeichnen() wird nach Änderungen an Ausfällen/Zusatzterminen gerufen.
   */
  KS.rasterEinfuegen = function (klasse, container, neuZeichnen, optionen) {
    optionen = optionen || {};
    const plan = optionen.plan || SP.aktuellerPlan(klasse);
    const planId = plan ? plan.id : null;
    const eintraege = SP.planEintraege(plan);
    if (optionen.planLeiste) planLeisteEinfuegen(klasse, container, plan, optionen.beiPlanWechsel, neuZeichnen);
    const faecher = M.klassenFaecher(klasse);
    if (!faecher.length) {
      container.appendChild(H.el('p', { class: 'bw-hinweis', text: 'Die Klasse hat noch kein Fach – für eigene Stunden zuerst Fächer wählen. Fremde Stunden lassen sich trotzdem eintragen.' }));
    }
    const gebaut = rasterBauen(klasse, function (wt, s, inZelle) {
      if (!inZelle.length) { N.bildschirmOeffnen('klasse-stunde', { klasseId: klasse.id, planId: planId, wochentag: wt, stunde: s }); return; }
      if (inZelle.length === 1) { N.bildschirmOeffnen('klasse-stunde', { klasseId: klasse.id, planId: planId, id: inZelle[0].id }); return; }
      zelleWaehlen(klasse, wt, s, inZelle, planId);
    }, eintraege);
    container.appendChild(gebaut.raster);
    const legende = [];
    legende.push('Tipp auf eine Zelle: Stunde eintragen oder bearbeiten.');
    if (eintraege.some(e => e.art === 'fremd')) legende.push('Blasse Zellen sind fremde Stunden.');
    if (gebaut.tage.length < 7) {
      container.appendChild(H.el('p', { class: 'text-klein text-schwach plan-legende' }, [
        legende.join(' ') + ' Wochenende: ',
        gebaut.tage.indexOf(6) < 0 ? H.el('button', { type: 'button', class: 'textknopf klein', text: 'Samstag', onclick: () => N.bildschirmOeffnen('klasse-stunde', { klasseId: klasse.id, planId: planId, wochentag: 6, stunde: 1 }) }) : null,
        gebaut.tage.indexOf(6) < 0 && gebaut.tage.indexOf(7) < 0 ? ' · ' : null,
        gebaut.tage.indexOf(7) < 0 ? H.el('button', { type: 'button', class: 'textknopf klein', text: 'Sonntag', onclick: () => N.bildschirmOeffnen('klasse-stunde', { klasseId: klasse.id, planId: planId, wochentag: 7, stunde: 1 }) }) : null
      ]));
    } else {
      container.appendChild(H.el('p', { class: 'text-klein text-schwach plan-legende', text: legende.join(' ') }));
    }
    ausfallEinfuegen(klasse, container, neuZeichnen);
    zusatzEinfuegen(klasse, container, neuZeichnen);
  };

  /* ---------- Leiste: welcher Stundenplan wird gezeigt ---------- */

  /** „Gilt seit 16.11.“, „Galt 02.11. – 15.11.“, „Gilt ab 01.02.“ – aus Sicht von heute. */
  function planKopfText(klasse, plan) {
    if (!plan) return '';
    const heute = H.heute();
    const bis = SP.planBis(klasse, plan);
    const ab = plan.abDatum;
    if (!ab && !bis) return 'Gilt immer';
    if (ab && ab > heute) return 'Gilt ab ' + H.datumKurz(ab);
    if (bis && bis < heute) return ab ? 'Galt ' + H.datumKurz(ab) + ' – ' + H.datumKurz(bis) : 'Galt bis ' + H.datumKurz(bis);
    if (ab && bis) return 'Gilt ' + H.datumKurz(ab) + ' – ' + H.datumKurz(bis);
    if (ab) return 'Gilt seit ' + H.datumKurz(ab);
    return 'Gilt bis ' + H.datumKurz(bis);
  }

  /**
   * Kopf über dem Raster: welcher Plan gezeigt wird, Pfeile zum Blättern durch
   * die Geschichte und der Knopf für einen neuen Plan ab einem Datum.
   * Bearbeiten im Raster ändert immer den gezeigten Plan – für eine echte
   * Umstellung legt man einen neuen an.
   */
  function planLeisteEinfuegen(klasse, container, plan, beiPlanWechsel, neuZeichnen) {
    const liste = SP.plaene(klasse);
    const i = liste.findIndex(p => p.id === (plan && plan.id));
    const aktuellerPlan = SP.planIstAktuell(klasse, plan);

    const kopf = H.el('div', { class: 'plan-leiste-kopf' }, [
      liste.length > 1 ? H.el('button', {
        type: 'button', class: 'symbolknopf', 'aria-label': 'Vorheriger Stundenplan',
        disabled: i <= 0 ? true : undefined,
        onclick: () => beiPlanWechsel && beiPlanWechsel(liste[i - 1].id)
      }, H.el('span', { class: 'pfeil-zurueck', 'aria-hidden': 'true', text: '‹' })) : null,
      H.el('div', { class: 'plan-leiste-text' }, [
        H.el('span', { class: 'plan-leiste-titel', text: planKopfText(klasse, plan) }),
        H.el('span', { class: 'text-klein text-schwach', text: liste.length > 1
          ? 'Stundenplan ' + (i + 1) + ' von ' + liste.length + (aktuellerPlan ? ' · gilt heute' : '')
          : 'Dein einziger Stundenplan für diese Klasse' })
      ]),
      liste.length > 1 ? H.el('button', {
        type: 'button', class: 'symbolknopf', 'aria-label': 'Nächster Stundenplan',
        disabled: i >= liste.length - 1 ? true : undefined,
        onclick: () => beiPlanWechsel && beiPlanWechsel(liste[i + 1].id)
      }, H.el('span', { 'aria-hidden': 'true', text: '›' })) : null
    ]);

    const knoepfe = [
      H.el('button', { type: 'button', class: 'knopf klein', text: '+ Neuer Plan ab …', onclick: () => planNeuWaehlen(klasse, beiPlanWechsel) })
    ];
    if (i > 0) {
      knoepfe.push(H.el('button', { type: 'button', class: 'knopf klein', text: 'Datum ändern', onclick: () => planDatumAendern(klasse, plan, neuZeichnen) }));
      knoepfe.push(H.el('button', { type: 'button', class: 'knopf klein gefaehrlich', text: 'Verwerfen', onclick: () => planVerwerfen(klasse, plan, beiPlanWechsel) }));
    }

    const hinweis = aktuellerPlan
      ? 'Änderungen im Raster gelten für diesen Zeitraum – auch rückwirkend. Hat sich der Stundenplan wirklich geändert, lege einen neuen ab dem ersten Tag an.'
      : 'Du bearbeitest einen Stundenplan, der heute nicht gilt. Änderungen wirken nur in seinem Zeitraum.';

    // Stunden, die durch die Umstellung aus dem Raster gefallen sind
    const offen = NB.PlanUmhaengen.offene(klasse, plan);
    const umhaengen = offen.length ? H.el('div', { class: 'plan-leiste-offen' }, [
      H.el('span', { class: 'text-klein', text: offen.length === 1
        ? 'Eine erfasste Stunde passt nicht mehr in dieses Raster.'
        : offen.length + ' erfasste Stunden passen nicht mehr in dieses Raster.' }),
      H.el('button', { type: 'button', class: 'knopf klein', text: 'Umhängen …', onclick: () => NB.PlanUmhaengen.oeffnen(klasse.id, plan.id) })
    ]) : null;

    container.appendChild(H.el('section', { class: 'plan-leiste' + (aktuellerPlan ? '' : ' plan-leiste-anderer') }, [
      kopf,
      H.el('div', { class: 'plan-leiste-knoepfe' }, knoepfe),
      H.el('p', { class: 'text-klein text-schwach plan-leiste-hinweis', text: hinweis }),
      umhaengen
    ]));
  }

  /** Datum für einen neuen Plan wählen und ihn anlegen (Kopie des bis dahin gültigen). */
  function planNeuWaehlen(klasse, beiPlanWechsel) {
    NB.Kalender.oeffnen({
      datum: H.heute(),
      markierungen: (jahr, monat) => SP.kalenderMarkierungen(jahr, monat, klasse.id),
      fusszeile: () => 'Ab diesem Tag gilt der neue Stundenplan. Davor bleibt alles, wie es war.',
      beiAuswahl: function (iso) {
        const vorhanden = SP.plaene(klasse).find(p => p.abDatum === iso);
        const plan = SP.planNeu(M.klasse(klasse.id), iso);
        if (beiPlanWechsel) beiPlanWechsel(plan.id);
        NB.App.meldung(vorhanden
          ? 'Ab ' + H.datumKurz(iso) + ' gibt es schon einen Stundenplan – er wird jetzt gezeigt.'
          : 'Neuer Stundenplan ab ' + H.datumKurz(iso) + '. Er ist eine Kopie des bisherigen – ändere jetzt die Stunden, die anders sind. Vor diesem Tag bleibt alles, wie es war.');
      }
    });
  }

  /** „Gilt ab“ eines Plans nachträglich verschieben. */
  function planDatumAendern(klasse, plan, neuZeichnen) {
    NB.Kalender.oeffnen({
      datum: plan.abDatum || H.heute(),
      markierungen: (jahr, monat) => SP.kalenderMarkierungen(jahr, monat, klasse.id),
      fusszeile: () => 'Ab diesem Tag gilt dieser Stundenplan.',
      beiAuswahl: function (iso) {
        const fehler = SP.planDatumSetzen(M.klasse(klasse.id), plan.id, iso);
        if (fehler) { NB.Dialog.hinweis({ titel: 'Datum nicht möglich', text: fehler }); return; }
        if (neuZeichnen) neuZeichnen();
        NB.App.meldung('Der Stundenplan gilt jetzt ab ' + H.datumKurz(iso) + '.');
      }
    });
  }

  /** Einen versehentlich angelegten Plan verwerfen – nur solange nichts darunter erfasst wurde. */
  async function planVerwerfen(klasse, plan, beiPlanWechsel) {
    const bis = SP.planBis(klasse, plan);
    const einheiten = M.einheitenImZeitraum(klasse.id, plan.abDatum, bis);
    if (einheiten.length) {
      await NB.Dialog.hinweis({
        titel: 'Lässt sich nicht verwerfen',
        text: 'In diesem Zeitraum ' + (einheiten.length === 1 ? 'ist schon eine Stunde' : 'sind schon ' + einheiten.length + ' Stunden') + ' erfasst. Stundenpläne mit erfassten Stunden bleiben erhalten – du kannst stattdessen das Datum ändern oder die Stunden im Raster anpassen.'
      });
      return;
    }
    const ok = await NB.Dialog.bestaetigen({
      titel: 'Stundenplan verwerfen?',
      text: 'Der Stundenplan ab ' + H.datumKurz(plan.abDatum) + ' wird entfernt. Danach gilt in diesem Zeitraum wieder der vorherige Plan. Erfasste Stunden gibt es hier keine.',
      bestaetigen: 'Verwerfen',
      gefaehrlich: true
    });
    if (!ok) return;
    const frisch = M.klasse(klasse.id);
    SP.planVerwerfen(frisch, plan.id);
    if (beiPlanWechsel) beiPlanWechsel(SP.aktuellerPlan(M.klasse(klasse.id)).id);
    NB.App.meldung('Stundenplan verworfen.');
  }

  /** Mehrere Einträge in einer Zelle (A- und B-Woche): welcher soll bearbeitet werden? */
  async function zelleWaehlen(klasse, wt, s, eintraege, planId) {
    const optionen = eintraege.map(e => ({ text: eintragText(e), untertitel: [SP.turnusText(e.turnus), SP.raumText(e.raum)].filter(Boolean).join(' · ') || 'Jede Woche', wert: e.id }));
    optionen.push({ text: 'Weitere Stunde eintragen', wert: '__neu__', klasse: 'auswahl-sekundaer' });
    const wahl = await NB.Dialog.auswahl({ titel: H.WOCHENTAGE[wt - 1] + ', ' + s + '. Stunde', optionen: optionen });
    if (!wahl) return;
    if (wahl === '__neu__') N.bildschirmOeffnen('klasse-stunde', { klasseId: klasse.id, planId: planId, wochentag: wt, stunde: s });
    else N.bildschirmOeffnen('klasse-stunde', { klasseId: klasse.id, planId: planId, id: wahl });
  }

  /* ---------- Ausfalltermine der Klasse ---------- */

  function ausfallText(a) { return a.stunde ? a.stunde + '. Stunde' : 'Ganzer Tag'; }

  function ausfallEinfuegen(klasse, container, neuZeichnen) {
    const zeilen = (klasse.ausnahmen || []).slice().sort((a, b) => (a.datum < b.datum ? -1 : 1)).map(a => eintrag(
      H.datumMitWochentag(a.datum), ausfallText(a) + (a.grund ? ' · ' + a.grund : ''), null,
      function () { klasse.ausnahmen = (klasse.ausnahmen || []).filter(x => x.id !== a.id); M.klasseSpeichern(klasse); neuZeichnen(); }
    ));
    const neu = { datum: null };
    const umfang = H.el('select', { 'aria-label': 'Was fällt aus', hidden: true });
    function umfangFuellen() {
      H.leeren(umfang);
      umfang.appendChild(H.el('option', { value: 'tag', text: 'Ganzer Tag' }));
      if (neu.datum) SP.klassenStundenAmTag(klasse, neu.datum).forEach(function (s) {
        umfang.appendChild(H.el('option', { value: String(s.stunde), text: s.stunde + '. Stunde · ' + (s.art === 'fremd' ? (s.bezeichnung || 'fremde Stunde') : fachName(s.fachId)) }));
      });
      umfang.hidden = !neu.datum;
    }
    const datum = datumKnopf(null, 'Datum wählen', iso => { neu.datum = iso; umfangFuellen(); }, 'Ausfalltermin', klasse);
    const grundFeld = H.el('input', { type: 'text', placeholder: 'Grund (optional), zum Beispiel Wandertag', autocomplete: 'off', 'aria-label': 'Grund' });
    const fehler = H.el('p', { class: 'fehler', hidden: true });
    const hinzu = H.el('button', { type: 'button', class: 'knopf primaer', text: 'Ausfall hinzufügen', onclick: function () {
      if (!neu.datum) { fehler.textContent = 'Bitte ein Datum wählen.'; fehler.hidden = false; return; }
      if (!Array.isArray(klasse.ausnahmen)) klasse.ausnahmen = [];
      klasse.ausnahmen.push({ id: H.neueId(), datum: neu.datum, stunde: (umfang.value && umfang.value !== 'tag') ? Number(umfang.value) : null, grund: grundFeld.value.trim() });
      M.klasseSpeichern(klasse);
      neuZeichnen();
    } });
    zeilen.push(H.el('div', { class: 'einst-zeile einst-zeile-feld einst-formular' }, [
      H.el('div', { class: 'einst-text' }, [
        H.el('div', { class: 'einst-label', text: 'Ausfall hinzufügen' }),
        H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Ein ganzer Tag (etwa Wandertag) oder eine einzelne Stunde dieses Tages.' })
      ]),
      H.el('div', { class: 'einst-steuerung einst-formular-felder' }, [datum, umfang, grundFeld, fehler, hinzu])
    ]));
    container.appendChild(gruppe('Ausfalltermine', zeilen));
  }

  /* ---------- Zusatztermine der Klasse ---------- */

  function zusatzEinfuegen(klasse, container, neuZeichnen) {
    const zeilen = (klasse.zusatz || []).slice().sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.stunde - b.stunde)).map(z => eintrag(
      H.datumMitWochentag(z.datum) + ' · ' + z.stunde + '. Stunde',
      fachName(z.fachId) + (z.raum ? ' · ' + SP.raumText(z.raum) : ''),
      () => N.bildschirmOeffnen('klasse-stunde', { klasseId: klasse.id, zusatzId: z.id }),
      function () { klasse.zusatz = (klasse.zusatz || []).filter(x => x.id !== z.id); M.klasseSpeichern(klasse); neuZeichnen(); }
    ));
    zeilen.push(H.el('div', { class: 'einst-eintrag' }, H.el('button', {
      type: 'button', class: 'einst-eintrag-text einst-hinzu', text: '+ Zusatztermin',
      onclick: () => N.bildschirmOeffnen('klasse-stunde', { klasseId: klasse.id, zusatz: true })
    })));
    container.appendChild(gruppe('Zusatztermine', zeilen, 'Eine zusätzliche eigene Stunde an einem bestimmten Tag, etwa eine Vertretung oder eine verlegte Stunde. Zusatztermine gelten immer als Unterrichtstag.'));
  }

  /* ---------- Bildschirm: Stundenplan der Klasse ---------- */

  function planRendern(parameter) {
    aktuell = parameter || {};
    const wurzel = H.$('#bildschirm-klasse-stundenplan');
    H.leeren(wurzel);
    const klasse = M.klasse(aktuell.klasseId);
    if (!klasse) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diese Klasse gibt es nicht mehr.' })));
      return;
    }
    const plan = SP.plan(klasse, aktuell.planId) || SP.aktuellerPlan(klasse);
    aktuell.planId = plan ? plan.id : null;
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    inhalt.appendChild(H.el('h2', { class: 'aw-titel', text: klasse.name }));
    KS.rasterEinfuegen(klasse, inhalt, () => planRendern(aktuell), {
      plan: plan,
      planLeiste: true,
      beiPlanWechsel: function (planId) { aktuell.planId = planId; planRendern(aktuell); }
    });
    inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text: 'Uhrzeiten, Schuljahr, A-Woche, Ferien und Feiertage gelten für alle Klassen: Einstellungen → Stundenplan.' }));
    wurzel.appendChild(inhalt);
  }

  /* ---------- Stundeneditor (Plan-Eintrag oder Zusatztermin) ---------- */

  function stundeRendern(parameter) {
    stundeParameter = parameter || {};
    const wurzel = H.$('#bildschirm-klasse-stunde');
    H.leeren(wurzel);
    const klasse = M.klasse(stundeParameter.klasseId);
    if (!klasse) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diese Klasse gibt es nicht mehr.' })));
      return;
    }
    const istZusatz = !!(stundeParameter.zusatz || stundeParameter.zusatzId);
    // Alle Änderungen gelten dem Plan, aus dem die Stunde geöffnet wurde
    const plan = SP.plan(klasse, stundeParameter.planId) || SP.aktuellerPlan(klasse);
    const planEintraege = SP.planEintraege(plan);
    let vorlage = null;
    if (stundeParameter.id) vorlage = planEintraege.find(e => e.id === stundeParameter.id) || null;
    if (stundeParameter.zusatzId) vorlage = (klasse.zusatz || []).find(z => z.id === stundeParameter.zusatzId) || null;

    const faecher = M.klassenFaecher(klasse);
    const werte = {
      art: vorlage && vorlage.art === 'fremd' ? 'fremd' : 'eigene',
      wochentag: vorlage && vorlage.wochentag ? Number(vorlage.wochentag) : (stundeParameter.wochentag || 1),
      datum: vorlage && vorlage.datum ? vorlage.datum : null,
      stunde: vorlage ? Number(vorlage.stunde) : (stundeParameter.stunde || 1),
      fachId: vorlage && vorlage.fachId ? vorlage.fachId : (faecher[0] ? faecher[0].id : ''),
      bezeichnung: vorlage ? (vorlage.bezeichnung || '') : '',
      lehrkraft: vorlage ? (vorlage.lehrkraft || '') : '',
      raum: vorlage ? (vorlage.raum || '') : '',
      turnus: vorlage && vorlage.turnus ? vorlage.turnus : 'jede'
    };
    if (!istZusatz && werte.art === 'eigene' && !faecher.length) werte.art = 'fremd';

    const felder = [];

    // Art: eigene oder fremde Stunde (nicht bei Zusatzterminen – die sind immer eigene)
    const eigeneFelder = [];
    const fremdeFelder = [];
    function artAnwenden() {
      eigeneFelder.forEach(f => { f.hidden = werte.art !== 'eigene'; });
      fremdeFelder.forEach(f => { f.hidden = werte.art !== 'fremd'; });
    }
    if (!istZusatz) {
      const art = H.el('div', { class: 'segment', role: 'group', 'aria-label': 'Art der Stunde' });
      [['eigene', 'Eigene Stunde'], ['fremd', 'Fremde Stunde']].forEach(function (a) {
        art.appendChild(H.el('button', {
          type: 'button', dataset: { wert: a[0] }, text: a[1], 'aria-pressed': werte.art === a[0] ? 'true' : 'false',
          onclick: function () {
            werte.art = a[0];
            H.$$('button', art).forEach(k => k.setAttribute('aria-pressed', k.dataset.wert === a[0] ? 'true' : 'false'));
            artAnwenden();
          }
        }));
      });
      felder.push(H.el('div', { class: 'einst-zeile einst-zeile-segment' }, [
        H.el('div', { class: 'einst-text' }, [
          H.el('div', { class: 'einst-label', text: 'Art' }),
          H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Eigene Stunden unterrichtest du selbst – sie werden bewertet und geplant. Fremde Stunden (andere Lehrkraft) dienen nur der Übersicht.' })
        ]),
        H.el('div', { class: 'einst-steuerung' }, art)
      ]));
    }

    if (istZusatz) {
      const datum = datumKnopf(werte.datum, 'Datum wählen', iso => { werte.datum = iso; }, 'Datum des Zusatztermins', klasse);
      felder.push(zeileFeld('Datum', datum));
    } else {
      const wtFeld = H.el('select', { 'aria-label': 'Wochentag' });
      H.WOCHENTAGE.forEach((name, i) => wtFeld.appendChild(H.el('option', { value: String(i + 1), text: name })));
      wtFeld.value = String(werte.wochentag);
      wtFeld.addEventListener('change', () => { werte.wochentag = Number(wtFeld.value); });
      felder.push(zeileFeld('Wochentag', wtFeld));
    }

    const stundeFeld = H.el('select', { 'aria-label': 'Stunde' });
    for (let s = 1; s <= HOECHSTE_STUNDE; s++) {
      const zeit = SP.uhrzeitText(s);
      stundeFeld.appendChild(H.el('option', { value: String(s), text: s + '. Stunde' + (zeit ? ' (' + zeit + ')' : '') }));
    }
    stundeFeld.value = String(werte.stunde);
    stundeFeld.addEventListener('change', () => { werte.stunde = Number(stundeFeld.value); });
    felder.push(zeileFeld('Stunde', stundeFeld));

    // Eigene Stunde: Fach aus den Klassenfächern
    const fachFeld = H.el('select', { 'aria-label': 'Fach' });
    faecher.forEach(f => fachFeld.appendChild(H.el('option', { value: f.id, text: f.name })));
    if (werte.fachId) fachFeld.value = werte.fachId;
    fachFeld.addEventListener('change', () => { werte.fachId = fachFeld.value; });
    const fachZeile = zeileFeld('Fach', fachFeld, faecher.length ? null : 'Die Klasse hat noch kein Fach (Klasse verwalten → Fächer).');
    eigeneFelder.push(fachZeile);
    felder.push(fachZeile);

    // Fremde Stunde: Bezeichnung und Lehrkraft
    const bezeichnungFeld = H.el('input', { type: 'text', value: werte.bezeichnung, placeholder: 'zum Beispiel Sport oder Förderunterricht', autocomplete: 'off', 'aria-label': 'Bezeichnung' });
    bezeichnungFeld.addEventListener('input', () => { werte.bezeichnung = bezeichnungFeld.value; });
    const lehrkraftFeld = H.el('input', { type: 'text', value: werte.lehrkraft, placeholder: 'optional', autocomplete: 'off', 'aria-label': 'Lehrkraft' });
    lehrkraftFeld.addEventListener('input', () => { werte.lehrkraft = lehrkraftFeld.value; });
    const bezeichnungZeile = zeileFeld('Bezeichnung', bezeichnungFeld);
    const lehrkraftZeile = zeileFeld('Lehrkraft', lehrkraftFeld);
    fremdeFelder.push(bezeichnungZeile, lehrkraftZeile);
    felder.push(bezeichnungZeile, lehrkraftZeile);

    const raumFeld = H.el('input', { type: 'text', value: werte.raum, placeholder: 'zum Beispiel 12 oder Turnhalle', autocomplete: 'off', 'aria-label': 'Raum' });
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
          H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Bei A- und B-Wochen zählt die A-Woche aus Einstellungen → Stundenplan. Aktuell ist die ' + SP.wochenTyp(H.heute()) + '-Woche.' })
        ]),
        H.el('div', { class: 'einst-steuerung' }, turnus)
      ]));
    }
    artAnwenden();

    const fehler = H.el('p', { class: 'fehler', role: 'alert', hidden: true });
    function fehlerZeigen(text) { fehler.textContent = text; fehler.hidden = false; }

    function speichern(ev) {
      ev.preventDefault();
      fehler.hidden = true;
      const eigene = istZusatz || werte.art === 'eigene';
      if (eigene && !werte.fachId) { fehlerZeigen('Bitte ein Fach wählen – die Klasse braucht dafür mindestens ein Fach.'); return; }
      if (!eigene && !werte.bezeichnung.trim()) { fehlerZeigen('Bitte eine Bezeichnung für die fremde Stunde eintragen.'); return; }
      if (istZusatz && !werte.datum) { fehlerZeigen('Bitte ein Datum wählen.'); return; }

      if (istZusatz) {
        if (!Array.isArray(klasse.zusatz)) klasse.zusatz = [];
        const neu = { id: vorlage ? vorlage.id : H.neueId(), datum: werte.datum, stunde: werte.stunde, fachId: werte.fachId, raum: werte.raum.trim() };
        const i = klasse.zusatz.findIndex(x => x.id === neu.id);
        if (i >= 0) klasse.zusatz[i] = neu; else klasse.zusatz.push(neu);
        M.klasseSpeichern(klasse);
        N.zurueck();
        return;
      }

      // Gleicher Tag, gleiche Stunde in dieser Klasse: Konflikt, wenn sich die Turnusse überschneiden
      const doppelt = planEintraege.find(function (e) {
        if (vorlage && e.id === vorlage.id) return false;
        if (Number(e.wochentag) !== werte.wochentag || Number(e.stunde) !== werte.stunde) return false;
        const t = e.turnus || 'jede';
        return t === werte.turnus || t === 'jede' || werte.turnus === 'jede';
      });
      if (doppelt) {
        fehlerZeigen('Am ' + H.WOCHENTAGE[werte.wochentag - 1] + ' in der ' + werte.stunde + '. Stunde steht bereits ' + eintragText(doppelt) + (doppelt.turnus && doppelt.turnus !== 'jede' ? ' (' + SP.turnusText(doppelt.turnus) + ')' : '') + '. Zwei Einträge in derselben Stunde gehen nur mit Turnus A und B.');
        return;
      }
      const neu = eigene
        ? { id: vorlage ? vorlage.id : H.neueId(), art: 'eigene', wochentag: werte.wochentag, stunde: werte.stunde, fachId: werte.fachId, raum: werte.raum.trim(), turnus: werte.turnus }
        : { id: vorlage ? vorlage.id : H.neueId(), art: 'fremd', wochentag: werte.wochentag, stunde: werte.stunde, bezeichnung: werte.bezeichnung.trim(), lehrkraft: werte.lehrkraft.trim(), raum: werte.raum.trim(), turnus: werte.turnus };
      const konflikte = eigene ? SP.ueberschneidungen(klasse, neu, plan) : [];
      SP.eintragSpeichern(klasse, neu, plan ? plan.id : null);
      if (konflikte.length) NB.App.meldung('Hinweis: Zur selben Zeit steht bereits ' + konflikte.map(k => k.klasseName + ' · ' + fachName(k.fachId)).join(', ') + ' in deinem Plan.');
      N.zurueck();
    }

    async function entfernen() {
      const ok = await NB.Dialog.bestaetigen({
        titel: istZusatz ? 'Zusatztermin entfernen?' : 'Stunde entfernen?',
        text: (istZusatz ? H.datumMitWochentag(vorlage.datum) : H.WOCHENTAGE[Number(vorlage.wochentag) - 1]) + ', ' + vorlage.stunde + '. Stunde: ' + eintragText(vorlage) + '.'
          + ((!istZusatz && SP.plaene(klasse).length > 1) ? ' Betrifft den Stundenplan ' + SP.planZeitraumText(klasse, plan) + '.' : '')
          + ' Bereits erfasste Bewertungen bleiben erhalten.',
        bestaetigen: 'Entfernen',
        gefaehrlich: true
      });
      if (!ok) return;
      if (istZusatz) { klasse.zusatz = (klasse.zusatz || []).filter(x => x.id !== vorlage.id); M.klasseSpeichern(klasse); }
      else SP.eintragEntfernen(klasse, vorlage.id, plan ? plan.id : null);
      N.zurueck();
    }

    wurzel.appendChild(H.el('div', { class: 'karte-inhalt einst' }, H.el('form', { novalidate: true, onsubmit: speichern }, [
      H.el('p', { class: 'text-klein text-schwach', text: klasse.name
        + ((!istZusatz && SP.plaene(klasse).length > 1) ? ' · Stundenplan ' + SP.planZeitraumText(klasse, plan) : '') }),
      H.el('div', { class: 'einst-karte' }, felder),
      fehler,
      H.el('div', { class: 'knopfzeile' }, [
        vorlage ? H.el('button', { type: 'button', class: 'knopf gefaehrlich', text: 'Entfernen', onclick: entfernen }) : null,
        H.el('button', { type: 'submit', class: 'knopf primaer', text: istZusatz ? 'Zusatztermin speichern' : 'Stunde speichern' })
      ])
    ])));
  }

  /* ---------- Registrierung ---------- */

  N.bildschirmRegistrieren('klasse-stundenplan', {
    titel: 'Stundenplan der Klasse',
    zurueck: true,
    zeigen: planRendern
  });
  N.bildschirmRegistrieren('klasse-stunde', {
    titel: function () {
      if (!stundeParameter) return 'Stunde';
      if (stundeParameter.zusatz || stundeParameter.zusatzId) return stundeParameter.zusatzId ? 'Zusatztermin bearbeiten' : 'Neuer Zusatztermin';
      return stundeParameter.id ? 'Stunde bearbeiten' : 'Neue Stunde';
    },
    zurueck: true,
    zeigen: stundeRendern
  });

  return KS;
})();
