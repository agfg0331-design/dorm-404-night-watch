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
 for(const [width,height,platform] of [[932,430,'taptap'],[915,412,'taptap'],[844,390,'taptap'],[1280,720,'web']]){
  const page=await browser.newPage({viewport:{width,height},isMobile:platform==='taptap',hasTouch:true});
  const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const messages=[{id:1,nickname:'上一任值班员',createdAt:'2026-09-28T10:00:00Z',content:'今晚的走廊格外安静。先确认每一路监控，再查看手机里的消息。',likes:12,dislikes:1},{id:2,nickname:'夜班访客',createdAt:'2026-09-28T09:40:00Z',content:'别忘了交班手册。',likes:4,dislikes:0},{id:3,nickname:'四楼住户',createdAt:'2026-09-28T09:20:00Z',content:'走廊的灯已经修好了，值班辛苦。',likes:2,dislikes:0},{id:4,nickname:'晚归学生',createdAt:'2026-09-28T09:10:00Z',content:'今晚回来得晚，请留一盏灯。',likes:1,dislikes:0}];
  await page.route('**/api/board**',async route=>{const request=route.request();requests.push({url:request.url(),method:request.method(),data:request.postDataJSON()});const vote=request.postDataJSON()?.value;await route.fulfill({json:request.method()==='GET'?{messages}:{ok:true,vote}});});
  await page.goto(`${base}/?platform=${platform}`);
  await page.evaluate(()=>{document.querySelector('#startOverlay').classList.add('hidden');document.querySelector('#roomView').classList.add('active');});
  await page.locator('#openGuestbook').click();await page.locator('.guest-message').first().waitFor();await page.waitForTimeout(550);
  const layout=await page.evaluate(()=>{const q=s=>document.querySelector(s),rect=e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};return{dialog:rect(q('.guestbook-phone')),form:rect(q('#guestbookForm')),list:rect(q('#guestbookList')),submit:rect(q('#guestbookForm button')),nickname:rect(q('#guestbookNickname')),textarea:rect(q('#guestbookContent')),formScroll:q('#guestbookForm').scrollHeight,formClient:q('#guestbookForm').clientHeight,bodyScroll:document.documentElement.scrollHeight,viewport:innerHeight};});
  if(platform==='taptap'){
   assert(layout.dialog.top>=40);assert(layout.dialog.bottom<=height);assert(layout.dialog.left>=10&&layout.dialog.right<=width-10);
   assert(layout.formScroll<=layout.formClient+1,JSON.stringify(layout));assert(layout.submit.bottom<=layout.form.bottom);assert(layout.submit.height>=44);assert.equal(layout.nickname.width,layout.textarea.width);
   assert(layout.list.width/(layout.list.width+layout.form.width)>.60&&layout.list.width/(layout.list.width+layout.form.width)<.65);
   const compact=await page.evaluate(()=>{const q=s=>document.querySelector(s),rect=s=>q(s).getBoundingClientRect();return{card:rect('.guest-message').height,list:rect('#guestbookList').height,home:getComputedStyle(q('.guestbook-home')).display,nicknameLabel:rect('#guestbookForm label span').bottom,nicknameInput:rect('#guestbookNickname').top,note:rect('#guestbookNote').top,submit:rect('#guestbookForm button').bottom,horizontal:document.documentElement.scrollWidth>innerWidth,thirdVisible:(rect('#guestbookList').bottom-document.querySelectorAll('.guest-message')[2].getBoundingClientRect().top)/document.querySelectorAll('.guest-message')[2].getBoundingClientRect().height};});
   assert(compact.card<=95);assert(compact.list/compact.card>=2.5);assert.equal(compact.home,'none');assert(compact.nicknameLabel<=compact.nicknameInput);assert(compact.note>=compact.submit);assert(!compact.horizontal);assert(compact.thirdVisible>=.5,JSON.stringify(compact));
   const touches=await page.locator('.guest-votes button').evaluateAll(items=>items.every(e=>e.getBoundingClientRect().height>=44));assert(touches);
  }
  await page.locator('[data-sort="hot"]').click();await page.waitForFunction(()=>document.querySelector('.guest-message'));assert(requests.some(r=>r.url.includes('sort=hot')));
  await page.locator('[data-sort="latest"]').click();await page.waitForFunction(()=>document.querySelector('.guest-message'));
  for(const vote of ['1','-1']){await page.locator(`[data-vote="${vote}"]`).first().click();await page.waitForFunction(()=>document.querySelector('.guest-message'));assert(requests.some(r=>r.data?.value===Number(vote)));}
  await page.locator('[data-report]').first().click();await page.waitForFunction(()=>document.querySelector('#guestbookNote').textContent.includes('举报已记录'));
  await page.locator('#guestbookNickname').fill('布局测试');await page.locator('#guestbookContent').fill('本地模拟接口测试');
  assert.equal(await page.locator('#guestbookCounter').textContent(),'8 / 180');
  await page.locator('#guestbookForm button').click();await page.waitForFunction(()=>document.querySelector('#guestbookContent').value==='');assert(requests.some(r=>r.data?.content==='本地模拟接口测试'));
  await page.screenshot({path:`/tmp/404-guestbook-${width}.png`});
  const posts=requests.filter(r=>r.method==='POST').length;
  await page.locator('#guestbookContent').fill('131500');await page.locator('#guestbookForm button').click();await page.locator('#testModule:not(.hidden)').waitFor();assert.equal(requests.filter(r=>r.method==='POST').length,posts);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,height,platform,layout,functions:'sort/post/vote/report/131500 passed; mocked API only'}));await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
