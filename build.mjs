import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import * as logic from './logic.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(root, fs.existsSync(path.join(root,'config.local.json')) ? 'config.local.json' : 'config.example.json'),'utf8'));
const bindingsPath=path.join(root,'credential-bindings.local.json');
const bindings=fs.existsSync(bindingsPath)?JSON.parse(fs.readFileSync(bindingsPath,'utf8')):{};
const directory = path.join(root, 'workflows');
const originalNames = fs.readdirSync(directory).filter(x => /^\d\d-.*\.json$/.test(x)).sort();
const titles = ['Master Revenue Router', 'Auto Lead Capture', 'Instant WA Greeting', 'AI Lead Qualifier', 'Form ke CRM', 'AI DM Auto-Reply', 'Auto Booking Meeting', 'Notif Hot Leads Sales', 'Quote Generator', 'Kirim Proposal', 'AI Proposal Summary', 'Follow-Up WA', 'Follow-Up Proposal', 'Re-Engage Leads', 'Invoice dan Reminder', 'Notif Payment Sukses', 'Onboarding Klien', 'Review dan Rating', 'Upsell Sequence', 'AI Competitor Monitor', 'AI Sales Weekly Report'];
function helpersFor(body) {
  const used = new Set();
  let source = body, changed = true;
  while (changed) {
    changed = false;
    for (const [name, fn] of Object.entries(logic)) {
      if (!used.has(name) && new RegExp('\\b' + name + '\\s*\\(').test(source)) {
        used.add(name); source += '\n' + fn.toString(); changed = true;
      }
    }
  }
  return [...used].map(name => logic[name].toString()).join('\n');
}
const sheets = {};
const binding = {
  googleSheetsOAuth2Api: 'Google Sheets', googleCalendarOAuth2Api: 'Google Calendar', googleDriveOAuth2Api: 'Google Drive', gmailOAuth2: 'Gmail', googlePalmApi: 'Gemini', telegramApi: 'Telegram', httpHeaderAuth: 'Revenue webhook or Fonnte', httpBasicAuth: 'Midtrans server key'
};
const definitions = [];
function expression(s) { return '={{ ' + s + ' }}'; }
function node(w, name, type, parameters, version = 1, extra = {}) {
  const n = { id: randomUUID(), name, type: type.includes('.') ? type : 'n8n-nodes-base.' + type, typeVersion: version, position: [240 + w.nodes.length * 230, 400], parameters, ...extra };
  w.nodes.push(n); return name;
}
function edge(w, from, to, branch = 0, type = 'main') {
  const c = w.connections[from] ||= {}; c[type] ||= []; c[type][branch] ||= [];
  c[type][branch].push({ node: to, type, index: 0 });
}
function code(w, name, body) {
  const source = helpersFor(body) + '\n' + body;
  // Only public configuration is embedded. Service secrets stay in n8n credentials.
  const prefix = source.includes('$env') ? 'const $env = Object.freeze('+JSON.stringify(config)+');\n' : '';
  return node(w, name, 'code', { mode: 'runOnceForAllItems', jsCode: prefix + source }, 2);
}
function map(w, name, call) { return code(w, name, `return $input.all().flatMap((item, i) => { const d = item.json.body ?? item.json; const out = ${call}; return out ? [{json:out,pairedItem:{item:i}}] : []; });`); }
function restore(w, from, previous) {
  const n = code(w, 'Restore ' + from, `return $input.all().map((item,i)=>({json:$(${JSON.stringify(previous)}).itemMatching(i).json,pairedItem:{item:i}}));`);
  edge(w, from, n); return n;
}
function attachCredential(w, name, type, label = binding[type]) {
  const n = w.nodes.find(x => x.name === name); n.credentials = { [type]: bindings[label] || { id: 'SET_' + label.replace(/\W/g, '_'), name: 'CONFIGURE: ' + label } };
}
function sheet(w, previous, table, fields, keyField, read = false, filter) {
  const rl = value => ({ __rl: true, value, mode: value.startsWith('=') ? 'id' : 'name' });
  const params = { resource: 'sheet', operation: read ? 'read' : 'appendOrUpdate', documentId: rl(expression('$env.GSHEET_CRM_ID')), sheetName: rl(table), options: { cellFormat: 'RAW' } };
  const fieldList = fields ? fields.split(' ') : [];
  if (!read) {
    sheets[table] = [...new Set([...(sheets[table] || []), ...fieldList])];
    params.columns = { mappingMode: 'defineBelow', value: Object.fromEntries(fieldList.map(f => [f, expression(`$json[${JSON.stringify(f)}] ?? ''`)])), matchingColumns: [keyField], schema: fieldList.map(f => ({ id: f, displayName: f, type: 'string', display: true, required: false, defaultMatch: f === keyField, canBeUsedToMatch: true })) };
  }
  if (filter) params.filtersUI = { values: [{ lookupColumn: filter[0], lookupValue: expression(filter[1]) }] };
  const name = node(w, (read ? 'Read ' : 'Save ') + table + ' ' + w.nodes.length, 'googleSheets', params, 4.5, { alwaysOutputData: true });
  attachCredential(w, name, 'googleSheetsOAuth2Api'); edge(w, previous, name);
  return read ? name : restore(w, name, previous);
}
function http(w, previous, name, endpoint, body, credential, method = 'POST', options = {}) {
  const parameters = { method, url: endpoint, options: { timeout: 30000, ...options } };
  if (body) Object.assign(parameters, { sendBody: true, specifyBody: 'json', jsonBody: expression(body) });
  if (credential) Object.assign(parameters, { authentication: 'genericCredentialType', genericAuthType: credential });
  const n = node(w, name, 'httpRequest', parameters, 4.2); if (credential) attachCredential(w, n, credential, name.includes('Midtrans') ? 'Midtrans' : 'Fonnte'); edge(w, previous, n); return n;
}
function wa(w, previous, text = '$json.message', target = '$json.phone_e164') {
  const n = http(w, previous, 'Send WhatsApp ' + w.nodes.length, 'https://api.fonnte.com/send', `{target:${target},message:${text}}`, 'httpHeaderAuth');
  const check = code(w, 'Check Fonnte result ' + w.nodes.length, `return $input.all().map((item,i)=>{ if(item.json.status !== true) throw new Error('WhatsApp provider rejected message'); return {json:$(${JSON.stringify(previous)}).itemMatching(i).json,pairedItem:{item:i}};});`); edge(w, n, check); return check;
}
function telegram(w, previous, text = '$json.alert') {
  const n = node(w, 'Telegram alert ' + w.nodes.length, 'telegram', { resource: 'message', operation: 'sendMessage', chatId: expression('$env.TELEGRAM_SALES_CHAT_ID'), text: expression(text), additionalFields: { appendAttribution: false } }, 1.2);
  attachCredential(w, n, 'telegramApi'); edge(w, previous, n); return restore(w, n, previous);
}
function gmail(w, previous, subject = '$json.subject', message = '$json.email_html', to = '$json.email') {
  const n = node(w, 'Send email ' + w.nodes.length, 'gmail', { resource: 'message', operation: 'send', sendTo: expression(to), subject: expression(subject), emailType: 'html', message: expression(message), options: { appendAttribution: false } }, 2.1);
  attachCredential(w, n, 'gmailOAuth2'); edge(w, previous, n); return restore(w, n, previous);
}
function ai(w, previous, resultFunction) {
  const n = node(w, 'Gemini analysis', '@n8n/n8n-nodes-langchain.chainLlm', { promptType: 'define', text: expression('$json.ai_prompt'), batching:{batchSize:1}, options: {} }, 1.7);
  const model = node(w, 'Gemini model', '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', { modelName: config.GEMINI_MODEL || 'models/gemini-3.8-flash', options: {} }, 1);
  attachCredential(w, model, 'googlePalmApi'); edge(w, model, n, 0, 'ai_languageModel'); edge(w, previous, n);
  const output = map(w, 'Parse Gemini result', `${resultFunction}($(${JSON.stringify(previous)}).itemMatching(i).json, d)`); edge(w, n, output); return output;
}
function child(w, previous, number, wait = true) {
  const target = typeof number === 'number' ? 'revenue' + String(number).padStart(2, '0') : expression(number);
  const n = node(w, 'Execute ' + (typeof number === 'number' ? String(number).padStart(2, '0') : 'target'), 'executeWorkflow', { source: 'database', workflowId: { __rl: true, value: target, mode: 'id' }, mode: 'each', options: { waitForSubWorkflow: wait } }, 1.3);
  edge(w, previous, n); return restore(w, n, previous);
}
function condition(w, previous, name, check) {
  const n = node(w, name, 'if', { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: randomUUID(), leftValue: expression(check), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, 2.2); edge(w, previous, n); return n;
}
function prepare(w, previous, fn) { const n = map(w, 'Prepare ' + titles[w.number], `${fn}(d)`); edge(w, previous, n); return n; }
const leadFields = 'lead_id full_name email phone_e164 company marketing_opt_in do_not_contact captured_at status';
const dealFields = 'deal_id lead_id full_name email phone_e164 company owner_name owner_wa stage deal_value_idr marketing_opt_in do_not_contact';
const projectFields = 'project_id invoice_no full_name email phone_e164 company status package_tier drive_folder_id drive_folder_url created_at marketing_opt_in do_not_contact';
const invoiceFields = 'invoice_no lead_id full_name email phone_e164 company amount_idr due_date payment_status payment_url payment_expires_at created_at marketing_opt_in do_not_contact';

for (let number = 0; number <= 20; number++) {
  const w = { id: 'revenue' + String(number).padStart(2, '0'), name: String(number).padStart(2, '0') + '. ' + titles[number], active: false, nodes: [], connections: {}, settings: { executionOrder: 'v1', timezone: 'Asia/Jakarta', callerPolicy: 'workflowsFromSameOwner' }, versionId: randomUUID(), pinData: {}, number };
  const entry = node(w, 'Workflow input', 'executeWorkflowTrigger', { inputSource: 'passthrough' }, 1.1);
  let start = entry;
  const scheduled = {11:'30 9,15 * * *',12:'0 10 * * 1-5',13:'0 10 * * 2',14:'0 9 * * *',18:'0 11 * * 4',19:'0 7 * * 1,4',20:'0 8 * * 1'};
  let webhook;
  if (!(number in scheduled) || number === 14) {
    webhook = node(w, 'Inbound webhook', 'webhook', { httpMethod: 'POST', path: 'revenue-' + String(number).padStart(2, '0'), responseMode: 'lastNode', ...(number === 15 ? {} : { authentication: 'headerAuth' }), options: {} }, 2, { webhookId: randomUUID() });
    if (number !== 15) attachCredential(w, webhook, 'httpHeaderAuth', 'Revenue webhook');
  }
  const dual = first => { if (webhook) edge(w, webhook, first); };
  if (number === 0) {
    start = prepare(w, entry, 'route'); dual(start); start = child(w, start, '$json.target_workflow_id');
  } else if (number === 1) {
    start = prepare(w, entry, 'capture'); dual(start);
    const read = sheet(w, start, 'Leads_DB', null, null, true, ['lead_id','$json.lead_id']);
    const dedup = code(w, 'Skip existing lead', `const d=$(${JSON.stringify(start)}).first().json; return $input.all().some(x=>x.json.lead_id===d.lead_id) ? [] : [{json:d}];`); edge(w, read, dedup);
    start = sheet(w, dedup, 'Leads_DB', leadFields, 'lead_id');
    const check = condition(w, start, 'Can greet WhatsApp?', '!!$json.phone_e164 && $json.marketing_opt_in === true && $json.do_not_contact !== true');
    start = child(w, check, 2);
    start = child(w, start, 3);
    edge(w, check, 'Execute 03', 1);
  } else if (number === 2) {
    start = prepare(w, entry, 'greeting'); dual(start); start = wa(w, start); start = sheet(w, start, 'Leads_DB', 'lead_id status greeted_at', 'lead_id');
  } else if (number === 3) {
    start = prepare(w, entry, 'qualify'); dual(start); start = ai(w, start, 'qualified');
    start = sheet(w, start, 'Leads_DB', 'lead_id lead_score lead_tier reason qualified_at status', 'lead_id');
    const check = condition(w, start, 'Hot lead?', '$json.lead_score >= 75'); start = child(w, check, 7, false);
  } else if (number === 4) {
    start = prepare(w, entry, 'crm'); dual(start); start = sheet(w, start, 'CRM_Contacts', leadFields + ' contact_id', 'contact_id'); start = sheet(w, start, 'CRM_Deals', dealFields, 'deal_id'); start = wa(w, start, "'Deal baru '+$json.deal_id+': '+$json.full_name", '$json.owner_wa');
  } else if (number === 5) {
    start = prepare(w, entry, 'dm'); dual(start);
    const check = condition(w, start, 'Opt out?', '$json.opted_out === true');
    const stop = map(w, 'Persist STOP', `({...d, lead_id:'LD-'+key(d.sender_id),phone_e164:d.channel==='WHATSAPP'?d.sender_id:'',status:'DNC',do_not_contact:true,marketing_opt_in:false})`); edge(w, check, stop);
    sheet(w, stop, 'Leads_DB', 'lead_id phone_e164 status do_not_contact marketing_opt_in', 'lead_id');
    const active = map(w, 'Reply context', "({...d,lead_id:'LD-'+key(d.sender_id),last_reply_at:new Date().toISOString()})"); edge(w, check, active, 1);
    const remembered=sheet(w,active,'Leads_DB','lead_id last_reply_at','lead_id');start = ai(w, remembered, 'dmReply');
    const channel=condition(w,start,'Instagram channel?',"$json.channel === 'INSTAGRAM_DM'");
    const instagram=http(w,channel,'Reply on Instagram',expression("'https://graph.facebook.com/'+$env.META_GRAPH_VERSION+'/me/messages'"),'{recipient:{id:$json.sender_id},message:{text:$json.reply_text}}','httpHeaderAuth');attachCredential(w,instagram,'httpHeaderAuth','Instagram');
    const whatsapp=map(w,'WhatsApp reply context','d');edge(w,channel,whatsapp,1);wa(w,whatsapp,'$json.reply_text','$json.sender_id');
  } else if (number === 6) {
    start = prepare(w, entry, 'booking'); dual(start);
    const events = node(w, 'Read calendar availability', 'googleCalendar', { resource:'event', operation:'getAll', calendar:{__rl:true,value:expression("$env.CALENDAR_ID || 'primary'"),mode:'id'}, returnAll:true, options:{timeMin:expression('$json.start_iso'),timeMax:expression('$json.end_iso')} }, 1.2, {alwaysOutputData:true}); attachCredential(w,events,'googleCalendarOAuth2Api'); edge(w,start,events);
    const free = code(w,'Reject occupied slot',`return [{json:available($(${JSON.stringify(start)}).first().json,$input.all().map(i=>i.json))}];`); edge(w,events,free);
    const create = node(w,'Create calendar event','googleCalendar',{resource:'event',operation:'create',calendar:{__rl:true,value:expression("$env.CALENDAR_ID || 'primary'"),mode:'id'},start:expression('$json.start_iso'),end:expression('$json.end_iso'),additionalFields:{summary:expression('$json.agenda'),attendees:[expression('$json.email')],conferenceDataUi:{conferenceDataValues:{conferenceSolution:'hangoutsMeet'}},id:expression('$json.requested_event_id')}},1.2); attachCredential(w,create,'googleCalendarOAuth2Api');edge(w,free,create);
    start=map(w,'Use created calendar links',`booked($('Reject occupied slot').itemMatching(i).json,d)`);edge(w,create,start);start=sheet(w,start,'Leads_DB','lead_id calendar_event_id start_iso meet_url status','lead_id');start=wa(w,start);
  } else if (number === 7) {
    start=prepare(w,entry,'hot');dual(start);start=telegram(w,start);start=wa(w,start,'$json.alert','$json.owner_wa');
    const wait=node(w,'Wait 15 minutes','wait',{amount:15,unit:'minutes'},1.1,{webhookId:randomUUID()});edge(w,start,wait);
    const stored=sheet(w,wait,'Leads_DB',null,null,true,['lead_id','$json.lead_id']);
    const stale=code(w,'Check actual claim',`const original=$(${JSON.stringify(start)}).first().json; const row=$input.all().find(i=>i.json.lead_id===original.lead_id)?.json; if(!row)throw new Error('Lead missing in CRM'); return row.claim_status==='CLAIMED' ? []:[{json:{...original,...row,message:'SLA 15 menit: '+original.alert}}];`);edge(w,stored,stale);start=wa(w,stale,'$json.message','$json.manager_wa');
  } else if (number === 8) {
    start=prepare(w,entry,'quote');dual(start);start=ai(w,start,'quoteAI');start=sheet(w,start,'Quotes_DB','quote_no full_name email phone_e164 company line_items_json subtotal_idr tax_rate tax_idr discount_idr grand_total_idr dp_idr balance_idr status created_at','quote_no');
  } else if (number === 9) {
    start=prepare(w,entry,'proposal');dual(start);start=gmail(w,start);start=wa(w,start);start=sheet(w,start,'CRM_Deals','deal_id proposal_id proposal_url stage proposal_sent_at next_followup_at proposal_followup_count','deal_id');
  } else if (number === 10) {
    start=prepare(w,entry,'summary');dual(start);start=ai(w,start,'summarized');start=wa(w,start);
  } else if ([11,12,13].includes(number)) {
    const read=sheet(w,entry,number===12?'CRM_Deals':'Leads_DB',null,null,true);
    start=map(w,'Select eligible contacts',number===13?'reengage(d)':`followup(d,${number===12})`);edge(w,read,start);start=wa(w,start);
    start=sheet(w,start,number===12?'CRM_Deals':'Leads_DB',number===12?'deal_id proposal_followup_count last_followup_at':number===11?'lead_id followup_count last_followup_at':'lead_id status last_followup_at',number===12?'deal_id':'lead_id');
  } else if (number === 14) {
    start=prepare(w,entry,'invoice');dual(start);
    const snap=http(w,start,'Create Midtrans payment link',expression("$env.MIDTRANS_SNAP_BASE_URL + '/snap/v1/transactions'"),'{transaction_details:{order_id:$json.invoice_no,gross_amount:$json.amount_idr},customer_details:{first_name:$json.full_name,email:$json.email,phone:$json.phone_e164},page_expiry:{duration:24,unit:"hours"},expiry:{duration:24,unit:"hours"}}','httpBasicAuth');
    const linked=map(w,'Use provider payment link',`invoiceLink($(${JSON.stringify(start)}).itemMatching(i).json,d)`);edge(w,snap,linked);start=sheet(w,linked,'Invoices_DB',invoiceFields,'invoice_no');
    const msg=map(w,'New invoice message',"({...d,message:'Invoice '+d.invoice_no+', '+formatMoney(d.amount_idr)+', jatuh tempo '+d.due_date+'. '+d.payment_url,last_reminder_at:new Date().toISOString()})");edge(w,start,msg);let sent=wa(w,msg);sheet(w,sent,'Invoices_DB','invoice_no last_reminder_at','invoice_no');
    const scheduledInput=node(w,'Reminder schedule','scheduleTrigger',{rule:{interval:[{field:'cronExpression',expression:scheduled[14]}]}},1.2);
    const read=sheet(w,scheduledInput,'Invoices_DB',null,null,true);const reminders=map(w,'Select due reminders','reminder(d)');edge(w,read,reminders);sent=wa(w,reminders);sheet(w,sent,'Invoices_DB','invoice_no last_reminder_at','invoice_no');
  } else if (number === 15) {
    start=prepare(w,entry,'paymentRequest');dual(start);
    const verify=http(w,start,'Verify Midtrans server status',expression("$env.MIDTRANS_API_BASE_URL+'/v2/'+encodeURIComponent($json.invoice_no)+'/status'"),null,'httpBasicAuth','GET');
    const read=sheet(w,verify,'Invoices_DB',null,null,true,['invoice_no',"$('Prepare Notif Payment Sukses').item.json.invoice_no"]);
    const payment=code(w,'Verify stored amount and settlement',`return $input.all().flatMap((item,i)=>{const out=paid($('Verify Midtrans server status').itemMatching(i).json,item.json);return out?[{json:out,pairedItem:{item:i}}]:[];});`);edge(w,read,payment);
    start=sheet(w,payment,'Invoices_DB','invoice_no payment_status receipt_no paid_at transaction_id','invoice_no');start=wa(w,start);start=telegram(w,start,'$json.message');start=child(w,start,16);
  } else if (number === 16) {
    const stored=sheet(w,entry,'Invoices_DB',null,null,true,['invoice_no',"$json.body?.invoice_no || $json.invoice_no"]);dual(stored);
    start=prepare(w,stored,'onboarding');const read=sheet(w,start,'Projects_DB',null,null,true,['project_id','$json.project_id']);
    const dedup=code(w,'Skip existing project',`const d=$(${JSON.stringify(start)}).first().json;return $input.all().some(i=>i.json.project_id===d.project_id)?[]:[{json:d}];`);edge(w,read,dedup);
    const folder=node(w,'Create client folder','googleDrive',{resource:'folder',operation:'create',name:expression('$json.folder_name'),driveId:{__rl:true,value:'My Drive',mode:'list'},folderId:{__rl:true,value:'root',mode:'list'},options:{}},3);attachCredential(w,folder,'googleDriveOAuth2Api');edge(w,dedup,folder);
    start=map(w,'Use created folder',`onboarded($('Skip existing project').itemMatching(i).json,d)`);edge(w,folder,start);start=sheet(w,start,'Projects_DB',projectFields,'project_id');start=child(w,start,6);start=wa(w,start);
    start=gmail(w,start,"'Onboarding '+$json.project_id","'<p>'+ $json.message.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</p>'");
  } else if (number === 17) {
    start=prepare(w,entry,'review');dual(start);start=sheet(w,start,'Reviews_DB','review_id project_id rating_score feedback recovery_needed submitted_at','review_id');start=sheet(w,start,'Projects_DB','project_id rating_score','project_id');start=wa(w,start);
    const recovery=condition(w,start,'Service recovery needed?','$json.recovery_needed === true');start=telegram(w,recovery,"'CSAT '+$json.rating_score+'/5. Project '+$json.project_id+'. '+$json.feedback");
  } else if (number === 18) {
    const read=sheet(w,entry,'Projects_DB',null,null,true);start=prepare(w,read,'upsell');start=wa(w,start);start=sheet(w,start,'Projects_DB','project_id last_upsell_at','project_id');start=sheet(w,start,'CRM_Deals',dealFields,'deal_id');
  } else if (number === 19) {
    start=code(w,'Configured competitor watchlist','return watchlist().map(json=>({json}));');edge(w,entry,start);
    const fetch=http(w,start,'Fetch configured pricing page',expression('$json.pricing_url'),null,null,'GET',{response:{response:{responseFormat:'text',outputPropertyName:'data'}},redirect:{redirect:{followRedirects:false}}});
    const extracted=map(w,'Extract actual snapshot',`snapshot($('Configured competitor watchlist').itemMatching(i).json,d)`);edge(w,fetch,extracted);start=ai(w,extracted,'intel');start=sheet(w,start,'Competitor_Intel_DB','snapshot_id competitor_name pricing_url snapshot summary observed_at','snapshot_id');start=telegram(w,start,'$json.message');
  } else if (number === 20) {
    const read=sheet(w,entry,'CRM_Deals',null,null,true);start=code(w,'Compute actual weekly metrics','return [{json:weekly($input.all().map(i=>i.json))}];');edge(w,read,start);start=ai(w,start,'report');start=gmail(w,start,'$json.subject','$json.email_html','$env.REPORT_RECIPIENT_EMAIL');
  }
  if (number in scheduled && number !== 14) {
    const schedule=node(w,'Schedule WIB','scheduleTrigger',{rule:{interval:[{field:'cronExpression',expression:scheduled[number]}]}},1.2);
    const first=w.connections[entry]?.main?.[0]?.[0]?.node; if (first) edge(w,schedule,first);
  }
  node(w,'Setup and limitations','stickyNote',{content:'Pilih kredensial CONFIGURE pada setiap node. Semua workflow dinonaktifkan sampai preflight lulus. Kontrak input, header CRM, pengujian, dan batas implementasi tersedia di README.md. Data pengujian hanya sintetis.',width:600,height:180},1);
  delete w.number;
  // Resolve non-secret expressions at build time. No environment access is needed in nodes.
  function resolveConfig(value) {
    if (typeof value === 'string' && value.startsWith('=')) return value.replace(/\$env\.([A-Z_]+)/g,(_,name)=>JSON.stringify(config[name] ?? ''));
    if (Array.isArray(value)) return value.map(resolveConfig);
    if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='jsCode'?v:resolveConfig(v)]));
    return value;
  }
  w.nodes=w.nodes.map(resolveConfig);
  fs.writeFileSync(path.join(directory,originalNames[number]),JSON.stringify(w,null,2)+'\n'); definitions.push(w);
}
fs.writeFileSync(path.join(root,'all-workflows.json'),JSON.stringify(definitions,null,2)+'\n');
fs.mkdirSync(path.join(root,'sheet-templates'),{recursive:true});
for(const [table,fields] of Object.entries(sheets)) fs.writeFileSync(path.join(root,'sheet-templates',table+'.csv'),fields.join(',')+'\n');
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({n8nVersion:'2.44.4',workflows:definitions.map(w=>({id:w.id,name:w.name,nodes:w.nodes.length})),tables:sheets,credentialTypes:binding},null,2)+'\n');
console.log('Built '+definitions.length+' workflows, '+definitions.reduce((s,w)=>s+w.nodes.length,0)+' nodes.');
