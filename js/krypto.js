/*
 * Notenblock – Verschlüsselung
 *
 * Ausschließlich Web Crypto API.
 *   Schlüsselableitung: PBKDF2, SHA-256, 300 000 Runden, 16 Byte Salt.
 *   Verschlüsselung:    AES-GCM, 256 Bit, je Schreibvorgang ein frischer 12-Byte-IV.
 *
 * Der abgeleitete Schlüssel wird als nicht exportierbarer CryptoKey erzeugt und
 * nur im Arbeitsspeicher gehalten (siehe daten.js). Zur Prüfung der Passphrase
 * dient ein Kontrollwert: ein bekannter kurzer Text, mit dem Schlüssel
 * verschlüsselt. Die Passphrase selbst wird nirgends abgelegt.
 */
'use strict';
NB.Krypto = (function () {
  const K = {};
  const H = NB.Hilfen;

  K.ITERATIONEN = 300000;
  const KONTROLLTEXT = 'notenblock-kontrollwert-v1';

  /** Web Crypto nur im sicheren Kontext (https:// oder localhost) verfügbar. */
  K.verfuegbar = function () {
    return !!(window.isSecureContext && window.crypto && window.crypto.subtle);
  };

  K.zufallsBytes = function (anzahl) {
    const bytes = new Uint8Array(anzahl);
    crypto.getRandomValues(bytes);
    return bytes;
  };

  /**
   * Leitet aus Passphrase und Salt einen AES-GCM-256-Schlüssel ab.
   * Die Passphrase wird Unicode-normalisiert (NFC), damit dieselbe Eingabe auf
   * Mac und iPhone denselben Schlüssel ergibt.
   */
  K.schluesselAbleiten = async function (passphrase, salt, iterationen) {
    const basis = await crypto.subtle.importKey(
      'raw', H.textZuBytes(String(passphrase).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iterationen || K.ITERATIONEN, hash: 'SHA-256' },
      basis,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']);
  };

  /** Verschlüsselt Bytes. Ergebnis: { iv, daten } jeweils Base64. */
  K.verschluesselnBytes = async function (schluessel, bytes) {
    const iv = K.zufallsBytes(12);
    const geheim = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, schluessel, bytes);
    return { iv: H.bytesZuBase64(iv), daten: H.bytesZuBase64(new Uint8Array(geheim)) };
  };

  K.entschluesselnBytes = async function (schluessel, paket) {
    const klar = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: H.base64ZuBytes(paket.iv) }, schluessel, H.base64ZuBytes(paket.daten));
    return new Uint8Array(klar);
  };

  /** Verschlüsselt ein beliebiges JSON-fähiges Objekt. */
  K.verschluesselnObjekt = function (schluessel, objekt) {
    return K.verschluesselnBytes(schluessel, H.textZuBytes(JSON.stringify(objekt)));
  };

  K.entschluesselnObjekt = async function (schluessel, paket) {
    return JSON.parse(H.bytesZuText(await K.entschluesselnBytes(schluessel, paket)));
  };

  K.kontrollwertErzeugen = function (schluessel) {
    return K.verschluesselnBytes(schluessel, H.textZuBytes(KONTROLLTEXT));
  };

  /** Liefert true, wenn der Schlüssel zum Kontrollwert passt. */
  K.kontrollwertPruefen = async function (schluessel, kontrollwert) {
    try {
      const bytes = await K.entschluesselnBytes(schluessel, kontrollwert);
      return H.bytesZuText(bytes) === KONTROLLTEXT;
    } catch (e) {
      return false;
    }
  };

  /**
   * Einfache Stärkeeinschätzung für die Anzeige: 0 (zu kurz), 1 schwach,
   * 2 mittel, 3 stark. Bewertet Länge und Zeichenvielfalt.
   */
  K.staerke = function (passphrase) {
    const p = String(passphrase || '');
    if (p.length < 10) return 0;
    let klassen = 0;
    if (/[a-zäöüß]/.test(p)) klassen++;
    if (/[A-ZÄÖÜ]/.test(p)) klassen++;
    if (/[0-9]/.test(p)) klassen++;
    if (/[^A-Za-z0-9ÄÖÜäöüß]/.test(p)) klassen++;
    const punkte = p.length + klassen * 3;
    if (punkte >= 26) return 3;
    if (punkte >= 18) return 2;
    return 1;
  };

  return K;
})();
