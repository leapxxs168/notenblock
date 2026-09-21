/*
 * Notenblock – Datenschicht
 *
 * Hält den entschlüsselten Bestand im Arbeitsspeicher und schreibt Änderungen
 * verschlüsselt in den Speicher. Für die Oberfläche ist der Zugriff synchron:
 *
 *   NB.Daten.holen(typ, schluessel)        → Objekt oder null
 *   NB.Daten.alle(typ)                     → Liste aller Objekte dieses Typs
 *   NB.Daten.setzen(typ, schluessel, obj)  → speichert (verzögert um 150 ms gebündelt)
 *   NB.Daten.entfernen(typ, schluessel)
 *   NB.Daten.bei(handler)                  → wird bei jeder Änderung gerufen
 *
 * Typen und Schlüssel:
 *   'klasse'        klasse.id
 *   'faecher'       ''  (Liste aller Fächer in Reihenfolge)
 *   'stundenplan'   ''  (Liste der Stundenplaneinträge)
 *   'schuljahr'     ''  (Zeitraum, Ferien, Feiertage, Ausnahmen, Zusatztermine)
 *   'stundenzeiten' ''  (Uhrzeiten je Stundennummer)
 *   'planung'       datum|stunde|klasseId|fachId
 *   'bewertung'     klasseId|fachId|datum
 *   'notiz'         notiz.id
 *   'aufgabe'       aufgabe.id
 *   'einstellungen' ''
 *   'zustand'       ''  (wo die App zuletzt stand)
 *
 * Jeder Datensatz wird als eigener Eintrag { id, iv, daten } verschlüsselt
 * abgelegt; Typ und Schlüssel stehen im verschlüsselten Teil. Der AES-Schlüssel
 * liegt ausschließlich in der Variable `schluessel` und wird beim Sperren
 * verworfen – zusammen mit dem entschlüsselten Bestand.
 */
