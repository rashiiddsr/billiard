#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const outArg = process.argv[2] || './certs/qz';
const outDir = resolve(process.cwd(), outArg);
const days = process.env.QZ_CERT_DAYS || '3650';
const cn = process.env.QZ_CERT_CN || 'Billiard POS QZ Signing';

const keyFile = resolve(outDir, 'qz-private-key.pem');
const certFile = resolve(outDir, 'qz-certificate.pem');

mkdirSync(dirname(keyFile), { recursive: true });

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(`❌ Command not found: ${command}. Please install OpenSSL and ensure it is in PATH.`);
      process.exit(1);
    }
    console.error(`❌ Failed to run ${command}:`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`❌ ${command} failed with code ${result.status}`);
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(result.status ?? 1);
  }
};

run('openssl', ['genrsa', '-out', keyFile, '2048']);
run('openssl', ['req', '-new', '-x509', '-key', keyFile, '-out', certFile, '-days', String(days), '-subj', `/CN=${cn}`]);

const escapeMultiline = (filepath) => readFileSync(filepath, 'utf8').replace(/\r\n/g, '\n').trimEnd().replace(/\n/g, '\\n');
const escapedCert = escapeMultiline(certFile);
const escapedKey = escapeMultiline(keyFile);
const apiKey = randomBytes(24).toString('hex');

console.log('✅ Generated QZ certificate pair:');
console.log(`- Private key : ${keyFile}`);
console.log(`- Certificate : ${certFile}`);
console.log('');
console.log('Copy these values into apps/api/.env:');
console.log(`QZ_CERTIFICATE="${escapedCert}"`);
console.log(`QZ_PRIVATE_KEY="${escapedKey}"`);
console.log(`QZ_SIGN_API_KEY="${apiKey}"`);
