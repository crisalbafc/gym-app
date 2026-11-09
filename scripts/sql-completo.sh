#!/usr/bin/env bash
# Junta todos los archivos SQL en uno solo para instalar GymLog en un proyecto
# de Supabase nuevo. Uso: bash scripts/sql-completo.sh <URL_DEL_PROYECTO> <CRON_SECRET> > salida.sql
set -e
URL="${1:?Falta la URL del proyecto}"
SECRET="${2:?Falta el CRON_SECRET}"
cd "$(dirname "$0")/../supabase"
echo "-- GymLog: instalación completa (generado $(date '+%Y-%m-%d'))"
for f in schema.sql 0*.sql; do
  echo; echo "-- ===================== $f ====================="
  sed -e "s#https://gzlgzoueqrrfxmviiomw.supabase.co#${URL}#g" -e "s#CAMBIA_ESTE_SECRETO#${SECRET}#g" "$f"
done
