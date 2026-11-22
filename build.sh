#!/usr/bin/env bash
# Crée dist/<nom>-<version>.zip, prêt à envoyer au Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")"
name=$(basename "$PWD")
version=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
mkdir -p dist
out="dist/$name-$version.zip"
rm -f "$out"
zip -qr "$out" manifest.json content.js $( [ -f content.css ] && echo content.css ) $( [ -f popup.html ] && echo popup.html popup.js ) icons
echo "$out"
