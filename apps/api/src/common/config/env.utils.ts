import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DEFAULT_ENV_FILE_PATHS = [
  join(process.cwd(), '.env'),
  join(process.cwd(), 'apps/api/.env'),
  join(__dirname, '../../../.env'),
  join(__dirname, '../../../../.env'),
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseQuotedValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readValueFromEnvFile(key: string, envFilePath: string): string | undefined {
  if (!existsSync(envFilePath)) {
    return undefined;
  }

  const content = readFileSync(envFilePath, 'utf8');
  const keyPattern = escapeRegExp(key);

  // Supports canonical syntax KEY=value and a common typo KEY-"value".
  const match = content.match(new RegExp(`^\\s*${keyPattern}\\s*[=-]\\s*(.+)\\s*$`, 'm'));
  if (!match) {
    return undefined;
  }

  const normalized = parseQuotedValue(match[1]);
  return normalized || undefined;
}

export function resolveEnvValue(key: string, filePaths: string[] = DEFAULT_ENV_FILE_PATHS): string | undefined {
  const direct = process.env[key]?.trim();
  if (direct) {
    return direct;
  }

  for (const envFilePath of filePaths) {
    const fileValue = readValueFromEnvFile(key, envFilePath);
    if (fileValue) {
      return fileValue;
    }
  }

  return undefined;
}

export function getEnvFilePaths(): string[] {
  return [...DEFAULT_ENV_FILE_PATHS];
}
