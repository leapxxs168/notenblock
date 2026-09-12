/*
 * Notenblock – Monatskalender (eigenständiges Modul)
 *
 * Overlay mit Monatsraster Mo–So, Pfeilen für den Monatswechsel, Tipp auf die
 * Monatsbezeichnung springt zum aktuellen Monat, Schaltflächen „Heute“ und
 * „Schließen“. Ein Tipp auf einen Tag übernimmt das Datum und schließt sofort.
 * Wischen wechselt den Monat, Escape und Hintergrund-Tipp schließen.
 * Tastatur: Pfeile tageweise, Bild auf/ab monatsweise, Enter übernimmt.
 *
 * Verwendung:
 *   NB.Kalender.oeffnen({
 *     datum: 'JJJJ-MM-TT',                       // gewähltes Datum
 *     markierungen: function (jahr, monat0) {},  // → { iso: { unterricht, frei, ausserhalb, punkt } }, gebündelt je Monat
 *     fusszeile: function (jahr, monat0) {},     // → Text unter dem Raster (optional)
 *     beiAuswahl: function (iso) {}
 *   });
 *
 * Darstellung ausschließlich mit zurückhaltenden Mitteln, ohne Notenfarben:
 *   unterricht → kräftige Schrift, blass → Tag ohne Unterricht,
 *   frei → schraffiert (Ferien/Feiertag/Ausnahme), ausserhalb → sehr blass,
 *   punkt → kleiner Punkt (bereits erfasste Bewertungen).
 */
