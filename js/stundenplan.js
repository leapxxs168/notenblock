/*
 * Notenblock – Stundenpläne je Klasse, „Mein Plan“ und Bewertungseinheiten
 *
 * Jede Klasse hat einen eigenen Stundenplan als Wochenraster. Ein Eintrag ist
 * entweder eine eigene Stunde (Fach aus den Klassenfächern, Raum, Turnus) oder
 * eine fremde Stunde (freie Bezeichnung, Lehrkraft, Raum), die nur der
 * Übersicht dient und weder bewertet noch geplant wird.
 * Der Plan der Lehrerin ist die Summe aller eigenen Stunden aller Klassen.
 *
 * Global bleiben Uhrzeiten, Schuljahreszeitraum, A-Woche, Ferien, Feiertage.
 * Je Klasse gepflegt werden Ausfall- und Zusatztermine.
 *
 * Bewertungseinheit: Zwei oder mehr unmittelbar aufeinanderfolgende eigene
 * Stunden derselben Klasse im selben Fach am selben Tag bilden eine Einheit
 * (Doppelstunde). Liegt eine andere Stunde dazwischen – auch eine fremde oder
 * eine Freistunde – sind es getrennte Einheiten. Schlüssel ist die erste
 * Stundennummer. Ohne Stundenplan gilt je Klasse, Fach und Tag eine Einheit
 * mit Stunde 0.
 */
