/*
 * Notenblock – Notfall-Wächter
 *
 * Wird als erstes Skript geladen und braucht keine anderen Dateien. Sammelt
 * Fehler, die schon beim Laden der übrigen Skripte auftreten, und ersetzt den
 * Ladebildschirm nach wenigen Sekunden durch eine lesbare Meldung, falls die
 * App bis dahin nicht gestartet ist. So endet kein Startfehler als weiße Seite.
 */
'use strict';
(function () {
  var fehlerListe = [];

  window.addEventListener('error', function (ereignis) {
    var text = ereignis.message || (ereignis.error && ereignis.error.message) || 'Unbekannter Fehler';
    if (ereignis.filename) text += ' (' + ereignis.filename.split('/').pop() + ':' + ereignis.lineno + ')';
    if (ereignis.target && ereignis.target.tagName === 'SCRIPT' && ereignis.target.src) {
      text = 'Skript konnte nicht geladen werden: ' + ereignis.target.src.split('/').pop();
    }
    fehlerListe.push(text);
  }, true);

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var laden = document.getElementById('bildschirm-laden');
      if (!laden || laden.hidden) return; // App ist gestartet
      var fehler = document.getElementById('bildschirm-fehler');
      var text = document.getElementById('fehler-text');
      var hinweis = document.getElementById('fehler-hinweis');
      if (fehler && text) {
        text.textContent = fehlerListe.length
          ? 'Beim Laden ist ein Fehler aufgetreten: ' + fehlerListe.join(' · ')
          : 'Der Start dauert ungewöhnlich lange oder ist stehen geblieben.';
        if (hinweis) hinweis.textContent = 'Bitte die Seite neu laden. Bleibt der Fehler, hilft ein Neustart des Browsers.';
        laden.hidden = true;
        fehler.hidden = false;
        var knopf = document.getElementById('fehler-erneut');
        if (knopf) knopf.onclick = function () { location.reload(); };
      } else {
        laden.textContent = 'Notenblock konnte nicht starten. Bitte die Seite neu laden.';
      }
    }, 6000);
  });
})();