'use strict';
NB.Kalender = (function () {
  const Ka = {};
  const H = NB.Hilfen;

  Ka.oeffnen = function (o) {
    o = o || {};
    const heute = H.heute();
    let gewaehlt = o.datum || heute;
    let cursor = gewaehlt;
    let tastaturModus = false;
    let start = H.isoZuDatum(gewaehlt);
    let jahr = start.getFullYear();
    let monat = start.getMonth();
    let eintrag = null;

    const titel = H.el('button', { type: 'button', class: 'kal-titel', title: 'Zum aktuellen Monat' });
    const raster = H.el('div', { class: 'kal-raster', role: 'grid', 'aria-label': 'Monatskalender' });
    const fuss = H.el('div', { class: 'kal-fuss text-schwach text-klein', 'aria-live': 'polite' });

    function pfeil(richtung, text) {
      return H.el('button', {
        type: 'button', class: 'symbolknopf kal-pfeil', 'aria-label': text,
        onclick: () => monatWechseln(richtung)
      }, H.el('span', { 'aria-hidden': 'true', text: richtung < 0 ? '‹' : '›' }));
    }

    const kopf = H.el('div', { class: 'kal-kopf' }, [pfeil(-1, 'Vorheriger Monat'), titel, pfeil(1, 'Nächster Monat')]);
    const knoepfe = H.el('div', { class: 'knopfzeile kal-knoepfe' }, [
      H.el('button', { type: 'button', class: 'knopf', text: 'Heute', onclick: () => auswaehlen(heute) }),
      H.el('button', { type: 'button', class: 'knopf', text: 'Schließen', onclick: () => eintrag.schliessen(null) })
    ]);
    const box = H.el('div', { class: 'kal' }, [kopf, raster, fuss, knoepfe]);

    function monatWechseln(richtung) {
      monat += richtung;
      if (monat < 0) { monat = 11; jahr--; }
      if (monat > 11) { monat = 0; jahr++; }
      const tage = new Date(jahr, monat + 1, 0).getDate();
      const c = H.isoZuDatum(cursor);
      cursor = H.datumZuIso(new Date(jahr, monat, Math.min(c.getDate(), tage)));
      rendern();
    }

    function zumMonat(iso) {
      const d = H.isoZuDatum(iso);
      jahr = d.getFullYear();
      monat = d.getMonth();
    }

    function auswaehlen(iso) {
      gewaehlt = iso;
      eintrag.schliessen(iso);
    }

    function rendern() {
      titel.textContent = H.MONATE[monat] + ' ' + jahr;
      H.leeren(raster);
      H.WOCHENTAGE_KURZ.forEach(function (wt) {
        raster.appendChild(H.el('div', { class: 'kal-wt', role: 'columnheader', text: wt }));
      });

      const markierungen = (o.markierungen ? o.markierungen(jahr, monat) : null) || {};
      const erster = new Date(jahr, monat, 1);
      const versatz = (erster.getDay() + 6) % 7; // Montag = 0
      const tage = new Date(jahr, monat + 1, 0).getDate();

      for (let i = 0; i < versatz; i++) raster.appendChild(H.el('div', { class: 'kal-leer', 'aria-hidden': 'true' }));

      for (let tag = 1; tag <= tage; tag++) {
        const iso = H.datumZuIso(new Date(jahr, monat, tag));
        const m = markierungen[iso] || {};
        let klasse = 'kal-tag';
        if (m.unterricht) klasse += ' unterricht';
        else if (m.unterricht === false) klasse += ' blass';
        if (m.frei) klasse += ' frei';
        if (m.ausserhalb) klasse += ' ausserhalb';
        if (iso === heute) klasse += ' heute';
        if (iso === gewaehlt) klasse += ' gewaehlt';
        if (tastaturModus && iso === cursor) klasse += ' cursor';
        const knopf = H.el('button', {
          type: 'button', class: klasse, role: 'gridcell', dataset: { iso: iso },
          tabindex: iso === cursor ? 0 : -1,
          'aria-label': H.datumLang(iso) + (m.punkt ? ', Bewertungen vorhanden' : '') + (m.frei ? ', frei' : ''),
          'aria-selected': iso === gewaehlt ? 'true' : 'false',
          onclick: () => auswaehlen(iso)
        }, [
          H.el('span', { class: 'kal-zahl', text: String(tag) }),
          m.punkt ? H.el('span', { class: 'kal-punkt', 'aria-hidden': 'true' }) : null
        ]);
        raster.appendChild(knopf);
      }

      fuss.textContent = o.fusszeile ? (o.fusszeile(jahr, monat) || '') : '';
      fuss.hidden = !fuss.textContent;
    }

    /* Wischen nach links/rechts wechselt den Monat */
    let wisch = null;
    raster.addEventListener('pointerdown', function (ev) {
      wisch = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    });
    raster.addEventListener('pointermove', function (ev) {
      if (!wisch || ev.pointerId !== wisch.id) return;
      const dx = ev.clientX - wisch.x, dy = ev.clientY - wisch.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        wisch = null;
        monatWechseln(dx < 0 ? 1 : -1);
      }
    });
    raster.addEventListener('pointerup', () => { wisch = null; });
    raster.addEventListener('pointercancel', () => { wisch = null; });

    /* Tastatur */
    function taste(ev) {
      let neu = null;
      switch (ev.key) {
        case 'ArrowLeft': neu = H.tageAddieren(cursor, -1); break;
        case 'ArrowRight': neu = H.tageAddieren(cursor, 1); break;
        case 'ArrowUp': neu = H.tageAddieren(cursor, -7); break;
        case 'ArrowDown': neu = H.tageAddieren(cursor, 7); break;
        case 'PageUp': ev.preventDefault(); tastaturModus = true; monatWechseln(-1); fokusAufCursor(); return;
        case 'PageDown': ev.preventDefault(); tastaturModus = true; monatWechseln(1); fokusAufCursor(); return;
        case 'Enter':
          if (ev.target && ev.target.classList && ev.target.classList.contains('kal-tag')) return; // Knopf löst selbst aus
          ev.preventDefault(); auswaehlen(cursor); return;
        default: return;
      }
      ev.preventDefault();
      tastaturModus = true;
      cursor = neu;
      zumMonat(cursor);
      rendern();
      fokusAufCursor();
    }

    function fokusAufCursor() {
      const ziel = raster.querySelector('.kal-tag[data-iso="' + cursor + '"]');
      if (ziel) ziel.focus();
    }

    titel.addEventListener('click', function () {
      zumMonat(heute);
      cursor = heute;
      rendern();
    });

    rendern();
    eintrag = NB.Dialog.overlayOeffnen(box, {
      klasse: 'kalender',
      beiTaste: taste,
      beiSchliessen: function (iso) {
        if (iso && o.beiAuswahl) o.beiAuswahl(iso);
      },
      fokus: '.kal-tag.gewaehlt'
    });
    return eintrag;
  };

  return Ka;
})();
