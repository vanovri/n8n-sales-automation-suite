import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as L from './logic.mjs';
globalThis.require = createRequire(import.meta.url);
const root=path.dirname(fileURLToPath(import.meta.url));
const workflows=JSON.parse(fs.readFileSync(path.join(root,'all-workflows.json'),'utf8'));
const fixed=Date.parse('2026-11-02T03:00:00Z');
const RealDate=Date;
globalThis.Date=class extends RealDate { constructor(...args){ super(...(args.length?args:[fixed])); } static now(){ return fixed; } };
const config={ GSHEET_CRM_ID:'SYNTHETIC-SHEET',REPORT_RECIPIENT_EMAIL:'report@example.test',TELEGRAM_SALES_CHAT_ID:'TEST',SALES_OWNER_WA:'628111111111',SALES_MANAGER_WA:'628222222222',SALES_ROSTER_JSON:JSON.stringify([{name:'Test AE',wa:'628111111111'}]),SERVICE_CATALOG_JSON:JSON.stringify({TEST:{name:'Test <script>',price_idr:1000000}}),UPGRADE_CATALOG_JSON:JSON.stringify({STARTER_WA:{name:'Test Growth',price_idr:2000000}}),GOOGLE_REVIEW_URL:'https://example.test/review',COMPETITOR_WATCHLIST_JSON:JSON.stringify([{name:'Test competitor',url:'https://example.test/pricing'}]),QUOTE_TAX_RATE:'0.11',QUOTE_DISCOUNT_PCT:'0',META_GRAPH_VERSION:'vTEST',MIDTRANS_API_BASE_URL:'https://api.sandbox.midtrans.com',MIDTRANS_SNAP_BASE_URL:'https://app.sandbox.midtrans.com' };
globalThis.$env=config;
const contact={full_name:'Synthetic Client',email:'client@example.test',phone:'081234567890',company:'Synthetic Co',marketing_opt_in:true,do_not_contact:false};
const lead={...L.capture(contact),captured_at:'2026-10-01T03:00:00Z',lead_score:85};
const invoice={...lead,invoice_no:'INV-TEST',amount_idr:1000000,due_date:'2026-11-02',payment_status:'UNPAID',payment_url:'https://example.test/pay'};
const project={...lead,project_id:'PRJ-TEST',invoice_no:'INV-TEST',status:'ACTIVE',package_tier:'STARTER_WA',rating_score:5};
const deal={...lead,deal_id:'DL-TEST',proposal_id:'PROP-TEST',stage:'PROPOSAL_SENT',proposal_sent_at:'2026-10-20T03:00:00Z',deal_value_idr:1000000,created_at:'2026-11-01T03:00:00Z'};
const aiResult={lead_score:85,reason:'Synthetic BANT evidence',reply_text:'Synthetic reply',core_problem:'Synthetic problem',solution:'Synthetic solution',investment:'Not provided',timeline:'Not provided',next_step:'Discuss',summary:'Synthetic summary',actions:['Check pipeline']};
let count=0;const checks=[];
function test(name,fn){fn();count++;checks.push(name);}
function throws(fn,pattern){assert.throws(fn,pattern);}
test('Normalize Indonesian mobile',()=>assert.equal(L.capture(contact).phone_e164,'6281234567890'));
test('Stable lead ID across retries',()=>assert.equal(L.capture(contact).lead_id,L.capture({...contact,phone:'+6281234567890'}).lead_id));
test('Reject empty contact',()=>throws(()=>L.capture({}),/phone or email required/));
test('Reject invalid phone',()=>throws(()=>L.phone('1234'),/Invalid/));
test('Reject malformed email',()=>throws(()=>L.capture({email:'a@'}),/Invalid email/));
test('Email-only lead accepted',()=>assert.ok(L.capture({email:'client@example.test'}).lead_id));
test('Unknown router event rejected',()=>throws(()=>L.route({event_type:'malicious'}),/Unsupported/));
test('All 20 routes resolved',()=>{for(const [i,event] of ['lead.captured','wa.greeting','lead.qualify','form.submit','dm.inbound','meeting.book','lead.hot','quote.create','proposal.send','proposal.summarize','leads.followup','proposals.followup','leads.reengage','invoice.create','payment.settled','client.onboard','review.submit','clients.upsell','competitors.check','sales.report'].entries()) assert.equal(L.route({event_type:event,payload:{}}).target_workflow_id,'revenue'+String(i+1).padStart(2,'0'));});
test('Greeting excludes no consent',()=>assert.equal(L.greeting({...lead,marketing_opt_in:false}),null));
test('String false does not count as consent',()=>assert.equal(L.greeting({...lead,marketing_opt_in:'false'}),null));
test('DNC excludes greeting',()=>assert.equal(L.greeting({...lead,status:'DNC'}),null));
test('BANT validates score',()=>throws(()=>L.qualified(lead,{output:'{"lead_score":101,"reason":"x"}'}),/Invalid/));
test('BANT rejects NaN',()=>throws(()=>L.qualified(lead,{output:'{"lead_score":"bad","reason":"x"}'}),/Invalid/));
test('Malformed AI JSON fails closed',()=>throws(()=>L.qualified(lead,{output:'nonsense'}),/valid JSON/));
test('BANT classification boundaries',()=>{for(const [score,tier] of [[39,'COLD'],[40,'WARM'],[74,'WARM'],[75,'HOT']])assert.equal(L.qualified(lead,{output:JSON.stringify({lead_score:score,reason:'evidence'})}).lead_tier,tier);});
test('CRM request retries stable',()=>assert.equal(L.crm({...contact,request_id:'test'}).deal_id,L.crm({...contact,request_id:'test'}).deal_id));
test('Ignore own DM echo',()=>assert.equal(L.dm({sender_id:'1',message:{text:'hi',is_echo:true}}),null));
test('Persist opt-out intent',()=>assert.equal(L.dm({from:'081234567890',text:'STOP'}).opted_out,true));
test('Unsupported DM channel rejected',()=>throws(()=>L.dm({sender_id:'1',text:'hi',channel:'TIKTOK'}),/Unsupported/));
test('Booking requires timezone offset',()=>throws(()=>L.booking({...lead,preferred_datetime:'2026-11-03T10:00:00'}),/offset/));
test('Reject past meeting',()=>throws(()=>L.booking({...lead,preferred_datetime:'2026-11-01T10:00:00+07:00'}),/future/));
test('Reject weekend WIB',()=>throws(()=>L.booking({...lead,preferred_datetime:'2026-11-07T10:00:00+07:00'}),/business hours/));
test('Reject booking outside WIB hours',()=>throws(()=>L.booking({...lead,preferred_datetime:'2026-11-03T17:30:00+07:00'}),/business hours/));
test('Reject occupied slot',()=>throws(()=>L.available(lead,[{id:'busy'}]),/conflict/));
test('Calendar event identity stable across timezone spellings',()=>assert.equal(L.booking({...lead,preferred_datetime:'2026-11-03T10:00:00+07:00'}).requested_event_id,L.booking({...lead,preferred_datetime:'2026-11-03T03:00:00Z'}).requested_event_id));
test('Never invent Meet URL',()=>assert.equal(L.booked({...lead,start_iso:'2026-11-03T03:00:00Z'},{id:'evt'}).meet_url,''));
test('Quote numeric totals',()=>{const q=L.quote({...contact,request_id:'quote',items:[{sku:'TEST',qty:2}]});assert.equal(q.grand_total_idr,2220000);assert.equal(q.dp_idr+q.balance_idr,q.grand_total_idr);});
test('Quote escapes HTML',()=>assert.ok(L.quote({...contact,request_id:'quote',items:[{sku:'TEST',qty:1}]}).quote_html.includes('&lt;script&gt;')));
test('Reject negative quantity',()=>throws(()=>L.quote({...contact,request_id:'quote',items:[{sku:'TEST',qty:-1}]}),/Invalid/));
test('Reject unknown SKU',()=>throws(()=>L.quote({...contact,request_id:'quote',items:[{sku:'BAD',qty:1}]}),/Unknown/));
test('Client cannot set discount',()=>assert.equal(L.quote({...contact,discount_pct:100,request_id:'quote',items:[{sku:'TEST',qty:1}]}).discount_idr,0));
test('Proposal requires actual URL',()=>throws(()=>L.proposal({...deal}),/proposal_url/));
test('Follow-up count persists',()=>assert.equal(L.followup({...lead,followup_count:0}).followup_count,1));
test('Blank first follow-up count starts at one',()=>assert.equal(L.followup({...lead,followup_count:' '}).followup_count,1));
test('Unknown previous follow-up counts never send',()=>{
  assert.equal(L.followup({...lead,followup_count:'',last_followup_at:'2000-01-01'}),null);
  assert.equal(L.followup({...lead,followup_count:'not a count'}),null);
  assert.equal(L.followup({...lead,followup_count:0.5}),null);
});
test('Cadence stops after 3 sends',()=>assert.equal(L.followup({...lead,followup_count:3}),null));
test('No same-day follow-up duplicate',()=>assert.equal(L.followup({...lead,last_followup_at:new Date().toISOString()}),null));
test('Do not follow up a reply',()=>assert.equal(L.followup({...lead,last_reply_at:'2026-10-31T00:00:00Z'}),null));
test('Do not follow up won deal',()=>assert.equal(L.followup({...lead,stage:'CLOSED_WON'}),null));
test('Proposal cadence requires stage',()=>assert.equal(L.followup({...deal,stage:'CLOSED_LOST'},true),null));
test('No reengage without opt-in',()=>assert.equal(L.reengage({...lead,marketing_opt_in:false}),null));
test('No reengage after recent reply',()=>assert.equal(L.reengage({...lead,last_reply_at:new Date().toISOString()}),null));
test('Invoice rejects zero amount',()=>throws(()=>L.invoice({...invoice,amount_idr:0}),/Invalid/));
test('Reject boolean monetary input',()=>throws(()=>L.invoice({...invoice,amount_idr:true}),/Invalid/));
test('Reject invalid calendar date',()=>throws(()=>L.invoice({...invoice,due_date:'2026-02-30'}),/Invalid due_date/));
test('Invoice requires provider URL',()=>throws(()=>L.invoiceLink(invoice,{}),/provider payment URL/));
test('Paid invoices have no reminders',()=>assert.equal(L.reminder({...invoice,payment_status:'PAID'}),null));
test('No daily reminder duplicate',()=>assert.equal(L.reminder({...invoice,last_reminder_at:new Date().toISOString()}),null));
test('Reminder only on configured due offsets',()=>assert.equal(L.reminder({...invoice,due_date:'2026-11-04'}),null));
test('Expired payment link never sent in reminder',()=>assert.ok(!L.reminder({...invoice,payment_expires_at:'2026-10-31T00:00:00Z'}).message.includes(invoice.payment_url)));
test('Current payment link included',()=>assert.ok(L.reminder({...invoice,payment_expires_at:'2026-11-03T00:00:00Z'}).message.includes(invoice.payment_url)));
const verified={order_id:'INV-TEST',gross_amount:'1000000.00',transaction_status:'settlement',transaction_id:'TX-TEST'};
test('Empty callback cannot mark paid',()=>throws(()=>L.paymentRequest({}),/order_id/));
test('Unknown invoice rejected',()=>throws(()=>L.paid(verified,{}),/Unknown/));
test('Wrong payment amount rejected',()=>throws(()=>L.paid({...verified,gross_amount:1},invoice),/amount mismatch/));
test('Wrong payment order rejected',()=>throws(()=>L.paid({...verified,order_id:'other'},invoice),/invoice mismatch/));
test('Wrong currency rejected',()=>throws(()=>L.paid({...verified,currency:'USD'},invoice),/currency mismatch/));
test('Pending payment never paid',()=>assert.equal(L.paid({...verified,transaction_status:'pending'},invoice),null));
test('Fraud challenge capture never paid',()=>assert.equal(L.paid({...verified,transaction_status:'capture',fraud_status:'challenge'},invoice),null));
test('Duplicate paid callback no-op',()=>assert.equal(L.paid(verified,{...invoice,payment_status:'PAID'}),null));
test('Settled verified amount accepted',()=>assert.equal(L.paid(verified,invoice).payment_status,'PAID'));
test('Unpaid onboarding rejected',()=>throws(()=>L.onboarding(invoice),/Paid/));
test('Kickoff two business days at 10 WIB',()=>assert.equal(L.onboarding({...invoice,payment_status:'PAID'}).preferred_datetime,'2026-11-04T10:00:00+07:00'));
test('No fabricated Drive folder',()=>throws(()=>L.onboarded(project,{}),/folder ID/));
test('CSAT 1..5 required',()=>throws(()=>L.review({...project,request_id:'review',rating_score:6}),/Invalid/));
test('Review invitation reaches low score',()=>assert.ok(L.review({...project,request_id:'review',rating_score:1}).message.includes('https://example.test/review')));
test('No invented review feedback',()=>assert.equal(L.review({...project,request_id:'review',rating_score:5}).feedback,''));
test('No upsell without rating',()=>assert.equal(L.upsell({...project,rating_score:undefined}),null));
test('Upsell 90-day cooldown',()=>assert.equal(L.upsell({...project,last_upsell_at:new Date().toISOString()}),null));
test('Only successful nonempty pricing responses create snapshots',()=>{
  const competitor={competitor_name:'X'};
  assert.equal(L.snapshot(competitor,{}),null);
  assert.equal(L.snapshot(competitor,{statusCode:308,body:'Redirect'}),null);
  assert.equal(L.snapshot(competitor,{statusCode:403,body:'Forbidden'}),null);
  assert.equal(L.snapshot(competitor,{statusCode:200,body:'<style>a{}</style>'}),null);
  assert.equal(L.snapshot(competitor,{statusCode:200,body:'<b>Rp 1.000</b>'}).snapshot,'Rp 1.000');
});
test('Empty weekly data zero revenue',()=>{const r=L.weekly([]);assert.equal(r.won_revenue_idr,0);assert.equal(r.total_deals,0);assert.equal(r.win_rate_pct,0);});
test('Old and future records excluded',()=>assert.equal(L.weekly([{deal_id:'old',date:'2020-01-01',amount_idr:999,status:'CLOSED_WON'},{deal_id:'future',date:'2030-01-01',amount_idr:999,status:'CLOSED_WON'}]).won_revenue_idr,0));
test('Win rate uses closed deals',()=>{const r=L.weekly([{...deal,deal_id:'one',status:'',stage:'CLOSED_WON'},{...deal,deal_id:'two',stage:'CLOSED_LOST'},{...deal,deal_id:'three',stage:'PROPOSAL_SENT'}]);assert.equal(r.win_rate_pct,50);assert.equal(r.open_pipeline_idr,1000000);});
test('Duplicate report deal rejected',()=>throws(()=>L.weekly([deal,deal]),/Duplicate/));
test('Report escapes AI content',()=>assert.ok(L.report(L.weekly([]),{output:'{"summary":"<script>","actions":[]}'}).email_html.includes('&lt;script&gt;')));
test('21 inactive workflows and valid graph edges',()=>{assert.equal(workflows.length,21);for(const w of workflows){assert.equal(w.active,false);const names=new Set(w.nodes.map(n=>n.name));assert.equal(names.size,w.nodes.length);for(const [src,types]of Object.entries(w.connections)){assert.ok(names.has(src));for(const branches of Object.values(types))for(const branch of branches)for(const e of branch)assert.ok(names.has(e.node));}for(const n of w.nodes.filter(n=>n.type.endsWith('.code')))new vm.Script('(function(){'+n.parameters.jsCode+'})()');}});

