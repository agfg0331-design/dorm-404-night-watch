import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(process.argv[2] || 'dist/taptap-dev');
const server=http.createServer((req,res)=>{
  let file=path.join(root,new URL(req.url,'http://localhost').pathname);
  if(file.endsWith('/'))file+='index.html';
  try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const seen=new Set();
try{
 for(const [width,height] of [[932,430],[915,412],[844,390]]){
  for(const event of ['hall-door','music-figure','dance-figure','elevator-open','lab-feed']){
   const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
   await page.route('https://**/*',route=>route.abort());
   if(process.env.REVIEW_FRAMES) await page.route('**/assets/cam-*.webp',route=>{
    const candidate=path.join(process.env.REVIEW_FRAMES,path.basename(new URL(route.request().url()).pathname));
    return fs.existsSync(candidate)?route.fulfill({path:candidate,contentType:'image/webp'}):route.continue();
   });
   await page.goto(`${base}/?qa=1&test=event&event=${event}&seed=818&platform=taptap`);
   await page.locator('#testBegin').click();await page.waitForFunction(()=>document.body.dataset.view==='monitor');
   for(const key of [1,2,3,4,5,6]){
    await page.keyboard.press(String(key));await page.waitForTimeout(70);
    const state=await page.evaluate(()=>{
     const watermark=document.querySelector('#sceneWatermark'),rect=watermark.getBoundingClientRect(),stage=document.querySelector('.monitor-stage').getBoundingClientRect(),scene=document.querySelector('#monitorView').dataset.scene;
     return {scene,name:watermark.textContent,expected:scene==='duty'?'值班室':GameContent.scenePool[scene].name,instances:document.querySelectorAll('.scene-watermark').length,top:rect.top,left:rect.left,bottom:rect.bottom,stageTop:stage.top,stageLeft:stage.left,stageHeight:stage.height,bottomStyle:getComputedStyle(watermark).bottom};
    });
    assert.equal(state.name,state.expected);assert.equal(state.instances,1);assert(!state.name.includes('CAM'));
    assert(state.top>=30 && state.top-state.stageTop<65,JSON.stringify(state));
    assert(state.left-state.stageLeft>=10);assert(state.bottom<state.stageTop+state.stageHeight/3);
    seen.add(state.scene);
    if(key===1) await page.screenshot({path:`/tmp/404-watermark-${width}-${state.scene}.png`});
   }
   console.log(JSON.stringify({width,height,event,camSwitches:6,watermark:'one top-left scene name; correct on every switch'}));await page.close();
  }
 }
 assert.equal(seen.size,10);console.log(`Watermark: all ${seen.size} scenes passed at all three landscape sizes.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
