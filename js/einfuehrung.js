/*
 * Notenblock – Einführung
 *
 * Karten zum Durchblättern, die beim ersten Start einmalig erscheinen und
 * sich jederzeit unter Einstellungen → Hilfe erneut öffnen lassen. Jede Karte hat eine schlichte
 * Skizze, einen Titel und wenige Sätze; unten Punkte, „Zurück“, „Weiter“ und
 * „Überspringen“.
 *
 * Dass die Einführung gezeigt wurde, merkt sich die Einstellung
 * „einfuehrungGesehen“. Ausführlicher steht alles in der Hilfeseite
 * (NB.Einstellungen, Abschnitt „Hilfe“).
 */
'use strict';
NB.Einfuehrung = (function () {
  const E = {};
  const H = NB.Hilfen;
  const M = NB.Modell;

  /* ---------- Skizzen (schlichte Zeichnungen, keine Bilder) ---------- */

  function svg(inhalt, beschreibung) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 120 72');
    s.setAttribute('class', 'ein-skizze');
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', beschreibung);
    s.innerHTML = inhalt;
    return s;
  }

  const RAHMEN = '<rect x="4" y="4" width="112" height="64" rx="8" class="ein-linie"/>';

  const SKIZZEN = {
    willkommen: () => svg(RAHMEN
      + '<rect x="14" y="16" width="52" height="7" rx="3" class="ein-fuell"/>'
      + '<rect x="14" y="29" width="80" height="5" rx="2" class="ein-hell"/>'
      + '<rect x="14" y="39" width="66" height="5" rx="2" class="ein-hell"/>'
      + '<rect x="14" y="52" width="34" height="9" rx="4" class="ein-akzent"/>', 'Skizze: Startseite'),
    klassen: () => svg(RAHMEN
      + '<rect x="12" y="14" width="96" height="14" rx="5" class="ein-hell"/><rect x="12" y="14" width="4" height="14" class="ein-akzent"/>'
      + '<rect x="12" y="32" width="96" height="14" rx="5" class="ein-hell"/><rect x="12" y="32" width="4" height="14" class="ein-fuell"/>'
      + '<rect x="12" y="50" width="96" height="14" rx="5" class="ein-hell"/><rect x="12" y="50" width="4" height="14" class="ein-linie-voll"/>', 'Skizze: Liste der Klassen'),
    kalender: () => svg(RAHMEN
      + '<rect x="12" y="12" width="96" height="9" rx="4" class="ein-hell"/>'
      + '<rect x="12" y="26" width="28" height="16" rx="4" class="ein-akzent"/>'
      + '<rect x="46" y="26" width="28" height="16" rx="4" class="ein-hell"/>'
      + '<rect x="80" y="26" width="28" height="16" rx="4" class="ein-hell"/>'
      + '<rect x="12" y="48" width="96" height="14" rx="4" class="ein-fuell"/>', 'Skizze: Kalender mit Tag, Woche, Monat'),
    bewerten: () => svg(RAHMEN
      + '<rect x="30" y="12" width="60" height="7" rx="3" class="ein-fuell"/>'
      + '<rect x="12" y="26" width="96" height="16" rx="6" class="ein-hell"/>'
      + '<rect x="44" y="28" width="16" height="12" rx="4" class="ein-akzent"/>'
      + '<rect x="12" y="48" width="44" height="12" rx="5" class="ein-hell"/>'
      + '<rect x="64" y="48" width="44" height="12" rx="5" class="ein-akzent"/>', 'Skizze: Skala und Weiter'),
    feinheiten: () => svg(RAHMEN
      + '<rect x="12" y="14" width="60" height="6" rx="3" class="ein-fuell"/>'
      + '<rect x="78" y="13" width="30" height="8" rx="4" class="ein-hell"/>'
      + '<rect x="12" y="26" width="96" height="14" rx="5" class="ein-hell"/>'
      + '<rect x="12" y="46" width="96" height="14" rx="5" class="ein-hell" opacity="0.5"/>', 'Skizze: Kriterium aussetzen'),
    profil: () => svg(RAHMEN
      + '<circle cx="24" cy="24" r="8" class="ein-fuell"/>'
      + '<rect x="38" y="18" width="50" height="6" rx="3" class="ein-fuell"/>'
      + '<rect x="38" y="28" width="34" height="4" rx="2" class="ein-hell"/>'
      + '<rect x="12" y="42" width="70" height="7" rx="3" class="ein-akzent"/>'
      + '<rect x="12" y="54" width="48" height="7" rx="3" class="ein-hell"/>', 'Skizze: Profil eines Kindes'),
    sicherheit: () => svg(RAHMEN
      + '<rect x="46" y="26" width="28" height="22" rx="4" class="ein-fuell"/>'
      + '<path d="M52 26v-6a8 8 0 0 1 16 0v6" class="ein-linie"/>'
      + '<circle cx="60" cy="37" r="3" class="ein-weiss"/>', 'Skizze: Schloss')
  };

  /* ---------- Karten ---------- */

  const KARTEN = [
    {
      skizze: 'willkommen',
      titel: 'Willkommen bei Notenblock',
      text: 'Notenblock begleitet deinen Unterricht: planen, jede Stunde bewerten, am Ende eine begründete Note. Alle Daten bleiben auf diesem Gerät und sind mit deiner Passphrase verschlüsselt – es gibt keinen Server und keine Cloud.',
      punkte: ['Vier Bereiche unten: Kalender, Klassen, Notizen, Aufgaben', 'Alles speichert sofort, ohne Knopf']
    },
    {
      skizze: 'klassen',
      titel: 'Klassen anlegen',
      text: 'Unter „Klassen“ legst du eine Klasse in vier Schritten an: Name und Stufe, Fächer, Stundenplan, Kinder. Schritte lassen sich überspringen und später nachholen.',
      punkte: ['Stufe 1 und 2 arbeitet ohne Noten, mit Stufen', 'Jede Klasse hat ihre eigenen Fächer und ihre Farbe', 'Ein Tipp auf die Klasse öffnet die Übersicht mit „Stunde bewerten“']
    },
    {
      skizze: 'kalender',
      titel: 'Kalender und Termine',
      text: 'Oben wählst du „Mein Plan“ oder eine Klasse, darunter Tag, Woche oder Monat. Dein Plan ist die Summe der Klassenpläne.',
      punkte: ['Ein Tipp auf eine Stunde öffnet die Planung', 'Termine (Ausflug, Konferenz, Elternabend) mit „+ Termin“', 'Ein Termin kann den Unterricht des Tages ausfallen lassen']
    },
    {
      skizze: 'bewerten',
      titel: 'Eine Stunde bewerten',
      text: 'Im Bewertungsbildschirm siehst du ein Kind nach dem anderen. Oben stehen Klasse, Datum und die Einheit; „Stunde“ zeigt Mitarbeit und Arbeits- und Sozialverhalten, „Kompetenzen“ die Fachinhalte.',
      punkte: ['Tippen oder Ziehen auf der Skala setzt den Wert', '„Weiter“ schreibt die Standardnote fest, die Pfeile überspringen', '„Fehlt“ nimmt das Kind aus dieser Stunde heraus']
    },
    {
      skizze: 'feinheiten',
      titel: 'Feinheiten beim Bewerten',
      text: 'Notenblock denkt mit: Werte werden vorbelegt, Abweichungen setzt du selbst. Oben kannst du die Planung der Stunde aufklappen und das Thema eintragen.',
      punkte: ['„Aussetzen“ blendet ein Kriterium für diese Stunde aus', '„Bewertung zurücknehmen …“ löscht ein Kind oder die ganze Stunde', 'Unter dem Namen steht der bisherige Durchschnitt']
    },
    {
      skizze: 'profil',
      titel: 'Kinderprofil und Auswertung',
      text: 'Ein Tipp auf den Namen öffnet das Profil des Kindes: Stundenkriterien und Kompetenzen getrennt, Verlauf, Textbausteine für Zeugnisse und die Notizen zum Kind.',
      punkte: ['Die Note entsteht erst hier – aus den einzelnen Werten', 'Arbeits- und Sozialverhalten bleibt getrennt von der Fachnote', 'Kinder ohne Benotung stellst du im Profil um']
    },
    {
      skizze: 'sicherheit',
      titel: 'Sicherheit und Sicherung',
      text: 'Nach fünf Minuten ohne Bedienung sperrt sich Notenblock. Ohne Passphrase kommt niemand an die Daten – auch nicht der Hersteller.',
      punkte: ['Sicherung erstellen: Einstellungen → Daten', 'Löschfristen erinnern an alte Klassen', 'Diese Einführung findest du wieder unter Einstellungen → Hilfe']
    }
  ];

  /* ---------- Anzeige ---------- */

  let eintrag = null;
  let schritt = 0;

  function karteBauen(behaelter, beiEnde) {
    const k = KARTEN[schritt];
    H.leeren(behaelter);
    const punkte = H.el('div', { class: 'ein-punkte', 'aria-hidden': 'true' },
      KARTEN.map((x, i) => H.el('span', { class: 'ein-punkt' + (i === schritt ? ' aktiv' : '') })));
    H.anhaengen(behaelter, [
      SKIZZEN[k.skizze](),
      H.el('h2', { class: 'ein-titel', text: k.titel }),
      H.el('p', { class: 'ein-text', text: k.text }),
      H.el('ul', { class: 'ein-liste' }, k.punkte.map(p => H.el('li', { text: p }))),
      punkte,
      H.el('p', { class: 'text-klein text-schwach ein-zaehler', text: 'Schritt ' + (schritt + 1) + ' von ' + KARTEN.length }),
      H.el('div', { class: 'knopfzeile ein-knoepfe' }, [
        schritt > 0
          ? H.el('button', { type: 'button', class: 'knopf', text: 'Zurück', onclick: function () { schritt--; karteBauen(behaelter, beiEnde); } })
          : H.el('button', { type: 'button', class: 'knopf', text: 'Überspringen', onclick: beiEnde }),
        H.el('button', {
          type: 'button', class: 'knopf primaer', text: schritt === KARTEN.length - 1 ? 'Los geht’s' : 'Weiter',
          onclick: function () {
            if (schritt === KARTEN.length - 1) { beiEnde(); return; }
            schritt++;
            karteBauen(behaelter, beiEnde);
          }
        })
      ])
    ]);
    const titel = H.$('.ein-titel', behaelter);
    if (titel) setTimeout(() => titel.focus(), 30);
    titel.setAttribute('tabindex', '-1');
  }

  /** Einführung öffnen. Merkt sich beim Schließen, dass sie gezeigt wurde. */
  E.oeffnen = function () {
    schritt = 0;
    const behaelter = H.el('div', { class: 'ein-inhalt' });
    function beenden() {
      M.einstellungSetzen('einfuehrungGesehen', true);
      if (eintrag) eintrag.schliessen();
      eintrag = null;
    }
    karteBauen(behaelter, beenden);
    eintrag = NB.Dialog.overlayOeffnen(behaelter, {
      klasse: 'einfuehrung',
      beiSchliessen: function () { M.einstellungSetzen('einfuehrungGesehen', true); eintrag = null; }
    });
  };

  /**
   * Beim Start einmalig zeigen – beim allerersten Öffnen und nach einer
   * Aktualisierung, die die Einführung mitbringt. Danach nie wieder von
   * selbst; die erste Karte lässt sich sofort überspringen.
   */
  E.beimStartPruefen = function () {
    if (M.einstellungen().einfuehrungGesehen === true) return;
    setTimeout(E.oeffnen, 500);
  };

  return E;
})();
