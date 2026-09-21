/*
 * Notenblock – Dialoge und Overlays
 *
 * Eigene, schlichte Overlays statt window.confirm (das in der installierten
 * App unpassend wirkt). Schließen per Hintergrund-Tipp und Escape. Der Fokus
 * kehrt nach dem Schließen zum vorherigen Element zurück.
 *
 *   NB.Dialog.bestaetigen({ titel, text, bestaetigen, abbrechen, gefaehrlich }) → Promise<boolean>
 *   NB.Dialog.hinweis({ titel, text })                                          → Promise<void>
 *   NB.Dialog.auswahl({ titel, optionen: [{ text, wert, aktiv, klasse }] })      → Promise<wert | null>
 *   NB.Dialog.overlayOeffnen(inhalt, optionen)                                  → { schliessen }
 */
'use strict';
NB.Dialog = (function () {
  const Dg = {};
  const H = NB.Hilfen;
  const stapel = [];

  Dg.istOffen = () => stapel.length > 0;

  /** Alle offenen Overlays schließen (z. B. beim Sperren). */
  Dg.alleSchliessen = function () {
    stapel.slice().reverse().forEach(e => e.schliessen(null));
  };

  /**
   * Generisches Overlay.
   * optionen: { klasse, beiSchliessen(ergebnis), beiTaste(ereignis), fokus (Selektor), unten (Blatt am unteren Rand),
   *             pflicht (kein Schließen über Hintergrund oder Escape) }
   */
  Dg.overlayOeffnen = function (inhalt, optionen) {
    optionen = optionen || {};
    const vorherFokus = document.activeElement;
    const box = H.el('div', {
      class: 'overlay-inhalt' + (optionen.klasse ? ' ' + optionen.klasse : '') + (optionen.unten ? ' blatt' : ''),
      role: 'dialog',
      'aria-modal': 'true'
    }, inhalt);
    const overlay = H.el('div', { class: 'overlay' + (optionen.unten ? ' unten' : '') }, box);
    let geschlossen = false;
    const eintrag = { overlay: overlay, schliessen: schliessen };

    function schliessen(ergebnis) {
      if (geschlossen) return;
      geschlossen = true;
      const i = stapel.indexOf(eintrag);
      if (i >= 0) stapel.splice(i, 1);
      document.removeEventListener('keydown', tastatur, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (optionen.beiSchliessen) optionen.beiSchliessen(ergebnis);
      if (vorherFokus && typeof vorherFokus.focus === 'function') {
        try { vorherFokus.focus(); } catch (e) { /* egal */ }
      }
    }

    function tastatur(ereignis) {
      if (stapel[stapel.length - 1] !== eintrag) return;
      if (ereignis.key === 'Escape') {
        ereignis.preventDefault();
        if (!optionen.pflicht) schliessen(null);
      } else if (optionen.beiTaste) {
        optionen.beiTaste(ereignis);
      }
    }

    overlay.addEventListener('click', function (ereignis) {
      if (ereignis.target === overlay && !optionen.pflicht) schliessen(null);
    });
    document.addEventListener('keydown', tastatur, true);
    stapel.push(eintrag);
    H.$('#overlays').appendChild(overlay);

    setTimeout(function () {
      const ziel = optionen.fokus ? box.querySelector(optionen.fokus) : null;
      const f = ziel || box.querySelector('[autofocus]') || box.querySelector('button, input, textarea, [tabindex]');
      if (f) f.focus();
    }, 30);

    return eintrag;
  };

  /** Ja/Nein-Rückfrage. Bei gefaehrlich liegt der Fokus auf „Abbrechen“. */
  Dg.bestaetigen = function (o) {
    return new Promise(function (aufloesen) {
      let eintrag;
      const abbrechen = H.el('button', {
        type: 'button', class: 'knopf', text: o.abbrechen || 'Abbrechen',
        onclick: () => eintrag.schliessen(false)
      });
      const ok = H.el('button', {
        type: 'button', class: 'knopf ' + (o.gefaehrlich ? 'gefaehrlich' : 'primaer'), text: o.bestaetigen || 'OK',
        onclick: () => eintrag.schliessen(true)
      });
      const inhalt = [
        H.el('h2', { text: o.titel || '' }),
        o.text ? H.el('p', { text: o.text }) : null,
        H.el('div', { class: 'knopfzeile' }, [abbrechen, ok])
      ];
      eintrag = Dg.overlayOeffnen(inhalt, {
        klasse: 'dialog',
        beiSchliessen: erg => aufloesen(erg === true),
        fokus: o.gefaehrlich ? '.knopf:not(.gefaehrlich)' : '.primaer'
      });
    });
  };

  /** Hinweis mit einem einzigen Knopf. */
  Dg.hinweis = function (o) {
    return new Promise(function (aufloesen) {
      let eintrag;
      const inhalt = [
        H.el('h2', { text: o.titel || '' }),
        o.text ? H.el('p', { text: o.text }) : null,
        H.el('div', { class: 'knopfzeile' }, H.el('button', {
          type: 'button', class: 'knopf primaer', text: o.knopf || 'Verstanden',
          onclick: () => eintrag.schliessen(true)
        }))
      ];
      eintrag = Dg.overlayOeffnen(inhalt, { klasse: 'dialog', beiSchliessen: () => aufloesen() });
    });
  };

  /** Eingabe eines kurzen Textes. Liefert den Text oder null. */
  Dg.eingabe = function (o) {
    return new Promise(function (aufloesen) {
      let eintrag;
      const feld = H.el('input', { type: 'text', value: o.wert || '', placeholder: o.platzhalter || '', autocomplete: 'off', autofocus: true });
      const absenden = function (ev) {
        if (ev) ev.preventDefault();
        const wert = feld.value.trim();
        if (!wert) { feld.focus(); return; }
        eintrag.schliessen(wert);
      };
      const inhalt = H.el('form', { novalidate: true, onsubmit: absenden }, [
        H.el('h2', { text: o.titel || '' }),
        H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: o.label || '' }), feld]),
        H.el('div', { class: 'knopfzeile' }, [
          H.el('button', { type: 'button', class: 'knopf', text: 'Abbrechen', onclick: () => eintrag.schliessen(null) }),
          H.el('button', { type: 'submit', class: 'knopf primaer', text: o.bestaetigen || 'Übernehmen' })
        ])
      ]);
      eintrag = Dg.overlayOeffnen(inhalt, { klasse: 'dialog', beiSchliessen: erg => aufloesen(typeof erg === 'string' ? erg : null), fokus: 'input' });
    });
  };

  /**
   * Auswahlliste (Blatt am unteren Rand auf kleinen Bildschirmen).
   * optionen: [{ text, wert, aktiv, klasse, untertitel }]
   */
  Dg.auswahl = function (o) {
    return new Promise(function (aufloesen) {
      let eintrag;
      const liste = H.el('div', { class: 'auswahl-liste', role: 'listbox', 'aria-label': o.titel || 'Auswahl' });
      (o.optionen || []).forEach(function (opt) {
        const knopf = H.el('button', {
          type: 'button',
          class: 'auswahl-eintrag' + (opt.klasse ? ' ' + opt.klasse : ''),
          role: 'option',
          'aria-selected': opt.aktiv ? 'true' : 'false',
          onclick: () => eintrag.schliessen(opt.wert)
        }, [
          H.el('span', { class: 'auswahl-text', text: opt.text }),
          opt.untertitel ? H.el('span', { class: 'auswahl-unter text-schwach text-klein', text: opt.untertitel }) : null
        ]);
        liste.appendChild(knopf);
      });
      const inhalt = [
        o.titel ? H.el('h2', { text: o.titel }) : null,
        liste,
        H.el('div', { class: 'knopfzeile' }, H.el('button', {
          type: 'button', class: 'knopf', text: 'Schließen', onclick: () => eintrag.schliessen(null)
        }))
      ];
      eintrag = Dg.overlayOeffnen(inhalt, {
        klasse: 'auswahl',
        unten: true,
        beiSchliessen: erg => aufloesen(erg === undefined ? null : erg),
        fokus: '[aria-selected="true"]'
      });
    });
  };

  return Dg;
})();
