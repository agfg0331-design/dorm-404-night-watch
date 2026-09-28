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
try{
 for(const [width,height] of [[932,430],[915,412],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>route.abort());
  await page.goto(`${base}/?qa=1&test=event&event=hall-door&seed=818&platform=taptap`);
  await page.locator('#testBegin').click();
  await page.waitForFunction(()=>document.body.dataset.view==='monitor');
  await page.locator('#monitorPhone').tap();
  await page.waitForTimeout(550);
  assert.equal(await page.locator('.phone-composite').evaluate(e=>getComputedStyle(e).animationName),'phoneLift');
  await page.locator('[data-tab="report"]').tap();
  const measure=()=>page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width};};
    const panel=document.querySelector('#reportPanel');
    return {panel:rect(panel),client:panel.clientHeight,scroll:panel.scrollHeight,scrollTop:panel.scrollTop,
      screen:rect(document.querySelector('.phone-screen')),select:rect(document.querySelector('#reportCamera')),
      submit:rect(document.querySelector('.submit-report')),back:rect(document.querySelector('#closePhone')),
      categories:[...document.querySelectorAll('.category-grid span')].map(e=>{const range=document.createRange();range.selectNodeContents(e);return{...rect(e),lines:range.getClientRects().length,text:e.textContent};})};
  });
  function check(m){assert.equal(m.categories.length,6);assert(m.scroll<=m.client+1,`${width}: report overflow ${JSON.stringify(m)}`);assert.equal(m.scrollTop,0);assert(m.submit.bottom<=m.screen.bottom-1);assert(m.select.top>=m.screen.top);assert(m.submit.height>=44);assert(m.back.height>=44);assert(m.categories.every(c=>c.height>=43&&c.lines===1));}
  check(await measure());
  for(let i=0;i<6;i++){await page.locator('.category-grid label').nth(i).tap();assert(await page.locator('input[name="category"]').nth(i).isChecked());}
  await page.locator('.submit-report').tap();
  assert.equal(await page.locator('#reportFeedback').textContent(),'报告已提交');
  const measured=await measure();check(measured);
  await page.screenshot({path:`/tmp/404-report-${width}x${height}.png`});
  await page.locator('#closePhone').tap();assert(await page.locator('#messagesPanel').evaluate(e=>e.classList.contains('active')));
  await page.locator('#closePhone').tap();
  assert.equal(await page.locator('.phone-composite').evaluate(e=>getComputedStyle(e).animationName),'phoneLower');
  await page.waitForTimeout(500);assert(!await page.locator('#phoneView').evaluate(e=>e.classList.contains('active')));
  const stage=await page.locator('.monitor-stage').evaluate(e=>({ratio:e.offsetWidth/e.offsetHeight,transform:getComputedStyle(e).transform}));
  assert(Math.abs(stage.ratio-4/3)<.01);assert(stage.transform.startsWith('matrix(1.05,'));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({size:`${width}×${height}`,panelHeight:measured.client,scrollHeight:measured.scroll,submitBottom:measured.submit.bottom,screenBottom:measured.screen.bottom,categoryHeight:measured.categories[0].height,returnButton:true,feedback:true,animations:true,stage}));
  await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
