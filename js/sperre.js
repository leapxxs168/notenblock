/*
 * Notenblock – Einrichtung, Sperrbildschirm und automatische Sperre
 *
 * - Einrichtung beim ersten Start (Passphrase zweimal, mindestens zehn Zeichen,
 *   Stärkeanzeige, Bestätigung), danach Hinweis auf den Passwortmanager.
 * - Sperrbildschirm beim Start und nach jeder Sperre.
 * - Nach fünf Fehlversuchen eine Wartezeit ab fünf Sekunden, die sich mit
 *   jedem weiteren Fehlversuch verdoppelt. Daten werden nie gelöscht.
 * - Automatische Sperre nach Minuten ohne Bedienung und – abschaltbar – beim
 *   Wechsel in den Hintergrund. Beide Werte kommen aus den Einstellungen und
 *   wirken sofort.
 */
'use strict';
NB.Sperre = (function () {
  const Sp = {};
  const H = NB.Hilfen;
  const D = NB.Daten;

  const MINDESTLAENGE = 10;
  const FREIE_VERSUCHE = 5;
  const WARTEZEIT_START_S = 5;
  const WARTEZEIT_MAX_S = 60 * 60;
  const PRUEFINTERVALL_MS = 10000;

  const STAERKE_TEXTE = ['Mindestens zehn Zeichen', 'Schwach – besser länger', 'Mittel', 'Stark'];

  let entsperrtHandler = null;   // wird nach erfolgreichem Entsperren gerufen
  let gesperrtHandler = null;    // wird beim Sperren gerufen
  let letzteAktivitaet = Date.now();
  let verstecktSeit = null;
  let wartezeitTimer = null;
  let ueberwachungGestartet = false;

  /* ---------- Bildschirme umschalten ---------- */

  const BILDSCHIRME = ['bildschirm-laden', 'bildschirm-fehler', 'bildschirm-einrichtung',
    'bildschirm-einrichtung-hinweis', 'bildschirm-sperre', 'app'];

  Sp.bildschirmZeigen = function (id) {
    BILDSCHIRME.forEach(function (b) {
      const e = document.getElementById(b);
      if (e) e.hidden = (b !== id);
    });
  };

  Sp.beiEntsperrt = fn => { entsperrtHandler = fn; };
  Sp.beiGesperrt = fn => { gesperrtHandler = fn; };

  /* ---------- Einrichtung ---------- */

  Sp.einrichtungZeigen = function () {
    Sp.bildschirmZeigen('bildschirm-einrichtung');
    const pass1 = H.$('#einrichtung-pass1');
    pass1.value = '';
    H.$('#einrichtung-pass2').value = '';
    H.$('#einrichtung-bestaetigt').checked = false;
    staerkeAnzeigen('');
    fehlerZeigen('#einrichtung-fehler', null);
    setTimeout(() => pass1.focus(), 50);
  };

  function staerkeAnzeigen(passphrase) {
    const stufe = passphrase ? NB.Krypto.staerke(passphrase) : 0;
    const box = H.$('#einrichtung-staerke');
    box.dataset.stufe = String(stufe);
    H.$('#einrichtung-staerke-text').textContent = passphrase ? STAERKE_TEXTE[stufe] : '';
  }

  function fehlerZeigen(selektor, text) {
    const e = H.$(selektor);
    e.textContent = text || '';
    e.hidden = !text;
  }

  async function einrichtungAbsenden(ereignis) {
    ereignis.preventDefault();
    const pass1 = H.$('#einrichtung-pass1').value;
    const pass2 = H.$('#einrichtung-pass2').value;
    const bestaetigt = H.$('#einrichtung-bestaetigt').checked;

    if (pass1.length < MINDESTLAENGE) {
      fehlerZeigen('#einrichtung-fehler', 'Die Passphrase muss mindestens zehn Zeichen lang sein.');
      H.$('#einrichtung-pass1').focus();
      return;
    }
    if (pass1 !== pass2) {
      fehlerZeigen('#einrichtung-fehler', 'Die beiden Eingaben stimmen nicht überein.');
      H.$('#einrichtung-pass2').focus();
      return;
    }
    if (!bestaetigt) {
      fehlerZeigen('#einrichtung-fehler', 'Bitte bestätige, dass die Daten ohne Passphrase nicht wiederherstellbar sind.');
      return;
    }

    fehlerZeigen('#einrichtung-fehler', null);
    const knopf = H.$('#einrichtung-absenden');
    knopf.disabled = true;
    knopf.textContent = 'Schlüssel wird erzeugt …';
    try {
      await D.einrichten(pass1);
      H.$('#einrichtung-pass1').value = '';
      H.$('#einrichtung-pass2').value = '';
      Sp.bildschirmZeigen('bildschirm-einrichtung-hinweis');
      setTimeout(() => H.$('#einrichtung-weiter').focus(), 50);
    } catch (fehler) {
      console.error(fehler);
      fehlerZeigen('#einrichtung-fehler', 'Die Einrichtung ist fehlgeschlagen: ' + (fehler.message || fehler) + '. Bitte erneut versuchen.');
    } finally {
      knopf.disabled = false;
      knopf.textContent = 'Passphrase festlegen';
    }
  }

  /* ---------- Sperrbildschirm ---------- */

  Sp.sperrbildschirmZeigen = function () {
    Sp.bildschirmZeigen('bildschirm-sperre');
    vergessenZeigen(false);
    const feld = H.$('#sperre-pass');
    feld.value = '';
    fehlerZeigen('#sperre-fehler', null);
    wartezeitAnzeigen();
    setTimeout(() => feld.focus(), 50);
  };

  /** Wartezeit in Sekunden nach dem n-ten Fehlversuch (0 = keine). */
  function wartezeitSekunden(fehlversuche) {
    if (fehlversuche < FREIE_VERSUCHE) return 0;
    return Math.min(WARTEZEIT_MAX_S, WARTEZEIT_START_S * Math.pow(2, fehlversuche - FREIE_VERSUCHE));
  }

  function wartezeitAnzeigen() {
    clearInterval(wartezeitTimer);
    const meta = D.meta() || {};
    const anzeige = H.$('#sperre-wartezeit');
    const feld = H.$('#sperre-pass');
    const knopf = H.$('#sperre-entsperren');

    function aktualisieren() {
      const rest = Math.ceil(((meta.gesperrtBis || 0) - Date.now()) / 1000);
      if (rest > 0) {
        anzeige.textContent = 'Zu viele Fehlversuche. Nächster Versuch in ' + rest + ' Sekunden möglich.';
        anzeige.hidden = false;
        feld.disabled = true;
        knopf.disabled = true;
      } else {
        clearInterval(wartezeitTimer);
        anzeige.hidden = true;
        feld.disabled = false;
        knopf.disabled = false;
      }
    }
    aktualisieren();
    if ((meta.gesperrtBis || 0) > Date.now()) wartezeitTimer = setInterval(aktualisieren, 500);
  }

  async function sperreAbsenden(ereignis) {
    ereignis.preventDefault();
    const meta = D.meta();
    if (!meta) return;
    if ((meta.gesperrtBis || 0) > Date.now()) { wartezeitAnzeigen(); return; }

    const feld = H.$('#sperre-pass');
    const passphrase = feld.value;
    if (!passphrase) { feld.focus(); return; }

    const knopf = H.$('#sperre-entsperren');
    knopf.disabled = true;
    knopf.textContent = 'Wird geprüft …';
    fehlerZeigen('#sperre-fehler', null);
    try {
      const ok = await D.entsperren(passphrase);
      if (ok) {
        feld.value = '';
        if (meta.fehlversuche || meta.gesperrtBis) await D.metaAktualisieren({ fehlversuche: 0, gesperrtBis: 0 });
        letzteAktivitaet = Date.now();
        Sp.ueberwachungStarten();
        if (entsperrtHandler) entsperrtHandler();
      } else {
        const fehlversuche = (meta.fehlversuche || 0) + 1;
        const warten = wartezeitSekunden(fehlversuche);
        await D.metaAktualisieren({ fehlversuche: fehlversuche, gesperrtBis: warten > 0 ? Date.now() + warten * 1000 : 0 });
        feld.value = '';
        fehlerZeigen('#sperre-fehler', 'Die Passphrase ist nicht richtig.');
        wartezeitAnzeigen();
        if (!feld.disabled) feld.focus();
      }
    } catch (fehler) {
      console.error(fehler);
      fehlerZeigen('#sperre-fehler', 'Entsperren fehlgeschlagen: ' + (fehler.message || fehler));
    } finally {
      knopf.textContent = 'Entsperren';
      if ((D.meta() || {}).gesperrtBis <= Date.now()) knopf.disabled = false;
    }
  }

  /* ---------- Sperren ---------- */

  let sperrenLaeuft = false;

  /** Sofort sperren: App verbergen, ausstehende Änderungen schreiben, Schlüssel verwerfen. */
  Sp.sperren = async function () {
    if (sperrenLaeuft || !D.istEntsperrt()) return;
    sperrenLaeuft = true;
    try {
      if (NB.Dialog) NB.Dialog.alleSchliessen();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (gesperrtHandler) gesperrtHandler();
      Sp.sperrbildschirmZeigen();
      await D.sperren();
    } finally {
      sperrenLaeuft = false;
    }
  };

  /* ---------- Automatische Sperre ---------- */

  function einstellung(name, standard) {
    const e = D.holen('einstellungen', '');
    return e && e[name] != null ? e[name] : standard;
  }

  function aktivitaet() {
    letzteAktivitaet = Date.now();
  }

  function pruefen() {
    if (!D.istEntsperrt()) return;
    const minuten = Number(einstellung('sperreNachMinuten', 5));
    if (minuten > 0 && Date.now() - letzteAktivitaet > minuten * 60000) Sp.sperren();
  }

  function sichtbarkeitGeaendert() {
    if (document.visibilityState === 'hidden') {
      verstecktSeit = Date.now();
      if (!D.istEntsperrt()) return;
      // Ausstehende Änderungen sofort sichern, bevor das System die Seite anhält.
      D.flush().catch(() => { /* bereits gemeldet */ });
      if (einstellung('sperreImHintergrund', true)) Sp.sperren();
    } else {
      // Zurück im Vordergrund: Zeit im Hintergrund zählt als Untätigkeit.
      if (verstecktSeit && verstecktSeit < letzteAktivitaet) letzteAktivitaet = verstecktSeit;
      verstecktSeit = null;
      pruefen();
      // Wartezeit-Anzeige auffrischen, falls der Sperrbildschirm offen ist
      if (!H.$('#bildschirm-sperre').hidden) wartezeitAnzeigen();
    }
  }

  Sp.ueberwachungStarten = function () {
    if (ueberwachungGestartet) return;
    ueberwachungGestartet = true;
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (name) {
      document.addEventListener(name, aktivitaet, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', sichtbarkeitGeaendert);
    window.addEventListener('pagehide', function () {
      if (D.istEntsperrt()) D.flush().catch(() => { /* bereits gemeldet */ });
    });
    setInterval(pruefen, PRUEFINTERVALL_MS);
  };

  /* ---------- Passphrase vergessen: Neuanfang nach Eintippen von LÖSCHEN ---------- */

  const LOESCHWORT = 'LÖSCHEN';

  function vergessenZeigen(sichtbar) {
    H.$('#sperre-normal').hidden = sichtbar;
    H.$('#sperre-vergessen').hidden = !sichtbar;
    const eingabe = H.$('#sperre-loeschen-eingabe');
    eingabe.value = '';
    H.$('#sperre-alles-loeschen').disabled = true;
    if (sichtbar) setTimeout(() => eingabe.focus(), 50);
  }

  function loeschwortPruefen() {
    const wert = H.$('#sperre-loeschen-eingabe').value.trim().normalize('NFC');
    H.$('#sperre-alles-loeschen').disabled = (wert !== LOESCHWORT);
  }

  async function allesLoeschen() {
    if (H.$('#sperre-loeschen-eingabe').value.trim().normalize('NFC') !== LOESCHWORT) return;
    const knopf = H.$('#sperre-alles-loeschen');
    knopf.disabled = true;
    knopf.textContent = 'Wird gelöscht …';
    try {
      await D.allesLoeschen();
      NB.Navigation.zuruecksetzen();
      NB.App.meldung('Alle Daten wurden gelöscht. Notenblock beginnt von vorn.');
      Sp.einrichtungZeigen();
    } catch (fehler) {
      console.error(fehler);
      NB.App.meldung('Löschen fehlgeschlagen: ' + (fehler.message || fehler), 'fehler');
    } finally {
      knopf.textContent = 'Alle Daten löschen';
    }
  }

  /* ---------- Verdrahtung ---------- */

  Sp.verdrahten = function () {
    H.$('#sperre-vergessen-zeigen').addEventListener('click', () => vergessenZeigen(true));
    H.$('#sperre-vergessen-abbrechen').addEventListener('click', () => { vergessenZeigen(false); setTimeout(() => H.$('#sperre-pass').focus(), 50); });
    H.$('#sperre-loeschen-eingabe').addEventListener('input', loeschwortPruefen);
    H.$('#sperre-alles-loeschen').addEventListener('click', allesLoeschen);
    H.$('#einrichtung-formular').addEventListener('submit', einrichtungAbsenden);
    H.$('#einrichtung-pass1').addEventListener('input', ev => staerkeAnzeigen(ev.target.value));
    H.$('#einrichtung-weiter').addEventListener('click', function () {
      letzteAktivitaet = Date.now();
      Sp.ueberwachungStarten();
      if (entsperrtHandler) entsperrtHandler();
    });
    H.$('#sperre-formular').addEventListener('submit', sperreAbsenden);
    H.$('#knopf-sperren').addEventListener('click', () => Sp.sperren());
  };

  return Sp;
})();
