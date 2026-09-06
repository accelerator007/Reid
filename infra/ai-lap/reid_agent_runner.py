#!/usr/bin/env python3
import json, os, subprocess, time, urllib.request

RUNNER_URL=os.environ['REID_RUNNER_URL']; RUNNER_TOKEN=os.environ['REID_RUNNER_TOKEN']; ORIGIN_TOKEN=os.environ['REID_ORIGIN_TOKEN']
ADAPTER=os.environ.get('REID_ADAPTER_URL','http://127.0.0.1:11436')
VERSION='1.1.0'; last_heartbeat=0.0; last_ping=None

def telemetry():
    result={}
    try:
      with open('/proc/meminfo',encoding='utf-8') as source:
        values={line.split(':')[0]:int(line.split()[1]) for line in source if ':' in line}
      total=values['MemTotal']/1024/1024; available=values['MemAvailable']/1024/1024
      result.update(memoryUsedGb=round(total-available,2),memoryTotalGb=round(total,2))
    except Exception: pass
    try:
      fields=subprocess.check_output(['nvidia-smi','--query-gpu=utilization.gpu,memory.used,memory.total','--format=csv,noheader,nounits'],text=True,timeout=3).splitlines()[0].split(',')
      result.update(gpuUtilization=int(fields[0]),vramUsedMb=int(fields[1]),vramTotalMb=int(fields[2]))
    except Exception: pass
    try:
      load=os.getloadavg()[0]; cpus=max(1,os.cpu_count() or 1); result['cpuPercent']=round(min(100,load/cpus*100),2)
    except Exception: pass
    return result

def post(url,payload,token_header='authorization',token=None,timeout=140):
    headers={'content-type':'application/json',token_header: token or f'Bearer {RUNNER_TOKEN}'}
    req=urllib.request.Request(url,data=json.dumps(payload).encode(),headers=headers,method='POST')
    with urllib.request.urlopen(req,timeout=timeout) as response:return json.load(response)

def adapter(path,payload): return post(ADAPTER+path,payload,'x-reid-origin-token',ORIGIN_TOKEN)

while True:
  try:
    if time.monotonic()-last_heartbeat > 30:
      ping_started=time.monotonic()
      payload={'action':'heartbeat','version':VERSION,'model':'gemma4:12b','gpu':'NVIDIA RTX 3080 Ti 12GB',**telemetry()}
      if last_ping is not None: payload['pingMs']=last_ping
      post(RUNNER_URL,payload)
      last_ping=round((time.monotonic()-ping_started)*1000)
      last_heartbeat=time.monotonic()
    claimed=post(RUNNER_URL,{'action':'claim'}); job=claimed.get('job')
    if not job: time.sleep(3); continue
    started=time.monotonic()
    try:
      if job['action']=='embed':
        emb=adapter('/api/embeddings',{'prompt':job['input']}).get('embedding',[]); output=''; tokens=0
      else:
        messages=[]
        if job.get('system_prompt'): messages.append({'role':'system','content':job['system_prompt']})
        messages.append({'role':'user','content':job['input']})
        result=adapter('/api/chat',{'messages':messages}); output=result.get('message',{}).get('content',''); tokens=(result.get('prompt_eval_count',0)+result.get('eval_count',0)); emb=adapter('/api/embeddings',{'prompt':output[:4000]}).get('embedding',[]) if output else []
      post(RUNNER_URL,{'action':'complete','runId':job['id'],'output':output,'embedding':emb,'tokenUsage':tokens,'latencyMs':round((time.monotonic()-started)*1000)})
    except Exception as error: post(RUNNER_URL,{'action':'fail','runId':job['id'],'error':type(error).__name__})
  except Exception: time.sleep(5)
