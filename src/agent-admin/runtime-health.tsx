import React from 'react';
import { localApi,localError } from '../local-api';
import { Badge,Button,Card,InlineAlert,SectionHeader } from '../ui';
type Runtime={active:number;maxConcurrent:number;circuit:string;retryAfterMs:number;windowRequests:number;windowFailures:number;p50Ms:number|null;p95Ms:number|null};
export function RuntimeHealth({lang}:{lang:'ar'|'en'}) {
  const [data,setData]=React.useState<Runtime|null>(null),[error,setError]=React.useState('');
  const tr=(ar:string,en:string)=>lang==='ar'?ar:en;
  const load=React.useCallback(async()=>{try{setData(await localApi<Runtime>('ai/runtime'));setError('');}catch(e){setError(localError(e,lang));}},[lang]);
  React.useEffect(()=>{void load();const id=setInterval(()=>{if(document.visibilityState==='visible')void load();},15000);return()=>clearInterval(id);},[load]);
  return <Card><SectionHeader title={tr('أداء ردود ريّد','Reid reply performance')} action={<Button size="sm" onClick={()=>void load()}>{tr('تحديث','Refresh')}</Button>}/>
    {error&&<InlineAlert>{error}</InlineAlert>}
    {data&&<><Badge tone={data.circuit==='closed'?'success':'warning'}>{data.circuit==='closed'?tr('يستقبل الطلبات','Accepting requests'):tr('ينتظر تعافي النموذج','Waiting for model recovery')}</Badge>
      <p>{tr('طلبات قيد المعالجة','Active requests')}: {data.active}/{data.maxConcurrent} · {tr('أخطاء','Failures')}: {data.windowFailures}/{data.windowRequests}</p>
      <p>{tr('الزمن الوسيط','Median latency')}: {data.p50Ms===null?'—':`${(data.p50Ms/1000).toFixed(1)}s`} · P95: {data.p95Ms===null?'—':`${(data.p95Ms/1000).toFixed(1)}s`}</p>
      <small>{tr('آخر ١٠٠ استدعاء منذ تشغيل الخدمة. أزمنة الاستجابات الناجحة، دون حفظ نصوص المحادثات.','Last 100 calls since service start. Successful-response latency; conversation text is not stored.')}</small></>}
  </Card>;
}