const fixtures=[{event_type:'quote.create',payload:{...contact,request_id:'quote',items:[{sku:'TEST',qty:1}]}},contact,lead,lead,{...contact,request_id:'form'}, {from:'081234567890',text:'Harga?',channel:'WHATSAPP'}, {...lead,preferred_datetime:'2026-11-03T10:00:00+07:00'},lead,{...contact,request_id:'quote',items:[{sku:'TEST',qty:1}]},{...deal,proposal_url:'https://example.test/proposal'}, {...lead,proposal_id:'PROP-TEST',proposal_text:'Synthetic scope'}, {},{},{},invoice,{order_id:'INV-TEST'}, {invoice_no:'INV-TEST'}, {...project,request_id:'review',rating_score:2},{},{},{}];
const graphResults=[];
async function runGraph(w,input,depth=0){
  assert.ok(depth<5,'Subworkflow recursion');
  const data=new Map(), effects=[];
  const db={Leads_DB:[{...lead,claim_status:'UNCLAIMED'}],CRM_Deals:[deal],Invoices_DB:[w.id==='revenue16'?{...invoice,payment_status:'PAID'}:invoice],Projects_DB:w.id==='revenue16'?[]:[project]};
  if(w.id==='revenue01')db.Leads_DB=[];
  const selector=name=>({first:()=>{assert.ok(data.has(name),'Node not executed: '+name);return data.get(name)[0];},all:()=>data.get(name)||[],itemMatching:i=>{const values=data.get(name);assert.ok(values?.length,'Unexecuted context '+name);return values[i]||values[0];},get item(){return this.first();}});
  const evaluate=(value,item)=>{
    if(typeof value==='string'&&value.startsWith('={{'))return vm.runInNewContext('('+value.slice(3,-2)+')',{$json:item.json,$:selector,$env:config,JSON,Math,encodeURIComponent});
    if(Array.isArray(value))return value.map(v=>evaluate(v,item));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,evaluate(v,item)]));
    return value;
  };
  async function visit(name,items){
    const n=w.nodes.find(x=>x.name===name);assert.ok(n,'Unknown graph node');let out=items,branch=0;
    if(n.type.endsWith('.code')){
      const source=n.parameters.jsCode.replace(/^const \$env = Object.freeze\([^\n]*\);\n/,'');
      out=vm.runInNewContext('(function(){'+source+'})()',{$input:{all:()=>items,first:()=>items[0]},$:selector,$env:config,require:globalThis.require,Date:globalThis.Date,Intl,Math,JSON,Number,String,Boolean,Array,Object,encodeURIComponent},{timeout:2000});
      assert.ok(Array.isArray(out),name+' must return items');
    }else if(n.type.endsWith('.if')){
      const c=n.parameters.conditions.conditions[0],yes=items.filter(item=>evaluate(c.leftValue,item)),no=items.filter(item=>!evaluate(c.leftValue,item));
      data.set(name,items);for(const [index,list]of [[0,yes],[1,no]]){if(!list.length)continue;for(const target of w.connections[name]?.main?.[index]||[])await visit(target.node,list);}return;
    }else if(n.type.endsWith('.googleSheets')){
      const p=n.parameters,table=p.sheetName.value;
      if(p.operation==='read')out=items.flatMap(item=>{let rows=db[table]||[];for(const f of p.filtersUI?.values||[])rows=rows.filter(row=>row[f.lookupColumn]===evaluate(f.lookupValue,item));return rows.length?rows.map(json=>({json})):[{json:{}}];});
      else {out=items.map(item=>({json:evaluate(p.columns.value,item)}));effects.push({type:'sheet-write',table,rows:out.length});for(const item of out){db[table]||=[];const k=p.columns.matchingColumns[0],index=db[table].findIndex(r=>r[k]===item.json[k]);if(index<0)db[table].push(item.json);else db[table][index]={...db[table][index],...item.json};}}
    }else if(n.type.includes('chainLlm')){effects.push({type:'mock-ai',workflow:w.id});out=items.map(()=>({json:{text:JSON.stringify(aiResult)}}));}
    else if(n.type.endsWith('.httpRequest')){
      out=items.map(item=>{if(n.name==='Create Midtrans payment link')return{json:{redirect_url:'https://example.test/pay'}};if(n.name==='Verify Midtrans server status')return{json:verified};if(n.name==='Fetch configured pricing page')return{json:{statusCode:200,body:'<html>Test price Rp 1.000.000</html>'}};const body=evaluate(n.parameters.jsonBody,item);if(n.name.includes('WhatsApp')){assert.ok(body.target,'Missing WA target');assert.ok(body.message,'Missing WA message');}effects.push({type:'mock-http',node:n.name});return{json:{status:true,id:'provider-test'}};});
    }else if(n.type.endsWith('.googleCalendar')){for(const item of items)evaluate(n.parameters,item);out=n.parameters.operation==='getAll'?[{json:{}}]:items.map(()=>({json:{id:'created-event',hangoutLink:'https://meet.google.com/test-only'}}));}
    else if(n.type.endsWith('.googleDrive'))out=items.map(()=>({json:{id:'created-folder'}}));
    else if(n.type.endsWith('.telegram')||n.type.endsWith('.gmail')){out=items.map(item=>{const p=evaluate(n.parameters,item);if(n.type.endsWith('.gmail')){if(w.id==='revenue20')p.sendTo=config.REPORT_RECIPIENT_EMAIL;assert.ok(p.sendTo,'Missing email recipient');assert.ok(p.message,'Missing email message');}else assert.ok(p.text,'Missing Telegram text');return{json:{id:'synthetic-message'}};});effects.push({type:'mock-send',node:n.name});}
    else if(n.type.endsWith('.executeWorkflow')){out=[];for(const item of items){let target=evaluate(n.parameters.workflowId.value,item);const child=workflows.find(w=>w.id===target);assert.ok(child,'Target workflow missing '+target);const result=await runGraph(child,item.json,depth+1);out.push({json:result.last});effects.push(...result.effects);}}
    else if(n.type.endsWith('.wait'))effects.push({type:'simulated-wait',minutes:n.parameters.amount});
    data.set(name,out);
    if(!out.length)return;
    for(const target of w.connections[name]?.main?.[branch]||[])await visit(target.node,out);
  }
  await visit('Workflow input',[{json:input}]);
  return {last:[...data.values()].at(-1)?.[0]?.json||{},nodes:[...data.keys()],effects};
}
for(let i=0;i<workflows.length;i++){
  const result=await runGraph(workflows[i],fixtures[i]);
  assert.ok(result.nodes.length>2,'Workflow did not exercise logic '+i);
  if(i===1){test('Greeting sends before AI qualification',()=>assert.ok(result.effects.findIndex(e=>e.type==='mock-http')<result.effects.findIndex(e=>e.type==='mock-ai')));}
  graphResults.push({id:workflows[i].id,name:workflows[i].name,status:'PASS',nodes_exercised:result.nodes.length,mocked_effects:result.effects.length});
}
test('Hot-lead SLA does not block caller',()=>assert.equal(workflows.find(w=>w.id==='revenue03').nodes.find(n=>n.name==='Execute 07').parameters.options.waitForSubWorkflow,false));
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports','local-tests.json'),JSON.stringify({time:new RealDate().toISOString(),rule_tests_passed:count,rule_tests:checks,graph_simulations:graphResults,scope:'JavaScript business rules and workflow graph simulation. External services are mocked. This is not native n8n execution or proof of provider delivery.'},null,2)+'\n');
console.log(count+' rule checks PASS; '+graphResults.length+'/21 workflow graph simulations PASS. External services mocked.');
export {fixed,config,fixtures,aiResult,verified,lead,deal,invoice,project};
