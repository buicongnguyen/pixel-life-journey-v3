// Uses the smooth-dense-scenes measurement method, adapted to this game's r186 renderer.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [label = 'baseline', device = 'desktop', url = 'http://127.0.0.1:5191'] = process.argv.slice(2);
const pwPath = process.env.PLAYWRIGHT_MODULE ?? createRequire(path.resolve('package.json')).resolve('playwright');
const { chromium } = await import(pathToFileURL(pwPath).href);
const directory = 'logs/performance-review'; mkdirSync(directory, { recursive: true });
const mobile = device === 'mobile';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const errors = []; page.on('pageerror', e => { errors.push(e.message); if(errors.length < 4) console.error(e.stack); });
  page.on('console', m => { if(m.type() === 'error') console.error(m.text()); });
  // Inject the observer into this browser response only, never into game source.
  await page.route('**/src/view3d.ts*', async route => {
    const response = await route.fetch();
    const body = await response.text();
    const anchor = 'const scene = new THREE.Scene();';
    if (!body.includes(anchor)) throw new Error('Renderer observer anchor changed');
    await route.fulfill({ response, body: body.replace(anchor, `${anchor} window.__reviewAttach(renderer);`) });
  });
  await page.route('**/__performance_fixture__', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module" src="/scripts/performance/review-fixture.js"></script>' }));
  await page.goto(`${url}/__performance_fixture__`);
  await page.waitForFunction(() => window.review?.ready, { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 1 });
  await cdp.send('Performance.enable');
  const summary = rows => Object.fromEntries(Object.keys(rows[0]).map(key => {
    const values = rows.map(r => r[key]).sort((a,b) => a-b);
    return [key, { median: values[Math.floor(values.length/2)], p95: values[Math.floor(values.length*.95)] }];
  }));
  const result = { label, device, cpuThrottle: mobile ? 4 : 1, engine: '0.186.0', errors };
  for (const mode of ['idle', 'moving']) {
    const rows = await page.evaluate(mode => window.review.sample(mode), mode);
    if (!rows.length) throw new Error(`No frames: ${JSON.stringify(await page.evaluate(() => ({ hidden: document.hidden, panels:document.querySelectorAll('.plj-3d').length, memory:window.review.memory() })))}`);
    result[mode] = summary(rows);
  }
  await page.evaluate(() => window.review.picture());
  await page.locator('.plj-3d-scene canvas').screenshot({ path: `${directory}/${label}-${device}.png` });
  result.memory = await page.evaluate(() => window.review.memory());
  result.cycles = await page.evaluate(() => window.review.cycle());
  result.reopen = await page.evaluate(() => window.review.reopen());
  await page.evaluate(() => window.review.removeCounters());
  await cdp.send('HeapProfiler.collectGarbage');
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name,m.value]));
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await cdp.send('Profiler.start');
  // Operation wrappers are removed for timing. Whole-callback timing remains diagnostic.
  result.uninstrumentedMoving = summary(await page.evaluate(() => window.review.sample('moving', 180)));
  const { profile } = await cdp.send('Profiler.stop');
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name,m.value]));
  result.cpu = { taskMs: (after.TaskDuration-before.TaskDuration)*1000, scriptMs: (after.ScriptDuration-before.ScriptDuration)*1000,
    wallMs: (after.Timestamp-before.Timestamp)*1000, jsHeapBytes: after.JSHeapUsedSize };
  const times = new Map();
  profile.samples.forEach((id,i) => times.set(id, (times.get(id) ?? 0) + profile.timeDeltas[i]/1000));
  result.cpu.topSelf = profile.nodes.map(n => ({ name:n.callFrame.functionName, url:n.callFrame.url, ms:times.get(n.id) ?? 0 }))
    .sort((a,b) => b.ms-a.ms).slice(0,15);
  writeFileSync(`${directory}/${label}-${device}.cpuprofile`, JSON.stringify(profile));
  if (process.argv.includes('--timing')) {
    result.pairedTiming = {};
    for (const [name,mode,control] of [['idle','idle',false],['moving','moving',false],['nullMoving','moving',true]]) {
      result.pairedTiming[name] = await page.evaluate(([mode,control])=>window.review.pairedTiming(mode,control),[mode,control]);
    }
  }
  if (process.argv.includes('--verify')) {
    result.correctness = {};
    for (const pose of ['turn','bob','inactive','child','remove','room','hide','reveal','shadows-toggle']) {
      await page.evaluate(pose => window.review.pose(pose), pose);
      const cached = await page.locator('.plj-3d-scene canvas').screenshot();
      await page.evaluate(() => window.review.forceShadows(true));
      const fresh = await page.locator('.plj-3d-scene canvas').screenshot();
      const changed = await page.evaluate(async ([a,b]) => {
        const image = async data => { const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode(); return img; };
        const first = await image(a), second = await image(b), canvas = document.createElement('canvas');
        canvas.width = first.width; canvas.height = first.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(first,0,0);
        const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
        ctx.drawImage(second,0,0); const next = ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let changes = 0; for(let i=0;i<pixels.length;i+=4) if(pixels.subarray(i,i+4).some((v,j)=>v!==next[i+j])) changes++;
        return changes;
      }, [cached.toString('base64'), fresh.toString('base64')]);
      result.correctness[pose] = { cachedVsFreshShadowPixels: changed };
      if(changed) errors.push(`${pose}: cached shadow differs from fresh render`);
      await page.evaluate(() => window.review.forceShadows(false));
    }
    result.correctness.pickedLabel = await page.evaluate(() => window.review.pick());
    if(result.correctness.pickedLabel !== 'Mother') errors.push('Picking failed');
    result.repeatedCycles = [];
    for(let i=0;i<3;i++) result.repeatedCycles.push(await page.evaluate(() => window.review.cycle()));
    const previous = result.repeatedCycles[1].at(-1), latest = result.repeatedCycles[2].at(-1);
    result.correctness.stableMemory = previous.renderer.geometries === latest.renderer.geometries &&
      previous.renderer.textures === latest.renderer.textures && previous.programs === latest.programs;
    if (!result.correctness.stableMemory) errors.push('Resources grew across warmed room cycles');
    await page.locator('input[type=file]').setInputFiles('public/models/life-art.glb');
    await page.waitForFunction(() => document.querySelector('.plj-3d-status').textContent.includes('life-art.glb loaded.'));
    result.correctness.importedAvatar = 'loaded';
  }
  result.afterClose = await page.evaluate(() => window.review.close());
  if (result.afterClose.geometries !== 0) errors.push('Geometry resources remain after close');
  writeFileSync(`${directory}/${label}-${device}.json`, JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
