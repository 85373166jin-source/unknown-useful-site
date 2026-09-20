import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'apps', 'web', 'public', 'media', 'covers');

const series = [
  {
    id: 'super',
    sourceDir: path.join(process.env.USERPROFILE ?? '', 'Desktop', '超影系列备份'),
    count: 18
  },
  {
    id: 'anbu',
    sourceDir: path.join(process.env.USERPROFILE ?? '', 'Desktop', '暗部系列备份'),
    count: 31
  }
];

fs.mkdirSync(outputDir, { recursive: true });

const server = http.createServer((request, response) => {
  const match = /^\/(super|anbu)\/(\d+)\.mp4$/.exec(request.url ?? '');
  if (!match) {
    response.writeHead(404).end('Not found');
    return;
  }
  const found = series.find((item) => item.id === match[1]);
  const input = found ? path.join(found.sourceDir, `${match[2]}.mp4`) : '';
  if (!input || !fs.existsSync(input)) {
    response.writeHead(404).end('Not found');
    return;
  }
  const stat = fs.statSync(input);
  const range = request.headers.range;
  if (range) {
    const [startText, endText] = range.replace(/bytes=/, '').split('-');
    const start = Number(startText);
    const end = endText ? Number(endText) : stat.size - 1;
    response.writeHead(206, {
      'Content-Type': 'video/mp4',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(input, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes'
  });
  fs.createReadStream(input).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({
  headless: true,
  executablePath: fs.existsSync(edgePath) ? edgePath : undefined,
  args: ['--allow-file-access-from-files']
});

try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  for (const item of series) {
    for (let index = 1; index <= item.count; index += 1) {
      const input = path.join(item.sourceDir, `${index}.mp4`);
      const output = path.join(outputDir, `${item.id}-${String(index).padStart(2, '0')}.jpg`);
      if (!fs.existsSync(input)) {
        console.warn(`Missing video: ${input}`);
        continue;
      }

      const source = `http://127.0.0.1:${port}/${item.id}/${index}.mp4`;
      await page.setContent(`
        <style>
          html, body { margin: 0; background: #000; }
          video { display: block; width: 800px; height: 450px; object-fit: contain; background: #000; }
        </style>
        <video id="video" muted preload="auto" src="${source}"></video>
      `, { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        const video = document.querySelector('video');
        if (!video) throw new Error('video element missing');
        await new Promise((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('video load timeout')), 30000);
          video.addEventListener('loadeddata', () => {
            window.clearTimeout(timeout);
            resolve(undefined);
          }, { once: true });
          video.addEventListener('error', () => reject(new Error('video decode failed')), { once: true });
          video.load();
        });
        const target = Math.min(2, Math.max(0, (video.duration || 3) * 0.1));
        await new Promise((resolve) => {
          video.addEventListener('seeked', () => resolve(undefined), { once: true });
          video.currentTime = target;
        });
      });
      await page.locator('#video').screenshot({ path: output, type: 'jpeg', quality: 82 });
      console.log(`${item.id}-${String(index).padStart(2, '0')}.jpg`);
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
