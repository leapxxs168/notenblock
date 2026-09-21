/*
 * Notenblock – Start der App
 *
 * Der Startvorgang ist vollständig in eine Fehlerbehandlung eingebettet:
 * Was auch immer schiefgeht, es erscheint eine lesbare Meldung statt einer
 * weißen Seite. Hier wird auch der Service Worker registriert (nur über
 * http/https, niemals per Inline-Skript).
 */
'use strict';
NB.App = (function () {
  const A = {};
  const H = NB.Hilfen;

  A.VERSION = '1.0';

  let gestartet = false;

  /* ---------- Meldungen ---------- */

  /**
   * Kurze Meldung oben einblenden. art: 'hinweis' (verschwindet nach 4 s)
   * oder 'fehler' (bleibt, bis sie geschlossen wird).
   */
  A.meldung = function (text, art) {
    const behaelter = H.$('#meldungen');
    if (!behaelter) { alert(text); return; }
    const box = H.el('div', { class: 'meldung' + (art === 'fehler' ? ' fehlerhaft' : ''), role: art === 'fehler' ? 'alert' : 'status' }, [
      H.el('span', { class: 'meldung-text', text: text })
    ]);
    const entfernen = () => { if (box.parentNode) box.parentNode.removeChild(box); };
    box.appendChild(H.el('button', { type: 'button', class: 'meldung-schliessen', 'aria-label': 'Meldung schließen', text: '×', onclick: entfernen }));
    behaelter.appendChild(box);
    if (art !== 'fehler') setTimeout(entfernen, 4000);
  };

  /* ---------- Startfehler ---------- */

  function fehlerbildschirm(titel, text, hinweis, erneutMoeglich) {
    H.$('#fehler-titel').textContent = titel;
    H.$('#fehler-text').textContent = text;
    H.$('#fehler-hinweis').textContent = hinweis || '';
    H.$('#fehler-erneut').hidden = !erneutMoeglich;
    NB.Sperre.bildschirmZeigen('bildschirm-fehler');
  }

  A.startfehlerZeigen = function (fehler) {
    console.error('Startfehler', fehler);
    const text = (fehler && fehler.message) ? fehler.message : String(fehler);
    const hinweis = (fehler && fehler.wiederholbar)
      ? 'Bitte die App vollständig schließen und erneut öffnen, oder unten „Erneut versuchen“ antippen.'
      : 'Wenn der Fehler bleibt, hilft ein Neustart des Browsers. Die Schritte zum Start stehen in START.md.';
    fehlerbildschirm('Notenblock kann nicht starten', text, hinweis, true);
  };

  /* ---------- Umgebung prüfen ---------- */

  function umgebungPruefen() {
    if (location.protocol === 'file:') {
      fehlerbildschirm(
        'Notenblock muss über einen lokalen Server geöffnet werden',
        'Die Seite wurde per Doppelklick geöffnet (Adresse beginnt mit file://). So stehen Speicher und Verschlüsselung des Browsers nicht zuverlässig zur Verfügung.',
        'Bitte die App über http://localhost starten – die Schritte stehen in START.md („Notenblock starten.command“ auf dem Mac).',
        false);
      return false;
    }
    if (!NB.Krypto.verfuegbar()) {
      fehlerbildschirm(
        'Verschlüsselung nicht verfügbar',
        'Diese Adresse (' + location.origin + ') gilt für den Browser nicht als sicher. Die Verschlüsselung steht nur über https:// oder http://localhost zur Verfügung.',
        'Auf dem Mac: über http://localhost öffnen (siehe START.md). Auf iPad und iPhone muss die App über eine https-Adresse geladen werden.',
        false);
      return false;
    }
    return true;
  }

  /* ---------- Service Worker ---------- */

  function serviceWorkerRegistrieren() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('service-worker.js').then(function (registrierung) {
      // Sofort nach neuer Fassung suchen; sie wird vollständig geladen und gilt beim nächsten Öffnen.
      if (registrierung && registrierung.update) registrierung.update().catch(() => { /* offline */ });
    }).catch(function (fehler) {
      // Über http:// ohne localhost ist keine Registrierung möglich – das ist kein Startfehler.
      console.warn('Service Worker nicht registriert:', fehler && fehler.message);
    });
  }

  /* ---------- Start ---------- */

  /** Darstellungs-Einstellungen anwenden (Schriftgröße). Wirkt sofort. */
  A.darstellungAnwenden = function () {
    const e = NB.Modell.einstellungen();
    const wurzel = document.documentElement;
    wurzel.classList.toggle('schrift-klein', e.schriftgroesse === 'klein');
    wurzel.classList.toggle('schrift-gross', e.schriftgroesse === 'gross');
  };

  let hinweisGezeigt = false;

  async function nachEntsperren() {
    A.darstellungAnwenden();
    if (NB.Navigation.aktiverBereich()) {
      NB.Navigation.fortsetzen();   // gleiche Sitzung: an derselben Stelle weitermachen
    } else {
      // Bestand aus einer früheren Fassung? Einmalige Umstellung vor dem Start.
      if (NB.Umstellung && NB.Umstellung.noetig()) {
        NB.Sperre.bildschirmZeigen('app');
        try { await NB.Umstellung.durchfuehren(); } catch (fehler) { console.error(fehler); A.meldung('Umstellung fehlgeschlagen: ' + (fehler.message || fehler), 'fehler'); }
      }
      if (NB.Umstellung) {
        try { const hinweis = NB.Umstellung.kleineAnhebungen(); if (hinweis) A.meldung(hinweis, 'fehler'); } catch (fehler) { console.error(fehler); }
      }
      NB.Navigation.start();        // Seitenstart oder Neuanfang
      if (NB.Speicher.backend === 'localstorage' && !hinweisGezeigt) {
        hinweisGezeigt = true;
        A.meldung('Hinweis: Der Browser stellt IndexedDB nicht bereit. Notenblock arbeitet mit dem Ausweichspeicher (localStorage), der weniger Platz bietet.', 'fehler');
      }
      // Löschfristen: Hinweis beim Start, höchstens einmal am Tag, nie automatisch löschen
      if (NB.Loeschfristen) NB.Loeschfristen.beimStartPruefen().catch(fehler => console.error(fehler));
    }
    if (NB.Daten.ladeWarnung) A.meldung(NB.Daten.ladeWarnung, 'fehler');
  }

  async function starten() {
    if (!umgebungPruefen()) return;
    NB.Sperre.verdrahten();
    NB.Navigation.verdrahten();
    H.$('#knopf-einstellungen').addEventListener('click', () => NB.Einstellungen.oeffnen());
    NB.Sperre.beiEntsperrt(nachEntsperren);
    NB.Sperre.beiGesperrt(function () { /* Bereiche müssen nichts tun; die App wird verborgen */ });

    await NB.Speicher.oeffnen();
    const meta = await NB.Daten.metaLaden();
    gestartet = true;
    if (meta) NB.Sperre.sperrbildschirmZeigen();
    else NB.Sperre.einrichtungZeigen();
    serviceWorkerRegistrieren();
  }

  A.start = function () {
    H.$('#fehler-erneut').addEventListener('click', function () { location.reload(); });
    starten().catch(A.startfehlerZeigen);
  };

  /* ---------- Unerwartete Fehler nie stumm verschlucken ---------- */

  window.addEventListener('error', function (ereignis) {
    const fehler = ereignis.error || new Error(ereignis.message || 'Unbekannter Fehler');
    if (!gestartet) A.startfehlerZeigen(fehler);
    else A.meldung('Unerwarteter Fehler: ' + (fehler.message || fehler), 'fehler');
  });
  window.addEventListener('unhandledrejection', function (ereignis) {
    const fehler = ereignis.reason || new Error('Unbekannter Fehler');
    if (!gestartet) A.startfehlerZeigen(fehler);
    else A.meldung('Unerwarteter Fehler: ' + (fehler.message || fehler), 'fehler');
  });

  return A;
})();

document.addEventListener('DOMContentLoaded', function () {
  try {
    NB.App.start();
  } catch (fehler) {
    NB.App.startfehlerZeigen(fehler);
  }
});
