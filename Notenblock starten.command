#!/bin/bash
# Startet einen kleinen lokalen Webserver für Notenblock und öffnet die App im Browser.
# Doppelklick genügt. Das Terminalfenster geöffnet lassen, solange die App benutzt wird.
cd "$(dirname "$0")"
PORT=8765
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 wurde nicht gefunden. macOS bietet beim ersten Aufruf an, die Befehlszeilen-Werkzeuge zu installieren."
  echo "Bitte diese Installation bestätigen und das Skript danach erneut starten."
  read -r -p "Enter zum Schließen …"
  exit 1
fi
echo "Notenblock läuft unter http://localhost:$PORT"
echo "Immer genau diese Adresse verwenden – die Daten sind an sie gebunden."
echo "Zum Beenden dieses Fenster schließen (oder Strg+C)."
(sleep 1; open "http://localhost:$PORT/") &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
