#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const outArg = process.argv[2] || './certs/qz';
const outDir = resolve(process.cwd(), outArg);
const days = process.env.QZ_CERT_DAYS || '3650';
const cn = process.env.QZ_CERT_CN || 'Billiard POS QZ Signing';
const forceSimple = process.argv.includes('--simple') || process.env.QZ_SIMPLE_CERT === 'true';

const keyFile = resolve(outDir, 'qz-private-key.pem');
const certFile = resolve(outDir, 'qz-certificate.pem');

mkdirSync(dirname(keyFile), { recursive: true });

const SIMPLE_CERT = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUAg7fSAysdCwOTkp6THBSWG3GkNEwDQYJKoZIhvcNAQEL
BQAwIjEgMB4GA1UEAwwXQmlsbGlhcmQgUE9TIFFaIFNpZ25pbmcwHhcNMjYwMjI4
MTgzNTE1WhcNMzYwMjI2MTgzNTE1WjAiMSAwHgYDVQQDDBdCaWxsaWFyZCBQT1Mg
UVogU2lnbmluZzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANq0PqZt
VnAHK4kDIXZGX4dyenv+rHSuQehDcObxN6tb3EqFExEbKDEWSYRhJAgf0Sl002Gm
ll1IlfULwVcEAhm845pQGSt9Sc8i/cZ4S67h2/gLohQZmVMLLnAAYsL2AWJ4RC9W
O1VVWUYZHZkWagLUVk7SZIpzdTaFTRX5FfK0JzKpIVq5gyHEaYi6B+TLBG4pjj5K
h8vWpGvpqLrx9aEjdqkR2zmUflmBc/uVyckD0v5Ns/KUTXYQ8fR+IhD7cyQNa0Th
sQCobdZxAKMsedhVIZQl2Scc7706+QpSeE750sR6/FnVrOEyxqsXmJTYYGAdJyCQ
EdoPPFi+N4p/RJkCAwEAAaNTMFEwHQYDVR0OBBYEFCse3feGrt7wzAiUfSROoLQz
zlbiMB8GA1UdIwQYMBaAFCse3feGrt7wzAiUfSROoLQzzlbiMA8GA1UdEwEB/wQF
MAMBAf8wDQYJKoZIhvcNAQELBQADggEBAHgCFEGODeKBkQz6pnxzieOr/UovzwyT
6AahwbJVss6zKo5r9neRzHszMVNVo/kCrEYp8BLDwkv3AbujM8S9ettQT2LA52tZ
N7WmGjZwxH7z4kZzBShXRLEvjQZqYDiYqJiJ02jAB0XApA7MKBb670g4Y7oM5ufW
E0Ytk3liwVsTHgUAxn8v63HLSSNKD76ALLKCHxNybkkCqVwqKJLWdmgqru5s74sG
fIjWoKCTmCGv04V5/51TfYGV4w952nCso2VUbAQ5GhyCH4+HfnPN5WWmy0FJBrFv
kkqRUdXMIcy0OInoEdL+nqu6Ya3BkqbTYffdDB9beMYXXxTX/PJxVZ4=
-----END CERTIFICATE-----`;

const SIMPLE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDatD6mbVZwByuJ
AyF2Rl+Hcnp7/qx0rkHoQ3Dm8TerW9xKhRMRGygxFkmEYSQIH9EpdNNhppZdSJX1
C8FXBAIZvOOaUBkrfUnPIv3GeEuu4dv4C6IUGZlTCy5wAGLC9gFieEQvVjtVVVlG
GR2ZFmoC1FZO0mSKc3U2hU0V+RXytCcyqSFauYMhxGmIugfkywRuKY4+SofL1qRr
6ai68fWhI3apEds5lH5ZgXP7lcnJA9L+TbPylE12EPH0fiIQ+3MkDWtE4bEAqG3W
cQCjLHnYVSGUJdknHO+9OvkKUnhO+dLEevxZ1azhMsarF5iU2GBgHScgkBHaDzxY
vjeKf0SZAgMBAAECggEACecidRe7U7xHYN9W6wuZtMDewfGQroHbcyBmotZmTmiM
64TmDZ68rahUMN3TK1kBeA6VqbTI1zV7sMpU+VMxoye16J1a3mjAaFQtyIhW6PbK
JoukTaOxGR0G/8RMtIY+Hs7SS5BshFsmfTGS8QUeTL1/oPcO3WQH+S2FBYsvTrt7
GJahXBdG+Zo+pehHCBi04e06Zbjc4EkuOXnGwZgzwfZxcJv5b2iwbbFAkIron75y
qrlNlAGifTjCt8UnZ7wWRmEEJVhic1mosOiDRbSYwaUNSzIpml+s+dvsm1ju0EPG
Ax4v+R24CZr6dppc0JHFHu4YK6Ra5cUqoHPffFxCAQKBgQD70pKGq9nNnmZ7XWXJ
kNpEKeiFmpSbEJZaZW9yCkEsbsu70bbrFirvEbqz/Ec0Sm3ZYnzmAvmh+CsHyDI+
HlHrZhro81Er++lpXM+x7UXMjMoakLI7MWF3D+B9OGv5b/bB3kuFacCyFOqquBCf
14YqyeRncBhFI6Ej8xuLnbT2GQKBgQDeVQbHTsJ1YiKDZkyzRmA2AsRkTa3Zp0Z0
2AWlS/n0L93ihRsupkUgImgik3lx2khMaTjcUOVg1tylajRpEaIRNntI4ErKJFqZ
G+HoE3hM6btXvSWl78F6374VOVUItc/Bf7mdYxqH3HSeE9L1jbGl+gPbnqbE5QJb
B1g6Sj2SgQKBgQC4duScv+/5HipF/gGc6H3qZqSMkdJ/0GPC7gD4EajyKmsVNyb+
CCwFGgCg7ZEfLdJP5kRFnTJNwmOK/MxJEp7Bh/b4Y5w3Uv4FD1aZKIzzrMIzOYFF
uQODWt7/+z+k5a5lDzhVD0V3bbkEu3Z6ED+YwnGMj+FHbDUTB3dLC4hOqQKBgBY6
OetDHH3PydOJLrHdn1DHBgthGLhh2NFlp2rXJa4b+vrig80uIksMJY0PYVzYjdHV
0zFzhPshf/2pmIPIl4NRBxJKGjALYmNcPkGNcMF/vJMQ/eqRBa7bH43PpYixZIvb
0RrDBav/hkkngje6asBFNo2GVvXoT0v6d/+b3HwBAoGBAIar7xXNnpJ1npK+PsxN
hTI+liD2sfUQf8eqxlzvS+KqTsWxvhGIVy+lmZ1eEi5phgeIivim8vYj4WGudfZi
Wd9U+e0/3eTMsdvxHPtc622vlvhTxAkwuLmoMNzwuvE4IdmSmAAL/bt8xI5rXHl0
Iaw9tsIuRQ+hc7hRkDIl9POt
-----END PRIVATE KEY-----`;

