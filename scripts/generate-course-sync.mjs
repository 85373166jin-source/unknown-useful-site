import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(repoRoot, 'work', 'course-sync.sql');
const releaseBase =
  'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920';
const products = [
  ['super', '超影课程', 29, 2900, 'course', 'active', 'courses', 1, '18 个视频、封面选集、在线播放、单课评论与下载'],
  ['bundle', '火影合集', 49, 4900, 'course', 'presale', 'courses', 2, '超影课程 18 节加暗部课程 31 节'],
  ['anbu', '暗部课程', 29, 2900, 'course', 'active', 'courses', 3, '31 个视频、封面选集、在线播放、单课评论与下载']
];

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const now = Date.now();
const lines = [];
for (const [id, title, priceYuan, priceCents, productType, status, categoryId, sortOrder, description] of products) {
  lines.push(`INSERT INTO products (id, title, price_yuan, price_cents, product_type, status, category_id, sort_order, description, created_at, updated_at) VALUES (${quote(id)}, ${quote(title)}, ${priceYuan}, ${priceCents}, ${quote(productType)}, ${quote(status)}, ${quote(categoryId)}, ${sortOrder}, ${quote(description)}, ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET title=excluded.title, price_yuan=excluded.price_yuan, price_cents=excluded.price_cents, product_type=excluded.product_type, status=excluded.status, category_id=excluded.category_id, sort_order=excluded.sort_order, description=excluded.description, updated_at=excluded.updated_at;`);
}

for (const seriesId of ['super', 'anbu']) {
  const title = seriesId === 'super' ? '超影课程' : '暗部课程';
  lines.push(`INSERT INTO series (id, title, status, course_password_hash, created_at, updated_at) VALUES (${quote(seriesId)}, ${quote(title)}, 'active', 'card-key-only', ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, updated_at=excluded.updated_at;`);
}

for (const item of [{ id: 'super', count: 18 }, { id: 'anbu', count: 31 }]) {
  for (let order = 1; order <= item.count; order += 1) {
    const padded = String(order).padStart(2, '0');
    lines.push(`INSERT INTO lessons (id, series_id, title, media_path, sort_order, created_at, updated_at) VALUES (${quote(`${item.id}-${padded}`)}, ${quote(item.id)}, ${quote(`第 ${order} 课`)}, ${quote(`${releaseBase}/${item.id}-${padded}.mp4`)}, ${order}, ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET series_id=excluded.series_id, title=excluded.title, media_path=excluded.media_path, sort_order=excluded.sort_order, updated_at=excluded.updated_at;`);
  }
}

for (const child of ['super', 'anbu']) {
  lines.push(`INSERT INTO product_components (parent_product_id, child_product_id, created_at, updated_at) VALUES ('bundle', ${quote(child)}, ${now}, ${now}) ON CONFLICT(parent_product_id, child_product_id) DO UPDATE SET updated_at=excluded.updated_at;`);
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');
console.log(output);
