/*
 * Notenblock – Sicherung und Export
 *
 * Sicherung erstellen: Der gesamte Bestand als Datei. Standardmäßig
 * verschlüsselt (AES-GCM, Schlüssel aus einer beim Export abgefragten
 * Passphrase per PBKDF2). Unverschlüsselt nur nach ausdrücklicher Bestätigung;
 * die Datei heißt dann …-UNVERSCHLUESSELT.json.
 * Sicherung laden: Datei wählen, ggf. Passphrase eingeben, Rückfrage, dann wird
 * der gesamte Bestand ersetzt (die App-Passphrase bleibt).
 * CSV: unverschlüsselt, weil für Tabellenprogramme gedacht; vorher als
 * personenbezogen ausgewiesen. Semikolon-getrennt, UTF-8 mit BOM, Dezimalkomma.
 */
'use strict';
NB.Export = (function () {
  const X = {};
  const H = NB.Hilfen;
  const D = NB.Daten;
  const M = NB.Modell;
  const K = NB.Krypto;

  const FORMAT = 'notenblock-sicherung';

  /* ---------- Datei abgeben ---------- */

  function istIos() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  }

  /** Datei an die Nutzerin geben: auf iPhone/iPad über das Teilen-Blatt, sonst als Download. */
  async function dateiAbgeben(name, inhalt, typ) {
    const blob = new Blob([inhalt], { type: typ });
    if (istIos() && navigator.share && typeof File === 'function') {
      try {
        const datei = new File([blob], name, { type: typ });
        if (!navigator.canShare || navigator.canShare({ files: [datei] })) {
          await navigator.share({ files: [datei], title: name });
          return true;
        }
      } catch (fehler) {
        if (fehler && fehler.name === 'AbortError') return false;
        // sonst Download versuchen
      }
    }
    const url = URL.createObjectURL(blob);
    const a = H.el('a', { href: url, download: name });
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
    return true;
  }

  function datumFuerDatei() { return H.heute(); }

  /* ---------- Sicherung erstellen ---------- */

  function zusammenfassung() {
    const klassen = M.klassen();
    return {
      klassen: klassen.length,
      kinder: klassen.reduce((s, k) => s + (k.kinder || []).length, 0),
      stunden: D.alle('bewertung').filter(M.bewertungHatInhalt).length,
      notizen: D.alle('notiz').length,
      aufgaben: D.alle('aufgabe').length,
      termine: D.alle('termin').length
    };
  }

  function zusammenfassungText(z) {
    return z.klassen + (z.klassen === 1 ? ' Klasse' : ' Klassen') + ' mit ' + z.kinder + ' Kindern, ' + z.stunden + ' bewertete Stunden, ' + z.notizen + ' Notizen, ' + z.aufgaben + ' Aufgaben, ' + (z.termine || 0) + ' Termine';
  }

  /** Fragt nach Passphrase (zweimal) oder erlaubt den unverschlüsselten Weg. Liefert { passphrase } | { unverschluesselt: true } | null. */
  function sicherungsartFragen() {
    return new Promise(function (aufloesen) {
      let eintrag;
      const p1 = H.el('input', { type: 'password', autocomplete: 'new-password', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Passphrase für die Sicherung' });
      const p2 = H.el('input', { type: 'password', autocomplete: 'new-password', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Passphrase wiederholen' });
      const fehler = H.el('p', { class: 'fehler', hidden: true });
      const formular = H.el('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        if (p1.value.length < 10) { fehler.textContent = 'Mindestens zehn Zeichen.'; fehler.hidden = false; p1.focus(); return; }
        if (p1.value !== p2.value) { fehler.textContent = 'Die beiden Eingaben stimmen nicht überein.'; fehler.hidden = false; p2.focus(); return; }
        eintrag.schliessen({ passphrase: p1.value });
      } }, [
        H.el('h2', { text: 'Sicherung erstellen' }),
        H.el('p', { text: 'Die Sicherungsdatei wird mit einer Passphrase verschlüsselt. Sie darf dieselbe sein wie die der App – zum Laden wird sie wieder gebraucht.' }),
        H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: 'Passphrase für die Sicherung' }), p1]),
        H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: 'Passphrase wiederholen' }), p2]),
        fehler,
        H.el('div', { class: 'knopfzeile' }, [
          H.el('button', { type: 'button', class: 'knopf', text: 'Abbrechen', onclick: () => eintrag.schliessen(null) }),
          H.el('button', { type: 'submit', class: 'knopf primaer', text: 'Verschlüsselt sichern' })
        ]),
        H.el('p', { class: 'text-mittig' }, H.el('button', { type: 'button', class: 'textknopf klein', text: 'Ohne Verschlüsselung sichern …', onclick: () => eintrag.schliessen({ unverschluesselt: true }) }))
      ]);
      eintrag = NB.Dialog.overlayOeffnen(formular, { klasse: 'dialog', beiSchliessen: erg => aufloesen(erg && typeof erg === 'object' ? erg : null), fokus: 'input' });
    });
  }

  /** Sicherungsdatei als Objekt; mit Passphrase verschlüsselt, ohne (null) im Klartext. */
  X.sicherungsdateiErzeugen = async function (passphrase) {
    await D.flush();
    const bestand = D.bestandExportieren();
    const kopf = { format: FORMAT, version: 1, erstelltAm: H.jetztIso(), appVersion: 1, zusammenfassung: zusammenfassung() };
    if (!passphrase) return Object.assign(kopf, { verschluesselt: false, bestand: bestand });
    const salt = K.zufallsBytes(16);
    const schluessel = await K.schluesselAbleiten(passphrase, salt, K.ITERATIONEN);
    const paket = await K.verschluesselnObjekt(schluessel, { bestand: bestand });
    return Object.assign(kopf, { verschluesselt: true, salt: H.bytesZuBase64(salt), iterationen: K.ITERATIONEN, iv: paket.iv, daten: paket.daten });
  };

  /** Bestand aus einer Sicherungsdatei lesen; bei Verschlüsselung mit Passphrase. Liefert null bei falscher Passphrase. */
  X.sicherungsdateiLesen = async function (inhalt, passphrase) {
    if (!inhalt || inhalt.format !== FORMAT) throw new Error('Keine Notenblock-Sicherung');
    if (!inhalt.verschluesselt) return Array.isArray(inhalt.bestand) ? inhalt.bestand : null;
    try {
      const schluessel = await K.schluesselAbleiten(passphrase || '', H.base64ZuBytes(inhalt.salt), inhalt.iterationen || K.ITERATIONEN);
      const klar = await K.entschluesselnObjekt(schluessel, { iv: inhalt.iv, daten: inhalt.daten });
      return Array.isArray(klar.bestand) ? klar.bestand : null;
    } catch (e) {
      return null;
    }
  };

  X.sicherungErstellen = async function () {
    const wahl = await sicherungsartFragen();
    if (!wahl) return;
    let unverschluesselt = false;
    if (wahl.unverschluesselt) {
      const ok = await NB.Dialog.bestaetigen({
        titel: 'Wirklich ohne Verschlüsselung?',
        text: 'Die Datei enthält dann Namen, Noten und Notizen im Klartext. Jeder, der die Datei bekommt, kann sie lesen. Bitte nur bewusst und nur auf einem sicheren Speicherort verwenden.',
        bestaetigen: 'Unverschlüsselt sichern',
        gefaehrlich: true
      });
      if (!ok) return;
      unverschluesselt = true;
    }
    try {
      const datei = await X.sicherungsdateiErzeugen(unverschluesselt ? null : wahl.passphrase);
      const name = 'notenblock-sicherung-' + datumFuerDatei() + (unverschluesselt ? '-UNVERSCHLUESSELT' : '') + '.json';
      const abgegeben = await dateiAbgeben(name, JSON.stringify(datei), 'application/json');
      if (abgegeben) {
        M.einstellungSetzen('letzteSicherung', H.jetztIso());
        NB.App.meldung('Sicherung erstellt: ' + name);
        if (NB.Einstellungen) NB.Einstellungen.neuZeichnen();
      }
    } catch (fehler) {
      console.error(fehler);
      NB.App.meldung('Sicherung fehlgeschlagen: ' + (fehler.message || fehler), 'fehler');
    }
  };

  /* ---------- Sicherung laden ---------- */

  function dateiWaehlen() {
    return new Promise(function (aufloesen) {
      const eingabe = H.el('input', { type: 'file', accept: '.json,application/json' });
      eingabe.hidden = true;
      document.body.appendChild(eingabe);
      eingabe.addEventListener('change', function () {
        const datei = eingabe.files && eingabe.files[0];
        document.body.removeChild(eingabe);
        aufloesen(datei || null);
      });
      eingabe.click();
    });
  }

  function dateiLesen(datei) {
    return new Promise(function (aufloesen, ablehnen) {
      const leser = new FileReader();
      leser.onload = () => aufloesen(String(leser.result));
      leser.onerror = () => ablehnen(leser.error || new Error('Datei konnte nicht gelesen werden'));
      leser.readAsText(datei, 'utf-8');
    });
  }

  function passphraseFragen(titel, text) {
    return new Promise(function (aufloesen) {
      let eintrag;
      const feld = H.el('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Passphrase' });
      const formular = H.el('form', { novalidate: true, onsubmit: function (ev) { ev.preventDefault(); if (feld.value) eintrag.schliessen(feld.value); } }, [
        H.el('h2', { text: titel }),
        text ? H.el('p', { text: text }) : null,
        H.el('label', { class: 'feld' }, [H.el('span', { class: 'feld-name', text: 'Passphrase der Sicherung' }), feld]),
        H.el('div', { class: 'knopfzeile' }, [
          H.el('button', { type: 'button', class: 'knopf', text: 'Abbrechen', onclick: () => eintrag.schliessen(null) }),
          H.el('button', { type: 'submit', class: 'knopf primaer', text: 'Entschlüsseln' })
        ])
      ]);
      eintrag = NB.Dialog.overlayOeffnen(formular, { klasse: 'dialog', beiSchliessen: erg => aufloesen(typeof erg === 'string' ? erg : null), fokus: 'input' });
    });
  }

  X.sicherungLaden = async function () {
    const datei = await dateiWaehlen();
    if (!datei) return;
    try {
      let inhalt;
      try {
        inhalt = JSON.parse(await dateiLesen(datei));
      } catch (e) {
        await NB.Dialog.hinweis({ titel: 'Keine Sicherungsdatei', text: 'Die Datei ließ sich nicht lesen. Bitte eine mit Notenblock erstellte Sicherung (.json) wählen.' });
        return;
      }
      if (!inhalt || inhalt.format !== FORMAT) {
        await NB.Dialog.hinweis({ titel: 'Keine Sicherungsdatei', text: 'Diese Datei ist keine Notenblock-Sicherung.' });
        return;
      }
      let bestand = null;
      if (inhalt.verschluesselt) {
        let versuch = 0;
        while (bestand === null) {
          const passphrase = await passphraseFragen('Sicherung entschlüsseln', versuch ? 'Die Passphrase war nicht richtig. Bitte erneut eingeben.' : 'Die Sicherung vom ' + H.datumKurz((inhalt.erstelltAm || '').slice(0, 10) || H.heute()) + ' ist verschlüsselt.');
          if (passphrase == null) return;
          versuch++;
          bestand = await X.sicherungsdateiLesen(inhalt, passphrase);
        }
      } else {
        bestand = await X.sicherungsdateiLesen(inhalt, null);
      }
      if (!Array.isArray(bestand)) {
        await NB.Dialog.hinweis({ titel: 'Sicherung unvollständig', text: 'Die Datei enthält keinen lesbaren Bestand.' });
        return;
      }
      const z = inhalt.zusammenfassung ? zusammenfassungText(inhalt.zusammenfassung) : bestand.length + ' Einträge';
      const ok = await NB.Dialog.bestaetigen({
        titel: 'Sicherung laden?',
        text: 'Sicherung vom ' + H.datumKurz((inhalt.erstelltAm || '').slice(0, 10) || H.heute()) + ': ' + z + '. Alle aktuellen Daten auf diesem Gerät werden dadurch ersetzt (derzeit: ' + zusammenfassungText(zusammenfassung()) + '). Die App-Passphrase bleibt unverändert.',
        bestaetigen: 'Sicherung laden',
        gefaehrlich: true
      });
      if (!ok) return;
      await D.bestandImportieren(bestand);
      NB.App.darstellungAnwenden();
      NB.Navigation.zuruecksetzen();
      NB.Navigation.start();
      NB.App.meldung('Sicherung geladen.');
    } catch (fehler) {
      console.error(fehler);
      NB.App.meldung('Laden fehlgeschlagen: ' + (fehler.message || fehler) + '. Der bisherige Bestand bleibt erhalten.', 'fehler');
    }
  };

  /* ---------- CSV ---------- */

  function csvFeld(wert) {
    const s = wert == null ? '' : String(wert);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csvZeile(felder) { return felder.map(csvFeld).join(';'); }

  function csvZahl(wert) { return wert == null ? '' : String(Math.round(wert * 10) / 10).replace('.', ','); }

  async function csvBestaetigen(was) {
    return NB.Dialog.bestaetigen({
      titel: was + ' als CSV',
      text: 'Die CSV-Datei enthält personenbezogene Daten (Namen und Noten) unverschlüsselt, damit sie sich in Tabellenprogrammen öffnen lässt. Bitte nur auf einem sicheren Speicherort ablegen und nach Gebrauch löschen.',
      bestaetigen: 'CSV erstellen'
    });
  }

  /** Einzelne Noten: eine Zeile je Kind, Stunde und Kriterium. */
  X.csvNoten = async function () {
    if (!(await csvBestaetigen('Noten'))) return;
    await dateiAbgeben('notenblock-noten-' + datumFuerDatei() + '.csv', X.csvNotenText(), 'text/csv;charset=utf-8');
  };

  X.csvNotenText = function () {
    const zeilen = [csvZeile(['Klasse', 'Fach', 'Datum', 'Einheit', 'Kind', 'Kürzel', 'Fehlt', 'Kriterium', 'Wert', 'Art', 'Notiz zur Stunde'])];
    const faecher = M.faecher();
    M.klassen().forEach(function (klasse) {
      const kinder = M.kinderSortiert(klasse);
      NB.Auswertung.stunden(klasse.id, null).forEach(function (b) {
        const fach = faecher.find(f => f.id === b.fachId);
        const fachName = fach ? fach.name : b.fachId;
        kinder.forEach(function (kind) {
          const e = b.kinder ? b.kinder[kind.id] : null;
          if (!e) return;
          const noten = e.noten || {};
          const kritIds = Object.keys(noten);
          if (e.fehlt || !kritIds.length) {
            if (e.fehlt || (e.notiz && e.notiz.trim())) zeilen.push(csvZeile([klasse.name, fachName, H.datumKurz(b.datum), M.einheitText(b), kind.name || '', kind.kuerzel || '', e.fehlt ? 'ja' : '', '', '', '', e.notiz || '']));
            return;
          }
          kritIds.forEach(function (kritId) {
            const n = M.notenWert(e, kritId);
            if (!n) return;
            const krit = M.kriterium(kritId, fach);
            zeilen.push(csvZeile([klasse.name, fachName, H.datumKurz(b.datum), M.einheitText(b), kind.name || '', kind.kuerzel || '', '', krit ? krit.name : kritId, n.wert, M.ausgesetzt(b, kritId) ? 'ausgesetzt' : (n.art === 'uebernommen' ? 'übernommen' : 'gesetzt'), e.notiz || '']));
          });
        });
      });
    });
    return '\ufeff' + zeilen.join('\r\n');
  };

  /**
   * Auswertung: eine Zeile je Kind und Fach mit Gesamtwert (Fachleistung),
   * Notenvorschlag (leer in Stufe 1–2) und Arbeits- und Sozialverhalten (Ø).
   */
  X.csvAuswertung = async function () {
    if (!(await csvBestaetigen('Auswertung'))) return;
    await dateiAbgeben('notenblock-auswertung-' + datumFuerDatei() + '.csv', X.csvAuswertungText(), 'text/csv;charset=utf-8');
  };

  X.csvAuswertungText = function () {
    const zeilen = [csvZeile(['Klasse', 'Fach', 'Kind', 'Kürzel', 'Erfasste Stunden', 'Gefehlt', 'Gesamtwert', 'Notenvorschlag', 'Arbeits- und Sozialverhalten', 'Hinweis'])];
    M.klassen().forEach(function (klasse) {
      M.klassenFaecher(klasse, { mitStillgelegten: true }).forEach(function (fach) {
        if (!NB.Auswertung.stunden(klasse.id, fach.id).length) return;
        NB.Auswertung.klasse(klasse, fach).forEach(function (z) {
          zeilen.push(csvZeile([klasse.name, fach.name, z.kind.name || '', z.kind.kuerzel || '', z.anwesend, z.gefehlt, csvZahl(z.gesamt), z.vorschlag == null ? '' : csvZahl(z.vorschlag), csvZahl(z.verhalten), z.ohneNote ? 'wird nicht benotet' : '']));
        });
      });
    });
    return '\ufeff' + zeilen.join('\r\n');
  };

  return X;
})();
