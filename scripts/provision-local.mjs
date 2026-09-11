// Run on the authenticated operator Mac. Credentials are captured in memory
// and piped through SSH, never echoed, passed as arguments, or put in Git.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ssh=(host,command,input)=>execFileSync('ssh',[host,command],{encoding:'utf8',input,stdio:['pipe','pipe','inherit']});
const keys=JSON.parse(execFileSync('npx',['--yes','supabase@2.117.0','projects','api-keys','--project-ref','pkogchbrknwmzefjklkr','--reveal','-o','json'],{encoding:'utf8'}));
const anon=keys.find(k=>k.type==='publishable')?.api_key||keys.find(k=>k.name==='anon')?.api_key;
const service=keys.find(k=>k.name==='service_role')?.api_key;
if(!anon||!service)throw Error('missing_supabase_credentials');
const adapter=ssh('ai-lap','cat /home/ai-lap/.config/reid-ai/adapter.env');
const aiToken=adapter.split('\n').find(x=>x.startsWith('REID_ORIGIN_TOKEN='))?.split('=').slice(1).join('=').replace(/^["']|["']$/g,'');
if(!aiToken)throw Error('missing_ai_adapter_token');
const pub=ssh('reid@10.162.46.74','cat /home/reid/.config/reid-os/ai_key.pub').trim();
const hostKey=ssh('ai-lap','cat /etc/ssh/ssh_host_ed25519_key.pub').trim();
const authorize=`import sys,json,pathlib,shutil
p=pathlib.Path('/home/ai-lap/.ssh/authorized_keys')
key=json.load(sys.stdin)['key']
old=p.read_text()
line='restrict,port-forwarding,permitopen="127.0.0.1:11436",command="/bin/false" '+key
if key.split()[1] not in old:
 shutil.copy2(p,p.with_name('authorized_keys.before-reid-os'))
 p.write_text(old.rstrip()+'\\n'+line+'\\n')
 p.chmod(0o600)
print('Restricted ai-lap relay access configured')`;
ssh('ai-lap',`python3 -c '${authorize.replaceAll("'", "'\\''")}'`,JSON.stringify({key:pub}));
const prior=ssh('reid@10.162.46.74',"test ! -f /home/reid/.config/reid-os/service.env || cat /home/reid/.config/reid-os/service.env");
const bridgeToken=prior.split('\n').find(x=>x.startsWith('REID_QR_BRIDGE_TOKEN='))?.split('=').slice(1).join('=')||randomBytes(32).toString('hex');
const config={SUPABASE_URL:'https://pkogchbrknwmzefjklkr.supabase.co',SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,SESSION_KEY:randomBytes(32).toString('hex'),AI_URL:'http://ai-relay:11436',AI_TOKEN:aiToken,REID_QR_BRIDGE_TOKEN:bridgeToken,REID_WHATSAPP_TRANSPORT:'qr'};
const provision=`import sys,json,pathlib
d=json.load(sys.stdin)
root=pathlib.Path('/home/reid/.config/reid-os');root.mkdir(parents=True,exist_ok=True);root.chmod(0o700)
p=root/'service.env'
if p.exists():
 for line in p.read_text().splitlines():
  if line.startswith(('SESSION_KEY=','REID_QR_BRIDGE_TOKEN=')): d['config'][line.split('=',1)[0]]=line.split('=',1)[1]
p.write_text('\\n'.join(k+'='+v for k,v in d['config'].items())+'\\n');p.chmod(0o600)
(root/'known_hosts').write_text('10.162.46.208 '+d['hostKey']+'\\n')
build=root/'build.env';build.write_text('VITE_SUPABASE_URL='+d['config']['SUPABASE_URL']+'\\nVITE_SUPABASE_ANON_KEY='+d['config']['SUPABASE_ANON_KEY']+'\\n');build.chmod(0o600)
print('Runtime credentials saved outside the repository')`;
console.log(ssh('reid@10.162.46.74',`python3 -c '${provision.replaceAll("'", "'\\''")}'`,JSON.stringify({config,hostKey})).trim());
const secretDirectory=mkdtempSync(join(tmpdir(),'reid-secrets-'));
try {
  const secretFile=join(secretDirectory,'transport.env');
  writeFileSync(secretFile,`REID_QR_BRIDGE_TOKEN=${bridgeToken}\nREID_WHATSAPP_TRANSPORT=qr\nREID_LOCAL_AI_ONLY=1\n`,{mode:0o600});chmodSync(secretFile,0o600);
  execFileSync('npx',['--yes','supabase@2.117.0','secrets','set','--project-ref','pkogchbrknwmzefjklkr','--env-file',secretFile],{stdio:['ignore','pipe','inherit']});
  console.log('QR transport configured for the private service bridge');
} finally { rmSync(secretDirectory,{recursive:true,force:true}); }
