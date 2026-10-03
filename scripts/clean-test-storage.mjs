import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;

  const text = fs.readFileSync(file, 'utf8');

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index < 1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const root = process.cwd();

for (const name of [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local'
]) {
  loadEnvFile(path.join(root, name));
}

const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!url) {
  throw new Error('URL do Supabase nao encontrada nos arquivos .env');
}

if (!key) {
  throw new Error('Service Role Key do Supabase nao encontrada nos arquivos .env');
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const buckets = [
  'branding-assets',
  'feed-posts',
  'profile-avatars'
];

async function listAll(bucket, prefix = '') {
  const result = [];

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, {
      limit: 1000,
      offset: 0,
      sortBy: {
        column: 'name',
        order: 'asc'
      }
    });

  if (error) {
    throw new Error(`${bucket}/${prefix}: ${error.message}`);
  }

  for (const item of data ?? []) {
    const itemPath = prefix
      ? `${prefix}/${item.name}`
      : item.name;

    if (item.id) {
      result.push(itemPath);
    } else {
      result.push(...await listAll(bucket, itemPath));
    }
  }

  return result;
}

for (const bucket of buckets) {
  const files = await listAll(bucket);

  console.log(`\n${bucket}: ${files.length} arquivo(s)`);

  if (files.length === 0) {
    console.log('Ja esta vazio.');
    continue;
  }

  for (const file of files) {
    console.log(` - ${file}`);
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .remove(files);

  if (error) {
    throw new Error(`Falha ao limpar ${bucket}: ${error.message}`);
  }

  console.log(`OK: ${bucket} limpo.`);
}

console.log('\n===================================');
console.log('STORAGE LIMPO COM SUCESSO.');
console.log('Os buckets foram mantidos.');
console.log('===================================');
