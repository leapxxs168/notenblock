/*
 * Notenblock – Erfasste Stunden umhängen
 *
 * Ändert sich der Stundenplan ab einem Datum, passen Stunden, die danach
 * schon erfasst wurden, womöglich nicht mehr: Sachunterricht stand mittwochs
 * und steht jetzt donnerstags. Für jede solche Stunde gibt es hier ein
 * Angebot – auf einen passenden Platz derselben Woche verschieben oder
 * einfach stehen lassen. Erzwungen wird nichts: Wer nichts tut, behält alles
 * so, wie es erfasst wurde. Verschoben werden Bewertung und Planung der
 * Stunde gemeinsam; zusammengeführt wird nie.
 *
 * Angeboten wird nur, was die Umstellung wirklich verschoben hat: Stunden,
 * die zum vorherigen Plan passten und zum neuen nicht mehr. Einzelne Stunden
 * lassen sich später jederzeit aus dem Bewertungsbildschirm umhängen.
 */
'use strict';
NB.PlanUmhaengen = (function () {
  const PU = {};
  const H = NB.Hilfen;
  const M = NB.Modell;
  const N = NB.Navigation;
  const SP = NB.Stundenplan;

  let aktuell = null;      // { klasseId, planId } des offenen Bildschirms
  const stehenLassen = {}; // Einheiten, die in diesem Durchgang bewusst bleiben

  function fachName(id) { const f = M.fach(id); return f ? f.name : 'Fach fehlt'; }

  /** Gehört die Einheit zu einer Stunde, die es an diesem Tag laut Plan gibt? */
  function passt(klasse, einheit, eintraege) {
    return SP.einheitenAmTag(klasse, einheit.datum, einheit.fachId, eintraege)
      .some(e => Number(e.stunde) === Number(einheit.stunde));
  }

  /** Einheit, die auf keinem Raster liegt (ohne Stundenplan oder archiviert)? */
  function amRaster(einheit) {
    return einheit.stunde !== M.OHNE_STUNDE && einheit.stunde !== M.UNBEKANNTE_STUNDE && Number(einheit.stunde) > 0;
  }

  /**
   * Freie Plätze für eine Einheit in derselben Woche: alle Stunden dieses
   * Fachs von Montag bis Sonntag, an denen noch nichts erfasst ist.
   */
  PU.kandidaten = function (klasse, einheit) {
    const montag = SP.montag(einheit.datum);
    const liste = [];
    for (let i = 0; i < 7; i++) {
      const tag = H.tageAddieren(montag, i);
      SP.einheitenAmTag(klasse, tag, einheit.fachId).forEach(function (e) {
        if (tag === einheit.datum && Number(e.stunde) === Number(einheit.stunde)) return; // das ist sie selbst
        if (M.einheit(klasse.id, einheit.fachId, tag, e.stunde)) return;                  // dort ist schon etwas erfasst
        liste.push({ datum: tag, stunde: e.stunde, stundeBis: e.stundeBis });
      });
    }
    return liste;
  };

  /**
   * Stunden im Zeitraum eines Plans, die der Planwechsel aus dem Raster
   * geschoben hat: [{ einheit, kandidaten }]
   */
  PU.offene = function (klasse, plan) {
    if (!klasse || !plan) return [];
    const liste = SP.plaene(klasse);
    const i = liste.findIndex(p => p.id === plan.id);
    const vorher = i > 0 ? liste[i - 1] : null;
    if (!vorher) return []; // der erste Plan hat nichts verschoben
    const vorherEintraege = SP.planEintraege(vorher);
    const bis = SP.planBis(klasse, plan);
    return M.einheitenImZeitraum(klasse.id, plan.abDatum, bis)
      .filter(b => amRaster(b) && M.klasseHatFach(klasse, b.fachId))
      .filter(b => !passt(klasse, b) && passt(klasse, b, vorherEintraege))
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : Number(a.stunde) - Number(b.stunde)))
      .map(b => ({ einheit: b, kandidaten: PU.kandidaten(klasse, b) }));
  };

  /** „Do, 19.11. · 3. Std.“ */
  function zielText(ziel) {
    return H.datumKurzOhneJahr(ziel.datum) + ' · ' + SP.stundenText(ziel.stunde, ziel.stundeBis);
  }

  /** Einheit auf einen Platz verschieben; meldet, was passiert ist. */
  function verschieben(klasse, einheit, ziel, danach) {
    const herkunft = H.datumKurzOhneJahr(einheit.datum); // vor dem Verschieben merken: einheit wird dabei geändert
    const ok = M.einheitVerschieben(klasse.id, einheit.fachId, einheit.datum, einheit.stunde, ziel.datum, ziel.stunde, ziel.stundeBis);
    if (!ok) {
      NB.Dialog.hinweis({ titel: 'Geht nicht', text: 'Auf diesem Platz ist inzwischen etwas erfasst. Zwei Erfassungen werden nie zusammengeführt.' });
      return;
    }
    NB.App.meldung(fachName(einheit.fachId) + ' vom ' + herkunft + ' steht jetzt am ' + zielText(ziel) + '.');
    if (danach) danach(ziel);
  }

  /* ---------- Bildschirm nach einem Planwechsel ---------- */

  PU.oeffnen = function (klasseId, planId) {
    N.bildschirmOeffnen('plan-umhaengen', { klasseId: klasseId, planId: planId });
  };

  /** Eine Karte je betroffener Stunde. */
  function karte(klasse, eintrag, neuZeichnen) {
    const b = eintrag.einheit;
    const schluessel = M.einheitSchluesselVon(b);
    const kinder = M.anzahlKinderInEinheit(b);
    const kopf = [
      H.el('div', { class: 'einst-eintrag-titel', text: H.datumMitWochentag(b.datum) + ' · ' + M.einheitText(b) }),
      H.el('div', { class: 'text-klein text-schwach', text: fachName(b.fachId) + ' · ' + (kinder === 1 ? '1 Kind erfasst' : kinder + ' Kinder erfasst') })
    ];
    const knoepfe = eintrag.kandidaten.map(ziel => H.el('button', {
      type: 'button', class: 'knopf primaer klein', text: zielText(ziel),
      onclick: () => verschieben(klasse, b, ziel, neuZeichnen)
    }));
    knoepfe.push(H.el('button', {
      type: 'button', class: 'knopf klein', text: 'Bleibt so',
      onclick: function () { stehenLassen[schluessel] = true; neuZeichnen(); }
    }));
    return H.el('div', { class: 'einst-zeile umhaengen-karte' }, [
      H.el('div', { class: 'einst-text' }, kopf),
      H.el('p', { class: 'text-klein text-schwach umhaengen-frage', text: eintrag.kandidaten.length
        ? 'Verschieben auf:'
        : 'In dieser Woche gibt es keinen freien Platz für ' + fachName(b.fachId) + ' – die Stunde bleibt, wo sie ist.' }),
      H.el('div', { class: 'umhaengen-knoepfe' }, knoepfe)
    ]);
  }

  function rendern(parameter) {
    aktuell = parameter || {};
    const wurzel = H.$('#bildschirm-plan-umhaengen');
    H.leeren(wurzel);
    const klasse = M.klasse(aktuell.klasseId);
    const plan = SP.plan(klasse, aktuell.planId);
    if (!klasse || !plan) {
      wurzel.appendChild(H.el('div', { class: 'leer' }, H.el('p', { text: 'Diesen Stundenplan gibt es nicht mehr.' })));
      return;
    }
    const inhalt = H.el('div', { class: 'karte-inhalt einst' });
    inhalt.appendChild(H.el('h2', { class: 'aw-titel', text: klasse.name + ' · Stundenplan ' + SP.planZeitraumText(klasse, plan) }));

    const offen = PU.offene(klasse, plan).filter(e => !stehenLassen[M.einheitSchluesselVon(e.einheit)]);
    if (!offen.length) {
      inhalt.appendChild(H.el('p', { class: 'bw-hinweis', text: 'Alles erledigt – es passt jetzt jede erfasste Stunde zum Stundenplan oder bleibt bewusst stehen.' }));
    } else {
      inhalt.appendChild(H.el('p', { class: 'text-klein text-schwach', text:
        'Diese Stunden wurden erfasst, bevor der neue Stundenplan galt – im neuen Plan gibt es sie an diesem Tag nicht mehr. '
        + 'Verschieben hängt Bewertung und Planung gemeinsam um; was du stehen lässt, bleibt unverändert erhalten.' }));
      inhalt.appendChild(H.el('div', { class: 'einst-karte' }, offen.map(e => karte(klasse, e, () => rendern(aktuell)))));
    }
    inhalt.appendChild(H.el('div', { class: 'knopfzeile' },
      H.el('button', { type: 'button', class: 'knopf primaer', text: 'Fertig', onclick: () => N.zurueck() })));
    wurzel.appendChild(inhalt);
  }

  /* ---------- Einzelne Stunde aus dem Bewertungsbildschirm ---------- */

  /**
   * Eine einzelne erfasste Stunde umhängen. Zeigt die freien Plätze derselben
   * Woche zur Auswahl; „Bleibt so“ ändert nichts.
   */
  PU.einzelneStunde = async function (klasseId, fachId, datum, stunde, danach) {
    const klasse = M.klasse(klasseId);
    const b = M.einheit(klasseId, fachId, datum, stunde);
    if (!klasse || !b) return;
    const kandidaten = PU.kandidaten(klasse, b);
    if (!kandidaten.length) {
      await NB.Dialog.hinweis({
        titel: 'Kein freier Platz',
        text: 'In dieser Woche gibt es keine weitere Stunde ' + fachName(fachId) + ', auf die sich die Erfassung verschieben ließe. Sie bleibt, wo sie ist.'
      });
      return;
    }
    const wahl = await NB.Dialog.auswahl({
      titel: 'Stunde verschieben',
      optionen: kandidaten.map((ziel, i) => ({
        text: zielText(ziel),
        untertitel: 'Bewertung und Planung ziehen mit',
        wert: String(i)
      })).concat([{ text: 'Bleibt so', wert: '__bleibt__', klasse: 'auswahl-sekundaer' }])
    });
    if (!wahl || wahl === '__bleibt__') return;
    verschieben(klasse, b, kandidaten[Number(wahl)], danach);
  };

  /* ---------- Registrierung ---------- */

  N.bildschirmRegistrieren('plan-umhaengen', {
    titel: 'Erfasste Stunden umhängen',
    zurueck: true,
    zeigen: rendern
  });

  return PU;
})();
