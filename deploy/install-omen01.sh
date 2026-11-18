#!/usr/bin/env bash
# One-shot install on the home server (run as the normal user; sudo asked once for apt).
#   bash deploy/install-omen01.sh
set -euo pipefail
cd "$HOME"
if ! command -v pdftoppm >/dev/null || ! command -v convert >/dev/null; then
  sudo apt-get install -y poppler-utils imagemagick libheif-examples
fi
if [ ! -d "$HOME/healthfile/.git" ]; then
  git clone https://github.com/cloudeeo/healthfile "$HOME/healthfile"
else
  git -C "$HOME/healthfile" pull --ff-only
fi
mkdir -p "$HOME/.config/systemd/user" "$HOME/.local/share/healthfile"
chmod 700 "$HOME/.local/share/healthfile"
# systemd user units do not load nvm's PATH: write the absolute path of node into the unit
NODE_BIN="$(command -v node)"
[ -n "$NODE_BIN" ] || { echo "node not found in PATH"; exit 1; }
sed "s|^ExecStart=.*|ExecStart=$NODE_BIN src/server.js|" "$HOME/healthfile/deploy/healthfile.service" > "$HOME/.config/systemd/user/healthfile.service"
systemctl --user daemon-reload
systemctl --user enable healthfile
systemctl --user restart healthfile
sleep 3
systemctl --user --no-pager status healthfile | head -5
curl -s http://127.0.0.1:8096/api/status | head -c 300 || echo "not answering yet: journalctl --user -u healthfile -n 20"
echo
# publish on the tailnet, HTTPS on port 8443, next to the dashboard
tailscale serve --bg --https=8443 http://127.0.0.1:8096
echo "Open https://<this machine's tailnet name>:8443/ from any device on the tailnet."
