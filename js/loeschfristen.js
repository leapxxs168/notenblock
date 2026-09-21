/*
 * Notenblock – Löschfristen
 *
 * Je Klasse ist das Schuljahr hinterlegt, in dem zuletzt unterrichtet wurde
 * (etwa „2025/2026“). Ein Jahr nach Ablauf des Kalenderjahres, in dem der
 * Unterricht endete, weist die App beim Start darauf hin und bietet das
 * Löschen an – höchstens einmal am Tag und niemals automatisch.
 *
 * Beispiel: Schuljahr 2025/2026 endet im Kalenderjahr 2026. Das Jahr läuft am
 * 31.12.2026 ab, ein Jahr später ist der 31.12.2027. Ab dem 1.1.2028 erinnert
 * Notenblock.
 */
'use strict';
NB.Loeschfristen = (function () {
  const L = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;

  /** Kalenderjahr, in dem der Unterricht endete, aus dem Schuljahrestext; null wenn unlesbar. */
  L.endjahr = function (schuljahrText) {
    const jahre = String(schuljahrText || '').match(/\d{4}/g);
    if (!jahre || !jahre.length) return null;
    return Math.max.apply(null, jahre.map(Number));
  };

  /** Datum, ab dem erinnert wird: 1. Januar des übernächsten Jahres. */
  L.stichtag = function (schuljahrText) {
    const jahr = L.endjahr(schuljahrText);
    return jahr ? (jahr + 2) + '-01-01' : null;
  };

  /** Klassen, deren Frist abgelaufen ist. */
  L.faellig = function () {
    const heute = H.heute();
    return M.klassen().filter(function (k) {
      const stichtag = L.stichtag(k.letztesSchuljahr);
      return stichtag && heute >= stichtag;
    });
  };

  /** Beim Start: Hinweis anzeigen, höchstens einmal je Kalendertag. */
  L.beimStartPruefen = async function () {
    const klassen = L.faellig();
    if (!klassen.length) return;
    const zustand = D.holen('zustand', '') || {};
    const heute = H.heute();
    if (zustand.loeschhinweisAm === heute) return;
    zustand.loeschhinweisAm = heute;
    D.setzen('zustand', '', zustand);
    await L.hinweisZeigen(klassen);
  };

  L.hinweisZeigen = function (klassen) {
    return new Promise(function (aufloesen) {
      let eintrag;
      const liste = H.el('div', { class: 'einst-liste' });
      klassen.forEach(function (k) {
        const anzahl = M.anzahlBewertungen(k.id);
        liste.appendChild(H.el('div', { class: 'einst-eintrag' }, [
          H.el('div', { class: 'einst-eintrag-text' }, [
            H.el('span', { class: 'einst-eintrag-titel', text: k.name }),
            H.el('span', { class: 'text-klein text-schwach', text: 'Zuletzt unterrichtet ' + (k.letztesSchuljahr || '?') + ' · ' + (k.kinder || []).length + ' Kinder · ' + anzahl + (anzahl === 1 ? ' erfasste Stunde' : ' erfasste Stunden') })
          ]),
          H.el('button', { type: 'button', class: 'knopf gefaehrlich klein', text: 'Löschen', onclick: async function () {
            const ok = await NB.Dialog.bestaetigen({
              titel: '„' + k.name + '“ löschen?',
              text: 'Die Klasse mit allen Kindern, Bewertungen, Notizen, Aufgaben und Stundenplaneinträgen wird endgültig gelöscht.',
              bestaetigen: 'Klasse löschen',
              gefaehrlich: true
            });
            if (!ok) return;
            M.klasseLoeschen(k.id);
            NB.App.meldung('Klasse „' + k.name + '“ gelöscht.');
            const rest = L.faellig();
            eintrag.schliessen(true);
            if (rest.length) L.hinweisZeigen(rest).then(aufloesen);
            else { aufloesen(); NB.Navigation.fortsetzen(); }
          } })
        ]));
      });
      const inhalt = [
        H.el('h2', { text: 'Löschfrist erreicht' }),
        H.el('p', { text: (klassen.length === 1 ? 'Für eine Klasse' : 'Für ' + klassen.length + ' Klassen') + ' ist seit dem Ende des Unterrichts mehr als ein Jahr nach Ablauf des Kalenderjahres vergangen. Personenbezogene Daten sollten dann gelöscht werden. Notenblock löscht nichts von selbst.' }),
        liste,
        H.el('p', { class: 'text-klein text-schwach', text: 'Vorher kann eine Sicherung erstellt werden (Einstellungen → Daten). Das Schuljahr je Klasse lässt sich unter „Klasse verwalten“ anpassen.' }),
        H.el('div', { class: 'knopfzeile' }, H.el('button', { type: 'button', class: 'knopf', text: 'Später erinnern', onclick: () => eintrag.schliessen(null) }))
      ];
      eintrag = NB.Dialog.overlayOeffnen(inhalt, { klasse: 'dialog', beiSchliessen: erg => { if (erg !== true) aufloesen(); } });
    });
  };

  return L;
})();
