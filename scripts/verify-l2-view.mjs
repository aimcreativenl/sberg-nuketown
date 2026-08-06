/**
 * Hard-refresh :5173, teleport camera to west-house L2, dump canvas PNGs via toDataURL.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve('scripts/_l2-verify');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.setDefaultTimeout(45000);

await page.goto(`http://127.0.0.1:5173/?v=${Date.now()}`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForFunction(() => window.__pastelNuketown?.camera && window.__pastelNuketown?.mapData, {
  timeout: 30000,
});
// Let a few frames paint
await page.waitForTimeout(800);

async function captureFrom(pose) {
  return page.evaluate((p) => {
    const game = window.__pastelNuketown;
    document.querySelectorAll('.overlay, #start-screen, #hud, #match-callout, #death-overlay, #pause-overlay, #victory-overlay').forEach((el) => {
      el.style.display = 'none';
      el.classList.add('hidden');
    });

    let open = null;
    game.scene.traverse((o) => {
      if (o.name === 'window_l2_open_west_0') open = o;
    });
    if (!open) return { ok: false, err: 'no window marker' };
    open.updateWorldMatrix(true, false);
    const e = open.matrixWorld.elements;
    const wp = { x: e[12], y: e[13], z: e[14] };

    // gap: L1 looking at front wall mid-height (former outdoor strip)
    // living: interior living bay overview
    let eye;
    let look;
    if (p === 'window') {
      eye = { x: wp.x, y: wp.y, z: wp.z + 1.6 };
      look = { x: wp.x, y: wp.y, z: wp.z - 5 };
    } else if (p === 'gap') {
      eye = { x: -17, y: 1.55, z: -2.2 };
      look = { x: -17, y: 2.9, z: -5 };
    } else if (p === 'living') {
      eye = { x: -14.5, y: 1.65, z: -1.0 };
      look = { x: -14.5, y: 1.2, z: -3.5 };
    } else {
      eye = { x: wp.x, y: 3.45, z: wp.z + 1.15 };
      look = { x: wp.x, y: 3.22, z: wp.z + 0.02 };
    }

    game.camera.position.set(eye.x, eye.y, eye.z);
    game.camera.lookAt(look.x, look.y, look.z);
    game.camera.updateMatrixWorld(true);
    if (game.composer) game.composer.render();
    else game.renderer.render(game.scene, game.camera);

    const canvas = document.getElementById('game-canvas');
    const dataUrl = canvas.toDataURL('image/png');

    let glass = null;
    game.scene.traverse((o) => {
      if (o.name === 'window_l2_glass_west_0' && o.material) glass = o.material;
    });

    // sample center pixel
    const w = canvas.width;
    const h = canvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const center = [...ctx.getImageData((w / 2) | 0, (h / 2) | 0, 1, 1).data];
    const lower = [...ctx.getImageData((w / 2) | 0, ((h * 0.75) | 0), 1, 1).data];

    return {
      ok: true,
      window: wp,
      eye,
      look,
      center,
      lower,
      glass: glass
        ? {
            type: glass.type,
            transmission: glass.transmission,
            opacity: glass.opacity,
            depthWrite: glass.depthWrite,
          }
        : null,
      dataUrl,
    };
  }, pose);
}

const win = await captureFrom('window');
if (!win.ok) {
  console.error(win);
  await browser.close();
  process.exit(1);
}
const winPath = path.join(OUT, 'l2-through-window.png');
fs.writeFileSync(winPath, Buffer.from(win.dataUrl.split(',')[1], 'base64'));

const sill = await captureFrom('sill');
const sillPath = path.join(OUT, 'l2-sill-joint.png');
fs.writeFileSync(sillPath, Buffer.from(sill.dataUrl.split(',')[1], 'base64'));

const gap = await captureFrom('gap');
const gapPath = path.join(OUT, 'l1-l2-joint.png');
fs.writeFileSync(gapPath, Buffer.from(gap.dataUrl.split(',')[1], 'base64'));

const living = await captureFrom('living');
const livingPath = path.join(OUT, 'interior-living.png');
fs.writeFileSync(livingPath, Buffer.from(living.dataUrl.split(',')[1], 'base64'));

const report = {
  windowPos: win.window,
  glass: win.glass,
  windowSamples: { center: win.center, lower: win.lower },
  sillSamples: { center: sill.center, lower: sill.lower },
  gapSamples: { center: gap.center, lower: gap.lower },
  livingSamples: { center: living.center, lower: living.lower },
  shots: { winPath, sillPath, gapPath, livingPath },
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
console.log('OK wrote', winPath, sillPath, gapPath, livingPath);
