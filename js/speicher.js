/*
 * Notenblock – Speicherschicht
 *
 * Dünner Wrapper um IndexedDB mit localStorage als Ausweichspeicher.
 *
 * Zwei Ablagen:
 *   meta      – ein Klartext-Datensatz: Salt, Kontrollwert, Fehlversuche.
 *               Enthält keine Passphrase und keinen Hash davon.
 *   eintraege – verschlüsselte Datensätze { id, iv, daten }. Was ein Eintrag
 *               enthält (Klasse, Bewertung, Notiz …), steht nur im
 *               verschlüsselten Teil. Die id ist zufällig und sagt nichts aus.
 *
 * Bekannter Safari-Fehler: indexedDB.open meldet sich gelegentlich gar nicht.
 * Deshalb gilt eine Zeitgrenze von 1,5 Sekunden. Ein Klartext-Marker in
 * localStorage (notenblock:speicherort) merkt sich, wo die Daten liegen:
 *   - Liegen sie in IndexedDB und IndexedDB antwortet nicht, gibt es eine
 *     Fehlermeldung mit „Erneut versuchen“ – niemals einen scheinbar leeren
 *     Neuanfang, der die Daten verdecken würde.
 *   - Ist noch nichts eingerichtet, darf localStorage genutzt werden.
 *   - Liegen Daten in localStorage und IndexedDB funktioniert später wieder,
 *     werden sie beim Start nach IndexedDB übernommen.
 */