const tryRunOpenSsl = () => {
  const run = (command, args) => {
    const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
    if (result.error || result.status !== 0) {
      return false;
    }
    return true;
  };

  const okKey = run('openssl', ['genrsa', '-out', keyFile, '2048']);
  if (!okKey) return false;
  const okCert = run('openssl', ['req', '-new', '-x509', '-key', keyFile, '-out', certFile, '-days', String(days), '-subj', `/CN=${cn}`]);
  return okCert;
};

let usingSimple = forceSimple;
if (!usingSimple) {
  const ok = tryRunOpenSsl();
  if (!ok) usingSimple = true;
}

if (usingSimple) {
  writeFileSync(keyFile, SIMPLE_KEY, 'utf8');
  writeFileSync(certFile, SIMPLE_CERT, 'utf8');
}

const escapeMultiline = (filepath) => readFileSync(filepath, 'utf8').replace(/\r\n/g, '\n').trimEnd().replace(/\n/g, '\\n');
const escapedCert = escapeMultiline(certFile);
const escapedKey = escapeMultiline(keyFile);
const apiKey = randomBytes(24).toString('hex');

if (usingSimple) {
  console.log('⚠️ OpenSSL tidak ditemukan / mode simple aktif. Menggunakan default demo certificate bawaan.');
  console.log('   Ini memudahkan setup cepat. Untuk produksi, disarankan generate sertifikat unik (install OpenSSL).');
  console.log('');
}

console.log('✅ Generated QZ certificate pair:');
console.log(`- Private key : ${keyFile}`);
console.log(`- Certificate : ${certFile}`);
console.log('');
console.log('Copy these values into apps/api/.env:');
console.log(`QZ_CERTIFICATE="${escapedCert}"`);
console.log(`QZ_PRIVATE_KEY="${escapedKey}"`);
console.log(`QZ_SIGN_API_KEY="${apiKey}"`);
