/*
 * Notenblock – Bereich Notizen
 *
 * Liste aller Notizen, neueste oben, angeheftete zuerst, mit Suche über Titel
 * und Text. Eine Notiz hat Titel, mehrzeiligen Text, Datum und optionale
 * Zuordnungen zu Klasse, Kind und Fach; sie kann angeheftet werden.
 * Notizen mit Kind-Zuordnung erscheinen zusätzlich in dessen Auswertung.
 * Neue Notiz über eine deutlich sichtbare Schaltfläche, Löschen nur nach
 * Rückfrage. Alles speichert sofort.
 *
 * Daten: 'notiz' → { id, titel, text, datum, klasseId, kindId, fachId, angeheftet, angelegtAm, geaendertAm }
 */
'use strict';
NB.BereichNotizen = (function () {
  const B = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;
  const N = NB.Navigation;

  let suchtext = '';
  let aktuelleNotiz = null;   // im Editor geöffnete Notiz

  /* ---------- Zugriff ---------- */

  B.notizen = function () {
    return D.alle('notiz').slice().sort(function (a, b) {
      if (!!a.angeheftet !== !!b.angeheftet) return a.angeheftet ? -1 : 1;
      if ((a.datum || '') !== (b.datum || '')) return (a.datum || '') < (b.datum || '') ? 1 : -1;
      return (a.geaendertAm || '') < (b.geaendertAm || '') ? 1 : -1;
    });
  };

  /** Notizen zu einem Kind (für die Auswertung), neueste zuerst. */
  B.notizenZuKind = function (kindId) {
    return B.notizen().filter(n => n.kindId === kindId);
  };

  function hatInhalt(n) {
    return !!((n.titel && n.titel.trim()) || (n.text && n.text.trim()));
  }

  function speichern(n) {
    if (!hatInhalt(n)) {
      if (D.holen('notiz', n.id)) D.entfernen('notiz', n.id);
      return;
    }
    n.geaendertAm = H.jetztIso();
    D.setzen('notiz', n.id, n);
  }

  function zuordnungText(n) {
    const teile = [];
    const klasse = n.klasseId ? M.klasse(n.klasseId) : null;
    if (klasse) teile.push(klasse.name);
    const kind = klasse && n.kindId ? M.kind(klasse, n.kindId) : null;
    if (kind) teile.push(M.kindName(kind));
    const fach = n.fachId ? M.fach(n.fachId) : null;
    if (fach) teile.push(fach.name);
    return teile.join(' · ');
  }

  /* ---------- Liste ---------- */

  function passtZurSuche(n) {
    if (!suchtext) return true;
    const s = suchtext.toLowerCase();
    return (n.titel || '').toLowerCase().indexOf(s) >= 0 || (n.text || '').toLowerCase().indexOf(s) >= 0;
  }

  function listeRendern() {
    const wurzel = H.$('#bereich-notizen');
    H.leeren(wurzel);

    const suche = H.el('input', { type: 'search', class: 'suchfeld', placeholder: 'Notizen durchsuchen', 'aria-label': 'Notizen durchsuchen', autocomplete: 'off', value: suchtext });
    suche.addEventListener('input', H.entprellen(function () {
      suchtext = suche.value.trim();
      ergebnisseRendern();
    }, 150));
    wurzel.appendChild(H.el('div', { class: 'notiz-kopf' }, [
      suche,
      H.el('button', { type: 'button', class: 'knopf primaer', text: 'Neue Notiz', onclick: () => B.neu() })
    ]));

    const ergebnisse = H.el('div', { class: 'notiz-liste' });
    wurzel.appendChild(ergebnisse);

    function ergebnisseRendern() {
      H.leeren(ergebnisse);
      const alle = B.notizen();
      const liste = alle.filter(passtZurSuche);
      if (!alle.length) {
        ergebnisse.appendChild(H.el('div', { class: 'leer' }, [
          H.el('p', { class: 'leer-titel', text: 'Noch keine Notizen' }),
          H.el('p', { text: 'Halte Beobachtungen, Absprachen und Ideen fest – auf Wunsch einem Kind, einer Klasse oder einem Fach zugeordnet.' })
        ]));
        return;
      }
      if (!liste.length) {
        ergebnisse.appendChild(H.el('p', { class: 'text-schwach kal-leer', text: 'Keine Notiz enthält „' + suchtext + '“.' }));
        return;
      }
      liste.forEach(n => ergebnisse.appendChild(notizKarte(n)));
    }
    ergebnisseRendern();
  }

  function notizKarte(n) {
    const zuordnung = zuordnungText(n);
    return H.el('button', {
      type: 'button', class: 'notiz-karte' + (n.angeheftet ? ' angeheftet' : ''),
      onclick: () => B.oeffnen(n.id)
    }, [
      H.el('span', { class: 'notiz-kopfzeile' }, [
        H.el('span', { class: 'notiz-titel', text: n.titel && n.titel.trim() ? n.titel : 'Ohne Titel' }),
        n.angeheftet ? H.el('span', { class: 'notiz-nadel', 'aria-label': 'angeheftet', title: 'Angeheftet', text: '📌' }) : null
      ]),
      n.text && n.text.trim() ? H.el('span', { class: 'notiz-vorschau', text: n.text.trim() }) : null,
      H.el('span', { class: 'notiz-meta text-klein text-schwach', text: [n.datum ? H.datumMitWochentag(n.datum) : null, zuordnung || null].filter(Boolean).join(' · ') })
    ]);
  }

  /* ---------- Editor ---------- */

  B.neu = function (vorgaben) {
    const n = Object.assign({
      id: H.neueId(), titel: '', text: '', datum: H.heute(), klasseId: null, kindId: null, fachId: null,
      angeheftet: false, angelegtAm: H.jetztIso()
    }, vorgaben || {});
    if (N.aktiverBereich() !== 'notizen') N.zeigen('notizen');
    N.bildschirmOeffnen('notiz', { notiz: n, neu: true });
  };

  B.oeffnen = function (id) {
    const n = D.holen('notiz', id);
    if (!n) return;
    if (N.aktiverBereich() !== 'notizen') N.zeigen('notizen');
    N.bildschirmOeffnen('notiz', { id: id });
  };

  function editorRendern(parameter) {
    const wurzel = H.$('#bildschirm-notiz');
    H.leeren(wurzel);
    const n = parameter.notiz || D.holen('notiz', parameter.id);
    aktuelleNotiz = n || null;
    if (!n) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diese Notiz gibt es nicht mehr.' })));
      return;
    }
    const sofort = () => speichern(n);
    const verzoegert = H.entprellen(sofort, 300);

    const titel = H.el('input', { type: 'text', class: 'notiz-titel-feld', placeholder: 'Titel', autocomplete: 'off', 'aria-label': 'Titel' });
    titel.value = n.titel || '';
    titel.addEventListener('input', function () { n.titel = titel.value; verzoegert(); N.kopfAktualisieren(); });
    titel.addEventListener('change', function () { n.titel = titel.value; sofort(); });

    const text = H.el('textarea', { rows: 8, class: 'notiz-text-feld', placeholder: 'Text', 'aria-label': 'Text' });
    text.value = n.text || '';
    text.addEventListener('input', function () { n.text = text.value; verzoegert(); });
    text.addEventListener('change', function () { n.text = text.value; sofort(); });

    // Datum
    const datumKnopf = H.el('button', { type: 'button', class: 'knopf datumknopf', 'aria-label': 'Datum wählen' }, H.el('span', { text: H.datumMitWochentag(n.datum || H.heute()) }));
    datumKnopf.addEventListener('click', function () {
      NB.Kalender.oeffnen({
        datum: n.datum || H.heute(),
        markierungen: (jahr, monat) => NB.Stundenplan.kalenderMarkierungen(jahr, monat),
        beiAuswahl: function (iso) { n.datum = iso; datumKnopf.firstChild.textContent = H.datumMitWochentag(iso); sofort(); }
      });
    });

    // Zuordnungen
    const klasseFeld = H.el('select', { 'aria-label': 'Klasse' });
    klasseFeld.appendChild(H.el('option', { value: '', text: 'Keine Klasse' }));
    M.klassen().forEach(k => klasseFeld.appendChild(H.el('option', { value: k.id, text: k.name })));
    klasseFeld.value = n.klasseId && M.klasse(n.klasseId) ? n.klasseId : '';

    const kindFeld = H.el('select', { 'aria-label': 'Kind' });
    function kinderFuellen() {
      H.leeren(kindFeld);
      kindFeld.appendChild(H.el('option', { value: '', text: 'Kein Kind' }));
      const klasse = klasseFeld.value ? M.klasse(klasseFeld.value) : null;
      M.kinderSortiert(klasse).forEach(k => kindFeld.appendChild(H.el('option', { value: k.id, text: M.kindName(k) })));
      kindFeld.disabled = !klasse;
      kindFeld.value = n.kindId && klasse && M.kind(klasse, n.kindId) ? n.kindId : '';
    }
    kinderFuellen();
    klasseFeld.addEventListener('change', function () {
      n.klasseId = klasseFeld.value || null;
      n.kindId = null;
      kinderFuellen();
      sofort();
    });
    kindFeld.addEventListener('change', function () { n.kindId = kindFeld.value || null; sofort(); });

    const fachFeld = H.el('select', { 'aria-label': 'Fach' });
    fachFeld.appendChild(H.el('option', { value: '', text: 'Kein Fach' }));
    M.faecher().forEach(f => fachFeld.appendChild(H.el('option', { value: f.id, text: f.name })));
    fachFeld.value = n.fachId && M.fach(n.fachId) ? n.fachId : '';
    fachFeld.addEventListener('change', function () { n.fachId = fachFeld.value || null; sofort(); });

    const nadel = H.el('input', { type: 'checkbox', class: 'schalter', role: 'switch' });
    nadel.checked = !!n.angeheftet;
    nadel.setAttribute('aria-checked', n.angeheftet ? 'true' : 'false');
    nadel.addEventListener('change', function () { n.angeheftet = nadel.checked; nadel.setAttribute('aria-checked', n.angeheftet ? 'true' : 'false'); sofort(); });

    function zeile(label, steuerung) {
      return H.el('label', { class: 'einst-zeile einst-zeile-kompakt' }, [
        H.el('div', { class: 'einst-text' }, H.el('span', { class: 'einst-label', text: label })),
        H.el('div', { class: 'einst-steuerung' }, steuerung)
      ]);
    }

    wurzel.appendChild(H.el('div', { class: 'karte-inhalt' }, [
      H.el('div', { class: 'einst-karte notiz-editor' }, [
        titel,
        text
      ]),
      H.el('div', { class: 'einst-karte' }, [
        zeile('Datum', datumKnopf),
        zeile('Klasse', klasseFeld),
        zeile('Kind', kindFeld),
        zeile('Fach', fachFeld),
        zeile('Angeheftet', nadel)
      ]),
      H.el('p', { class: 'text-klein text-schwach', text: 'Notizen mit Kind-Zuordnung erscheinen auch in der Auswertung des Kindes.' }),
      H.el('div', { class: 'knopfzeile' }, [
        H.el('button', { type: 'button', class: 'knopf gefaehrlich', text: 'Notiz löschen', onclick: () => loeschen(n) })
      ])
    ]));
    setTimeout(() => { if (parameter.neu) titel.focus(); }, 50);
  }

  async function loeschen(n) {
    const ok = await NB.Dialog.bestaetigen({
      titel: 'Notiz löschen?',
      text: (n.titel && n.titel.trim() ? '„' + n.titel.trim() + '“' : 'Diese Notiz') + ' wird endgültig gelöscht.',
      bestaetigen: 'Löschen',
      gefaehrlich: true
    });
    if (!ok) return;
    if (D.holen('notiz', n.id)) D.entfernen('notiz', n.id);
    n.titel = ''; n.text = '';   // verhindert ein späteres verzögertes Speichern
    N.zurueck();
  }

  /* ---------- Registrierung ---------- */

  N.bereichRegistrieren('notizen', { titel: 'Notizen', zeigen: listeRendern });
  N.bildschirmRegistrieren('notiz', {
    titel: () => (aktuelleNotiz && aktuelleNotiz.titel && aktuelleNotiz.titel.trim() ? aktuelleNotiz.titel.trim() : 'Notiz'),
    zurueck: true,
    zeigen: editorRendern,
    verbergen: function () { if (aktuelleNotiz) speichern(aktuelleNotiz); }
  });

  return B;
})();
