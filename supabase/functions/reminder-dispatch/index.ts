import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const equal=(a:string,b:string)=>{
  const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b); if(x.length!==y.length)return false;
  let d=0; for(let i=0;i<x.length;i++)d|=x[i]^y[i]; return d===0;
};

Deno.serve(async request=>{
  if(request.method!=='POST') return Response.json({error:'method_not_allowed'},{status:405});
  const expected=Deno.env.get('REID_REMINDER_CRON_TOKEN')||'';
  if(!expected || !equal(expected,request.headers.get('x-reid-cron-token')||'')) return Response.json({error:'unauthorized'},{status:401});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const due=await admin.from('personal_reminders').select('id,whatsapp_phone,reminder_text,attempts')
    .eq('status','scheduled').lte('due_at',new Date().toISOString()).order('due_at').limit(25);
  if(due.error) throw due.error;
  let sent=0,failed=0;
  for(const reminder of due.data||[]) {
    const claimed=await admin.from('personal_reminders').update({status:'sending',attempts:reminder.attempts+1,updated_at:new Date().toISOString()})
      .eq('id',reminder.id).eq('status','scheduled').select('id').maybeSingle();
    if(!claimed.data) continue;
    try {
      const token=Deno.env.get('META_WHATSAPP_ACCESS_TOKEN'),phoneId=Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
      if(!token||!phoneId) throw new Error('whatsapp_not_configured');
      const response=await fetch(`https://graph.facebook.com/v26.0/${phoneId}/messages`,{
        method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
        body:JSON.stringify({messaging_product:'whatsapp',to:reminder.whatsapp_phone,type:'text',text:{preview_url:false,body:`⏰ تذكيرك:\n${reminder.reminder_text}`}}),
      });
      if(!response.ok) throw new Error(`whatsapp_${response.status}`);
      await admin.from('personal_reminders').update({status:'sent',sent_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',reminder.id);
      sent++;
    } catch(error) {
      const retry=reminder.attempts+1<3;
      await admin.from('personal_reminders').update({status:retry?'scheduled':'failed',due_at:retry?new Date(Date.now()+5*60_000).toISOString():undefined,last_error:String(error).slice(0,300),updated_at:new Date().toISOString()}).eq('id',reminder.id);
      failed++;
    }
  }
  return Response.json({ok:true,sent,failed});
});
