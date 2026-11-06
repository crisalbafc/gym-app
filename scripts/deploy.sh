#!/usr/bin/env bash
# Publica la app en GitHub Pages (rama gh-pages). Uso: npm run deploy
set -e
npm run build
cd dist
touch .nojekyll
git init -q -b gh-pages
git add -A
git -c user.name="crisalbafc" -c user.email="342114004+crisalbafc@users.noreply.github.com" commit -q -m "Publicar $(date '+%Y-%m-%d %H:%M')"
git push -f https://github.com/crisalbafc/gym-app.git gh-pages
rm -rf .git
echo "Publicada en https://crisalbafc.github.io/gym-app/"
