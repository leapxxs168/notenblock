/*
 * Notenblock – Umstellung bestehender Daten auf Datenmodell 2
 *
 * Beim ersten Start nach dem Update einmalig die Wahl:
 *   „Bisherige Daten behalten“: alte Fächer und Kriterien werden archiviert,
 *     alte Bewertungen erhalten die Stundennummer „unbekannt“ und bleiben in
 *     der Auswertung unter „frühere Kriterien“ einsehbar, nicht mehr in der
 *     Erfassung. Klassen bekommen Stufe „unbekannt“ (werden beim Öffnen
 *     gefragt). Einträge des bisherigen Lehrerinnen-Stundenplans werden als
 *     eigene Stunden in die Klassenpläne übernommen, nicht zuordenbare als
 *     fremde Stunde – mit einer Liste nach der Umstellung.
 *   „Neu beginnen“: Klassen, Bewertungen, Planungen und Stundenpläne werden
 *     gelöscht, Notizen und Aufgaben bleiben. Bestätigung durch LÖSCHEN.
 * Die selbst angelegten Fächer „Geometrie“ und „Lesen“ werden in beiden
 * Fällen entfernt (ihre Inhalte stecken in Mathematik und Deutsch).
 * Alle Änderungen werden im Speicher vorbereitet und in einem Schreibvorgang
 * abgelegt.
 */
