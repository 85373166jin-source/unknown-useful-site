import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const owner = '85373166jin-source';
const repo = 'unknown-useful-site';
const tag = 'course-videos-20260920';
const releaseName = '课程视频 · 2026-09-20';
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const uploadBase = `https://uploads.github.com/repos/${owner}/${repo}`;

function credentialToken() {
  const result = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error('Unable to read GitHub credentials');
  }
  const line = result.stdout.split(/\r?\n/).find((entry) => entry.startsWith('password='));
  if (!line) {
    throw new Error('GitHub credential password/token was not available');
  }
  return line.slice('password='.length);
}

const token = credentialToken();
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Codex'
};

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return payload;
}

let release;
try {
  release = await jsonRequest(`${apiBase}/releases/tags/${tag}`);
} catch {
  release = await jsonRequest(`${apiBase}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: releaseName,
      body: '完整超影课程与暗部课程视频资源，供已开通用户在线播放和下载。',
      draft: false,
      prerelease: false
    })
  });
  console.log(`Created release ${tag}`);
}

const existing = new Set((release.assets ?? []).map((asset) => asset.name));
const files = [];
for (const item of [
  { id: 'super', dir: path.join(process.env.USERPROFILE ?? '', 'Desktop', '超影系列备份'), count: 18 },
  { id: 'anbu', dir: path.join(process.env.USERPROFILE ?? '', 'Desktop', '暗部系列备份'), count: 31 }
]) {
  for (let index = 1; index <= item.count; index += 1) {
    const name = `${item.id}-${String(index).padStart(2, '0')}.mp4`;
    const source = path.join(item.dir, `${index}.mp4`);
    if (!fs.existsSync(source)) throw new Error(`Missing course video: ${source}`);
    if (!existing.has(name)) files.push({ name, source });
  }
}

for (const archive of [
  { name: 'super-course-18.zip', sourceName: '超影系列备份.zip' },
  { name: 'anbu-course-31.zip', sourceName: '暗部系列备份.zip' }
]) {
  const source = path.join(process.cwd(), 'work', archive.sourceName);
  if (!fs.existsSync(source)) throw new Error(`Missing course archive: ${source}`);
  if (!existing.has(archive.name)) files.push({ name: archive.name, source, useCurl: true });
}

if (files.length === 0) {
  console.log('All release assets already exist.');
  process.exit(0);
}

let completed = 0;
let cursor = 0;
const workerCount = 1;

async function worker() {
  while (cursor < files.length) {
    const currentIndex = cursor;
    cursor += 1;
    const file = files[currentIndex];
    const stat = fs.statSync(file.source);
    console.log(`Uploading ${file.name} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    if (file.useCurl) {
      const result = spawnSync('curl.exe', [
        '--fail-with-body',
        '--location',
        '--silent',
        '--show-error',
        '--progress-bar',
        '--request', 'POST',
        '--header', `Authorization: Bearer ${token}`,
        '--header', 'Accept: application/vnd.github+json',
        '--header', 'X-GitHub-Api-Version: 2022-11-28',
        '--header', 'Content-Type: application/zip',
        '--data-binary', `@${file.source}`,
        `${uploadBase}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`
      ], { stdio: 'inherit' });
      if (result.status !== 0) {
        throw new Error(`Upload ${file.name} failed with curl exit code ${result.status}`);
      }
      completed += 1;
      console.log(`Uploaded ${completed}/${files.length}: ${file.name}`);
      continue;
    }
    const response = await fetch(`${uploadBase}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'video/mp4',
        'Content-Length': String(stat.size)
      },
      body: fs.createReadStream(file.source),
      duplex: 'half'
    });
    if (!response.ok) {
      throw new Error(`Upload ${file.name} failed: ${response.status} ${await response.text()}`);
    }
    completed += 1;
    console.log(`Uploaded ${completed}/${files.length}: ${file.name}`);
  }
}

await Promise.all(Array.from({ length: workerCount }, () => worker()));
console.log(`Release upload complete: ${files.length} assets.`);
