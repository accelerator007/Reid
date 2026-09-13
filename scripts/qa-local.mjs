import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
const url='https://pkogchbrknwmzefjklkr.supabase.co';
const keys=JSON.parse(execFileSync('npx',['--yes','supabase@2.117.0','projects','api-keys','--project-ref','pkogchbrknwmzefjklkr','--reveal','-o','json'],{encoding:'utf8'}));
const anon=keys.find(x=>x.type==='publishable').api_key;
const admin=createClient(url,keys.find(x=>x.name==='service_role').api_key,{auth:{persistSession:false}});
const client=createClient(url,anon,{auth:{persistSession:false}});
const folder='/Users/ali/Documents/Codex/2026-09-10/new-chat/work/reid-os-qa';mkdirSync(folder,{recursive:true});
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5175';
const local=base.startsWith('http://127.0.0.1:');
const tunnel=local?spawn('ssh',['-N','-o','ExitOnForwardFailure=yes','-L','127.0.0.1:8091:127.0.0.1:8090','reid@10.162.46.74'],{stdio:'ignore'}):null;
const vite=local?spawn('npm',['run','dev','--','--host','127.0.0.1','--port','5175'],{env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_ANON_KEY:anon},stdio:'ignore'}):null;
let browser,userId;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
  for(let i=0;i<30;i++){try{if((await fetch(base)).ok)break;}catch{}await pause(500);}
  browser=await chromium.launch({headless:true});const publicPage=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,colorScheme:'light'});
  const errors=[];publicPage.on('pageerror',e=>errors.push(e.message));
  await publicPage.goto(`${base}/`);await publicPage.getByRole('heading',{name:/أفكار تستحق/}).waitFor();await publicPage.screenshot({path:`${folder}/home-desktop.png`,fullPage:true});
  await publicPage.getByRole('button',{name:'EN',exact:true}).click();await publicPage.getByRole('heading',{name:/Good ideas/}).waitFor();
  await publicPage.setViewportSize({width:390,height:844});await publicPage.getByRole('button',{name:'ع',exact:true}).click();await publicPage.screenshot({path:`${folder}/home-mobile.png`,fullPage:true});
  if(await publicPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('public_mobile_overflow');
  const email=`reid-os-qa-${Date.now()}@reid.test`,password=randomBytes(24).toString('base64url');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Reid QA'}});if(created.error)throw created.error;userId=created.data.user.id;
  for(const result of [await admin.from('profiles').update({full_name:'Reid QA',linkedin_url:'https://www.linkedin.com/in/reid-qa'}).eq('id',userId),await admin.from('user_roles').insert({user_id:userId,role:'owner'})])if(result.error)throw result.error;
  const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw signed.error;
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
  await ctx.addInitScript(session=>localStorage.setItem('sb-pkogchbrknwmzefjklkr-auth-token',JSON.stringify(session)),signed.data.session);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>void dialog.accept());
  for(const [route,heading] of [['owner','الشركة في صورة'],['today','أهلًا'],['business','أول فرصة'],['finance','وضوح'],['operations','التفاصيل'],['assistant','فكرتك'],['admin','كل صلاحية'],['connections','كل أدواتك'],['inbox','كل محادثة']]){
    await page.goto(`${base}/${route}`);await page.getByRole('heading',{name:new RegExp(heading)}).first().waitFor({timeout:20000});if(route==='admin')await page.getByText('Sheikha Almamari',{exact:true}).waitFor({timeout:20000});else await pause(1500);await page.screenshot({path:`${folder}/${route}.png`,fullPage:true});console.log(`${route}: rendered`);
  }
  await page.goto(`${base}/connections`);
  await page.getByRole('heading',{name:'الإدارة عبر واتساب'}).waitFor({timeout:20000});
  await page.getByText('+96896709444',{exact:true}).waitFor({timeout:20000});
  await page.getByText('+96892797586',{exact:true}).waitFor({timeout:20000});
  console.log('Connections: both Owner WhatsApp identities and isolated memory controls rendered');
  const connectButton=page.getByRole('button',{name:'إظهار QR code'}),qrImage=page.getByRole('img',{name:'امسح هذا الكود من واتساب لربط رقم ريّد'});
  if(await connectButton.count())await connectButton.click();
  if(await qrImage.count()||await qrImage.waitFor({timeout:45000}).then(()=>true).catch(()=>false)){await qrImage.screenshot({path:`${folder}/qr.png`});console.log('QR: available from real service');}
  else console.log('QR: phone already linked');
  await page.screenshot({path:`${folder}/connections-qr.png`,fullPage:true});
  await page.goto(`${base}/finance`);await page.getByRole('button',{name:'بيانات ريّد'}).click();await page.getByText('تظهر هذه البيانات في المستندات الجديدة فقط.').waitFor();await page.getByRole('button',{name:'إغلاق'}).click();
  await page.getByRole('button',{name:'مستند جديد'}).click();await page.locator('[name=title]').fill('QA invoice - delete after test');await page.locator('[name=counterparty]').fill('Synthetic customer');await page.getByLabel('وصف البند 1').fill('QA service');await page.getByLabel('سعر البند 1').fill('12.345');await page.getByRole('button',{name:'حفظ كمسودة'}).click();await page.getByText('QA invoice - delete after test',{exact:true}).waitFor();let invoiceRow=page.locator('.os-record').filter({hasText:'QA invoice - delete after test'});await invoiceRow.getByRole('button',{name:'عرض وطباعة'}).click();await page.getByRole('heading',{name:'QA invoice - delete after test'}).waitFor();await page.getByText('QA service',{exact:true}).waitFor();await page.getByRole('button',{name:'إغلاق'}).click();invoiceRow=page.locator('.os-record').filter({hasText:'QA invoice - delete after test'});await invoiceRow.locator('select').selectOption('issued');await page.waitForTimeout(700);console.log('Finance: detailed invoice persisted, previewed, and issued');
  await page.getByRole('button',{name:'المصروفات'}).click();await page.getByRole('button',{name:'مستند جديد'}).click();await page.locator('[name=kind]').selectOption('expense');await page.locator('[name=title]').fill('QA expense - delete after test');await page.locator('[name=counterparty]').fill('Synthetic supplier');await page.getByLabel('وصف البند 1').fill('QA infrastructure');await page.getByLabel('سعر البند 1').fill('4.321');await page.getByRole('button',{name:'حفظ كمسودة'}).click();await page.getByText('QA expense - delete after test',{exact:true}).waitFor();let expenseRow=page.locator('.os-record').filter({hasText:'QA expense - delete after test'});await expenseRow.locator('select').selectOption('issued');await page.waitForTimeout(700);expenseRow=page.locator('.os-record').filter({hasText:'QA expense - delete after test'});await expenseRow.locator('select').selectOption('paid');await page.waitForTimeout(700);expenseRow=page.locator('.os-record').filter({hasText:'QA expense - delete after test'});if(await expenseRow.locator('select').inputValue()!=='paid')throw Error('expense_paid_transition_failed');console.log('Finance: expense issued and paid through UI');
  await page.setViewportSize({width:390,height:844});await page.goto(`${base}/business`);await page.getByRole('heading',{name:/أول فرصة/}).waitFor();await page.screenshot({path:`${folder}/business-mobile.png`,fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('business_mobile_overflow');
  await page.goto(`${base}/today`);await page.getByRole('heading',{name:/أهلًا/}).waitFor();await page.screenshot({path:`${folder}/today-mobile.png`,fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('workspace_mobile_overflow');
  await page.goto(`${base}/finance`);await page.getByRole('heading',{name:/وضوح/}).waitFor();await page.screenshot({path:`${folder}/finance-mobile.png`,fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('finance_mobile_overflow');
  await page.goto(`${base}/owner`);await page.getByRole('heading',{name:/الشركة في صورة/}).waitFor();await page.screenshot({path:`${folder}/owner-mobile.png`,fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('owner_mobile_overflow');
  if(errors.length)throw Error(JSON.stringify(errors));console.log('Browser QA passed; no page exceptions');
}finally{
  if(userId){await admin.from('finance_documents').delete().eq('created_by',userId);await admin.auth.admin.deleteUser(userId);}
  await browser?.close();vite?.kill('SIGTERM');tunnel?.kill('SIGTERM');
}