'use strict';
NB.Umstellung = (function () {
  const U = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;
  const SD = NB.Startdaten;

  const ENTFERNTE_FAECHER = ['geometrie', 'lesen'];

  /** Liegt der Bestand noch im Aufbau von Version 1 vor (Wahl nötig)? */
  U.noetig = function () {
    if (!D.istEntsperrt()) return false;
    const e = D.holen('einstellungen', '') || {};
    if (e.datenmodell >= 2) return false;
    // Frisch eingerichtete Bestände tragen die Kennung; alte nicht.
    const faecher = D.holen('faecher', '') || [];
    const alt = faecher.some(f => Array.isArray(f.kriterien)) || !D.holen('arbeitsverhalten', '');
    return alt || D.alle('klasse').some(k => k.stufe === undefined);
  };

  function entferntesFach(fach) {
    return ENTFERNTE_FAECHER.indexOf(String(fach.id || '').toLowerCase()) >= 0
      || ENTFERNTE_FAECHER.indexOf(String(fach.name || '').trim().toLowerCase()) >= 0;
  }

  /* ---------- Bausteine der Umstellung ---------- */

  /** Fächerkatalog aufbauen: Startbestand plus selbst angelegte Fächer (ohne Geometrie und Lesen). */
  function katalogAufbauen(alteFaecher) {
    const katalog = SD.faecher();
    const katalogIds = katalog.map(f => f.id);
    const uebernommen = [];
    alteFaecher.forEach(function (alt) {
      if (katalogIds.indexOf(alt.id) >= 0 || entferntesFach(alt)) return;
      const fach = {
        id: alt.id, name: alt.name, aktiv: true, eigen: true, stufen: SD.STUFEN.slice(), hinweise: {}, nichtVerfuegbar: {}, kompetenzen: []
      };
      (alt.kriterien || []).forEach(function (k) {
        SD.STUFEN.forEach(function (stufe) {
          fach.kompetenzen.push({
            id: k.id + '-' + stufe.replace('-', ''), name: k.name, bereich: 'Allgemein', stufe: stufe,
            gewicht: (typeof k.gewicht === 'number') ? k.gewicht : 1,
            stufen: Array.isArray(k.stufen) && k.stufen.length === 6 ? k.stufen.slice() : ['', '', '', '', '', ''],
            aktiv: true
          });
        });
      });
      katalog.push(fach);
      uebernommen.push(fach.name);
    });
    return { katalog: katalog, eigeneUebernommen: uebernommen };
  }

  /** Noten eines Kind-Eintrags aus Version 1 (Zahl) in { wert, art } wandeln. */
  function notenWandeln(kinder) {
    const neu = {};
    Object.keys(kinder || {}).forEach(function (kindId) {
      const e = kinder[kindId] || {};
      const noten = {};
      Object.keys(e.noten || {}).forEach(function (kritId) {
        const n = e.noten[kritId];
        if (typeof n === 'number' && n >= 1) noten[kritId] = { wert: n, art: 'gesetzt' };
        else if (n && typeof n === 'object' && n.wert >= 1) noten[kritId] = { wert: n.wert, art: n.art || 'gesetzt' };
      });
      neu[kindId] = { noten: noten, fehlt: !!e.fehlt, beruehrt: !!e.beruehrt, notiz: e.notiz || '' };
    });
    return neu;
  }

  /** Alle alten Bewertungen archivieren: Stunde „unbekannt“, neuer Schlüssel. */
  function bewertungenArchivieren() {
    let anzahl = 0;
    D.alle('bewertung').slice().forEach(function (b) {
      if (b.archiviert) return;
      let alterSchluessel = b.klasseId + '|' + b.fachId + '|' + b.datum;   // Schlüssel aus Version 1
      if (D.holen('bewertung', alterSchluessel) !== b) alterSchluessel = D.schluesselListe('bewertung').find(s => D.holen('bewertung', s) === b);
      const neu = {
        klasseId: b.klasseId, fachId: b.fachId, datum: b.datum,
        stunde: M.UNBEKANNTE_STUNDE, stundeBis: M.UNBEKANNTE_STUNDE,
        kinder: notenWandeln(b.kinder), archiviert: true,
        angelegtAm: b.angelegtAm || H.jetztIso(), geaendertAm: b.geaendertAm || H.jetztIso()
      };
      if (alterSchluessel) D.entfernen('bewertung', alterSchluessel);
      D.setzen('bewertung', M.einheitSchluesselVon(neu), neu);
      anzahl++;
    });
    return anzahl;
  }

  /** Klassen in den neuen Aufbau bringen (Stufe bleibt offen). */
  function klassenErweitern() {
    M.klassen().forEach(function (k) {
      if (k.stufe === undefined) k.stufe = null;
      if (!Array.isArray(k.faecher)) k.faecher = [];
      if (!Array.isArray(k.stundenplan)) k.stundenplan = [];
      if (!Array.isArray(k.ausnahmen)) k.ausnahmen = [];
      if (!Array.isArray(k.zusatz)) k.zusatz = [];
      M.klasseSpeichern(k);
    });
  }

  /** Bisherigen Lehrerinnen-Stundenplan in die Klassenpläne übernehmen. */
  function stundenplanUebernehmen(katalog, archivFaecher) {
    const alt = D.holen('stundenplan', '') || [];
    const ergebnis = { eigene: [], fremd: [], verworfen: [] };
    const katalogIds = katalog.map(f => f.id);
    const nameVon = id => { const f = archivFaecher.find(x => x.id === id) || katalog.find(x => x.id === id); return f ? f.name : id; };
    alt.forEach(function (e) {
      const klasse = M.klasse(e.klasseId);
      const text = H.WOCHENTAGE[Number(e.wochentag) - 1] + ', ' + e.stunde + '. Stunde: ' + nameVon(e.fachId);
      if (!klasse) { ergebnis.verworfen.push(text + ' (Klasse nicht mehr vorhanden)'); return; }
      const eintrag = { id: e.id || H.neueId(), wochentag: Number(e.wochentag), stunde: Number(e.stunde), raum: e.raum || '', turnus: e.turnus || 'jede' };
      if (katalogIds.indexOf(e.fachId) >= 0) {
        eintrag.art = 'eigene';
        eintrag.fachId = e.fachId;
        ergebnis.eigene.push(klasse.name + ' · ' + text);
      } else {
        eintrag.art = 'fremd';
        eintrag.bezeichnung = nameVon(e.fachId);
        ergebnis.fremd.push(klasse.name + ' · ' + text);
      }
      klasse.stundenplan.push(eintrag);
      M.klasseSpeichern(klasse);
    });
    if (D.holen('stundenplan', '')) D.entfernen('stundenplan', '');
    return ergebnis;
  }

  /** Ausfall- und Zusatztermine vom Schuljahr in die Klassen verschieben. */
  function termineVerschieben(katalog) {
    const sj = D.holen('schuljahr', '');
    if (!sj) return;
    const klassen = M.klassen();
    const katalogIds = katalog.map(f => f.id);
    (sj.ausnahmen || []).forEach(function (a) {
      const ziel = a.klasseId ? klassen.filter(k => k.id === a.klasseId) : klassen;
      ziel.forEach(function (k) {
        k.ausnahmen.push({ id: H.neueId(), datum: a.datum, stunde: a.stunde || null, grund: a.grund || '' });
      });
    });
    (sj.zusatz || []).forEach(function (z) {
      const k = klassen.find(x => x.id === z.klasseId);
      if (!k || katalogIds.indexOf(z.fachId) < 0) return;
      k.zusatz.push({ id: z.id || H.neueId(), datum: z.datum, stunde: Number(z.stunde), fachId: z.fachId, raum: z.raum || '' });
    });
    klassen.forEach(k => M.klasseSpeichern(k));
    delete sj.ausnahmen;
    delete sj.zusatz;
    D.setzen('schuljahr', '', sj);
  }

  /** Planungen auf die erste Stunde ihrer Einheit legen (Doppelstunden). */
  function planungenAngleichen() {
    const SP = NB.Stundenplan;
    D.alle('planung').slice().forEach(function (p) {
      const klasse = M.klasse(p.klasseId);
      if (!klasse || !SP.klasseHatPlan(klasse)) return;
      const einheit = SP.einheitFuerStunde(klasse, p.datum, p.stunde);
      if (!einheit || einheit.fachId !== p.fachId || einheit.stunde === Number(p.stunde)) return;
      const zielSchluessel = M.planungSchluessel(p.datum, einheit.stunde, p.klasseId, p.fachId);
      const ziel = D.holen('planung', zielSchluessel);
      D.entfernen('planung', p.schluessel);
      if (ziel) {
        ['thema', 'verlauf', 'material', 'hausaufgabe'].forEach(function (f) { if (!ziel[f] && p[f]) ziel[f] = p[f]; });
        ziel.fertig = ziel.fertig || p.fertig;
        D.setzen('planung', zielSchluessel, ziel);
      } else {
        p.schluessel = zielSchluessel;
        p.stunde = einheit.stunde;
        D.setzen('planung', zielSchluessel, p);
      }
    });
  }

  function einstellungenAnpassen() {
    const e = D.holen('einstellungen', '') || SD.einstellungenStandard();
    const standard = SD.einstellungenStandard();
    e.datenmodell = SD.DATENMODELL;
    if (e.uebernommeneZaehlen === undefined) e.uebernommeneZaehlen = standard.uebernommeneZaehlen;
    if (e.durchschnittAnzeigen === undefined) e.durchschnittAnzeigen = standard.durchschnittAnzeigen;
    delete e.standardnotenEinrechnen;
    Object.keys(standard).forEach(function (name) { if (e[name] === undefined) e[name] = standard[name]; });
    e.version = standard.version;
    D.setzen('einstellungen', '', e);
  }

  /** Verweise in Notizen und Aufgaben auf nicht mehr vorhandene Klassen, Kinder und Fächer lösen. */
  function verweiseBereinigen(katalog) {
    const katalogIds = katalog.map(f => f.id);
    D.alle('notiz').forEach(function (n) {
      let geaendert = false;
      const klasse = n.klasseId ? M.klasse(n.klasseId) : null;
      if (n.klasseId && !klasse) { n.klasseId = null; n.kindId = null; geaendert = true; }
      if (n.kindId && klasse && !M.kind(klasse, n.kindId)) { n.kindId = null; geaendert = true; }
      if (n.fachId && katalogIds.indexOf(n.fachId) < 0) { n.fachId = null; geaendert = true; }
      if (geaendert) D.setzen('notiz', n.id, n);
    });
    D.alle('aufgabe').forEach(function (a) {
      if (a.klasseId && !M.klasse(a.klasseId)) { a.klasseId = null; D.setzen('aufgabe', a.id, a); }
    });
  }

  /* ---------- Die beiden Wege ---------- */

  U.behalten = function () {
    const alteFaecher = (D.holen('faecher', '') || []).map(f => JSON.parse(JSON.stringify(f)));
    const bericht = { entfernteFaecher: alteFaecher.filter(entferntesFach).map(f => f.name) };

    // Archiv der bisherigen Kriterien (auch Geometrie und Lesen, samt ihrer Bewertungen)
    D.setzen('archiv', '', {
      faecher: alteFaecher.map(f => ({ id: f.id, name: f.name, kriterien: (f.kriterien || []).map(k => ({ id: k.id, name: k.name, typ: k.typ, gewicht: k.gewicht, stufen: k.stufen })) })),
      umgestelltAm: H.jetztIso()
    });
    bericht.archivierteEinheiten = bewertungenArchivieren();

    const aufbau = katalogAufbauen(alteFaecher);
    bericht.eigeneFaecher = aufbau.eigeneUebernommen;
    M.faecherSpeichern(aufbau.katalog);
    if (!D.holen('arbeitsverhalten', '')) D.setzen('arbeitsverhalten', '', SD.arbeitsverhalten());

    klassenErweitern();
    bericht.stundenplan = stundenplanUebernehmen(aufbau.katalog, alteFaecher);
    termineVerschieben(aufbau.katalog);
    planungenAngleichen();
    verweiseBereinigen(aufbau.katalog);
    einstellungenAnpassen();
    D.setzen('zustand', '', { bereich: 'kalender' });
    return bericht;
  };

  U.neuBeginnen = function () {
    const alteFaecher = D.holen('faecher', '') || [];
    const bericht = { entfernteFaecher: alteFaecher.filter(entferntesFach).map(f => f.name), stundenplan: { eigene: [], fremd: [], verworfen: [] } };
    D.alle('klasse').slice().forEach(k => D.entfernen('klasse', k.id));
    D.schluesselListe('bewertung').slice().forEach(s => D.entfernen('bewertung', s));
    D.schluesselListe('planung').slice().forEach(s => D.entfernen('planung', s));
    if (D.holen('stundenplan', '')) D.entfernen('stundenplan', '');
    if (D.holen('archiv', '')) D.entfernen('archiv', '');
    const aufbau = katalogAufbauen(alteFaecher.map(f => Object.assign({}, f)));
    M.faecherSpeichern(aufbau.katalog);
    bericht.eigeneFaecher = aufbau.eigeneUebernommen;
    D.setzen('arbeitsverhalten', '', SD.arbeitsverhalten());
    const sj = D.holen('schuljahr', '');
    if (sj) { delete sj.ausnahmen; delete sj.zusatz; D.setzen('schuljahr', '', sj); }
    verweiseBereinigen(aufbau.katalog);
    einstellungenAnpassen();
    D.setzen('zustand', '', { bereich: 'kalender' });
    return bericht;
  };

  /**
   * Kleine Anhebungen ohne Wahl: Datenmodell 2 → 2.1 ersetzt die vier bisherigen
   * Stundenkriterien (aus-1 … aus-4) durch die sechs neuen. Werte zu den alten
   * Ids werden nicht übertragen, ihre Definitionen wandern ins Archiv unter
   * „frühere Kriterien“; die Werte bleiben in den Einheiten stehen.
   * Liefert einen Hinweistext, wenn etwas geändert wurde.
   */
  U.kleineAnhebungen = function () {
    if (!D.istEntsperrt()) return null;
    const e = D.holen('einstellungen', '') || {};
    if (!(e.datenmodell >= 2) || e.datenmodell >= SD.DATENMODELL) return null;
    let hinweis = null;
    const alt = D.holen('arbeitsverhalten', '');
    const neu = SD.arbeitsverhalten();
    const neueIds = neu.kriterien.map(k => k.id);
    if (alt && (alt.kriterien || []).some(k => neueIds.indexOf(k.id) < 0)) {
      const archiv = D.holen('archiv', '') || { faecher: [], umgestelltAm: H.jetztIso() };
      archiv.arbeitsverhalten = (archiv.arbeitsverhalten || []).concat(
        (alt.kriterien || []).filter(k => neueIds.indexOf(k.id) < 0).map(k => ({ id: k.id, name: k.name, bereich: k.bereich, gewicht: k.gewicht, stufen: k.stufen }))
      );
      D.setzen('archiv', '', archiv);
      D.setzen('arbeitsverhalten', '', neu);
      const betroffen = D.alle('bewertung').filter(b => !b.archiviert && Object.keys(b.kinder || {}).some(id => { const n = b.kinder[id] && b.kinder[id].noten; return n && Object.keys(n).some(k => k.indexOf('aus-') === 0); })).length;
      hinweis = 'Stundenkriterien erneuert: sechs Kriterien zu Mitarbeit, Arbeits- und Sozialverhalten. ' + (betroffen ? 'Werte der bisherigen vier Kriterien in ' + betroffen + (betroffen === 1 ? ' Einheit bleiben' : ' Einheiten bleiben') + ' unter „frühere Kriterien“ erhalten.' : '');
    } else if (!alt) {
      D.setzen('arbeitsverhalten', '', neu);
    }
    e.datenmodell = SD.DATENMODELL;
    if (e.mitarbeitGewichtJeFach === undefined) e.mitarbeitGewichtJeFach = {};
    D.setzen('einstellungen', '', e);
    return hinweis;
  };

  /* ---------- Dialoge ---------- */

  function wahlDialog() {
    return new Promise(function (aufloesen) {
      let eintrag;
      const anzahlEinheiten = D.alle('bewertung').length;
      const anzahlKlassen = D.alle('klasse').length;
      const inhalt = [
        H.el('h2', { text: 'Umstellung auf kompetenzorientierte Bewertung' }),
        H.el('p', { text: 'Notenblock bewertet ab jetzt nach dem NRW-Lehrplan: Kompetenzen je Fach und Stufe sowie das Arbeits- und Sozialverhalten in jeder einzelnen Unterrichtsstunde. Die bisherigen Kriterien passen dazu nicht mehr und werden nicht umgerechnet.' }),
        H.el('p', { text: 'Dein Bestand: ' + anzahlKlassen + (anzahlKlassen === 1 ? ' Klasse' : ' Klassen') + ', ' + anzahlEinheiten + (anzahlEinheiten === 1 ? ' bewertete Stunde' : ' bewertete Stunden') + '. Wie möchtest du fortfahren?' }),
        H.el('div', { class: 'einst-karte' }, [
          H.el('div', { class: 'einst-zeile einst-zeile-knopf' }, [
            H.el('div', { class: 'einst-text' }, [
              H.el('div', { class: 'einst-label', text: 'Bisherige Daten behalten' }),
              H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Alte Kriterien und Bewertungen werden archiviert und bleiben in der Auswertung unter „frühere Kriterien“ einsehbar, in der Erfassung erscheinen sie nicht mehr. Klassen fragen beim Öffnen nach ihrer Stufe. Der Stundenplan wird in die Klassen übernommen.' })
            ]),
            H.el('div', { class: 'einst-steuerung' }, H.el('button', { type: 'button', class: 'knopf primaer klein', text: 'Behalten', onclick: () => eintrag.schliessen('behalten') }))
          ]),
          H.el('div', { class: 'einst-zeile einst-zeile-knopf' }, [
            H.el('div', { class: 'einst-text' }, [
              H.el('div', { class: 'einst-label', text: 'Neu beginnen' }),
              H.el('div', { class: 'einst-beschreibung text-klein text-schwach', text: 'Klassen, Bewertungen, Planungen und Stundenpläne werden gelöscht. Notizen und Aufgaben bleiben. Fächer und Kriterien kommen frisch aus dem Lehrplan.' })
            ]),
            H.el('div', { class: 'einst-steuerung' }, H.el('button', { type: 'button', class: 'knopf gefaehrlich klein', text: 'Neu beginnen …', onclick: () => eintrag.schliessen('neu') }))
          ])
        ]),
        H.el('p', { class: 'text-klein text-schwach', text: 'Die Fächer „Geometrie“ und „Lesen“ werden in beiden Fällen entfernt; ihre Inhalte stecken in Mathematik (Raum und Form) und Deutsch (Lesen). Vorher lässt sich eine Sicherung erstellen.' }),
        H.el('p', { class: 'text-mittig' }, H.el('button', { type: 'button', class: 'textknopf klein', text: 'Zuerst eine Sicherung erstellen …', onclick: () => NB.Export.sicherungErstellen() }))
      ];
      eintrag = NB.Dialog.overlayOeffnen(inhalt, { klasse: 'dialog', pflicht: true, beiSchliessen: erg => aufloesen(erg || null), fokus: '.primaer' });
    });
  }

  function loeschenBestaetigen() {
    return new Promise(function (aufloesen) {
      let eintrag;
      const eingabe = H.el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false' });
      const knopf = H.el('button', { type: 'submit', class: 'knopf gefaehrlich', text: 'Neu beginnen', disabled: true });
      eingabe.addEventListener('input', function () { knopf.disabled = eingabe.value.trim().normalize('NFC') !== 'LÖSCHEN'; });
      const formular = H.el('form', { novalidate: true, onsubmit: function (ev) { ev.preventDefault(); if (eingabe.value.trim().normalize('NFC') === 'LÖSCHEN') eintrag.schliessen(true); } }, [
        H.el('h2', { text: 'Wirklich neu beginnen?' }),
        H.el('p', { text: 'Alle Klassen, Kinder, Bewertungen, Planungen und Stundenpläne werden gelöscht. Notizen und Aufgaben bleiben erhalten. Ohne Sicherung ist das nicht rückgängig zu machen.' }),
        H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: 'Zur Bestätigung LÖSCHEN eintippen' }), eingabe]),
        H.el('div', { class: 'knopfzeile' }, [
          H.el('button', { type: 'button', class: 'knopf', text: 'Zurück', onclick: () => eintrag.schliessen(false) }),
          knopf
        ])
      ]);
      eintrag = NB.Dialog.overlayOeffnen(formular, { klasse: 'dialog', pflicht: true, beiSchliessen: erg => aufloesen(erg === true), fokus: 'input' });
    });
  }

  function berichtDialog(bericht, weg) {
    return new Promise(function (aufloesen) {
      let eintrag;
      const sp = bericht.stundenplan || { eigene: [], fremd: [], verworfen: [] };
      const liste = function (titel, eintraege) {
        if (!eintraege.length) return null;
        return H.el('div', { class: 'umstellung-liste' }, [
          H.el('h3', { text: titel }),
          H.el('ul', {}, eintraege.map(t => H.el('li', { text: t })))
        ]);
      };
      const inhalt = [
        H.el('h2', { text: 'Umstellung abgeschlossen' }),
        weg === 'behalten'
          ? H.el('p', { text: (bericht.archivierteEinheiten || 0) + (bericht.archivierteEinheiten === 1 ? ' bewertete Stunde wurde' : ' bewertete Stunden wurden') + ' archiviert (Stunde „unbekannt“). Jede Klasse fragt beim nächsten Öffnen nach ihrer Stufe und bietet danach Fächer und Stundenplan an.' })
          : H.el('p', { text: 'Klassen, Bewertungen, Planungen und Stundenpläne wurden gelöscht. Notizen und Aufgaben sind erhalten.' }),
        bericht.entfernteFaecher && bericht.entfernteFaecher.length ? H.el('p', { text: 'Entfernte Fächer: ' + bericht.entfernteFaecher.join(', ') + '.' }) : null,
        bericht.eigeneFaecher && bericht.eigeneFaecher.length ? H.el('p', { text: 'Selbst angelegte Fächer übernommen (Kompetenzen im Bereich „Allgemein“, beide Stufen): ' + bericht.eigeneFaecher.join(', ') + '.' }) : null,
        liste('Als eigene Stunden übernommen', sp.eigene),
        liste('Als fremde Stunde übernommen (Fach nicht mehr vorhanden)', sp.fremd),
        liste('Nicht übernommen', sp.verworfen),
        H.el('div', { class: 'knopfzeile' }, H.el('button', { type: 'button', class: 'knopf primaer', text: 'Weiter', onclick: () => eintrag.schliessen(true) }))
      ];
      eintrag = NB.Dialog.overlayOeffnen(inhalt, { klasse: 'dialog umstellung-bericht', pflicht: true, beiSchliessen: () => aufloesen() });
    });
  }

  /** Vollständiger Ablauf nach dem Entsperren. Liefert true, wenn umgestellt wurde. */
  U.durchfuehren = async function () {
    if (!U.noetig()) return false;
    let weg = null;
    while (!weg) {
      const wahl = await wahlDialog();
      if (wahl === 'behalten') weg = 'behalten';
      else if (wahl === 'neu') { if (await loeschenBestaetigen()) weg = 'neu'; }
    }
    const bericht = weg === 'behalten' ? U.behalten() : U.neuBeginnen();
    await D.flush();
    await berichtDialog(bericht, weg);
    return true;
  };

  return U;
})();
