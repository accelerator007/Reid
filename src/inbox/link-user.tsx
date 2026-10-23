import React from 'react';
import { supabase } from '../supabase';
import { list, run, messageFor } from '../db';
import { useSession } from '../shell';
import { Button, Dialog, Field, FormGrid, InlineAlert, Select, TextInput } from '../ui';

export function LinkWhatsappUser({lang,onSaved}:{lang:'ar'|'en';onSaved:()=>Promise<void>}){
  const {user}=useSession();
  const [open,setOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  const [people,setPeople]=React.useState<{id:string;full_name:string|null;email:string|null}[]>([]);
  const t=(ar:string,en:string)=>lang==='ar'?ar:en;
  const load=async()=>{
    setOpen(true);setBusy(true);setError('');
    if(!supabase){setBusy(false);setError(t('الاتصال غير مهيأ.','Connection unavailable.'));return;}
    const results=await Promise.all([
      list<{id:string;full_name:string|null;email:string|null}>(supabase.from('profiles').select('id,full_name,email').order('full_name')),
      list<{user_id:string}>(supabase.from('user_roles').select('user_id').neq('role','guest')),
      list<{user_id:string;status:string}>(supabase.from('account_controls').select('user_id,status')),
    ]);
    const [profiles,roles,controls]=results;
    const failure=results.find(result=>!result.ok);
    if(failure&&!failure.ok)setError(messageFor(failure.error,lang));
    else if(profiles.ok&&roles.ok&&controls.ok)setPeople(profiles.data.filter(p=>roles.data.some(r=>r.user_id===p.id)&&!controls.data.some(c=>c.user_id===p.id&&c.status!=='active')));
    setBusy(false);
  };
  return <><Button variant="secondary" onClick={()=>void load()}>{t('ربط مستخدم جديد','Link a new user')}</Button>
    <Dialog open={open} onClose={()=>!busy&&setOpen(false)} title={t('ربط حساب برقم واتساب','Link an account to WhatsApp')} closeLabel={t('إغلاق','Close')}>
      {error&&<InlineAlert>{error}</InlineAlert>}
      <FormGrid busy={busy} submit={t('حفظ الربط','Save link')} onSubmit={async form=>{
        if(!supabase||!user)return;
        const id=String(form.get('user_id')),phone=String(form.get('phone')).replace(/\D/g,'');
        if(!people.some(p=>p.id===id)||!/^[1-9][0-9]{7,14}$/.test(phone)){setError(t('اختر حسابًا ورقمًا صحيحًا مع مفتاح الدولة.','Choose an account and a valid international number.'));return;}
        setBusy(true);setError('');
        const result=await run(supabase.from('whatsapp_admin_profiles').upsert({user_id:id,phone_e164:phone,created_by:user.id,enabled:true},{onConflict:'user_id'}));
        if(!result.ok)setError(messageFor(result.error,lang));else{await onSaved();setOpen(false);}
        setBusy(false);
      }}>
        <Field label={t('الحساب','Account')} required><Select name="user_id" required><option value="">{t('اختر موظفًا','Choose an employee')}</option>{people.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}</Select></Field>
        <Field label={t('الرقم مع مفتاح الدولة','International phone number')} required><TextInput name="phone" required inputMode="tel" dir="ltr" maxLength={24} placeholder="968XXXXXXXX"/></Field>
      </FormGrid>
    </Dialog>
  </>;
}
