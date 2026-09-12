/*
 * Notenblock – Service Worker
 *
 * Cacht alle eigenen Dateien beim Installieren („Vorab-Cache“), damit die App
 * offline läuft. Jede Anfrage wird aus genau diesem Cache beantwortet, sodass
 * nie Dateien aus zwei Versionen gemischt werden. Eine neue Fassung (neuer
 * CACHE_NAME) wird im Hintergrund vollständig geladen und übernimmt beim
 * nächsten Öffnen der Seite. Fremde Adressen werden nie angefragt.
 */
'use strict';

const CACHE_NAME = 'notenblock-v15';
const DATEIEN = [
  './',
  './index.html',
  './stil.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './js/notfall.js',
  './js/hilfen.js',
  './js/speicher.js',
  './js/krypto.js',
  './js/kriterien-daten.js',
  './js/startdaten.js',
  './js/daten.js',
  './js/modell.js',
  './js/stundenplan.js',
  './js/dialog.js',
  './js/kalender-modul.js',
  './js/sperre.js',
  './js/navigation.js',
  './js/bereich-kalender.js',
  './js/bereich-klassen.js',
  './js/bereich-notizen.js',
  './js/bereich-aufgaben.js',
  './js/auswertung.js',
  './js/export.js',
  './js/loeschfristen.js',
  './js/bewertung.js',
  './js/einstellungen.js',
  './js/einstellungen-stundenplan.js',
  './js/app.js'
];

self.addEventListener('install', function (ereignis) {
  // cache: 'reload' umgeht den HTTP-Cache des Browsers, damit wirklich die
  // aktuellen Dateien in den Vorab-Cache kommen.
  ereignis.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(DATEIEN.map(pfad => new Request(pfad, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', function (ereignis) {
  // Alte Caches entfernen. Kein clients.claim(): Eine bereits laufende Seite
  // bleibt bei ihrer Version, die neue gilt ab dem nächsten Laden.
  ereignis.waitUntil(
    caches.keys().then(namen => Promise.all(namen.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
  );
});

self.addEventListener('fetch', function (ereignis) {
  const anfrage = ereignis.request;
  if (anfrage.method !== 'GET') return;
  const url = new URL(anfrage.url);
  if (url.origin !== self.location.origin) return; // fremde Adressen: nicht unsere Sache

  ereignis.respondWith(
    caches.open(CACHE_NAME)
      .then(cache => cache.match(anfrage, { ignoreSearch: true }))
      .then(function (imCache) {
        if (imCache) return imCache;
        // Nicht vorab gecacht (sollte nicht vorkommen): direkt laden, ohne zu cachen.
        return fetch(anfrage);
      })
  );
});
