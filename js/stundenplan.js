/*
 * Notenblock – Stundenplan und Unterrichtstage
 *
 * Der Stundenplan ist die Grundlage aller Termine. Ein Tag ist Unterrichtstag
 * für eine Kombination aus Klasse und Fach, wenn
 *   - der Stundenplan für diesen Wochentag einen passenden Eintrag hat,
 *   - der Tag im Schuljahreszeitraum liegt,
 *   - er kein Ferientag, Feiertag oder Ausfalltermin ist und
 *   - der Turnus passt (A/B-Wochen ab einer Ankerwoche).
 * Zusatztermine gelten immer als Unterrichtstag, auch in den Ferien.
 *
 * Daten:
 *   'stundenplan'  [{ id, wochentag 1–7, stunde, klasseId, fachId, raum, turnus 'jede'|'A'|'B' }]
 *   'schuljahr'    { von, bis, ferien: [{ id, name, von, bis }], feiertage: [{ id, datum, name }],
 *                    ausnahmen: [{ id, datum, stunde?, klasseId?, fachId?, grund }],
 *                    zusatz: [{ id, datum, stunde, klasseId, fachId, raum }], ankerwocheA }
 *   'stundenzeiten' { '1': { von: '08:00', bis: '08:45' }, … }
 */
'use strict';
NB.Stundenplan = (function () {
  const SP = {};
  const H = NB.Hilfen;
  const D = NB.Daten;

  const TAG_MS = 86400000;
  const SUCHTIEFE_TAGE = 400;

  /* ---------- Zugriff ---------- */

  SP.eintraege = () => D.holen('stundenplan', '') || [];
  SP.speichern = liste => D.setzen('stundenplan', '', liste);
  SP.hatStundenplan = () => SP.eintraege().length > 0;

  SP.schuljahr = function () {
    let sj = D.holen('schuljahr', '');
    if (!sj) {
      sj = NB.Startdaten.schuljahr();
      if (D.istEntsperrt()) D.setzen('schuljahr', '', sj);
    }
    ['ferien', 'feiertage', 'ausnahmen', 'zusatz'].forEach(function (name) {
      if (!Array.isArray(sj[name])) sj[name] = [];
    });
    return sj;
  };
  SP.schuljahrSpeichern = sj => D.setzen('schuljahr', '', sj);

  SP.stundenzeiten = () => D.holen('stundenzeiten', '') || {};
  SP.stundenzeitenSpeichern = z => D.setzen('stundenzeiten', '', z);

  /** Uhrzeit einer Stundennummer als Text, etwa „08:00–08:45“, oder ''. */
  SP.uhrzeitText = function (stunde) {
    const z = SP.stundenzeiten()[String(stunde)];
    if (!z || !z.von) return '';
    return z.von + (z.bis ? '–' + z.bis : '');
  };

  /** Höchste verwendete Stundennummer (mindestens 6). */
  SP.maxStunde = function () {
    let max = 6;
    SP.eintraege().forEach(e => { if (Number(e.stunde) > max) max = Number(e.stunde); });
    (SP.schuljahr().zusatz || []).forEach(e => { if (Number(e.stunde) > max) max = Number(e.stunde); });
    Object.keys(SP.stundenzeiten()).forEach(k => { if (Number(k) > max && SP.stundenzeiten()[k].von) max = Number(k); });
    return max;
  };

  /* ---------- Freie Tage und Schuljahr ---------- */

  SP.imSchuljahr = function (iso) {
    const sj = SP.schuljahr();
    return (!sj.von || iso >= sj.von) && (!sj.bis || iso <= sj.bis);
  };

  SP.ferien = function (iso) {
    return SP.schuljahr().ferien.find(f => f.von && f.bis && iso >= f.von && iso <= f.bis) || null;
  };

  SP.feiertag = function (iso) {
    return SP.schuljahr().feiertage.find(f => (typeof f === 'string' ? f : f.datum) === iso) || null;
  };

  /** Ausfall des ganzen Tages (Ausnahme ohne Stundenangabe). */
  SP.ausfallTag = function (iso) {
    return SP.schuljahr().ausnahmen.find(a => a.datum === iso && !a.stunde) || null;
  };

  /** Liefert { art, text } für Ferien, Feiertag oder Ausfalltag, sonst null. */
  SP.freierTag = function (iso) {
    const f = SP.ferien(iso);
    if (f) return { art: 'ferien', text: f.name || 'Ferien' };
    const ft = SP.feiertag(iso);
    if (ft) return { art: 'feiertag', text: (typeof ft === 'string' ? '' : ft.name) || 'Feiertag' };
    const a = SP.ausfallTag(iso);
    if (a) return { art: 'ausfall', text: a.grund || 'Unterricht fällt aus' };
    return null;
  };

  SP.montag = iso => H.tageAddieren(iso, -(H.wochentag(iso) - 1));

  /** Montag der Ankerwoche: gesetzt, sonst die erste Schulwoche (Wochenende zählt zur Folgewoche). */
  SP.ankerMontag = function () {
    const sj = SP.schuljahr();
    if (sj.ankerwocheA) return SP.montag(sj.ankerwocheA);
    if (!sj.von) return null;
    const montag = SP.montag(sj.von);
    return H.wochentag(sj.von) >= 6 ? H.tageAddieren(montag, 7) : montag;
  };

  /** A- oder B-Woche, gerechnet ab der Ankerwoche (sonst ab der ersten Schulwoche). */
  SP.wochenTyp = function (iso) {
    const anker = SP.ankerMontag();
    if (!anker) return 'A';
    const differenz = H.isoZuDatum(SP.montag(iso)) - H.isoZuDatum(anker);
    const wochen = Math.round(differenz / (7 * TAG_MS));
    return ((wochen % 2) + 2) % 2 === 0 ? 'A' : 'B';
  };

  /* ---------- Stunden eines Tages ---------- */

  /**
   * Alle Stunden eines Tages, nach Stundennummer sortiert:
   * [{ stunde, klasseId, fachId, raum, quelle: 'plan'|'zusatz', eintragId }]
   */
  SP.stundenAmTag = function (iso) {
    const sj = SP.schuljahr();
    const liste = [];
    if (SP.imSchuljahr(iso) && !SP.freierTag(iso)) {
      const wt = H.wochentag(iso);
      const typ = SP.wochenTyp(iso);
      const ausfaelle = sj.ausnahmen.filter(a => a.datum === iso && a.stunde);
      SP.eintraege().forEach(function (e) {
        if (Number(e.wochentag) !== wt) return;
        if (e.turnus && e.turnus !== 'jede' && e.turnus !== typ) return;
        const faelltAus = ausfaelle.some(a => Number(a.stunde) === Number(e.stunde)
          && (!a.klasseId || a.klasseId === e.klasseId) && (!a.fachId || a.fachId === e.fachId));
        if (faelltAus) return;
        liste.push({ stunde: Number(e.stunde), klasseId: e.klasseId, fachId: e.fachId, raum: e.raum || '', quelle: 'plan', eintragId: e.id, turnus: e.turnus || 'jede' });
      });
    }
    sj.zusatz.forEach(function (zt) {
      if (zt.datum !== iso) return;
      liste.push({ stunde: Number(zt.stunde), klasseId: zt.klasseId, fachId: zt.fachId, raum: zt.raum || '', quelle: 'zusatz', eintragId: zt.id });
    });
    liste.sort((a, b) => a.stunde - b.stunde);
    return liste;
  };

  SP.istUnterrichtstag = function (iso, klasseId, fachId) {
    return SP.stundenAmTag(iso).some(s => (!klasseId || s.klasseId === klasseId) && (!fachId || s.fachId === fachId));
  };

  /** Letzter Unterrichtstag am oder vor einem Datum, null wenn keiner gefunden wird. */
  SP.letzterUnterrichtstag = function (klasseId, fachId, bisIso) {
    let iso = bisIso;
    for (let i = 0; i < SUCHTIEFE_TAGE; i++) {
      if (SP.istUnterrichtstag(iso, klasseId, fachId)) return iso;
      iso = H.tageAddieren(iso, -1);
    }
    return null;
  };

  /** Nächster Unterrichtstag am oder nach einem Datum. */
  SP.naechsterUnterrichtstag = function (klasseId, fachId, abIso) {
    let iso = abIso;
    for (let i = 0; i < SUCHTIEFE_TAGE; i++) {
      if (SP.istUnterrichtstag(iso, klasseId, fachId)) return iso;
      iso = H.tageAddieren(iso, 1);
    }
    return null;
  };

  /* ---------- Kalender ---------- */

  /**
   * Markierungen eines Monats für den Monatskalender, gebündelt geladen.
   * Ohne Stundenplan bleibt der Kalender ein gewöhnlicher Kalender.
   */
  SP.kalenderMarkierungen = function (jahr, monat, klasseId, fachId) {
    const m = {};
    if (!SP.hatStundenplan()) return m;
    const tage = new Date(jahr, monat + 1, 0).getDate();
    for (let t = 1; t <= tage; t++) {
      const iso = H.datumZuIso(new Date(jahr, monat, t));
      const stunden = SP.stundenAmTag(iso);
      const unterricht = stunden.some(s => (!klasseId || s.klasseId === klasseId) && (!fachId || s.fachId === fachId));
      m[iso] = {
        unterricht: unterricht,
        frei: !!SP.freierTag(iso),
        ausserhalb: !SP.imSchuljahr(iso)
      };
    }
    return m;
  };

  /** Unterrichtstage eines Monats (Liste von ISO-Daten) für Klasse/Fach. */
  SP.unterrichtstageImMonat = function (jahr, monat, klasseId, fachId) {
    const liste = [];
    if (!SP.hatStundenplan()) return liste;
    const tage = new Date(jahr, monat + 1, 0).getDate();
    for (let t = 1; t <= tage; t++) {
      const iso = H.datumZuIso(new Date(jahr, monat, t));
      if (SP.istUnterrichtstag(iso, klasseId, fachId)) liste.push(iso);
    }
    return liste;
  };

  /* ---------- Beschriftungen ---------- */

  /** „Raum 12“ bei Nummern, sonst der Name selbst („Kunstraum“). */
  SP.raumText = function (raum) {
    if (!raum) return '';
    return /^\d/.test(raum) ? 'Raum ' + raum : raum;
  };

  SP.turnusText = function (turnus) {
    if (turnus === 'A') return 'A-Woche';
    if (turnus === 'B') return 'B-Woche';
    return '';
  };

  return SP;
})();
