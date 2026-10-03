import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;

  const text = fs.readFileSync(file, 'utf8');

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq < 1) continue;

    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(name in process.env)) {
      process.env[name] = value;
    }
  }
}

const root = process.cwd();

for (const file of [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local'
]) {
  loadEnvFile(path.join(root, file));
}

const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const candidateKeys = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_SERVICE_KEY,
  process.env.SUPABASE_SECRET_KEY
].filter(Boolean);

const key =
  candidateKeys.find((value) => value.startsWith('eyJ')) ||
  candidateKeys.find((value) => value.startsWith('sb_secret_')) ||
  candidateKeys[0];

if (!url) {
  throw new Error('URL do Supabase nao encontrada nos arquivos .env');
}

if (!key) {
  throw new Error('Chave administrativa do Supabase nao encontrada nos arquivos .env');
}

const isOpaqueSecret = key.startsWith('sb_secret_');

const safeFetch = async (input, init = {}) => {
  const inheritedHeaders =
    input instanceof Request ? input.headers : undefined;

  const headers = new Headers(inheritedHeaders);

  if (init.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((value, name) => headers.set(name, value));
  }

  // New Supabase sb_secret_* keys are opaque API keys, not JWTs.
  // Sending one as "Authorization: Bearer ..." makes Storage try to parse
  // it as a JWS/JWT and returns "Invalid Compact JWS".
  const auth = headers.get('authorization');

  if (
    isOpaqueSecret &&
    auth &&
    auth.trim() === `Bearer ${key}`
  ) {
    headers.delete('authorization');
  }

  return fetch(input, {
    ...init,
    headers
  });
};

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  global: {
    fetch: safeFetch
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

let totalRemoved = 0;

console.log(
  `Chave detectada: ${isOpaqueSecret ? 'sb_secret_* (nova)' : 'JWT service_role (legada)'}`
);

for (const bucket of buckets) {
  const files = await listAll(bucket);

  console.log(`\n${bucket}: ${files.length} arquivo(s)`);

  if (files.length === 0) {
    console.log('Ja esta vazio.');
    continue;
  }

  const chunkSize = 100;

  for (let i = 0; i < files.length; i += chunkSize) {
    const batch = files.slice(i, i + chunkSize);

    const { error } = await supabase.storage
      .from(bucket)
      .remove(batch);

    if (error) {
      throw new Error(
        `Falha ao limpar ${bucket}: ${error.message}`
      );
    }

    totalRemoved += batch.length;
  }

  const remaining = await listAll(bucket);

  if (remaining.length !== 0) {
    throw new Error(
      `${bucket} ainda possui ${remaining.length} arquivo(s) depois da limpeza`
    );
  }

  console.log(`OK: ${bucket} limpo.`);
}

console.log('\n===================================');
console.log(`STORAGE LIMPO: ${totalRemoved} arquivo(s) removido(s).`);
console.log('Os buckets foram mantidos.');
console.log('===================================');
