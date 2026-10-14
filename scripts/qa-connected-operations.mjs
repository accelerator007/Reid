import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {previewSession,respondForPreview,respondForLocalApi} from './visual-preview-fixtures.mjs';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:5178';
const output='test-results/connected-operations';
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [1440,390])for(const lang of ['ar','en'])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme==='dark'?'dark':'light'});
  await context.addInitScript(({session,lang,theme})=>{localStorage.setItem('sb-mock-auth-token',JSON.stringify(session));localStorage.setItem('reid-lang',lang);localStorage.setItem('reid-theme',theme);},{session:previewSession,lang,theme});
  await context.route('https://mock.supabase.test/**',respondForPreview);
  let journey=null,saves=0;
  await context.route(`${base}/api/**`,async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(path.endsWith('/journey')){
    if(request.method()==='POST'){
     saves++;const input=request.postDataJSON();assert.equal(input.title,'متابعة المشروع التجريبي');assert.ok(input.assignee_id);assert.ok(Number.isFinite(Date.parse(input.due_at)));
     journey={conversation_id:'chat-1',contact_id:'contact-1',lead_id:'lead-1',request_id:'request-1',task_id:'task-1',project_id:null,
       contact:{id:'contact-1',name:'أحمد'},task:{id:'task-1',title:input.title,status:'todo',due_at:input.due_at,assignee_id:input.assignee_id},project:null};
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(journey)});
   }
   return respondForLocalApi(route);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/owner`,{waitUntil:'networkidle'});
  assert.ok(await page.getByText(lang==='ar'?'ابدأ بهذه الإجراءات':'Start with these actions').isVisible());
  await page.screenshot({path:`${output}/${width}-${lang}-${theme}-owner.png`,fullPage:true});
  await page.goto(`${base}/inbox?chat=chat-1`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:lang==='ar'?'ربط العميل وفتح متابعة':'Link client & follow up',exact:true}).click();
  await page.getByRole('dialog').getByLabel(lang==='ar'?'الخطوة التالية':'Next step',{exact:false}).fill('متابعة المشروع التجريبي');
  await page.screenshot({path:`${output}/${width}-${lang}-${theme}-follow-up.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow in dialog');
  await page.getByRole('button',{name:lang==='ar'?'حفظ المتابعة':'Save follow-up',exact:true}).click();
  await page.getByRole('link',{name:lang==='ar'?'العميل والفرصة':'Client & lead',exact:true}).waitFor();
  assert.equal(saves,1);
  assert.equal(await page.getByRole('link',{name:lang==='ar'?'المهمة':'Task',exact:true}).getAttribute('href'),'/today?task=task-1');
  await page.screenshot({path:`${output}/${width}-${lang}-${theme}-linked.png`,fullPage:true});
  await page.goto(`${base}/connections`,{waitUntil:'networkidle'});
  await page.getByRole('tab',{name:'Google Meet',exact:true}).click();
  await page.getByRole('button',{name:lang==='ar'?'فحص اتصالات الاجتماع':'Check meeting connections',exact:true}).click();
  await page.getByText(lang==='ar'?'الفحص لا ينشئ اجتماعًا. نجاح الاتصالات يحتاج بعده تجربة اجتماع فعلية.':'This check creates no meeting. Working connections still need a real meeting test.').waitFor();
  await page.screenshot({path:`${output}/${width}-${lang}-${theme}-meet.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px ${lang} ${theme}: home, follow-up save, links, meeting preflight`);
  await context.close();
 }
}finally{await browser.close();}
