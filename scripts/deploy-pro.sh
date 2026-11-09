#!/usr/bin/env bash
# Publica la edición PRO (para gimnasios) de GymLog en https://crisalbafc.github.io/gymlog/
# Usa .env.pro (base de datos de negocio). Uso: npm run deploy:pro
set -e
node scripts/make-icons.mjs
npx tsc -b
npx vite build --mode pro --outDir dist-pro
cd dist-pro
touch .nojekyll
git init -q -b gh-pages
git add -A
git -c user.name="crisalbafc" -c user.email="342114004+crisalbafc@users.noreply.github.com" commit -q -m "Publicar $(date '+%Y-%m-%d %H:%M')"
git push -f https://github.com/crisalbafc/gymlog.git gh-pages
cd .. && rm -rf dist-pro
echo "Publicada en https://crisalbafc.github.io/gymlog/"
