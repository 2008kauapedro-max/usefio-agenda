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
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const publishable =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

const password = process.env.FIO_STORAGE_CLEANUP_PASSWORD;

if (!url) {
  throw new Error('URL do Supabase nao encontrada nos arquivos .env');
}

if (!publishable) {
  throw new Error('Publishable/anon key nao encontrada nos arquivos .env');
}

if (!password) {
  throw new Error('Senha temporaria nao recebida');
}

const supabase = createClient(url, publishable, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const email = 'usefiooficial@gmail.com';

const { data: signIn, error: signInError } =
  await supabase.auth.signInWithPassword({
    email,
    password
  });

if (signInError || !signIn.user) {
  throw new Error(
    `Falha no login de ${email}: ${signInError?.message ?? 'usuario ausente'}`
  );
}

const { data: admin, error: adminError } = await supabase
  .from('platform_admins')
  .select('user_id,active')
  .eq('user_id', signIn.user.id)
  .eq('active', true)
  .maybeSingle();

if (adminError) {
  throw new Error(`Falha ao validar administrador: ${adminError.message}`);
}

if (!admin) {
  throw new Error('A conta autenticada nao e um administrador ativo do FIO');
}

console.log('Login administrativo confirmado.');
console.log(`Admin: ${email}`);

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

let removed = 0;

for (const bucket of buckets) {
  const files = await listAll(bucket);

  console.log(`\n${bucket}: ${files.length} arquivo(s)`);

  if (files.length === 0) {
    console.log('Ja esta vazio.');
    continue;
  }

  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);

    const { error } = await supabase.storage
      .from(bucket)
      .remove(batch);

    if (error) {
      throw new Error(`Falha limpando ${bucket}: ${error.message}`);
    }

    removed += batch.length;
  }

  const remaining = await listAll(bucket);

  if (remaining.length !== 0) {
    throw new Error(
      `${bucket} ainda possui ${remaining.length} arquivo(s) depois da remocao`
    );
  }

  console.log(`OK: ${bucket} vazio.`);
}

await supabase.auth.signOut();

console.log('\n======================================');
console.log(`STORAGE LIMPO: ${removed} arquivo(s) removido(s).`);
console.log('Buckets mantidos.');
console.log('Migracoes locais sincronizadas.');
console.log('======================================');
