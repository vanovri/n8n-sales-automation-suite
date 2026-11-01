import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const configPath=path.join(root,'config.local.json');
const config=JSON.parse(fs.readFileSync(fs.existsSync(configPath)?configPath:path.join(root,'config.example.json'),'utf8'));
const workflows=JSON.parse(fs.readFileSync(path.join(root,'all-workflows.json'),'utf8'));
const mandatory=['GSHEET_CRM_ID','REPORT_RECIPIENT_EMAIL','TELEGRAM_SALES_CHAT_ID','SALES_OWNER_WA','SALES_MANAGER_WA','GOOGLE_REVIEW_URL','QUOTE_TAX_RATE','META_GRAPH_VERSION'];
const missing=mandatory.filter(k=>config[k]===undefined||String(config[k]).trim()==='');
for(const k of ['SALES_ROSTER_JSON','SERVICE_CATALOG_JSON','UPGRADE_CATALOG_JSON','COMPETITOR_WATCHLIST_JSON']){
  try{const value=JSON.parse(config[k]);if(!Object.keys(value).length)missing.push(k);}catch{missing.push(k);}
}
const placeholderBindings=[];
for(const w of workflows)for(const node of w.nodes)for(const [type,credential]of Object.entries(node.credentials||{}))if(!credential.id||credential.id.startsWith('SET_'))placeholderBindings.push({workflow:w.id,node:node.name,type,label:credential.name});
let nodeCompatibility=null;
const schemaPath=process.argv.slice(2).find(x=>!x.startsWith('--')) || path.join(root,'schemas','node-types.json');
if(schemaPath&&fs.existsSync(schemaPath)){
  const types=JSON.parse(fs.readFileSync(schemaPath,'utf8'));
  const failures=[];
  for(const w of workflows)for(const n of w.nodes){const t=types.find(x=>x.name===n.type&&(Array.isArray(x.version)?x.version:[x.version]).includes(n.typeVersion));if(!t)failures.push({workflow:w.id,node:n.name,type:n.type,version:n.typeVersion});}
  nodeCompatibility={nodes_checked:workflows.reduce((s,w)=>s+w.nodes.length,0),failures};
}
const report={generated_at:new Date().toISOString(),ready_for_live:missing.length===0&&placeholderBindings.length===0&&nodeCompatibility?.failures.length===0,config_file_exists:fs.existsSync(configPath),missing_public_configuration:missing,unbound_credentials:placeholderBindings,node_compatibility:nodeCompatibility,live_evidence:fs.existsSync(path.join(root,'reports','live-webhook.json'))?JSON.parse(fs.readFileSync(path.join(root,'reports','live-webhook.json'),'utf8')):null,external_delivery_verified:false,payment_provider:'Midtrans sandbox by default',whatsapp_provider:'Fonnte',production_limits:['Sheets deduplication and payment processing are not transactional under concurrent executions.','A provider timeout after accepting a message may require manual reconciliation before retry.','Drive folder creation does not share the folder with the customer.','Quote output is HTML. No PDF upload or PDF URL is fabricated.','Onboarding schedules kickoff two business days ahead at 10:00 WIB. A conflict stops booking and needs manual recovery.','Competitor summaries describe observed snapshots. No price-change claim without comparison.','Customer opt-in and DNC fields must come from an authenticated consent source.']};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports','preflight.json'),JSON.stringify(report,null,2)+'\n');
console.log('Live readiness: '+(report.ready_for_live?'READY':'BLOCKED')+'. Missing public config: '+missing.length+'. Unbound credential nodes: '+placeholderBindings.length+'.');
if(process.argv.includes('--strict')&&!report.ready_for_live)process.exitCode=2;