'use strict';
NB.Daten = (function () {
  const D = {};
  const H = NB.Hilfen;
  const K = NB.Krypto;
  const S = NB.Speicher;

  const SCHREIBVERZOEGERUNG_MS = 150;
  const WIEDERHOLUNG_MS = 5000;

  let schluessel = null;      // CryptoKey – nur im Arbeitsspeicher
  let meta = null;            // Klartext: { version, salt, iterationen, kontrollwert, fehlversuche, gesperrtBis }
  let cache = null;           // typ → { schluessel → { id, inhalt } }
  let ausstehend = new Map(); // id → { typ, schluessel } oder null (= löschen)
  let schreibTimer = null;
  let schreibKette = Promise.resolve();
  const beobachter = [];

  D.ladeWarnung = null;       // Text, falls Einträge beim Laden nicht lesbar waren
  D.schreibfehler = null;     // Letzter Speicherfehler (für die Anzeige)

  /* ---------- Metadaten ---------- */

  D.metaLaden = async function () {
    meta = await S.metaLesen();
    return meta;
  };

  D.istEingerichtet = () => !!meta;
  D.istEntsperrt = () => !!schluessel && !!cache;
  D.meta = () => meta;

  D.metaAktualisieren = async function (aenderungen) {
    Object.assign(meta, aenderungen);
    await S.metaSchreiben(meta);
  };

  /* ---------- Ver- und Entschlüsseln von Einträgen ---------- */

  async function eintragVerschluesseln(k, id, typ, schl, inhalt) {
    const paket = await K.verschluesselnObjekt(k, { typ: typ, schluessel: schl, inhalt: inhalt });
    return { id: id, iv: paket.iv, daten: paket.daten };
  }

  /** Alle Einträge des Caches mit einem Schlüssel verschlüsseln (für ersetzen). */
  async function allesVerschluesseln(k) {
    const liste = [];
    Object.keys(cache).forEach(function (typ) {
      Object.keys(cache[typ]).forEach(function (schl) {
        const e = cache[typ][schl];
        liste.push({ id: e.id, typ: typ, schluessel: schl, inhalt: e.inhalt });
      });
    });
    const ergebnis = [];
    for (let i = 0; i < liste.length; i += 50) {
      const block = liste.slice(i, i + 50);
      const teil = await Promise.all(block.map(e => eintragVerschluesseln(k, e.id, e.typ, e.schluessel, e.inhalt)));
      ergebnis.push.apply(ergebnis, teil);
    }
    return ergebnis;
  }

  /** Bestand aus dem Speicher laden und entschlüsseln. */
  async function allesLaden(k) {
    const roh = await S.alleEintraege();
    const neu = {};
    let unlesbar = 0;
    for (let i = 0; i < roh.length; i += 50) {
      const block = roh.slice(i, i + 50);
      const teile = await Promise.all(block.map(async function (e) {
        try {
          const objekt = await K.entschluesselnObjekt(k, e);
          return { id: e.id, objekt: objekt };
        } catch (fehler) {
          return null;
        }
      }));
      teile.forEach(function (t) {
        if (!t || !t.objekt || typeof t.objekt.typ !== 'string') { unlesbar++; return; }
        const typ = t.objekt.typ;
        const schl = String(t.objekt.schluessel == null ? '' : t.objekt.schluessel);
        if (!neu[typ]) neu[typ] = {};
        neu[typ][schl] = { id: t.id, inhalt: t.objekt.inhalt };
      });
    }
    D.ladeWarnung = unlesbar > 0
      ? (unlesbar + (unlesbar === 1 ? ' Eintrag konnte' : ' Einträge konnten') + ' nicht gelesen werden und wurde' + (unlesbar === 1 ? '' : 'n') + ' übersprungen.')
      : null;
    return neu;
  }

  /* ---------- Lebenszyklus ---------- */

  /** Erster Start: Schlüssel ableiten, Kontrollwert und Startdaten anlegen. */
  D.einrichten = async function (passphrase) {
    const salt = K.zufallsBytes(16);
    const k = await K.schluesselAbleiten(passphrase, salt, K.ITERATIONEN);
    const kontrollwert = await K.kontrollwertErzeugen(k);
    const neueMeta = {
      version: 1,
      salt: H.bytesZuBase64(salt),
      iterationen: K.ITERATIONEN,
      kontrollwert: kontrollwert,
      fehlversuche: 0,
      gesperrtBis: 0,
      angelegtAm: H.jetztIso()
    };
    // Startdaten im Cache aufbauen, dann alles in einem Schritt schreiben.
    schluessel = k;
    cache = {};
    ausstehend = new Map();
    NB.Startdaten.anlegen(D);
    ausstehend = new Map(); // wird gleich vollständig geschrieben
    const eintraege = await allesVerschluesseln(k);
    await S.ersetzen(neueMeta, eintraege);
    meta = neueMeta;
  };

  /** Entsperren: liefert true bei richtiger Passphrase. */
  D.entsperren = async function (passphrase) {
    const k = await K.schluesselAbleiten(passphrase, H.base64ZuBytes(meta.salt), meta.iterationen);
    const passt = await K.kontrollwertPruefen(k, meta.kontrollwert);
    if (!passt) return false;
    const neu = await allesLaden(k);
    schluessel = k;
    cache = neu;
    ausstehend = new Map();
    einstellungenErgaenzen();
    return true;
  };

  /**
   * Einstellungen um neue Standardwerte ergänzen, ohne gesetzte Werte zu
   * überschreiben. Einmalige Anpassung: Bestände mit Version 1 bekommen den
   * geänderten Standard „Sperre im Hintergrund: aus“, weil es noch keinen
   * Einstellungsbildschirm gab, in dem der alte Wert bewusst gewählt wurde.
   */
  function einstellungenErgaenzen() {
    const standard = NB.Startdaten.einstellungenStandard();
    let e = D.holen('einstellungen', '');
    let geaendert = false;
    if (!e) { e = {}; geaendert = true; }
    if (!e.version) {
      e.sperreImHintergrund = false;
      e.version = 2;
      geaendert = true;
    }
    Object.keys(standard).forEach(function (name) {
      if (name === 'datenmodell') return;   // kennzeichnet den Aufbau des Bestands; setzt nur die Umstellung
      if (e[name] === undefined) { e[name] = standard[name]; geaendert = true; }
    });
    if (geaendert) D.setzen('einstellungen', '', e);
  }

  /** Sperren: ausstehende Änderungen schreiben, dann Schlüssel und Bestand verwerfen. */
  D.sperren = async function () {
    try { await D.flush(); } catch (e) { /* Fehler wurde bereits gemeldet */ }
    schluessel = null;
    cache = null;
    ausstehend = new Map();
  };

  /**
   * Passphrase ändern: alte prüfen, gesamten Bestand mit neuem Schlüssel
   * verschlüsseln und in einem Schritt ersetzen. Bricht der Vorgang ab,
   * bleibt der alte Zustand erhalten. Liefert false bei falscher alter Passphrase.
   */
  D.passphraseAendern = async function (alt, neu) {
    const kAlt = await K.schluesselAbleiten(alt, H.base64ZuBytes(meta.salt), meta.iterationen);
    if (!(await K.kontrollwertPruefen(kAlt, meta.kontrollwert))) return false;
    await D.flush();
    const salt = K.zufallsBytes(16);
    const kNeu = await K.schluesselAbleiten(neu, salt, K.ITERATIONEN);
    const kontrollwert = await K.kontrollwertErzeugen(kNeu);
    const eintraege = await allesVerschluesseln(kNeu);
    const neueMeta = Object.assign({}, meta, {
      salt: H.bytesZuBase64(salt),
      iterationen: K.ITERATIONEN,
      kontrollwert: kontrollwert,
      fehlversuche: 0,
      gesperrtBis: 0,
      geaendertAm: H.jetztIso()
    });
    await S.ersetzen(neueMeta, eintraege);
    meta = neueMeta;
    schluessel = kNeu;
    return true;
  };

  /** Gesamten Bestand als Liste { typ, schluessel, inhalt } (ohne Oberflächenzustand). */
  D.bestandExportieren = function () {
    pruefeEntsperrt();
    const liste = [];
    Object.keys(cache).forEach(function (typ) {
      if (typ === 'zustand') return;
      Object.keys(cache[typ]).forEach(function (schl) {
        liste.push({ typ: typ, schluessel: schl, inhalt: cache[typ][schl].inhalt });
      });
    });
    return liste;
  };

  /**
   * Bestand vollständig durch eine Liste { typ, schluessel, inhalt } ersetzen
   * (Sicherung laden). Passphrase und Schlüssel bleiben. In IndexedDB eine
   * einzige Transaktion: entweder alles oder nichts.
   */
  D.bestandImportieren = async function (liste) {
    pruefeEntsperrt();
    await D.flush();
    const neu = {};
    liste.forEach(function (e) {
      if (!e || typeof e.typ !== 'string') return;
      const schl = String(e.schluessel == null ? '' : e.schluessel);
      if (!neu[e.typ]) neu[e.typ] = {};
      neu[e.typ][schl] = { id: H.neueId(), inhalt: e.inhalt };
    });
    const alterCache = cache;
    cache = neu;
    try {
      const eintraege = await allesVerschluesseln(schluessel);
      await S.ersetzen(meta, eintraege);
    } catch (fehler) {
      cache = alterCache;
      throw fehler;
    }
    ausstehend = new Map();
    einstellungenErgaenzen();
  };

  /** Alles löschen und in den Zustand vor der Einrichtung zurückkehren. */
  D.allesLoeschen = async function () {
    clearTimeout(schreibTimer);
    ausstehend = new Map();
    await S.allesLoeschen();
    schluessel = null;
    cache = null;
    meta = null;
  };

  /* ---------- Zugriff ---------- */

  function pruefeEntsperrt() {
    if (!cache) throw new Error('Die Daten sind gesperrt');
  }

  D.holen = function (typ, schl) {
    if (!cache) return null;
    const gruppe = cache[typ];
    const e = gruppe && gruppe[String(schl == null ? '' : schl)];
    return e ? e.inhalt : null;
  };

  D.alle = function (typ) {
    if (!cache || !cache[typ]) return [];
    return Object.keys(cache[typ]).map(s => cache[typ][s].inhalt);
  };

  D.schluesselListe = function (typ) {
    if (!cache || !cache[typ]) return [];
    return Object.keys(cache[typ]);
  };

  /**
   * Objekt ablegen. Das übergebene Objekt wird direkt gehalten – wer ein mit
   * holen() erhaltenes Objekt verändert, ruft danach setzen() auf.
   */
  D.setzen = function (typ, schl, inhalt) {
    pruefeEntsperrt();
    schl = String(schl == null ? '' : schl);
    if (!cache[typ]) cache[typ] = {};
    let e = cache[typ][schl];
    if (!e) {
      e = { id: H.neueId(), inhalt: inhalt };
      cache[typ][schl] = e;
    } else {
      e.inhalt = inhalt;
    }
    ausstehend.set(e.id, { typ: typ, schluessel: schl });
    schreibenPlanen(SCHREIBVERZOEGERUNG_MS);
    melden(typ, schl, inhalt);
  };

  D.entfernen = function (typ, schl) {
    pruefeEntsperrt();
    schl = String(schl == null ? '' : schl);
    const gruppe = cache[typ];
    const e = gruppe && gruppe[schl];
    if (!e) return;
    delete gruppe[schl];
    ausstehend.set(e.id, null);
    schreibenPlanen(SCHREIBVERZOEGERUNG_MS);
    melden(typ, schl, null);
  };

  /* ---------- Beobachter ---------- */

  D.bei = function (handler) {
    beobachter.push(handler);
    return function () {
      const i = beobachter.indexOf(handler);
      if (i >= 0) beobachter.splice(i, 1);
    };
  };

  function melden(typ, schl, inhalt) {
    beobachter.slice().forEach(function (h) {
      try { h(typ, schl, inhalt); } catch (e) { console.error('Beobachter-Fehler', e); }
    });
  }

  /* ---------- Schreiben ---------- */

  function schreibfehlerBehandeln(fehler) {
    console.error('Speichern fehlgeschlagen', fehler);
    D.schreibfehler = fehler;
    if (NB.App && NB.App.meldung) {
      NB.App.meldung('Speichern fehlgeschlagen: ' + (fehler && fehler.message ? fehler.message : fehler) + ' – es wird erneut versucht.', 'fehler');
    }
    if (ausstehend.size > 0) schreibenPlanen(WIEDERHOLUNG_MS);
  }

  function schreibenPlanen(verzoegerung) {
    clearTimeout(schreibTimer);
    schreibTimer = setTimeout(function () {
      schreibKette = schreibKette.then(schreiben).catch(schreibfehlerBehandeln);
    }, verzoegerung);
  }

  async function schreiben() {
    if (!schluessel || !cache || ausstehend.size === 0) return;
    const k = schluessel;
    const aufgaben = ausstehend;
    ausstehend = new Map();
    const speichern = [];
    const loeschen = [];
    try {
      for (const paar of aufgaben) {
        const id = paar[0], info = paar[1];
        if (info === null) {
          loeschen.push(id);
          continue;
        }
        const e = cache[info.typ] && cache[info.typ][info.schluessel];
        if (!e || e.id !== id) continue; // inzwischen entfernt oder ersetzt
        speichern.push(await eintragVerschluesseln(k, id, info.typ, info.schluessel, e.inhalt));
      }
      await S.eintraegeSchreiben(speichern, loeschen);
      D.schreibfehler = null;
    } catch (fehler) {
      // Nicht geschriebene Änderungen behalten, damit sie erneut versucht werden.
      aufgaben.forEach(function (info, id) {
        if (!ausstehend.has(id)) ausstehend.set(id, info);
      });
      throw fehler;
    }
  }

  /** Ausstehende Änderungen sofort schreiben. Der Aufrufer sieht einen Fehler, die Kette läuft weiter. */
  D.flush = function () {
    clearTimeout(schreibTimer);
    const lauf = schreibKette.then(schreiben);
    schreibKette = lauf.catch(schreibfehlerBehandeln);
    return lauf;
  };

  D.hatAusstehendeAenderungen = () => ausstehend.size > 0;

  return D;
})();