'use strict';
NB.Speicher = (function () {
  const S = {};

  const DB_NAME = 'notenblock';
  const DB_VERSION = 1;
  const STORE_META = 'meta';
  const STORE_EINTRAEGE = 'eintraege';
  const META_SCHLUESSEL = 'meta';
  const ZEITGRENZE_MS = 1500;

  const LS = 'notenblock:';            // Präfix aller localStorage-Schlüssel
  const LS_ORT = LS + 'speicherort';   // 'indexeddb' | 'localstorage'
  const LS_META = LS + 'meta';
  const LS_EINTRAG = LS + 'e:';

  let db = null;
  S.backend = null;                    // 'indexeddb' | 'localstorage'

  /* ---------- localStorage ---------- */

  function lsVerfuegbar() {
    try {
      const probe = LS + 'probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  function lsLesen(schluessel) {
    try {
      const wert = localStorage.getItem(schluessel);
      return wert == null ? null : JSON.parse(wert);
    } catch (e) {
      return null;
    }
  }

  function lsSchreiben(schluessel, wert) {
    localStorage.setItem(schluessel, JSON.stringify(wert));
  }

  function lsSchluesselListe() {
    const liste = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(LS) === 0) liste.push(k);
    }
    return liste;
  }

  function lsAlleEintraege() {
    return lsSchluesselListe()
      .filter(k => k.indexOf(LS_EINTRAG) === 0)
      .map(k => lsLesen(k))
      .filter(Boolean);
  }

  S.speicherort = function () {
    try { return localStorage.getItem(LS_ORT); } catch (e) { return null; }
  };

  function speicherortSetzen(ort) {
    try { localStorage.setItem(LS_ORT, ort); } catch (e) { /* ohne localStorage kein Marker */ }
  }

  /* ---------- IndexedDB ---------- */

  function idbOeffnen() {
    return new Promise(function (aufloesen, ablehnen) {
      let erledigt = false;
      const zeit = setTimeout(function () {
        if (erledigt) return;
        erledigt = true;
        ablehnen(new Error('IndexedDB hat sich innerhalb von ' + ZEITGRENZE_MS + ' ms nicht gemeldet'));
      }, ZEITGRENZE_MS);

      let anfrage;
      try {
        anfrage = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        clearTimeout(zeit);
        erledigt = true;
        ablehnen(e);
        return;
      }

      anfrage.onupgradeneeded = function (ereignis) {
        const d = ereignis.target.result;
        if (!d.objectStoreNames.contains(STORE_META)) d.createObjectStore(STORE_META);
        if (!d.objectStoreNames.contains(STORE_EINTRAEGE)) d.createObjectStore(STORE_EINTRAEGE, { keyPath: 'id' });
      };
      anfrage.onsuccess = function (ereignis) {
        if (erledigt) {
          // Zu spät gemeldet – wir arbeiten bereits anders weiter; Verbindung nicht offen lassen.
          try { ereignis.target.result.close(); } catch (e) { /* egal */ }
          return;
        }
        erledigt = true;
        clearTimeout(zeit);
        aufloesen(ereignis.target.result);
      };
      anfrage.onerror = function () {
        if (erledigt) return;
        erledigt = true;
        clearTimeout(zeit);
        ablehnen(anfrage.error || new Error('IndexedDB konnte nicht geöffnet werden'));
      };
      anfrage.onblocked = function () {
        if (erledigt) return;
        erledigt = true;
        clearTimeout(zeit);
        ablehnen(new Error('IndexedDB ist durch ein anderes Fenster blockiert'));
      };
    });
  }

  /**
   * Führt eine Transaktion aus. `arbeit(t)` erhält die Transaktion und darf
   * eine IDBRequest zurückgeben, deren Ergebnis dann geliefert wird.
   */
  function transaktion(stores, modus, arbeit) {
    return new Promise(function (aufloesen, ablehnen) {
      if (!db) { ablehnen(new Error('IndexedDB ist nicht geöffnet')); return; }
      let t;
      try {
        t = db.transaction(stores, modus);
      } catch (e) {
        ablehnen(e);
        return;
      }
      let ergebnis;
      t.oncomplete = () => aufloesen(ergebnis);
      t.onerror = () => ablehnen(t.error || new Error('Transaktion fehlgeschlagen'));
      t.onabort = () => ablehnen(t.error || new Error('Transaktion abgebrochen'));
      try {
        const r = arbeit(t);
        if (r && typeof r === 'object' && 'onsuccess' in r) {
          r.onsuccess = () => { ergebnis = r.result; };
        }
      } catch (e) {
        try { t.abort(); } catch (e2) { /* egal */ }
        ablehnen(e);
      }
    });
  }

  /* ---------- Öffnen und Übernahme ---------- */

  /**
   * Wählt das Backend. Wirft einen Fehler mit `wiederholbar = true`, wenn die
   * Daten in IndexedDB liegen, IndexedDB aber gerade nicht antwortet.
   */
  S.oeffnen = async function () {
    const ort = S.speicherort();
    let fehler = null;

    if (window.indexedDB) {
      try {
        db = await idbOeffnen();
      } catch (e) {
        fehler = e;
        db = null;
      }
    } else {
      fehler = new Error('Dieser Browser hat kein IndexedDB');
    }

    if (db) {
      S.backend = 'indexeddb';
      db.onversionchange = function () { try { db.close(); } catch (e) { /* egal */ } db = null; };
      if (ort === 'localstorage') await ausweichdatenUebernehmen();
      return S.backend;
    }

    if (ort === 'indexeddb') {
      const e = new Error('Der Datenspeicher des Browsers (IndexedDB) antwortet nicht. Deine Daten sind weiterhin vorhanden.');
      e.wiederholbar = true;
      e.ursache = fehler;
      throw e;
    }

    if (!lsVerfuegbar()) {
      throw new Error('Der Browser stellt keinen Speicher zur Verfügung (privates Fenster?). ' + (fehler ? fehler.message : ''));
    }

    S.backend = 'localstorage';
    return S.backend;
  };

  /** Daten aus dem Ausweichspeicher nach IndexedDB holen, danach dort löschen. */
  async function ausweichdatenUebernehmen() {
    const meta = lsLesen(LS_META);
    const eintraege = lsAlleEintraege();
    if (!meta && eintraege.length === 0) {
      speicherortSetzen('indexeddb');
      return;
    }
    await S.ersetzen(meta, eintraege);
    lsSchluesselListe().filter(k => k !== LS_ORT).forEach(k => localStorage.removeItem(k));
  }

  /* ---------- Meta ---------- */

  S.metaLesen = async function () {
    if (S.backend === 'indexeddb') {
      const m = await transaktion(STORE_META, 'readonly', t => t.objectStore(STORE_META).get(META_SCHLUESSEL));
      return m || null;
    }
    return lsLesen(LS_META);
  };

  S.metaSchreiben = async function (meta) {
    if (S.backend === 'indexeddb') {
      await transaktion(STORE_META, 'readwrite', t => t.objectStore(STORE_META).put(meta, META_SCHLUESSEL));
    } else {
      lsSchreiben(LS_META, meta);
    }
    speicherortSetzen(S.backend);
  };

  /* ---------- Einträge ---------- */

  S.alleEintraege = async function () {
    if (S.backend === 'indexeddb') {
      const liste = await transaktion(STORE_EINTRAEGE, 'readonly', t => t.objectStore(STORE_EINTRAEGE).getAll());
      return liste || [];
    }
    return lsAlleEintraege();
  };

  /** Mehrere Einträge in einem Schritt schreiben und löschen. */
  S.eintraegeSchreiben = async function (schreiben, loeschen) {
    schreiben = schreiben || [];
    loeschen = loeschen || [];
    if (schreiben.length === 0 && loeschen.length === 0) return;
    if (S.backend === 'indexeddb') {
      await transaktion(STORE_EINTRAEGE, 'readwrite', function (t) {
        const store = t.objectStore(STORE_EINTRAEGE);
        schreiben.forEach(e => store.put(e));
        loeschen.forEach(id => store.delete(id));
      });
    } else {
      schreiben.forEach(e => lsSchreiben(LS_EINTRAG + e.id, e));
      loeschen.forEach(id => localStorage.removeItem(LS_EINTRAG + id));
    }
  };

  /**
   * Gesamten Bestand ersetzen (Einrichtung, Passphrase ändern, Sicherung laden).
   * In IndexedDB eine einzige Transaktion: entweder alles oder nichts.
   * In localStorage: bei einem Fehler wird der alte Bestand zurückgeschrieben.
   */
  S.ersetzen = async function (meta, eintraege) {
    eintraege = eintraege || [];
    if (S.backend === 'indexeddb') {
      await transaktion([STORE_META, STORE_EINTRAEGE], 'readwrite', function (t) {
        const m = t.objectStore(STORE_META);
        const e = t.objectStore(STORE_EINTRAEGE);
        m.clear();
        e.clear();
        if (meta) m.put(meta, META_SCHLUESSEL);
        eintraege.forEach(x => e.put(x));
      });
    } else {
      const alteMeta = lsLesen(LS_META);
      const alteEintraege = lsAlleEintraege();
      const alles = () => lsSchluesselListe().filter(k => k !== LS_ORT).forEach(k => localStorage.removeItem(k));
      try {
        alles();
        if (meta) lsSchreiben(LS_META, meta);
        eintraege.forEach(e => lsSchreiben(LS_EINTRAG + e.id, e));
      } catch (fehler) {
        alles();
        if (alteMeta) lsSchreiben(LS_META, alteMeta);
        alteEintraege.forEach(e => lsSchreiben(LS_EINTRAG + e.id, e));
        throw fehler;
      }
    }
    speicherortSetzen(S.backend);
  };

  /** Alles löschen – in beiden Ablagen, samt Marker. */
  S.allesLoeschen = async function () {
    if (S.backend === 'indexeddb') {
      await transaktion([STORE_META, STORE_EINTRAEGE], 'readwrite', function (t) {
        t.objectStore(STORE_META).clear();
        t.objectStore(STORE_EINTRAEGE).clear();
      });
    }
    try { lsSchluesselListe().forEach(k => localStorage.removeItem(k)); } catch (e) { /* egal */ }
  };

  return S;
})();
