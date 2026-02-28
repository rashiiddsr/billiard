#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-./certs/qz}"
DAYS="${QZ_CERT_DAYS:-3650}"
CN="${QZ_CERT_CN:-Billiard POS QZ Signing}"

mkdir -p "$OUT_DIR"

KEY_FILE="$OUT_DIR/qz-private-key.pem"
CERT_FILE="$OUT_DIR/qz-certificate.pem"

openssl genrsa -out "$KEY_FILE" 2048 >/dev/null 2>&1
openssl req -new -x509 -key "$KEY_FILE" -out "$CERT_FILE" -days "$DAYS" -subj "/CN=$CN" >/dev/null 2>&1

escape_multiline() {
  python - "$1" <<'PY'
from pathlib import Path
import sys
content = Path(sys.argv[1]).read_text().replace('\r\n', '\n').rstrip('\n')
print(content.replace('\n', '\\n'))
PY
}

ESCAPED_CERT="$(escape_multiline "$CERT_FILE")"
ESCAPED_KEY="$(escape_multiline "$KEY_FILE")"

cat <<EOT
✅ Generated QZ certificate pair:
- Private key : $KEY_FILE
- Certificate : $CERT_FILE

Copy these values into apps/api/.env:
QZ_CERTIFICATE="$ESCAPED_CERT"
QZ_PRIVATE_KEY="$ESCAPED_KEY"
QZ_SIGN_API_KEY="$(openssl rand -hex 24)"
EOT
