import React from 'react';
import { localApi, localError } from '../local-api';
import { useSession } from '../shell';
import { Badge, Button, Dialog, Field, FormGrid, InlineAlert, Select, TextInput } from '../ui';
import type { Lang } from './model';

type Journey={conversation_id:string;contact_id:string;lead_id:string;request_id:string;task_id:string;project_id:string|null;
  contact:{id:string;name:string};task:{id:string;title:string;status:string;due_at:string;assignee_id:string};project:{id:string;name:string}|null};
type Options={contacts:{id:string;name:string;phone:string|null}[];projects:{id:string;name:string}[];people:{id:string;full_name:string}[]};
const tr=(lang:Lang,ar:string,en:string)=>lang==='ar'?ar:en;
// datetime-local uses the browser's timezone; the label makes that explicit.
const localDate=(iso:string)=>{const date=new Date(iso);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};

export function CustomerJourney({conversationId,lang}:{conversationId:string;lang:Lang}) {
  const {user}=useSession();
  const [journey,setJourney]=React.useState<Journey|null>(null);
  const [options,setOptions]=React.useState<Options|null>(null);
  const [loaded,setLoaded]=React.useState(false);
  const [open,setOpen]=React.useState(false);
  const [busy,setBusy]=React.useState(false);
  const [error,setError]=React.useState('');
  const [project,setProject]=React.useState('');
  const load=React.useCallback(async()=>{
    try {const row=await localApi<Journey|null>(`whatsapp/conversations/${conversationId}/journey`);setJourney(row);setLoaded(true);setError('');}
    catch(e){setError(localError(e,lang));}
  },[conversationId,lang]);
  React.useEffect(()=>{void load();},[load]);
  const edit=async()=>{
    setBusy(true);
    try {setOptions(await localApi<Options>('whatsapp/journey-options'));setProject(journey?.project_id||'');setOpen(true);setError('');}
    catch(e){setError(localError(e,lang));}finally{setBusy(false);}
  };
  const save=async(data:FormData)=>{
    setBusy(true);setError('');
    try {
      await localApi(`whatsapp/conversations/${conversationId}/journey`,{title:String(data.get('title')),due_at:new Date(String(data.get('due_at'))).toISOString(),assignee_id:String(data.get('assignee_id')),
        contact_id:journey?.contact_id||data.get('contact_id')||null,project_id:project&&project!=='new'?project:null,new_project_name:project==='new'?data.get('new_project_name'):null});
      setOpen(false);await load();
    }catch(e){setError(localError(e,lang));}finally{setBusy(false);}
  };
  return <section className="customer-journey" aria-label={tr(lang,'متابعة العميل','Customer follow-up')}>
    <div className="customer-journey__head"><strong>{tr(lang,'متابعة العميل','Customer follow-up')}</strong>
      <Button size="sm" busy={busy} disabled={!loaded} onClick={()=>void edit()}>{journey?tr(lang,'تعديل المتابعة','Edit follow-up'):tr(lang,'ربط العميل وفتح متابعة','Link client & follow up')}</Button></div>
    {error&&<InlineAlert action={<Button size="sm" onClick={()=>void load()}>{tr(lang,'تحديث','Refresh')}</Button>}>{error}</InlineAlert>}
    {journey&&<><p>{journey.contact.name} · {journey.task.title} <Badge tone={journey.task.status==='done'?'success':'info'}>{journey.task.status==='done'?tr(lang,'مكتمل','Done'):tr(lang,'للمتابعة','Follow up')}</Badge></p>
      <nav aria-label={tr(lang,'السجلات المرتبطة','Linked records')}>
        <a href={`/crm?lead=${journey.lead_id}`}>{tr(lang,'العميل والفرصة','Client & lead')}</a>
        <a href={`/operations?record=${journey.request_id}`}>{tr(lang,'الطلب','Request')}</a>
        <a href={`/today?task=${journey.task_id}`}>{tr(lang,'المهمة','Task')}</a>
        {journey.project&&<a href={`/projects/${journey.project.id}`}>{journey.project.name}</a>}
      </nav></>}
    <Dialog open={open} title={tr(lang,'متابعة العميل','Customer follow-up')} closeLabel={tr(lang,'إغلاق','Close')} onClose={()=>{if(!busy)setOpen(false);}}>
      {error&&<InlineAlert>{error}</InlineAlert>}
      {options&&<FormGrid onSubmit={save} busy={busy} submit={tr(lang,'حفظ المتابعة','Save follow-up')}>
        <Field label={tr(lang,'الخطوة التالية','Next step')} required wide><TextInput name="title" defaultValue={journey?.task.title||''} required maxLength={250}/></Field>
        {!journey&&<Field label={tr(lang,'العميل','Client')}><Select name="contact_id"><option value="">{tr(lang,'مطابقة الرقم أو إنشاء عميل','Match phone or create client')}</option>{options.contacts.map(contact=><option key={contact.id} value={contact.id}>{contact.name} {contact.phone}</option>)}</Select></Field>}
        <Field label={tr(lang,'المسؤول','Assignee')} required><Select name="assignee_id" defaultValue={journey?.task.assignee_id||user?.id} required>{options.people.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</Select></Field>
        <Field label={tr(lang,'موعد المتابعة (بتوقيت جهازك)','Follow-up due (device timezone)')} required><TextInput type="datetime-local" name="due_at" defaultValue={localDate(journey?.task.due_at||new Date(Date.now()+86400000).toISOString())} required/></Field>
        <Field label={tr(lang,'المشروع','Project')}><Select disabled={Boolean(journey?.project_id)} value={project} onChange={event=>setProject(event.target.value)}><option value="">{tr(lang,'بدون مشروع','No project')}</option><option value="new">{tr(lang,'إنشاء مشروع','Create project')}</option>{options.projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        {project==='new'&&<Field label={tr(lang,'اسم المشروع الجديد','New project name')} required><TextInput name="new_project_name" required maxLength={200}/></Field>}
      </FormGrid>}
    </Dialog>
  </section>;
}
