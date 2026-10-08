import React from 'react';
import { CheckCircle2, KeyRound, LoaderCircle, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { supabase } from './supabase';

type Lang='ar'|'en';
type Factor={id:string;friendly_name?:string;status?:string;created_at:string};
type Enrollment={id:string;qr:string;secret:string};

export function AccountSecurity({lang,provider}:{lang:Lang;provider?:string}) {
  const ar=lang==='ar';
  const [factors,setFactors]=React.useState<Factor[]>([]);
  const [enrollment,setEnrollment]=React.useState<Enrollment|null>(null);
  const [code,setCode]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const [message,setMessage]=React.useState('');

  const load=React.useCallback(async()=>{
    if(!supabase) return;
    const {data,error}=await supabase.auth.mfa.listFactors();
    if(error){setMessage(error.message);return;}
    setFactors(((data?.totp||[]) as Factor[]).filter(factor=>factor.status==='verified'));
  },[]);
  React.useEffect(()=>{void load();},[load]);

  const enroll=async()=>{
    if(!supabase||busy)return;
    setBusy(true);setMessage('');
    const listed=await supabase.auth.mfa.listFactors();
    if(listed.error){setBusy(false);setMessage(listed.error.message);return;}
    for(const factor of (listed.data?.totp||[])) {
      if(factor.status!=='verified') await supabase.auth.mfa.unenroll({factorId:factor.id});
    }
    const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Reid account'});
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setEnrollment({id:data.id,qr:data.totp.qr_code,secret:data.totp.secret});
  };
  const verify=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!supabase||!enrollment||code.length!==6||busy)return;
    setBusy(true);setMessage('');
    const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:enrollment.id,code});
    setBusy(false);
    if(error){setMessage(error.message);return;}
    setEnrollment(null);setCode('');setMessage(ar?'تم تفعيل التحقق بخطوتين.':'Two-step verification is enabled.');await load();
  };
  const remove=async(factorId:string)=>{
    if(!supabase||busy||!window.confirm(ar?'إيقاف التحقق بخطوتين لهذا الحساب؟':'Disable two-step verification for this account?'))return;
    setBusy(true);setMessage('');
    const {error}=await supabase.auth.mfa.unenroll({factorId});
    setBusy(false);
    setMessage(error?.message||(ar?'تم إلغاء طريقة التحقق.':'Verification method removed.'));
    if(!error)await load();
  };

  return <section className="account-security" aria-labelledby="account-security-title">
    <header><span className="os-icon"><ShieldCheck/></span><div><h2 id="account-security-title">{ar?'الأمان وتسجيل الدخول':'Security and sign-in'}</h2><p>{ar?'احمِ حسابك بتطبيق مصادقة، وراجع طريقة دخولك الحالية.':'Protect your account with an authenticator app and review your current sign-in method.'}</p></div></header>
    <div className="account-security__method"><div><KeyRound/><span><b>{ar?'طريقة الدخول':'Sign-in method'}</b><small>{provider==='google'?(ar?'Google مرتبط':'Google connected'):(ar?'البريد الإلكتروني':'Email') }</small></span></div><i><CheckCircle2/>{ar?'نشط':'Active'}</i></div>
    {factors.length>0 ? <div className="account-security__factors">{factors.map(factor=><div key={factor.id}><Smartphone/><span><b>{ar?'تطبيق المصادقة':'Authenticator app'}</b><small>{factor.friendly_name||new Date(factor.created_at).toLocaleDateString(ar?'ar-OM':'en-GB')}</small></span><i><CheckCircle2/>{ar?'مفعّل':'Enabled'}</i><button type="button" className="ui-icon-button" onClick={()=>void remove(factor.id)} aria-label={ar?'إزالة':'Remove'}><Trash2/></button></div>)}</div> : !enrollment && <div className="account-security__setup"><div><b>{ar?'التحقق بخطوتين غير مفعّل':'Two-step verification is off'}</b><p>{ar?'استخدم تطبيق مصادقة لحماية الحساب حتى لو انكشفت كلمة المرور.':'Use an authenticator app to protect the account even if the password is exposed.'}</p></div><button type="button" className="os-secondary" onClick={()=>void enroll()} disabled={busy}>{busy?<LoaderCircle className="spin"/>:<Smartphone/>}{ar?'تفعيل':'Enable'}</button></div>}
    {enrollment&&<form className="account-security__enroll" onSubmit={verify}><div><h3>{ar?'امسح الرمز في تطبيق المصادقة':'Scan with your authenticator app'}</h3><p>{ar?'بعد المسح، أدخل الرمز المكوّن من 6 أرقام لإكمال التفعيل.':'After scanning, enter the 6-digit code to finish setup.'}</p></div><img src={enrollment.qr} alt={ar?'رمز إعداد التحقق بخطوتين':'Two-step verification setup code'}/><details><summary>{ar?'لا أستطيع مسح الرمز':'I cannot scan the code'}</summary><code>{enrollment.secret}</code></details><label><span>{ar?'رمز التحقق':'Verification code'}</span><input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))}/></label><div><button className="os-primary" disabled={busy||code.length!==6}>{busy?<LoaderCircle className="spin"/>:null}{ar?'تأكيد التفعيل':'Confirm setup'}</button><button type="button" className="os-text-link" onClick={()=>{setEnrollment(null);setCode('');}}>{ar?'إلغاء':'Cancel'}</button></div></form>}
    {message&&<p className="account-security__message" role="status">{message}</p>}
  </section>;
}
