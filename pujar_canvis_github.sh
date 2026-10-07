#!/bin/bash
set -e

REPO_URL="https://github.com/Klemen-t/bjcp-game.git"
SOURCE="$HOME/Escriptori/asincron/bjcp-game"
DEST="$HOME/bjcp-game-git"

echo "==> Clonant el repositori..."
rm -rf "$DEST"
git clone "$REPO_URL" "$DEST"

echo "==> Copiant els arxius..."
rsync -av --exclude='.git' "$SOURCE/" "$DEST/"

cd "$DEST"

echo "==> Estat dels canvis:"
git status

echo "==> Afegint els arxius..."
git add .

echo "==> Creant commit..."
git commit -m "Update bjcp-game" || {
    echo "No hi ha canvis nous per fer commit."
    exit 0
}

echo "==> Pujant a GitHub..."
git push origin HEAD

echo "==> Fet!"
