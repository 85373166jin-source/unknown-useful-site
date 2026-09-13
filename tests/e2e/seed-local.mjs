import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');
const apiDir = path.join(root, 'apps', 'api');
const wranglerCandidates = [
  path.join(apiDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
];
const wranglerBin = wranglerCandidates.find((candidate) => fs.existsSync(candidate));
if (!wranglerBin) throw new Error('wrangler executable was not found under apps/api or the repository root');
const workDir = path.join(root, 'work');
const configHome = path.join(workDir, '.config');
const seedSqlPath = path.join(workDir, 'e2e-seed.sql');

const encoder = new TextEncoder();
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64Url(bytes) {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += ALPHABET[first >> 2];
    result += ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      result += ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) {
      result += ALPHABET[third & 0x3f];
    }
  }
  return result;
}

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    keyMaterial,
    256
  );
  return `pbkdf2-sha256$100000$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

function runWrangler(args, cwd = apiDir) {
  execFileSync(process.execPath, [wranglerBin, ...args], {
    cwd,
    env: { ...process.env, XDG_CONFIG_HOME: configHome },
    stdio: 'inherit'
  });
}

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildSeedSql(superHash, anbuHash, adminHash) {
  const now = Date.now();
  const lines = [];

  const insertProduct = (
    id,
    title,
    priceYuan,
    status,
    categoryId,
    sortOrder,
    description,
    priceCents = priceYuan * 100,
    productType = 'course'
  ) => {
    lines.push(
      `INSERT INTO products (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at) VALUES (${sqlQuote(id)}, ${sqlQuote(title)}, ${priceYuan}, ${priceCents}, ${sqlQuote(productType)}, ${sqlQuote(status)}, ${sqlQuote(categoryId)}, ${sortOrder}, ${sqlQuote(description)}, ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET title = excluded.title, price_yuan = excluded.price_yuan, price_cents = excluded.price_cents, product_type = excluded.product_type, status = excluded.status, category_id = excluded.category_id, sort_order = excluded.sort_order, description = excluded.description, updated_at = excluded.updated_at;`
    );
  };
  insertProduct('super', '超影课程', 29, 'active', 'courses', 1, '9 个视频、在线播放、下载、进度同步');
  insertProduct('bundle', '火影合集', 49, 'presale', 'courses', 2, '超影课程权益加暗部课程权益');
  insertProduct('anbu', '暗部课程', 29, 'coming_soon', 'courses', 3, '素材到位后配置视频与课程密码');
  insertProduct('vip_monthly', 'VIP 会员', 10, 'active', 'memberships', 4, 'VIP 会员 30 天', 990, 'membership');
  insertProduct('svip_monthly', 'SVIP 豪华会员', 20, 'active', 'memberships', 5, 'SVIP 豪华会员 30 天', 1990, 'membership');
  lines.push(
    `INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at) VALUES ('super', '超影课程', 'active', ${sqlQuote(superHash)}, ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status, course_password_hash = excluded.course_password_hash, updated_at = excluded.updated_at;`
  );
  lines.push(
    `INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at) VALUES ('anbu', '暗部课程', 'coming_soon', ${sqlQuote(anbuHash)}, ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status, course_password_hash = excluded.course_password_hash, updated_at = excluded.updated_at;`
  );

  for (let order = 1; order <= 9; order += 1) {
    const padded = String(order).padStart(2, '0');
    lines.push(
      `INSERT INTO lessons (id, series_id, title, media_path, sort_order, created_at, updated_at) VALUES (${sqlQuote(`super-${padded}`)}, 'super', ${sqlQuote(`第 ${order} 课`)}, ${sqlQuote(`/media/super-shadow/${order}.mp4`)}, ${order}, ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET series_id = excluded.series_id, title = excluded.title, media_path = excluded.media_path, sort_order = excluded.sort_order, updated_at = excluded.updated_at;`
    );
  }

  for (const child of ['super', 'anbu']) {
    lines.push(
      `INSERT INTO product_components (parent_product_id, child_product_id, created_at, updated_at) VALUES ('bundle', '${child}', ${now}, ${now}) ON CONFLICT(parent_product_id, child_product_id) DO UPDATE SET updated_at = excluded.updated_at;`
    );
  }

  lines.push(
    `INSERT INTO users (id, username, password_hash, role, permission_role, status, created_at, updated_at) VALUES ('admin', 'admin', ${sqlQuote(adminHash)}, 'admin', 'owner', 'active', ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash, role = excluded.role, permission_role = excluded.permission_role, status = excluded.status, updated_at = excluded.updated_at;`
  );

  return lines.join('\n');
}

fs.mkdirSync(workDir, { recursive: true });
fs.mkdirSync(configHome, { recursive: true });

const stateDir = path.join(apiDir, '.wrangler', 'state');
fs.rmSync(stateDir, { recursive: true, force: true });

runWrangler(['d1', 'migrations', 'apply', 'DB', '--local']);

const [superHash, anbuHash, adminHash] = await Promise.all([
  hashPassword('super-course-password'),
  hashPassword('anbu-course-password'),
  hashPassword('admin-password-123')
]);

fs.writeFileSync(seedSqlPath, buildSeedSql(superHash, anbuHash, adminHash), 'utf8');
runWrangler(['d1', 'execute', 'DB', '--local', '--file', seedSqlPath]);
console.log('Local D1 migrations and E2E seed completed.');
