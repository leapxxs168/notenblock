/*
 * Notenblock – Hilfsfunktionen
 *
 * Kleine Werkzeuge für DOM, Datum, Ids und Kodierung. Alle Module der App
 * hängen sich an das globale Objekt NB (für „Notenblock“).
 */
'use strict';
window.NB = window.NB || {};

NB.Hilfen = (function () {
  const H = {};

  /* ---------- DOM ---------- */

  H.$ = (selektor, wurzel) => (wurzel || document).querySelector(selektor);
  H.$$ = (selektor, wurzel) => Array.prototype.slice.call((wurzel || document).querySelectorAll(selektor));

  /**
   * Element anlegen.
   *   H.el('button', { class: 'knopf', text: 'Weiter', onclick: fn }, [kinder])
   * Besondere Attribute: text (textContent), class, dataset, on<ereignis> (Handler).
   * Werte true/false setzen bzw. lassen boolesche Attribute weg.
   */
  H.el = function (tag, attribute, kinder) {
    const e = document.createElement(tag);
    if (attribute) {
      Object.keys(attribute).forEach(function (name) {
        const wert = attribute[name];
        if (wert == null || wert === false) return;
        if (name === 'text') e.textContent = wert;
        else if (name === 'class') e.className = wert;
        else if (name === 'dataset') Object.keys(wert).forEach(k => { e.dataset[k] = wert[k]; });
        else if (name.indexOf('on') === 0 && typeof wert === 'function') e.addEventListener(name.slice(2), wert);
        else if (wert === true) e.setAttribute(name, '');
        else e.setAttribute(name, String(wert));
      });
    }
    if (kinder != null) H.anhaengen(e, kinder);
    return e;
  };

  H.anhaengen = function (eltern, kinder) {
    if (!Array.isArray(kinder)) kinder = [kinder];
    kinder.forEach(function (k) {
      if (k == null || k === false) return;
      eltern.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
    return eltern;
  };

  H.leeren = function (e) {
    while (e.firstChild) e.removeChild(e.firstChild);
    return e;
  };

  /* ---------- Ids und Zufall ---------- */

  /** Zufällige Id, 16 Hex-Zeichen. */
  H.neueId = function () {
    const bytes = new Uint8Array(8);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(bytes, b => ('0' + b.toString(16)).slice(-2)).join('');
  };

  /* ---------- Kodierung ---------- */

  H.textZuBytes = text => new TextEncoder().encode(text);
  H.bytesZuText = bytes => new TextDecoder().decode(bytes);

  H.bytesZuBase64 = function (bytes) {
    let binaer = '';
    const block = 0x8000;
    for (let i = 0; i < bytes.length; i += block) {
      binaer += String.fromCharCode.apply(null, bytes.subarray(i, i + block));
    }
    return btoa(binaer);
  };

  H.base64ZuBytes = function (text) {
    const binaer = atob(text);
    const bytes = new Uint8Array(binaer.length);
    for (let i = 0; i < binaer.length; i++) bytes[i] = binaer.charCodeAt(i);
    return bytes;
  };

  /* ---------- Datum (Format überall: 'JJJJ-MM-TT', lokale Zeit) ---------- */

  H.WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  H.WOCHENTAGE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  H.MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  const zweistellig = n => (n < 10 ? '0' : '') + n;

  H.datumZuIso = function (d) {
    return d.getFullYear() + '-' + zweistellig(d.getMonth() + 1) + '-' + zweistellig(d.getDate());
  };

  H.isoZuDatum = function (iso) {
    const t = iso.split('-');
    return new Date(Number(t[0]), Number(t[1]) - 1, Number(t[2]));
  };

  H.heute = () => H.datumZuIso(new Date());

  H.tageAddieren = function (iso, anzahl) {
    const d = H.isoZuDatum(iso);
    d.setDate(d.getDate() + anzahl);
    return H.datumZuIso(d);
  };

  /** Wochentag 1 (Montag) bis 7 (Sonntag). */
  H.wochentag = function (iso) {
    const t = H.isoZuDatum(iso).getDay();
    return t === 0 ? 7 : t;
  };

  H.datumKurz = function (iso) {
    const t = iso.split('-');
    return t[2] + '.' + t[1] + '.' + t[0];
  };

  H.datumLang = function (iso) {
    const d = H.isoZuDatum(iso);
    return H.WOCHENTAGE[H.wochentag(iso) - 1] + ', ' + d.getDate() + '. ' + H.MONATE[d.getMonth()] + ' ' + d.getFullYear();
  };

  H.datumMitWochentag = function (iso) {
    return H.WOCHENTAGE_KURZ[H.wochentag(iso) - 1] + ', ' + H.datumKurz(iso);
  };

  /** Kurzform ohne Jahr, etwa „Do, 10.09.“ */
  H.datumKurzOhneJahr = function (iso) {
    return H.WOCHENTAGE_KURZ[H.wochentag(iso) - 1] + ', ' + H.datumKurz(iso).slice(0, 6);
  };

  /** Kalenderwoche nach ISO 8601 (Montag als Wochenbeginn). */
  H.kalenderwoche = function (iso) {
    const d = H.isoZuDatum(iso);
    const ziel = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const tag = ziel.getUTCDay() || 7;
    ziel.setUTCDate(ziel.getUTCDate() + 4 - tag);
    const jahresanfang = new Date(Date.UTC(ziel.getUTCFullYear(), 0, 1));
    return Math.ceil(((ziel - jahresanfang) / 86400000 + 1) / 7);
  };

  H.jetztIso = () => new Date().toISOString();

  /* ---------- Sonstiges ---------- */

  H.entprellen = function (fn, ms) {
    let timer = null;
    return function () {
      const args = arguments, ich = this;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(ich, args), ms);
    };
  };

  H.begrenzen = (wert, min, max) => Math.min(max, Math.max(min, wert));

  H.vergleichText = (a, b) => String(a || '').localeCompare(String(b || ''), 'de', { sensitivity: 'base', numeric: true });

  H.warten = ms => new Promise(aufloesen => setTimeout(aufloesen, ms));

  /** Kurze haptische Rückmeldung, falls das Gerät sie unterstützt. */
  H.vibrieren = function (ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) { /* unwichtig */ }
  };

  return H;
})();
