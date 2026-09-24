/*
 * Notenblock – Bereich Klassen
 *
 * Einstieg: Liste der Klassen mit Name, Stufe und Anzahl der Kinder; die
 * Farbe der Klasse steht links. Ein Tipp öffnet die Klassenübersicht
 * (NB.KlasseVerwalten), nicht mehr direkt die Bewertung.
 * „Neue Klasse anlegen“ → geführte Anlage in vier Schritten (ebenfalls
 * NB.KlasseVerwalten).
 * Kinder verwalten: Liste, ein Kind pro Zeile: „Nachname, Vorname | Kürzel“.
 * Beim Speichern behalten bestehende Kinder ihre Id, damit ihre Bewertungen
 * erhalten bleiben (Abgleich über Name, sonst Kürzel). Die Bausteine
 * (zeilenEinlesen, abgleichen, kinderZuText) nutzt auch Schritt 4 der Anlage.
 */
'use strict';
NB.BereichKlassen = (function () {
  const B = {};
  const H = NB.Hilfen;
  const M = NB.Modell;
  const N = NB.Navigation;

  /* ---------- Klassenliste ---------- */

  function kinderText(anzahl) {
    if (anzahl === 0) return 'Noch keine Kinder';
    return anzahl === 1 ? '1 Kind' : anzahl + ' Kinder';
  }

  function listeRendern() {
    const wurzel = H.$('#bereich-klassen');
    H.leeren(wurzel);
    const klassen = M.klassen();

    if (klassen.length === 0) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, [
        H.el('p', { class: 'leer-titel', text: 'Noch keine Klasse' }),
        H.el('p', { text: 'Lege deine erste Klasse an und trage die Kinder ein – danach kannst du sofort bewerten.' })
      ]));
    } else {
      const liste = H.el('div', { class: 'klassenliste' });
      klassen.forEach(function (klasse) {
        const anzahl = (klasse.kinder || []).length;
        const stufe = klasse.stufe ? M.stufe(klasse.stufe) : null;
        const karte = H.el('button', {
          type: 'button', class: 'klasse-karte klasse-oeffnen',
          'aria-label': klasse.name + (stufe ? ', ' + stufe.bezeichnung : '') + ', ' + kinderText(anzahl),
          onclick: () => NB.KlasseVerwalten.oeffnen(klasse.id)
        }, [
          H.el('span', { class: 'klasse-name', text: klasse.name }),
          H.el('span', { class: 'klasse-info text-schwach text-klein', text: [stufe ? stufe.kurz : 'Stufe offen', kinderText(anzahl)].join(' · ') }),
          H.el('span', { class: 'einst-pfeil', 'aria-hidden': 'true', text: '›' })
        ]);
        karte.style.setProperty('--klassenfarbe', M.klassenFarbe(klasse));
        liste.appendChild(karte);
      });
      wurzel.appendChild(liste);
    }

    wurzel.appendChild(H.el('div', { class: 'knopfzeile' }, H.el('button', {
      type: 'button', class: 'knopf primaer', text: 'Neue Klasse anlegen',
      onclick: () => NB.KlasseVerwalten.neu()
    })));
  }

  /* ---------- Kinder verwalten ---------- */

  const HINWEIS = 'Ein Kind pro Zeile. Schreibweise „Nachname, Vorname“ sortiert nach Nachnamen. Ein Kürzel wird mit einem senkrechten Strich angehängt, zum Beispiel: Mustermann, Max | MM07';
  const HINWEIS_KUERZEL = 'Ein Kind pro Zeile, nur das Kürzel (Einstellung „Keine vollen Namen speichern“ ist eingeschaltet), zum Beispiel: MM07';

  function nurKuerzelSpeichern() {
    return M.einstellungen().keineVollenNamen === true;
  }
  B.nurKuerzel = nurKuerzelSpeichern;
  B.hinweisText = () => (nurKuerzelSpeichern() ? HINWEIS_KUERZEL : HINWEIS);

  /** Zeilen der Liste einlesen → [{ name, kuerzel }] oder Fehlertext. */
  function zeilenEinlesen(text) {
    const kinder = [];
    const gesehen = {};
    const zeilen = String(text || '').split(/\r?\n/);
    for (let i = 0; i < zeilen.length; i++) {
      const zeile = zeilen[i].trim();
      if (!zeile) continue;
      const teile = zeile.split('|');
      let name = teile[0].trim();
      let kuerzel = (teile[1] || '').trim();
      if (nurKuerzelSpeichern()) {
        // Nur Kürzel: bei „Name | Kürzel“ zählt das Kürzel, sonst die ganze Zeile
        kuerzel = kuerzel || name;
        name = '';
      }
      if (!name && !kuerzel) continue;
      if (teile.length > 2) return { fehler: 'Zeile ' + (i + 1) + ' enthält mehr als einen senkrechten Strich.' };
      const norm = (name || kuerzel).toLowerCase().replace(/\s+/g, ' ');
      if (gesehen[norm]) return { fehler: 'Der Name „' + (name || kuerzel) + '“ kommt zweimal vor. Bitte unterscheidbar schreiben, etwa mit zweitem Vornamen oder Kürzel.' };
      gesehen[norm] = true;
      kinder.push({ name: name, kuerzel: kuerzel });
    }
    return { kinder: kinder };
  }
  B.zeilenEinlesen = zeilenEinlesen;

  /** Neue Liste mit bestehenden Kindern abgleichen, damit Ids erhalten bleiben. */
  function abgleichen(bestehend, neu) {
    const rest = (bestehend || []).slice();
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const ergebnis = neu.map(function (n) {
      let i = rest.findIndex(a => a.name && n.name && norm(a.name) === norm(n.name));
      if (i < 0 && n.kuerzel) i = rest.findIndex(a => a.kuerzel && norm(a.kuerzel) === norm(n.kuerzel));
      if (i >= 0) {
        const alt = rest.splice(i, 1)[0];
        return { id: alt.id, name: n.name, kuerzel: n.kuerzel };
      }
      return { id: H.neueId(), name: n.name, kuerzel: n.kuerzel };
    });
    return { kinder: ergebnis, entfernt: rest };
  }
  B.abgleichen = abgleichen;

  function kinderZuText(kinder) {
    if (nurKuerzelSpeichern()) return (kinder || []).map(k => k.kuerzel || '').join('\n');
    return (kinder || []).map(k => (k.name || '') + (k.kuerzel ? ' | ' + k.kuerzel : '')).join('\n');
  }
  B.kinderZuText = kinderZuText;

  let bearbeitet = null; // { klasseId }

  B.kinderVerwalten = function (klasseId) {
    N.bildschirmOeffnen('kinder', { klasseId: klasseId });
  };

  /**
   * Neue Liste in die Klasse übernehmen: Abgleich mit bestehenden Kindern,
   * Rückfrage bei entfernten Kindern (samt ihrer Bewertungen und Notizen).
   * Liefert true, wenn gespeichert wurde, sonst den Fehlertext.
   */
  B.listeUebernehmen = async function (klasse, text) {
    const gelesen = zeilenEinlesen(text);
    if (gelesen.fehler) return gelesen.fehler;
    const abgleich = abgleichen(klasse.kinder || [], gelesen.kinder);
    if (abgleich.entfernt.length > 0) {
      const namen = abgleich.entfernt.map(k => M.kindName(k)).join(', ');
      const ok = await NB.Dialog.bestaetigen({
        titel: abgleich.entfernt.length === 1 ? 'Ein Kind entfernen?' : abgleich.entfernt.length + ' Kinder entfernen?',
        text: namen + ' – steht nicht mehr in der Liste. Beim Entfernen werden auch die bisherigen Bewertungen und Notizen dieses Kindes gelöscht. Bei einem Tippfehler im Namen: Abbrechen und den Namen korrigieren.',
        bestaetigen: 'Entfernen',
        gefaehrlich: true
      });
      if (!ok) return false;
    }
    abgleich.entfernt.forEach(k => M.kindEntfernen(klasse, k.id));
    klasse.kinder = abgleich.kinder;
    M.klasseSpeichern(klasse);
    return true;
  };

  function kinderRendern(parameter) {
    bearbeitet = parameter || {};
    const klasse = M.klasse(bearbeitet.klasseId);
    const wurzel = H.$('#bildschirm-kinder');
    H.leeren(wurzel);
    if (!klasse) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diese Klasse gibt es nicht mehr.' })));
      return;
    }

    const listeFeld = H.el('textarea', { id: 'kinder-liste', rows: 12, autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', placeholder: nurKuerzelSpeichern() ? 'MM07' : 'Mustermann, Max | MM07' });
    listeFeld.value = kinderZuText(klasse.kinder);
    const fehler = H.el('p', { class: 'fehler', role: 'alert', hidden: true });

    const formular = H.el('form', { class: 'formular', novalidate: true, onsubmit: ev => { ev.preventDefault(); speichern(); } }, [
      H.el('h2', { class: 'aw-titel', text: klasse.name }),
      H.el('label', { class: 'feld' }, [
        H.el('span', { class: 'feld-name', text: 'Kinder' }),
        listeFeld
      ]),
      H.el('p', { class: 'text-schwach text-klein', text: B.hinweisText() }),
      fehler,
      H.el('div', { class: 'knopfzeile' }, [
        H.el('button', { type: 'submit', class: 'knopf primaer', text: 'Liste speichern' })
      ])
    ]);
    wurzel.appendChild(H.el('div', { class: 'karte-inhalt' }, formular));

    async function speichern() {
      fehler.hidden = true;
      const ergebnis = await B.listeUebernehmen(klasse, listeFeld.value);
      if (ergebnis === true) { NB.App.meldung('Liste gespeichert.'); N.zurueck(); return; }
      if (typeof ergebnis === 'string') { fehler.textContent = ergebnis; fehler.hidden = false; listeFeld.focus(); }
    }

    setTimeout(() => listeFeld.focus(), 50);
  }

  /* ---------- Registrierung ---------- */

  N.bereichRegistrieren('klassen', { titel: 'Klassen', zeigen: listeRendern });
  N.bildschirmRegistrieren('kinder', {
    titel: 'Kinder verwalten',
    zurueck: true,
    zeigen: kinderRendern
  });

  return B;
})();
