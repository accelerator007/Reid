#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const tablePattern=/^[a-z][a-z0-9_]*$/;
const sha256=value=>createHash('sha256').update(value).digest('hex');
const quoteIdentifier=value=>`"${value.replaceAll('"','""')}"`;

function assertTable(table) {
  if(!tablePattern.test(table))throw Error(`Unsafe table name: ${table}`);
}

export async function exportTables({url,key,tables,outDir,fetchImpl=fetch,pageSize=1000,now=()=>new Date()}) {
  const base=new URL(url);
  if(base.protocol!=='https:')throw Error('The Supabase URL must use HTTPS.');
  if(!key)throw Error('The service key is required.');
  const unique=[...new Set(tables.map(value=>value.trim()).filter(Boolean))].sort();
  unique.forEach(assertTable);
  await mkdir(outDir,{recursive:true});

  async function exportOne(table) {
    const rows=[];
    for(let start=0;;start+=pageSize){
      const endpoint=new URL(`/rest/v1/${table}`,base);
      endpoint.searchParams.set('select','*');
      const response=await fetchImpl(endpoint,{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json',Range:`${start}-${start+pageSize-1}`},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error(`Export failed for ${table}: HTTP ${response.status}`);
      const page=await response.json();
      if(!Array.isArray(page))throw Error(`Export failed for ${table}: expected an array`);
      rows.push(...page);
      if(page.length<pageSize)break;
    }
    const body=JSON.stringify(rows);
    await writeFile(resolve(outDir,`${table}.json`),body,{mode:0o600});
    return {table,rows:rows.length,sha256:sha256(body),bytes:Buffer.byteLength(body)};
  }

  const entries=[];
  let cursor=0;
  async function worker(){
    while(cursor<unique.length){const index=cursor++;entries[index]=await exportOne(unique[index]);}
  }
  await Promise.all(Array.from({length:Math.min(4,unique.length)},worker));
  const manifest={format:'reid-public-rest-v1',createdAt:now().toISOString(),projectRef:base.hostname.split('.')[0],tables:entries};
  await writeFile(resolve(outDir,'..','manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
  return manifest;
}

export async function verifyBackup({backupDir}) {
  const manifest=JSON.parse(await readFile(resolve(backupDir,'manifest.json'),'utf8'));
  if(manifest?.format!=='reid-public-rest-v1'||!Array.isArray(manifest.tables))throw Error('Invalid backup manifest.');
  for(const entry of manifest.tables){
    assertTable(entry.table);
    const body=await readFile(resolve(backupDir,'data',`${entry.table}.json`),'utf8');
    const rows=JSON.parse(body);
    if(!Array.isArray(rows)||rows.length!==entry.rows||sha256(body)!==entry.sha256||Buffer.byteLength(body)!==entry.bytes)throw Error(`Backup verification failed for ${entry.table}.`);
  }
  return manifest;
}

export async function buildRestoreSql({backupDir}) {
  const manifest=await verifyBackup({backupDir});
  const tables=manifest.tables.map(entry=>`public.${quoteIdentifier(entry.table)}`);
  const lines=['\\set ON_ERROR_STOP on','begin;','set local session_replication_role = replica;'];
  if(tables.length)lines.push(`truncate table ${tables.join(', ')} restart identity cascade;`);
  for(const entry of manifest.tables){
    const body=await readFile(resolve(backupDir,'data',`${entry.table}.json`),'utf8');
    if(body.includes('$reid_backup$'))throw Error(`Unsafe backup delimiter in ${entry.table}.`);
    const target=`public.${quoteIdentifier(entry.table)}`;
    lines.push(`insert into ${target} overriding system value select * from json_populate_recordset(null::${target}, $reid_backup$${body}$reid_backup$::json);`);
    lines.push(`do $$ begin if (select count(*) from ${target}) <> ${entry.rows} then raise exception 'restore count mismatch: ${entry.table}'; end if; end $$;`);
  }
  lines.push('commit;');
  return lines.join('\n')+'\n';
}

function options(argv){
  const parsed={command:argv[0]};
  for(let index=1;index<argv.length;index+=2)parsed[argv[index].replace(/^--/,'')]=argv[index+1];
  return parsed;
}

async function main(){
  const args=options(process.argv.slice(2));
  if(args.command==='export'){
    const tables=(await readFile(args.tables,'utf8')).split(/\r?\n/);
    const manifest=await exportTables({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,tables,outDir:resolve(args.out,'data')});
    console.log(`Exported ${manifest.tables.length} tables and ${manifest.tables.reduce((sum,item)=>sum+item.rows,0)} rows.`);
  }else if(args.command==='verify'){
    const manifest=await verifyBackup({backupDir:resolve(args.backup)});
    console.log(`Verified ${manifest.tables.length} tables and ${manifest.tables.reduce((sum,item)=>sum+item.rows,0)} rows.`);
  }else if(args.command==='restore-sql'){
    await writeFile(resolve(args.output),await buildRestoreSql({backupDir:resolve(args.backup)}),{mode:0o600});
    console.log(`Restore SQL written to ${basename(args.output)}.`);
  }else throw Error('Usage: rest-backup.mjs export --tables FILE --out DIR | verify --backup DIR | restore-sql --backup DIR --output FILE');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