'use strict';
NB.Stundenplan = (function () {
  const SP = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;

  const TAG_MS = 86400000;
  const SUCHTIEFE_TAGE = 400;

  /* ---------- Global: Schuljahr, Uhrzeiten ---------- */

  SP.schuljahr = function () {
    let sj = D.holen('schuljahr', '');
    if (!sj) {
      sj = NB.Startdaten.schuljahr();
      if (D.istEntsperrt()) D.setzen('schuljahr', '', sj);
    }
    ['ferien', 'feiertage'].forEach(function (name) {
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

  /** Uhrzeit einer Einheit von der ersten bis zur letzten Stunde. */
  SP.uhrzeitTextBereich = function (von, bis) {
    const a = SP.stundenzeiten()[String(von)], b = SP.stundenzeiten()[String(bis || von)];
    if (!a || !a.von) return '';
    const ende = (b && b.bis) || a.bis;
    return a.von + (ende ? '–' + ende : '');
  };

  /** Höchste verwendete Stundennummer (mindestens 6). */
  SP.maxStunde = function () {
    let max = 6;
    M.klassen().forEach(function (k) {
      (k.stundenplan || []).forEach(e => { if (Number(e.stunde) > max) max = Number(e.stunde); });
      (k.zusatz || []).forEach(e => { if (Number(e.stunde) > max) max = Number(e.stunde); });
    });
    const zeiten = SP.stundenzeiten();
    Object.keys(zeiten).forEach(k => { if (Number(k) > max && zeiten[k].von) max = Number(k); });
    return max;
  };

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

  /** Ferien oder Feiertag (für alle Klassen): { art, text } oder null. */
  SP.freierTag = function (iso) {
    const f = SP.ferien(iso);
    if (f) return { art: 'ferien', text: f.name || 'Ferien' };
    const ft = SP.feiertag(iso);
    if (ft) return { art: 'feiertag', text: (typeof ft === 'string' ? '' : ft.name) || 'Feiertag' };
    return null;
  };

  /** Ausfall des ganzen Tages für eine Klasse (Ausnahme ohne Stundenangabe). */
  SP.ausfallTag = function (klasse, iso) {
    return (klasse && klasse.ausnahmen || []).find(a => a.datum === iso && !a.stunde) || null;
  };

  /** Freier Tag aus Sicht einer Klasse: Ferien, Feiertag oder Ausfalltag der Klasse. */
  SP.freierTagFuer = function (klasse, iso) {
    const frei = SP.freierTag(iso);
    if (frei) return frei;
    const a = SP.ausfallTag(klasse, iso);
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

  /** A- oder B-Woche, gerechnet ab der Ankerwoche. */
  SP.wochenTyp = function (iso) {
    const anker = SP.ankerMontag();
    if (!anker) return 'A';
    const differenz = H.isoZuDatum(SP.montag(iso)) - H.isoZuDatum(anker);
    const wochen = Math.round(differenz / (7 * TAG_MS));
    return ((wochen % 2) + 2) % 2 === 0 ? 'A' : 'B';
  };

  /* ---------- Pläne je Klasse ---------- */

  SP.klassenplan = klasse => (klasse && Array.isArray(klasse.stundenplan)) ? klasse.stundenplan : [];

  /** Hat die Klasse eigene Stunden im Plan? */
  SP.klasseHatPlan = klasse => SP.klassenplan(klasse).some(e => e.art !== 'fremd');

  /** Gibt es irgendwo einen Stundenplan mit eigenen Stunden? */
  SP.hatStundenplan = () => M.klassen().some(SP.klasseHatPlan);

  /** Eintrag im Plan einer Klasse anlegen oder (nach id) ersetzen. */
  SP.eintragSpeichern = function (klasse, eintrag) {
    if (!Array.isArray(klasse.stundenplan)) klasse.stundenplan = [];
    if (!eintrag.id) eintrag.id = H.neueId();
    const i = klasse.stundenplan.findIndex(e => e.id === eintrag.id);
    if (i >= 0) klasse.stundenplan[i] = eintrag;
    else klasse.stundenplan.push(eintrag);
    M.klasseSpeichern(klasse);
  };

  SP.eintragEntfernen = function (klasse, id) {
    if (!Array.isArray(klasse.stundenplan)) return;
    klasse.stundenplan = klasse.stundenplan.filter(e => e.id !== id);
    M.klasseSpeichern(klasse);
  };

  /** Alle eigenen Stunden aller Klassen (Lesesicht auf „Mein Plan“), mit klasseId. */
  SP.eintraege = function () {
    const liste = [];
    M.klassen().forEach(function (k) {
      SP.klassenplan(k).forEach(function (e) {
        if (e.art === 'fremd') return;
        liste.push(Object.assign({}, e, { klasseId: k.id }));
      });
    });
    return liste;
  };

  function turnusPasst(eintrag, typ) {
    return !eintrag.turnus || eintrag.turnus === 'jede' || eintrag.turnus === typ;
  }

  /**
   * Eigene Stunden anderer Klassen, die sich mit einem Eintrag überschneiden
   * (gleicher Wochentag, gleiche Stunde, überlappender Turnus).
   */
  SP.ueberschneidungen = function (klasse, eintrag) {
    const treffer = [];
    if (!eintrag || eintrag.art === 'fremd') return treffer;
    const t1 = eintrag.turnus || 'jede';
    M.klassen().forEach(function (k) {
      if (k.id === klasse.id) return;
      SP.klassenplan(k).forEach(function (e) {
        if (e.art === 'fremd') return;
        if (Number(e.wochentag) !== Number(eintrag.wochentag) || Number(e.stunde) !== Number(eintrag.stunde)) return;
        const t2 = e.turnus || 'jede';
        if (t1 === t2 || t1 === 'jede' || t2 === 'jede') treffer.push(Object.assign({}, e, { klasseId: k.id, klasseName: k.name }));
      });
    });
    return treffer;
  };

  /* ---------- Stunden eines Tages ---------- */

  /**
   * Alle Stunden einer Klasse an einem Tag (eigene und fremde), nach Stunde:
   * [{ klasseId, stunde, art, fachId, bezeichnung, lehrkraft, raum, turnus, quelle: 'plan'|'zusatz', eintragId }]
   */
  SP.klassenStundenAmTag = function (klasse, iso) {
    const liste = [];
    if (!klasse) return liste;
    if (SP.imSchuljahr(iso) && !SP.freierTagFuer(klasse, iso)) {
      const wt = H.wochentag(iso);
      const typ = SP.wochenTyp(iso);
      const ausfaelle = (klasse.ausnahmen || []).filter(a => a.datum === iso && a.stunde);
      SP.klassenplan(klasse).forEach(function (e) {
        if (Number(e.wochentag) !== wt || !turnusPasst(e, typ)) return;
        if (ausfaelle.some(a => Number(a.stunde) === Number(e.stunde))) return;
        liste.push({
          klasseId: klasse.id, stunde: Number(e.stunde), art: e.art === 'fremd' ? 'fremd' : 'eigene',
          fachId: e.art === 'fremd' ? null : e.fachId, bezeichnung: e.bezeichnung || '', lehrkraft: e.lehrkraft || '',
          raum: e.raum || '', turnus: e.turnus || 'jede', quelle: 'plan', eintragId: e.id
        });
      });
    }
    (klasse.zusatz || []).forEach(function (z) {
      if (z.datum !== iso) return;
      liste.push({ klasseId: klasse.id, stunde: Number(z.stunde), art: 'eigene', fachId: z.fachId, bezeichnung: '', lehrkraft: '', raum: z.raum || '', turnus: 'jede', quelle: 'zusatz', eintragId: z.id });
    });
    liste.sort((a, b) => a.stunde - b.stunde || (a.art === 'eigene' ? -1 : 1));
    return liste;
  };

  /** Eigene Stunden aller Klassen an einem Tag („Mein Plan“), nach Stunde und Klasse. */
  SP.eigeneStundenAmTag = function (iso) {
    const liste = [];
    M.klassen().forEach(function (k) {
      SP.klassenStundenAmTag(k, iso).forEach(function (s) {
        if (s.art === 'eigene') liste.push(s);
      });
    });
    liste.sort((a, b) => a.stunde - b.stunde);
    return liste;
  };

  /* ---------- Bewertungseinheiten ---------- */

  /**
   * Einheiten einer Klasse an einem Tag, wahlweise nur eines Fachs:
   * [{ klasseId, fachId, stunde, stundeBis, stunden: [n…], raum, quelle }]
   * Aufeinanderfolgende eigene Stunden desselben Fachs bilden eine Einheit;
   * jede andere Stunde (fremd, anderes Fach) oder Lücke trennt.
   */
  SP.einheitenAmTag = function (klasse, iso, fachId) {
    const alle = SP.klassenStundenAmTag(klasse, iso);
    const einheiten = [];
    let laufend = null;
    alle.forEach(function (s) {
      if (s.art !== 'eigene') { laufend = null; return; }
      if (laufend && laufend.fachId === s.fachId && s.stunde === laufend.stundeBis + 1) {
        laufend.stundeBis = s.stunde;
        laufend.stunden.push(s.stunde);
        return;
      }
      if (laufend && s.stunde === laufend.stundeBis) return; // Doppelbelegung derselben Stunde: erste gilt
      laufend = { klasseId: klasse.id, fachId: s.fachId, stunde: s.stunde, stundeBis: s.stunde, stunden: [s.stunde], raum: s.raum, quelle: s.quelle };
      einheiten.push(laufend);
    });
    return fachId ? einheiten.filter(e => e.fachId === fachId) : einheiten;
  };

  /** Die Einheit, zu der eine Stundennummer gehört (oder null). */
  SP.einheitFuerStunde = function (klasse, iso, stunde) {
    return SP.einheitenAmTag(klasse, iso).find(e => Number(stunde) >= e.stunde && Number(stunde) <= e.stundeBis) || null;
  };

  /**
   * Einheit, die zur Erfassung vorbelegt wird: die aktuelle (laufende) oder
   * die zuletzt vergangene laut Uhrzeit, sonst die erste des Tages.
   */
  SP.aktuelleEinheit = function (klasse, iso, fachId) {
    const einheiten = SP.einheitenAmTag(klasse, iso, fachId);
    if (!einheiten.length) return null;
    if (iso !== H.heute()) return einheiten[0];
    const jetzt = new Date();
    const minuten = jetzt.getHours() * 60 + jetzt.getMinutes();
    let gewaehlt = einheiten[0];
    einheiten.forEach(function (e) {
      const z = SP.stundenzeiten()[String(e.stunde)];
      if (!z || !z.von) return;
      const t = z.von.split(':');
      const start = Number(t[0]) * 60 + Number(t[1]);
      if (start <= minuten) gewaehlt = e;
    });
    return gewaehlt;
  };

  SP.istUnterrichtstag = function (iso, klasseId, fachId) {
    const klasse = M.klasse(klasseId);
    if (!klasse) return false;
    return SP.klassenStundenAmTag(klasse, iso).some(s => s.art === 'eigene' && (!fachId || s.fachId === fachId));
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
   * Ohne klasseId: „Mein Plan“ (alle eigenen Stunden). Ohne Stundenplan bleibt
   * der Kalender ein gewöhnlicher Kalender.
   */
  SP.kalenderMarkierungen = function (jahr, monat, klasseId, fachId) {
    const m = {};
    const klasse = klasseId ? M.klasse(klasseId) : null;
    if (klasseId ? !SP.klasseHatPlan(klasse) : !SP.hatStundenplan()) return m;
    const tage = new Date(jahr, monat + 1, 0).getDate();
    for (let t = 1; t <= tage; t++) {
      const iso = H.datumZuIso(new Date(jahr, monat, t));
      const stunden = klasse ? SP.klassenStundenAmTag(klasse, iso) : SP.eigeneStundenAmTag(iso);
      const unterricht = stunden.some(s => s.art === 'eigene' && (!fachId || s.fachId === fachId));
      m[iso] = {
        unterricht: unterricht,
        frei: !!(klasse ? SP.freierTagFuer(klasse, iso) : SP.freierTag(iso)),
        ausserhalb: !SP.imSchuljahr(iso)
      };
    }
    return m;
  };

  /** Unterrichtstage eines Monats (Liste von ISO-Daten) für „Mein Plan“ oder Klasse/Fach. */
  SP.unterrichtstageImMonat = function (jahr, monat, klasseId, fachId) {
    const liste = [];
    const m = SP.kalenderMarkierungen(jahr, monat, klasseId, fachId);
    Object.keys(m).forEach(function (iso) { if (m[iso].unterricht) liste.push(iso); });
    liste.sort();
    return liste;
  };

  /* ---------- Beschriftungen ---------- */

  SP.turnusText = function (turnus) {
    if (turnus === 'A') return 'A-Woche';
    if (turnus === 'B') return 'B-Woche';
    return '';
  };

  /** „Raum 12“ bei Nummern, sonst der Name selbst („Kunstraum“). */
  SP.raumText = function (raum) {
    if (!raum) return '';
    return /^\d/.test(raum) ? 'Raum ' + raum : raum;
  };

  /** Text für Stundennummern einer Einheit: „1. Std.“ oder „1.–2. Std.“ */
  SP.stundenText = function (von, bis) {
    if (!von) return 'Tag';
    return (bis && bis > von) ? von + '.–' + bis + '. Std.' : von + '. Std.';
  };

  return SP;
})();
