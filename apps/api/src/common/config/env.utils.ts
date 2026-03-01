import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

const MAX_PARENT_DEPTH = 6;

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function collectParentEnvPaths(start: string): string[] {
  const paths: string[] = [];
  let current = resolve(start);

  for (let depth = 0; depth <= MAX_PARENT_DEPTH; depth += 1) {
    paths.push(join(current, '.env'));
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return paths;
}

export function getEnvFilePaths(): string[] {
  const seeds = unique([
    process.cwd(),
    __dirname,
    dirname(__dirname),
    dirname(dirname(__dirname)),
    process.env.PWD || '',
  ].filter(Boolean));

  const discovered = seeds.flatMap((seed) => collectParentEnvPaths(seed));

  const explicit = [
    process.env.ENV_FILE,
    process.env.DOTENV_PATH,
    join(process.cwd(), 'apps/api/.env'),
  ].filter((value): value is string => Boolean(value));

  return unique([...explicit, ...discovered]);
}

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

  const raw = readFileSync(envFilePath, 'utf8');
  const content = raw.replace(/^\uFEFF/, '');
  const keyPattern = escapeRegExp(key);

  // Supports:
  // 1) KEY=value
  // 2) KEY = value
  // 3) KEY-"value" (common typo seen in production)
  const match = content.match(new RegExp(`^\\s*${keyPattern}\\s*(?:=|-)\\s*(.+)\\s*$`, 'm'));
  if (!match) {
    return undefined;
  }

  const normalized = parseQuotedValue(match[1]);
  return normalized || undefined;
}

export function resolveEnvValue(key: string, filePaths: string[] = getEnvFilePaths()): string | undefined {
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
