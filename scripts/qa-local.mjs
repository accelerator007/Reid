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
const tunnel=spawn('ssh',['-N','-o','ExitOnForwardFailure=yes','-L','127.0.0.1:8091:127.0.0.1:8090','reid@10.162.46.74'],{stdio:'ignore'});
const vite=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','5175'],{env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_ANON_KEY:anon},stdio:'ignore'});
let browser,userId;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
  for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:5175')).ok)break;}catch{}await pause(500);}
  browser=await chromium.launch({headless:true});const publicPage=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,colorScheme:'light'});
  const errors=[];publicPage.on('pageerror',e=>errors.push(e.message));
  await publicPage.goto('http://127.0.0.1:5175/');await publicPage.getByRole('heading',{name:/أفكار تستحق/}).waitFor();await publicPage.screenshot({path:`${folder}/home-desktop.png`,fullPage:true});
  await publicPage.getByRole('button',{name:'EN',exact:true}).click();await publicPage.getByRole('heading',{name:/Good ideas/}).waitFor();
  await publicPage.setViewportSize({width:390,height:844});await publicPage.getByRole('button',{name:'ع',exact:true}).click();await publicPage.screenshot({path:`${folder}/home-mobile.png`,fullPage:true});
  if(await publicPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('public_mobile_overflow');
  const email=`reid-os-qa-${Date.now()}@reid.test`,password=randomBytes(24).toString('base64url');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Reid QA'}});if(created.error)throw created.error;userId=created.data.user.id;
  for(const result of [await admin.from('profiles').update({full_name:'Reid QA',linkedin_url:'https://www.linkedin.com/in/reid-qa'}).eq('id',userId),await admin.from('user_roles').insert({user_id:userId,role:'owner'})])if(result.error)throw result.error;
  const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw signed.error;
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
  await ctx.addInitScript(session=>localStorage.setItem('sb-pkogchbrknwmzefjklkr-auth-token',JSON.stringify(session)),signed.data.session);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const [route,heading] of [['today','أهلًا'],['finance','وضوح'],['operations','التفاصيل'],['assistant','فكرتك'],['admin','كل صلاحية'],['connections','كل أدواتك'],['inbox','كل محادثة']]){
    await page.goto(`http://127.0.0.1:5175/${route}`);await page.getByRole('heading',{name:new RegExp(heading)}).first().waitFor({timeout:20000});if(route==='admin')await page.getByText('Reid QA',{exact:true}).waitFor({timeout:20000});else await pause(1500);await page.screenshot({path:`${folder}/${route}.png`,fullPage:true});console.log(`${route}: rendered`);
  }
  await page.goto('http://127.0.0.1:5175/connections');
  const connectButton=page.getByRole('button',{name:'إظهار QR code'}),qrImage=page.getByRole('img',{name:'امسح هذا الكود من واتساب لربط رقم ريّد'});
  if(await connectButton.count())await connectButton.click();
  if(await qrImage.count()||await qrImage.waitFor({timeout:45000}).then(()=>true).catch(()=>false)){await qrImage.screenshot({path:`${folder}/qr.png`});console.log('QR: available from real service');}
  else console.log('QR: phone already linked');
  await page.screenshot({path:`${folder}/connections-qr.png`,fullPage:true});
  await page.goto('http://127.0.0.1:5175/finance');await page.getByRole('button',{name:'مستند جديد'}).click();await page.locator('[name=title]').fill('QA invoice - delete after test');await page.locator('[name=counterparty]').fill('Synthetic customer');await page.locator('[name=amount]').fill('12.345');await page.getByRole('button',{name:'حفظ كمسودة'}).click();await page.getByText('QA invoice - delete after test',{exact:true}).waitFor();console.log('Finance: UI create persisted');
  await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:5175/today');await page.getByRole('heading',{name:/أهلًا/}).waitFor();await page.screenshot({path:`${folder}/today-mobile.png`,fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('workspace_mobile_overflow');
  if(errors.length)throw Error(JSON.stringify(errors));console.log('Browser QA passed; no page exceptions');
}finally{
  if(userId){await admin.from('finance_documents').delete().eq('created_by',userId);await admin.auth.admin.deleteUser(userId);}
  await browser?.close();vite.kill('SIGTERM');tunnel.kill('SIGTERM');
}
