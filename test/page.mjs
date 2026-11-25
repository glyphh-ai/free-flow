// test/page.mjs : opens the game's files in a headless Chromium with no server and no port: every request to
// https://freeflow.test/ is answered from the files on disk.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'https://freeflow.test';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
export async function open(url, opts) {
  opts = opts || {};
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext(opts.phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: opts.scale || 1, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: opts.scale || 1 });
  const errors = [];
  await ctx.route('**/*', async function (route) {
    const u = new URL(route.request().url());
    if (u.origin !== SITE) return route.abort();
    let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, path.normalize(p));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', function (e) { errors.push(String(e.message || e)); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(SITE + url, { waitUntil: 'load' });
  return { browser: browser, page: page, errors: errors };
}
