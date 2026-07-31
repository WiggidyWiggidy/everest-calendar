#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const execFileAsync = promisify(execFile);
async function loadEnvFile(filePath) { try { const raw = await fs.readFile(filePath, 'utf8'); for (const line of raw.split(/\r?\n/)) { const t=line.trim(); if (!t||t.startsWith('#')||!t.includes('=')) continue; const i=t.indexOf('='); const k=t.slice(0,i).trim().replace(/^export\s+/,''); let v=t.slice(i+1).trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); if(!process.env[k]) process.env[k]=v; } } catch {} }
async function loadEnv(){ await loadEnvFile(path.join(os.homedir(),'.zshenv')); await loadEnvFile(path.join(repoRoot,'.env.local')); }
function env(){ return {base:(process.env.EVEREST_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,''), key:process.env.EVEREST_SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||''}; }
function sanitize(v=''){ return String(v).replace(/Bearer\s+[A-Za-z0-9._-]+/g,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9._-]+/g,'[redacted-jwt]').slice(0,1000); }
async function curl(args){ const {stdout}=await execFileAsync('/usr/bin/curl',args,{maxBuffer:8*1024*1024}); return JSON.parse(stdout||'null'); }
function headers(key){ return ['-H',`apikey: ${key}`,'-H',`Authorization: Bearer ${key}`,'-H','Content-Type: application/json']; }
async function post(table,payload){ const {base,key}=env(); return curl(['-sS','--max-time','30','--retry','3','--retry-delay','1','--retry-all-errors','-X','POST',`${base}/rest/v1/${table}`,...headers(key),'-H','Prefer: return=representation','-d',JSON.stringify(payload)]); }
async function del(table,id){ const {base,key}=env(); return curl(['-sS','--max-time','30','--retry','3','--retry-delay','1','--retry-all-errors','-X','DELETE',`${base}/rest/v1/${table}?id=eq.${id}`,...headers(key),'-H','Prefer: return=representation']); }
async function get(table,params){ const {base,key}=env(); const url=new URL(`${base}/rest/v1/${table}`); for(const [k,v] of params) url.searchParams.append(k,v); return curl(['-sS','--max-time','30','--retry','3','--retry-delay','1','--retry-all-errors',url.toString(),'-H',`apikey: ${key}`,'-H',`Authorization: Bearer ${key}`,'-H','Accept: application/json']); }
async function main(){
  await loadEnv();
  const spec=JSON.parse(await fs.readFile(path.join(repoRoot,'artifacts/kryo-experiment-packets/latest/experiment-spec.json'),'utf8'));
  const smoke=`smoke_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  let leadId=null, depId=null;
  try {
    const lead=(await post('kryo_leads',{source:'manual',status:'new',consent_to_follow_up:true,consent_captured_at:new Date().toISOString(),phone_e164:'+10000000000',session_id:smoke,anonymous_id:smoke,channel:'smoke_test',market:'AE',device_type:'desktop',meta_ad_id:'smoke_ad',angle_id:spec.angle_id,hook_id:spec.hook_id,landing_page_version:spec.treatment?.landing_page_version,experiment_id:spec.experiment_id,experiment_key:spec.experiment_key,qualification_notes:'Synthetic smoke test. Delete immediately.',raw_payload:{smoke_test:true}}))[0];
    leadId=lead.id;
    const dep=(await post('kryo_deposit_events',{lead_id:leadId,experiment_id:spec.experiment_id,event_type:'deposit_completed',amount:1,currency:'AED',payment_provider:'smoke_test',payment_reference:smoke,meta_ad_id:'smoke_ad',landing_page_version:spec.treatment?.landing_page_version,raw_payload:{smoke_test:true}}))[0];
    depId=dep.id;
    const rollup=await get('vw_kryo_growth_spine_daily',[['experiment_key',`eq.${spec.experiment_key}`],['angle_id',`eq.${spec.angle_id}`],['hook_id',`eq.${spec.hook_id}`],['limit','5']]);
    console.log(JSON.stringify({status:'ok', inserted:{lead_id:leadId,deposit_event_id:depId}, rollup_rows_seen:Array.isArray(rollup)?rollup.length:null, cleanup:'pending', mutation_performed:true},null,2));
  } finally {
    const cleanup={deposit_deleted:null, lead_deleted:null};
    if (depId) cleanup.deposit_deleted=(await del('kryo_deposit_events',depId)).length;
    if (leadId) cleanup.lead_deleted=(await del('kryo_leads',leadId)).length;
    console.error(JSON.stringify({cleanup, mutation_type:'synthetic_smoke_rows_deleted'},null,2));
  }
}
main().catch((err)=>{ console.error(sanitize(err instanceof Error ? err.stack||err.message : String(err))); process.exit(1); });
