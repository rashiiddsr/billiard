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
    process.env.INIT_CWD || '',
  ].filter(Boolean));

  const discovered = seeds.flatMap((seed) => collectParentEnvPaths(seed));

  const explicit = [
    process.env.ENV_FILE,
    process.env.DOTENV_PATH,
    join(process.cwd(), 'apps/api/.env'),
  ].filter((value): value is string => Boolean(value));

  return unique([...explicit, ...discovered]);
}

function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|-)\s*(.*)$/);
  if (!match) {
    return null;
  }

  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return [match[1], value];
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const values: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (!parsed) {
      continue;
    }
    const [key, value] = parsed;
    values[key] = value;
  }

  return values;
}

export function loadEnvFilesIntoProcessEnv(filePaths: string[] = getEnvFilePaths()): string[] {
  const loadedFrom: string[] = [];

  for (const envFilePath of filePaths) {
    const parsed = readEnvFile(envFilePath);
    const keys = Object.keys(parsed);
    if (!keys.length) {
      continue;
    }

    for (const key of keys) {
      if (!process.env[key] && parsed[key] !== undefined) {
        process.env[key] = parsed[key];
      }
    }

    loadedFrom.push(envFilePath);
  }

  return loadedFrom;
}

export function resolveEnvValue(key: string, filePaths: string[] = getEnvFilePaths()): string | undefined {
  const direct = process.env[key]?.trim();
  if (direct) {
    return direct;
  }

  for (const envFilePath of filePaths) {
    const value = readEnvFile(envFilePath)[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}
