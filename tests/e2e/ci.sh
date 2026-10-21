#!/usr/bin/env bash
# Las tres baterías de punta a punta (verificar, regresiones e integridad) contra la app ya compilada (next build), cada
# una con su base de datos vacía. Todo simulado y local: Redis (tests/apoyo/upstash-mem.mjs), Stripe, correo e IA
# (tests/e2e/*-local.py). Nunca contra la app de verdad. Lo usa .github/workflows/e2e.yml; en local:
#   npx next build && bash tests/e2e/ci.sh            (APP_PORT y REDIS_PORT cambian los puertos de la app y de Redis)
set -uo pipefail
cd "$(dirname "$0")/../.."

APP_PORT=${APP_PORT:-3001}
REDIS_PORT=${REDIS_PORT:-8079}
BASE="http://localhost:${APP_PORT}"
REDIS="http://127.0.0.1:${REDIS_PORT}"
fallos=0
pids=()

esperar() { for _ in $(seq 1 60); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; echo "No responde: $1"; return 1; }
parar() { for p in ${pids[@]+"${pids[@]}"}; do kill "$p" 2>/dev/null; done; for p in ${pids[@]+"${pids[@]}"}; do wait "$p" 2>/dev/null; done; pids=(); }
trap 'parar; kill $(jobs -p) 2>/dev/null' EXIT

# Stripe (8077), correo (8078) e IA (8076) simulados: si ya están en marcha (otra sesión local), se reutilizan.
for s in stripe:8077 resend:8078 ia:8076; do
  curl -s -o /dev/null "http://127.0.0.1:${s#*:}" || { python3 "tests/e2e/${s%%:*}-local.py" & }
done

# Una batería: base vacía, la app con el entorno que pide y el script con el suyo.
bateria() {
  local nombre=$1 entorno_app=$2 entorno_script=$3 script=$4
  echo "::group::${nombre}"
  node tests/apoyo/upstash-mem.mjs "${REDIS_PORT}" & pids+=($!)
  esperar "${REDIS}" || { fallos=$((fallos + 1)); parar; echo "::endgroup::"; return; }
  : > /tmp/resend.json
  env KV_REST_API_URL="${REDIS}" KV_REST_API_TOKEN=x HIBP=off ${entorno_app} npx next start -p "${APP_PORT}" > "/tmp/e2e-app-${nombre}.log" 2>&1 & pids+=($!)
  if esperar "${BASE}/login"; then
    env BASE="${BASE}" KV_REST_API_URL="${REDIS}" KV_REST_API_TOKEN=x UPSTASH="${REDIS}" ${entorno_script} node "${script}" || fallos=$((fallos + 1))
  else
    fallos=$((fallos + 1)); tail -50 "/tmp/e2e-app-${nombre}.log"
  fi
  parar
  echo "::endgroup::"
}

COMUN="RESEND_API_KEY=x RESEND_URL=http://127.0.0.1:8078/emails STRIPE_SECRET_KEY=sk_test_local STRIPE_URL=http://127.0.0.1:8077 STRIPE_WEBHOOK_SECRET=whsec_pruebas_local CRON_SECRET=cron-pruebas ANTHROPIC_API_KEY=x ANTHROPIC_URL=http://127.0.0.1:8076/v1/messages"
bateria verificar "${COMUN}" "CRON_SECRET=cron-pruebas RESEND_URL=http://127.0.0.1:8078/emails STRIPE_WEBHOOK_SECRET=whsec_pruebas_local" tests/e2e/verificar.mjs
bateria regresiones "${COMUN}" "STRIPE_WEBHOOK_SECRET=whsec_pruebas_local" tests/e2e/regresiones.mjs
bateria integridad "${COMUN} VERIFICAR_EMAIL=off BLOQUEO_SERVIDOR=activo" "STRIPE_WEBHOOK_SECRET=whsec_pruebas_local" tests/e2e/integridad.mjs

if [ "${fallos}" -gt 0 ]; then echo "${fallos} baterías con fallos"; exit 1; fi
echo "Las tres baterías e2e, en verde"
