#!/bin/bash
# Despliega los templates de email de Supabase Auth para Vinanzas.
#
# Uso:
#   SUPABASE_ACCESS_TOKEN=xxx bash supabase/deploy-emails.sh
#
# El PAT (personal access token) se pasa por variable de entorno.
# Ejecutar desde la raiz del repo (mis-finanzas/).
set -e

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "Error: falta la variable SUPABASE_ACCESS_TOKEN."
  echo "Uso: SUPABASE_ACCESS_TOKEN=xxx bash supabase/deploy-emails.sh"
  exit 1
fi

CONF_FILE="supabase/email-templates/confirmation.html"
RECOV_FILE="supabase/email-templates/recovery.html"

if [ ! -f "$CONF_FILE" ] || [ ! -f "$RECOV_FILE" ]; then
  echo "Error: no se encontraron los templates. Ejecuta este script desde la raiz del repo."
  exit 1
fi

# El payload completo se construye con python3 para que las tildes de los
# subjects y del HTML se escapen como Unicode seguro (\uXXXX) y no dependan
# de la codificacion de la terminal ni del heredoc de bash.
PAYLOAD=$(python3 - "$CONF_FILE" "$RECOV_FILE" <<'PYEOF'
import json, sys

conf_file, recov_file = sys.argv[1], sys.argv[2]

with open(conf_file, encoding="utf-8") as f:
    conf = f.read()
with open(recov_file, encoding="utf-8") as f:
    recov = f.read()

payload = {
    "mailer_subjects_confirmation": "Confirmá tu cuenta en Vinanzas",
    "mailer_templates_confirmation_content": conf,
    "mailer_subjects_recovery": "Recuperá tu contraseña de Vinanzas",
    "mailer_templates_recovery_content": recov,
}

print(json.dumps(payload, ensure_ascii=True))
PYEOF
)

curl -s -X PATCH "https://api.supabase.com/v1/projects/qvoyhnapwqqnwakauevd/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF
$PAYLOAD
EOF

echo ""
echo "Templates desplegados."
