/*
 * Notenblock – Stundenpläne je Klasse, „Mein Plan“ und Bewertungseinheiten
 *
 * Jede Klasse hat ihre Stundenpläne als Wochenraster – nacheinander, jeder mit
 * einem „gilt ab“. Der erste gilt für alles davor, jeder weitere beendet den
 * vorherigen am Tag davor, der jüngste läuft unbefristet weiter. Pläne bleiben
 * erhalten, damit die Vergangenheit den Plan zeigt, der damals galt. Ein
 * Eintrag ist
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
      SP.alleEintraege(k).forEach(e => { if (Number(e.stunde) > max) max = Number(e.stunde); });
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
    // Termin ohne Klasse mit „Unterricht fällt aus“ (etwa Konferenztag)
    const t = M.ausfallTermin ? M.ausfallTermin(iso, null) : null;
    if (t && !t.klasseId) return { art: 'termin', text: t.titel || 'Unterricht fällt aus' };
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
    // Termin dieser Klasse (oder ohne Klasse) mit „Unterricht fällt aus“
    const t = (klasse && M.ausfallTermin) ? M.ausfallTermin(iso, klasse.id) : null;
    if (t) return { art: 'termin', text: t.titel || 'Unterricht fällt aus' };
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

  /*
   * Eine Klasse hat mehrere Stundenpläne nacheinander (NB.Modell.klassenPlaene).
   * Jeder trägt ein „gilt ab“; der erste hat keins und gilt für alles davor.
   * Ein neuer Plan beendet den vorherigen am Tag davor, der jüngste gilt
   * unbefristet weiter. Jede Abfrage nach Stunden nennt deshalb ein Datum und
   * bekommt den Plan, der an diesem Tag galt – die Vergangenheit bleibt so,
   * wie sie war.
   */

  SP.plaene = klasse => M.klassenPlaene(klasse);
  SP.planEintraege = plan => M.planEintraege(plan);

  /** Der Plan, der an einem Datum galt. Ohne Datum: der heute gültige. */
  SP.planFuer = function (klasse, iso) {
    const liste = SP.plaene(klasse);
    if (!liste.length) return null;
    const tag = iso || H.heute();
    let gewaehlt = liste[0];
    liste.forEach(function (p) {
      if (!p.abDatum || p.abDatum <= tag) gewaehlt = p;
    });
    return gewaehlt;
  };

  SP.aktuellerPlan = klasse => SP.planFuer(klasse, H.heute());

  SP.plan = function (klasse, planId) {
    return SP.plaene(klasse).find(p => p.id === planId) || null;
  };

  /** Letzter Tag, an dem ein Plan gilt – null, wenn er unbefristet weiterläuft. */
  SP.planBis = function (klasse, plan) {
    const liste = SP.plaene(klasse);
    const i = liste.findIndex(p => p.id === (plan && plan.id));
    const naechster = i >= 0 ? liste[i + 1] : null;
    return (naechster && naechster.abDatum) ? H.tageAddieren(naechster.abDatum, -1) : null;
  };

  /** Gilt dieser Plan heute? */
  SP.planIstAktuell = function (klasse, plan) {
    const jetzt = SP.aktuellerPlan(klasse);
    return !!(jetzt && plan && jetzt.id === plan.id);
  };

  /** Zeitraum eines Plans als Text: „gilt immer“, „bis 08.11.“, „ab 09.11.“, „09.11. – 20.12.“ */
  SP.planZeitraumText = function (klasse, plan) {
    if (!plan) return '';
    const bis = SP.planBis(klasse, plan);
    if (!plan.abDatum && !bis) return 'gilt immer';
    if (!plan.abDatum) return 'bis ' + H.datumKurz(bis);
    if (!bis) return 'ab ' + H.datumKurz(plan.abDatum);
    return H.datumKurz(plan.abDatum) + ' – ' + H.datumKurz(bis);
  };

  /** Einträge des Plans, der an einem Datum galt. Ohne Datum: der heutige Plan. */
  SP.klassenplan = function (klasse, iso) {
    return SP.planEintraege(SP.planFuer(klasse, iso));
  };

  /** Alle Einträge aller Pläne einer Klasse. */
  SP.alleEintraege = klasse => M.allePlanEintraege(klasse);

  /** Hat die Klasse irgendwann eigene Stunden im Plan? */
  SP.klasseHatPlan = klasse => SP.alleEintraege(klasse).some(e => e.art !== 'fremd');

  /** Gibt es irgendwo einen Stundenplan mit eigenen Stunden? */
  SP.hatStundenplan = () => M.klassen().some(SP.klasseHatPlan);

  /** Pläne einer Klasse so ablegen, dass sie auch beim nächsten Lesen stimmen. */
  function plaeneSichern(klasse, liste) {
    klasse.plaene = liste.slice().sort(M.planVergleich);
    if (klasse.stundenplan) delete klasse.stundenplan; // ab jetzt zählen nur noch die Pläne
    M.klasseSpeichern(klasse);
  }

  /**
   * Neuer Plan ab einem Datum: Der bis dahin gültige Plan wird kopiert (mit
   * frischen Ids), damit nur noch die Änderungen einzutragen sind. Der
   * vorherige Plan endet am Tag davor. Gibt es schon einen Plan ab genau
   * diesem Tag, wird dieser zurückgegeben.
   */
  SP.planNeu = function (klasse, abDatum) {
    const liste = SP.plaene(klasse).slice();
    const vorhanden = liste.find(p => p.abDatum === abDatum);
    if (vorhanden) return vorhanden;
    const vorlage = SP.planFuer(klasse, abDatum);
    const plan = {
      id: H.neueId(),
      abDatum: abDatum,
      eintraege: SP.planEintraege(vorlage).map(e => Object.assign({}, e, { id: H.neueId() }))
    };
    liste.push(plan);
    plaeneSichern(klasse, liste);
    return plan;
  };

  /**
   * „Gilt ab“ eines Plans ändern. Erlaubt ist jedes Datum zwischen dem Beginn
   * des vorherigen und dem des nächsten Plans; der erste Plan behält sein
   * offenes Ende nach hinten. Gibt einen Fehlertext zurück oder null.
   */
  SP.planDatumSetzen = function (klasse, planId, abDatum) {
    const liste = SP.plaene(klasse).slice();
    const i = liste.findIndex(p => p.id === planId);
    if (i < 0) return 'Diesen Stundenplan gibt es nicht mehr.';
    if (i === 0) return 'Der erste Stundenplan gilt für alles davor und bekommt kein Datum.';
    if (!abDatum) return 'Bitte ein Datum wählen.';
    const vorher = liste[i - 1];
    const nachher = liste[i + 1];
    if (vorher && vorher.abDatum && abDatum <= vorher.abDatum) {
      return 'Der Plan kann frühestens am Tag nach dem vorherigen beginnen (' + H.datumKurz(vorher.abDatum) + ').';
    }
    if (nachher && nachher.abDatum && abDatum >= nachher.abDatum) {
      return 'Der Plan muss vor dem nächsten beginnen (' + H.datumKurz(nachher.abDatum) + ').';
    }
    liste[i].abDatum = abDatum;
    plaeneSichern(klasse, liste);
    return null;
  };

  /** Einen versehentlich angelegten Plan verwerfen (nie den ersten). */
  SP.planVerwerfen = function (klasse, planId) {
    const liste = SP.plaene(klasse).slice();
    const i = liste.findIndex(p => p.id === planId);
    if (i <= 0) return false;
    liste.splice(i, 1);
    plaeneSichern(klasse, liste);
    return true;
  };

  /** Eintrag in einem Plan anlegen oder (nach id) ersetzen. Ohne planId: im heutigen Plan. */
  SP.eintragSpeichern = function (klasse, eintrag, planId) {
    const liste = SP.plaene(klasse).slice();
    const plan = (planId && liste.find(p => p.id === planId)) || SP.aktuellerPlan(klasse);
    if (!plan) return;
    if (!Array.isArray(plan.eintraege)) plan.eintraege = [];
    if (!eintrag.id) eintrag.id = H.neueId();
    const i = plan.eintraege.findIndex(e => e.id === eintrag.id);
    if (i >= 0) plan.eintraege[i] = eintrag;
    else plan.eintraege.push(eintrag);
    plaeneSichern(klasse, liste);
  };

  SP.eintragEntfernen = function (klasse, id, planId) {
    const liste = SP.plaene(klasse).slice();
    const plan = (planId && liste.find(p => p.id === planId)) || SP.aktuellerPlan(klasse);
    if (!plan || !Array.isArray(plan.eintraege)) return;
    plan.eintraege = plan.eintraege.filter(e => e.id !== id);
    plaeneSichern(klasse, liste);
  };

  /** Alle eigenen Stunden aller Klassen an einem Datum (Lesesicht auf „Mein Plan“), mit klasseId. */
  SP.eintraege = function (iso) {
    const liste = [];
    M.klassen().forEach(function (k) {
      SP.klassenplan(k, iso).forEach(function (e) {
        if (e.art === 'fremd') return;
        liste.push(Object.assign({}, e, { klasseId: k.id }));
      });
    });
    return liste;
  };

  function turnusPasst(eintrag, typ) {
    return !eintrag.turnus || eintrag.turnus === 'jede' || eintrag.turnus === typ;
  }

  /** Überlappen sich zwei Zeiträume? null steht für „offen“. */
  function zeitraeumeUeberlappen(von1, bis1, von2, bis2) {
    if (bis1 && von2 && von2 > bis1) return false;
    if (bis2 && von1 && von1 > bis2) return false;
    return true;
  }

  /**
   * Eigene Stunden anderer Klassen, die sich mit einem Eintrag überschneiden
   * (gleicher Wochentag, gleiche Stunde, überlappender Turnus). Verglichen
   * wird nur mit Plänen, deren Zeitraum sich mit dem des bearbeiteten Plans
   * überschneidet – ein Plan aus dem letzten Halbjahr stört also nicht mehr.
   */
  SP.ueberschneidungen = function (klasse, eintrag, plan) {
    const treffer = [];
    if (!eintrag || eintrag.art === 'fremd') return treffer;
    const t1 = eintrag.turnus || 'jede';
    const eigenerPlan = plan || SP.aktuellerPlan(klasse);
    const von1 = eigenerPlan ? eigenerPlan.abDatum : null;
    const bis1 = eigenerPlan ? SP.planBis(klasse, eigenerPlan) : null;
    const gesehen = {};
    M.klassen().forEach(function (k) {
      if (k.id === klasse.id) return;
      SP.plaene(k).forEach(function (p) {
        if (!zeitraeumeUeberlappen(von1, bis1, p.abDatum, SP.planBis(k, p))) return;
        SP.planEintraege(p).forEach(function (e) {
          if (e.art === 'fremd') return;
          if (Number(e.wochentag) !== Number(eintrag.wochentag) || Number(e.stunde) !== Number(eintrag.stunde)) return;
          const t2 = e.turnus || 'jede';
          if (!(t1 === t2 || t1 === 'jede' || t2 === 'jede')) return;
          const schluessel = k.id + '|' + e.fachId + '|' + e.wochentag + '|' + e.stunde;
          if (gesehen[schluessel]) return;
          gesehen[schluessel] = true;
          treffer.push(Object.assign({}, e, { klasseId: k.id, klasseName: k.name }));
        });
      });
    });
    return treffer;
  };

  /* ---------- Stunden eines Tages ---------- */

  /**
   * Alle Stunden einer Klasse an einem Tag (eigene und fremde), nach Stunde:
   * [{ klasseId, stunde, art, fachId, bezeichnung, lehrkraft, raum, turnus, quelle: 'plan'|'zusatz', eintragId }]
   * Eigene Stunden eines Fachs, das die Klasse nicht (mehr) gewählt hat oder
   * das stillgelegt ist, bleiben gespeichert, erscheinen aber nicht.
   * Mit eintraegeStattPlan lässt sich ein anderer Plan unterschieben – so
   * lässt sich fragen, wie der Tag mit einem früheren Plan ausgesehen hätte.
   */
  SP.klassenStundenAmTag = function (klasse, iso, eintraegeStattPlan) {
    const liste = [];
    if (!klasse) return liste;
    const sichtbareFaecher = M.klassenFaecher(klasse).map(f => f.id);
    const fachSichtbar = fachId => sichtbareFaecher.indexOf(fachId) >= 0;
    if (SP.imSchuljahr(iso) && !SP.freierTagFuer(klasse, iso)) {
      const wt = H.wochentag(iso);
      const typ = SP.wochenTyp(iso);
      const ausfaelle = (klasse.ausnahmen || []).filter(a => a.datum === iso && a.stunde);
      (eintraegeStattPlan || SP.klassenplan(klasse, iso)).forEach(function (e) {
        if (Number(e.wochentag) !== wt || !turnusPasst(e, typ)) return;
        if (ausfaelle.some(a => Number(a.stunde) === Number(e.stunde))) return;
        if (e.art !== 'fremd' && !fachSichtbar(e.fachId)) return;
        liste.push({
          klasseId: klasse.id, stunde: Number(e.stunde), art: e.art === 'fremd' ? 'fremd' : 'eigene',
          fachId: e.art === 'fremd' ? null : e.fachId, bezeichnung: e.bezeichnung || '', lehrkraft: e.lehrkraft || '',
          raum: e.raum || '', turnus: e.turnus || 'jede', quelle: 'plan', eintragId: e.id
        });
      });
    }
    (klasse.zusatz || []).forEach(function (z) {
      if (z.datum !== iso || !fachSichtbar(z.fachId)) return;
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
  SP.einheitenAmTag = function (klasse, iso, fachId, eintraegeStattPlan) {
    const alle = SP.klassenStundenAmTag(klasse, iso, eintraegeStattPlan);
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
