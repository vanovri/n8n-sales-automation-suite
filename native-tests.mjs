// Generate native n8n test workflows. Every external service is replaced by a local Code stub.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {fixed,config,fixtures,aiResult,verified,lead,deal,invoice,project} from './test.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(process.argv[2] || path.join(root,'..','..','work','native-tests.json'));
const originals=JSON.parse(fs.readFileSync(path.join(root,'all-workflows.json'),'utf8'));
const cloned=structuredClone(originals);
function expr(s){return typeof s==='string'&&s.startsWith('={{')?'('+s.slice(3,-2)+')':JSON.stringify(s);}
for(let index=0;index<cloned.length;index++){
  const w=cloned[index];w.id='qa'+w.id;w.name='QA MOCK '+w.name;w.settings.callerPolicy='workflowsFromSameOwner';
  const removed=new Set(w.nodes.filter(n=>n.type.endsWith('.webhook')||n.type.endsWith('.scheduleTrigger')||n.type.includes('lmChatGoogleGemini')||n.type.endsWith('.stickyNote')).map(n=>n.name));
  w.nodes=w.nodes.filter(n=>!removed.has(n.name));
  for(const name of removed)delete w.connections[name];
  for(const types of Object.values(w.connections))for(const branches of Object.values(types))for(let i=0;i<branches.length;i++)branches[i]=branches[i].filter(e=>!removed.has(e.node));
  const first=w.connections['Workflow input'].main[0][0].node;
  const seed={id:randomUUID(),name:'Seed synthetic fixture',type:'n8n-nodes-base.code',typeVersion:2,position:[0,300],parameters:{mode:'runOnceForAllItems',jsCode:'return [{json:'+JSON.stringify(fixtures[index])+'}];'}};
  w.nodes.push(seed);w.connections['Workflow input'].main[0]=[{node:seed.name,type:'main',index:0}];w.connections[seed.name]={main:[[{node:first,type:'main',index:0}]]};
  for(const n of w.nodes){
    let js;
    delete n.credentials;
    if(n.type.endsWith('.code')) n.parameters.jsCode=n.parameters.jsCode.replace(/^const \$env = Object.freeze\([^\n]*\);\n/,'const $env=Object.freeze('+JSON.stringify(config)+');\n');
    else if(n.type.includes('chainLlm'))js='return $input.all().map((item,i)=>({json:{text:'+JSON.stringify(JSON.stringify(aiResult))+'},pairedItem:{item:i}}));';
    else if(n.type.endsWith('.googleSheets')){
      const p=n.parameters,table=p.sheetName.value;
      if(p.operation==='read'){
        const rows=table==='Leads_DB'?(index===1?[]:[{...lead,claim_status:'UNCLAIMED',...(index===11?{followup_count:''}:{})}]):table==='CRM_Deals'?[deal]:table==='Invoices_DB'?[index===16?{...invoice,payment_status:'PAID'}:invoice]:table==='Projects_DB'?(index===16?[]:[project]):[];
        js='return '+JSON.stringify(rows)+'.map(json=>({json}));';
      }else js='return $input.all().map((item,i)=>{const $json=item.json;return {json:{'+Object.entries(p.columns.value).map(([key,value])=>JSON.stringify(key)+':'+expr(value)).join(',')+'},pairedItem:{item:i}};});';
    }else if(n.type.endsWith('.httpRequest')){
      const p=n.parameters;
      const result=n.name==='Create Midtrans payment link'?{redirect_url:'https://example.test/pay'}:n.name==='Verify Midtrans server status'?verified:n.name==='Fetch configured pricing page'?{statusCode:200,body:'<html>Test price Rp 1.000.000</html>'}:{status:true,id:'mock-provider'};
      js='return $input.all().map((item,i)=>{const $json=item.json;'+(p.jsonBody?'const payload='+expr(p.jsonBody)+';if(!payload)throw new Error("Missing mock HTTP payload");':'')+'return {json:'+JSON.stringify(result)+',pairedItem:{item:i}};});';
    }else if(n.type.endsWith('.googleCalendar')) js=n.parameters.operation==='getAll'?'return [{json:{}}];':'return $input.all().map((item,i)=>({json:{id:"created-event",hangoutLink:"https://meet.google.com/test-only"},pairedItem:{item:i}}));';
    else if(n.type.endsWith('.googleDrive')) js='return $input.all().map((item,i)=>({json:{id:"created-folder"},pairedItem:{item:i}}));';
    else if(n.type.endsWith('.telegram')||n.type.endsWith('.gmail'))js='return $input.all().map((item,i)=>({json:{id:"mock-message"},pairedItem:{item:i}}));';
    else if(n.type.endsWith('.wait'))js='return $input.all(); // Test shortcut: do not wait 15 real minutes.';
    else if(n.type.endsWith('.executeWorkflow')){
      // QA waits for async alerts so failures remain observable in the test result.
      n.parameters.options.waitForSubWorkflow=true;
      const id=n.parameters.workflowId.value;
      n.parameters.workflowId.value=id.startsWith('=')?'={{ "qa" + $json.target_workflow_id }}':'qa'+id;
    }
    if(js){n.type='n8n-nodes-base.code';n.typeVersion=2;n.parameters={mode:'runOnceForAllItems',jsCode:js};}
    if(n.type.endsWith('.code')){
      // Code nodes run in separate n8n sandboxes, outside the generator's frozen clock.
      n.parameters.jsCode=`const Date=class extends globalThis.Date {constructor(...args){super(...(args.length?args:[${fixed}]));}static now(){return ${fixed};}};\n`+n.parameters.jsCode;
    }
  }
}
const suite={id:'qaRevenueSuite',name:'QA MOCK Revenue suite. No external delivery.',active:false,nodes:[{id:randomUUID(),name:'Workflow input',type:'n8n-nodes-base.executeWorkflowTrigger',typeVersion:1.1,position:[0,300],parameters:{inputSource:'passthrough'}}],connections:{},settings:{executionOrder:'v1',timezone:'Asia/Jakarta',callerPolicy:'workflowsFromSameOwner'}};
let last='Workflow input';
for(const w of cloned){const name='Run '+w.id;const n={id:randomUUID(),name,type:'n8n-nodes-base.executeWorkflow',typeVersion:1.3,position:[suite.nodes.length*200,300],alwaysOutputData:true,parameters:{source:'database',workflowId:{__rl:true,value:w.id,mode:'id'},mode:'once',options:{waitForSubWorkflow:true}}};suite.nodes.push(n);suite.connections[last]={main:[[{node:name,type:'main',index:0}]]};last=name;}
const done={id:randomUUID(),name:'Native suite complete',type:'n8n-nodes-base.code',typeVersion:2,position:[4500,300],parameters:{jsCode:'return [{json:{status:"PASS",workflows:21,scope:"Native n8n engine. External service nodes replaced with mocks. No provider delivery."}}];'}};suite.nodes.push(done);suite.connections[last]={main:[[{node:done.name,type:'main',index:0}]]};
// Inline QA children use n8n's supported parameter source. No QA schedules or webhooks are published.
function inline(w,stack=[]){
  if(stack.includes(w.id))throw new Error('QA recursion');
  const out=structuredClone(w);
  for(const n of out.nodes.filter(n=>n.type.endsWith('.executeWorkflow'))){
    const target=n.parameters.workflowId.value;
    const child=cloned.find(c=>c.id===(target.startsWith('=')?'qarevenue08':target));
    if(!child)throw new Error('Unknown QA target '+target);
    n.parameters.source='parameter';n.parameters.workflowJson=JSON.stringify(inline(child,[...stack,w.id]));delete n.parameters.workflowId;
  }
  return out;
}
const runner=inline(suite);
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify([runner],null,2)+'\n');
console.log('Generated 1 native QA runner containing 21 inline mock workflows at '+output);
