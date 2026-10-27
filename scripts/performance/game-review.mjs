// Actual Canvas game CPU/effect and keyboard/touch smoke checks, without game changes.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [device = 'desktop', url = 'http://127.0.0.1:5191'] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE ?? createRequire(path.resolve('package.json')).resolve('playwright')).href);
const browser = await chromium.launch({ args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist'] });
try {
  const mobile = device === 'mobile';
  const page = await browser.newPage({ viewport: mobile ? {width:390,height:844} : {width:1440,height:900}, deviceScaleFactor:mobile?2:1, isMobile:mobile, hasTouch:mobile });
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => { let seed=7; Math.random=()=>((seed=Math.imul(1664525,seed)+1013904223|0)>>>0)/4294967296; });
  await page.goto(url); await page.waitForFunction(()=>window.__pixelLife);
  await page.evaluate(()=>window.__pixelLife.newGame(false,3));
  await page.waitForTimeout(1500);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:mobile?4:1});
  await page.evaluate(()=>{
    const game=window.__pixelLife;
    const metrics=window.__gameMetrics={update:[],render:[]};
    for(const name of ['update','render']) {
      const original=game[name]; game[name]=function(...args){ const start=performance.now(); const result=original.apply(this,args);metrics[name].push(performance.now()-start);return result; };
    }
  });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(200); await page.keyboard.up('ArrowRight');
  const keyboard = await page.evaluate(()=>({moved:window.__pixelLife.px>70,released:!window.__pixelLife.input.right}));
  const stick=await page.locator('.plj-stick').boundingBox();
  const previous=await page.evaluate(()=>window.__pixelLife.px);
  if(mobile) {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x+stick.width*.75,y:stick.y+stick.height*.5}]});
    await page.waitForTimeout(200);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } else {
    await page.mouse.move(stick.x+stick.width*.75,stick.y+stick.height*.5); await page.mouse.down();
    await page.waitForTimeout(200);await page.mouse.up();
  }
  const touch=await page.evaluate(previous=>({moved:window.__pixelLife.px>previous,released:!window.__pixelLife.joyActive}),previous);
  await page.evaluate(()=>{window.__gameMetrics.update=[];window.__gameMetrics.render=[];});
  await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:250});await cdp.send('Profiler.start');
  await page.waitForTimeout(3000);
  const {profile}=await cdp.send('Profiler.stop');
  const normal=await page.evaluate(()=>window.__gameMetrics);
  const effects=await page.evaluate(async()=>{
    const game=window.__pixelLife;game.floats=[];
    for(let i=0;i<20;i++)game.floats.push({x:100+i*10,y:200,text:'+1',color:'#fff',life:.2});
    await new Promise(r=>setTimeout(r,500));const expired=game.floats.length===0;
    game.floats.push({x:100,y:200,text:'+2',color:'#fff',life:1});
    await new Promise(r=>setTimeout(r,60));
    return {expired,reused:game.floats.some(f=>f.text==='+2'&&f.y<200)};
  });
  const times=new Map(); profile.samples.forEach((id,i)=>times.set(id,(times.get(id)??0)+profile.timeDeltas[i]/1000));
  const summary=values=>{values.sort((a,b)=>a-b);return{frames:values.length,median:values[values.length>>1],p95:values[Math.floor(values.length*.95)]};};
  const result={device,keyboard,touch,effects,errors,updateMs:summary(normal.update),renderMs:summary(normal.render),topSelf:profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,ms:times.get(n.id)??0})).sort((a,b)=>b.ms-a.ms).slice(0,20)};
  // Verify the companion remains attached to the real simulation and closes cleanly.
  await page.locator('.plj-view-toggle').click();await page.waitForSelector('.plj-3d-scene canvas');
  const before=await page.evaluate(()=>window.__pixelLife.px);
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(200);await page.keyboard.up('ArrowRight');
  result.companionMovement=await page.evaluate(before=>window.__pixelLife.px>before,before);
  await page.locator('.plj-3d-close').click();result.companionClosed=await page.locator('.plj-3d').count()===0;
  mkdirSync('logs/performance-review',{recursive:true});
  writeFileSync(`logs/performance-review/game-${device}.json`,JSON.stringify(result,null,2));
  writeFileSync(`logs/performance-review/game-${device}.cpuprofile`,JSON.stringify(profile));
  console.log(JSON.stringify(result,null,2));
  if(errors.length||!keyboard.moved||!keyboard.released||!touch.moved||!touch.released||!effects.expired||!effects.reused||!result.companionMovement||!result.companionClosed)process.exitCode=1;
} finally {await browser.close();}
