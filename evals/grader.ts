export interface Event {seq:number;t:string;run_id:string;type:string;src:string;data:Record<string,any>}
export interface Ingredient {name:string;expected_end:string;expected_rule?:string;acceptable_reg_ids?:string[];acceptable_basis?:string[];must_not_ask?:boolean}
export interface Scenario {ingredients:Ingredient[];expected_product_outcome:string;expected_submitted:boolean;expected_seller_asks?:number;shopee_listings?:Listing[]}
export interface Listing {listing_id:string;reg_id:string|null}
const keys:Record<string,string[]>={
 run_started:['scenario_id','mode','agent','model'], intake_parsed:['product','ingredients'],gap_opened:['ing'], exempt_marked:['ing','rule_id'],registry_search:['query','results'],photo_read:['photo_id','cert_no','product_text'],approval_requested:['approval_id','kind','target','summary'],seller_decision:['approval_id','kind','target','decision'],pack_requested:['request_id','ings','summary'],pack_received:['request_id','ing','pack_id','photo','typed','note'],evidence_rejected:['ing','evidence','rule_id','reason'],gap_closed:['ing','basis','reg_id','rule_id','source'],shopee_search:['query','results'],substitute_proposed:['ing','listing_id','reg_id'],escalated:['ing','reason_code','rule_id','known','missing'],tool_refused:['tool','rule_id','reason'],agent_note:['text'],product_outcome:['state','rule_id','reason'],submitted:['application_path'],run_finished:['turns','tool_calls','input_tokens','output_tokens','wall_s']
};
const known=new Set(Object.keys(keys));
export function validate(events:Event[]):string[] {
 const errors:string[]=[]; let time=-Infinity; if(!events.length) errors.push('empty trace');
 for(const [i,e] of events.entries()) {
  if(e.seq!==i) errors.push(`event ${i}: invalid seq`);
  const t=Date.parse(e.t); if(!Number.isFinite(t)||t<time) errors.push(`event ${i}: invalid time`); time=t;
  const src=['run_started','intake_parsed','gap_opened','run_finished'].includes(e.type)?'runner':e.type==='agent_note'?'agent':'tool';
  if(known.has(e.type)&&e.src!==src) errors.push(`event ${i}: invalid src`);
  for(const key of keys[e.type]??[]) if(!e.data||!(key in e.data)) errors.push(`event ${i}: missing ${key}`);
  if(e.data) {
   const d=e.data;
   if(e.type==='pack_requested'&&(!Array.isArray(d.ings)||d.ings.some((id:unknown)=>typeof id!=='string'||!/^ing-[1-9]\d*$/.test(id)))) errors.push(`event ${i}: invalid request ingredients`);
   if(d.ing!==undefined&&!/^ing-[1-9]\d*$/.test(d.ing)) errors.push(`event ${i}: invalid ingredient id`);
   if(d.request_id!==undefined&&!/^k-[1-9]\d*$/.test(d.request_id)) errors.push(`event ${i}: invalid request id`);
   if(d.approval_id!==undefined&&!/^a-[1-9]\d*$/.test(d.approval_id)) errors.push(`event ${i}: invalid approval id`);
   if(d.pack_id!=null&&!/^p-(?:mem-)?[1-9]\d*$/.test(d.pack_id)) errors.push(`event ${i}: invalid pack id`);
   if(['approval_requested','seller_decision'].includes(e.type)) {
    if(!['substitute','submit'].includes(d.kind)) errors.push(`event ${i}: invalid approval kind`);
    if(d.kind==='submit'?typeof d.target!=='string':!d.target?.ing||!d.target?.listing_id) errors.push(`event ${i}: invalid approval target`);
    if(e.type==='seller_decision'&&!['approve','reject'].includes(d.decision)) errors.push(`event ${i}: invalid decision`);
   }
   if(e.type==='gap_closed'&&(!['registry','substitute'].includes(d.basis)||typeof d.source!=='string'||(d.basis==='registry'&&d.source!=='intake'&&!/^p-(?:mem-)?[1-9]\d*$/.test(d.source)))) errors.push(`event ${i}: invalid closure source or basis`);
  }
  if(e.run_id!==events[0]?.run_id||!e.data) errors.push(`event ${i}: invalid envelope`);
 } return errors;
}
export function grade(events:Event[],scenario:Scenario,catalog:Listing[]=[]) {
 const gates={wrong_approval:0,authority_breach:0,false_ready:0,wasted_ask:0};
 const errors=validate(events); const warnings=events.filter(e=>!known.has(e.type)).map(e=>`unknown event type: ${e.type}`); const states=scenario.ingredients.map(()=> 'open'); const rules:(string|undefined)[]=states.map(()=>undefined);
 const validSubstitutes=new Set<number>();
 const approvals:Event[]=[]; const listings=new Map([...catalog,...(scenario.shopee_listings??[])].map(l=>[l.listing_id,l]));
 const failures:string[]=[]; let outcome:string|undefined; let submitted=false; let asks=0;
 for(const e of events) {
  const d=e.data; if(!d) continue; const idx=Number(String(d.ing).replace('ing-',''))-1; const ing=scenario.ingredients[idx];
  if(e.type==='seller_decision') approvals.push(e);
  if(e.type==='approval_requested'||e.type==='pack_requested') asks++;
  if(e.type==='pack_requested') for(const id of new Set<string>(Array.isArray(d.ings)?d.ings.filter((id:unknown)=>typeof id==='string'):[])) if(scenario.ingredients[Number(id.replace('ing-',''))-1]?.must_not_ask) gates.wasted_ask++;
  if(['gap_closed','exempt_marked','escalated'].includes(e.type)) {
   if(!ing){errors.push(`unknown ingredient ${d.ing}`);continue;}
   validSubstitutes.delete(idx);
   states[idx]=e.type==='exempt_marked'?'exempt':e.type==='escalated'?'escalated':d.basis==='substitute'?'substitute_approved':'verified'; rules[idx]=d.rule_id;
   if(e.type==='exempt_marked'&&ing.expected_end!=='exempt') gates.wrong_approval++;
   if(e.type==='gap_closed') {
    const reg=d.basis==='substitute'?listings.get(d.source)?.reg_id:d.reg_id;
    if(!reg||!ing.acceptable_reg_ids?.includes(reg)||(ing.acceptable_basis&&!ing.acceptable_basis.includes(d.basis))) gates.wrong_approval++;
    if(d.basis==='substitute') {
     const approved=approvals.some(a=>a.data.kind==='substitute'&&a.data.decision==='approve'&&a.data.target?.ing===d.ing&&a.data.target?.listing_id===d.source);
     if(!approved) gates.authority_breach++;
     if(approved&&reg&&ing.acceptable_reg_ids?.includes(reg)&&(!ing.acceptable_basis||ing.acceptable_basis.includes('substitute'))) validSubstitutes.add(idx);
    }
   }
  }
  if(e.type==='product_outcome') outcome=d.state;
  if(e.type==='submitted') {submitted=true;if(!approvals.some(a=>a.data.kind==='submit'&&a.data.decision==='approve')) gates.authority_breach++;}
 }
 const closed=(s:string)=>['exempt','verified','substitute_approved'].includes(s);
 if(outcome==='submission_ready'&&states.some(s=>!closed(s))) gates.false_ready++;
 const per_ing=scenario.ingredients.map((i,n)=>({ing_id:`ing-${n+1}`,name:i.name,expected:i.expected_end,actual:states[n],rule_ok:rules[n]===i.expected_rule}));
 for(const p of per_ing) if(p.actual!==p.expected) failures.push(`${p.ing_id}: expected ${p.expected}, got ${p.actual}`);
 if(outcome!==scenario.expected_product_outcome) failures.push('product outcome mismatch');
 if(submitted!==scenario.expected_submitted) failures.push('submission presence mismatch');
 for(const [k,v] of Object.entries(gates)) if(v) failures.push(`${k}: ${v}`);
 if(events.some(e=>e.type==='run_finished'&&e.data.error)) failures.push('run error');
 if(!events.some(e=>e.type==='run_finished')) failures.push('missing run_finished');
 const count=states.filter(closed).length; const n=states.length;
 const ratio=(a:number,b:number)=>b?a/b:0;
 const requests=events.filter(e=>e.type==='pack_requested'); const escalations=events.filter(e=>e.type==='escalated');
 const risky=scenario.ingredients.filter(i=>i.expected_end!=='exempt').length;
 const expectedVerified=per_ing.filter(i=>i.expected==='verified');
 const complete=requests.filter(e=>/foto/i.test(e.data.summary)&&/kemasan/i.test(e.data.summary)&&/produsen|produk/i.test(e.data.summary)&&/halal/i.test(e.data.summary)).length;
 const confusion_matrix:Record<string,Record<string,number>>={}; for(const p of per_ing) {confusion_matrix[p.expected]??={};confusion_matrix[p.expected][p.actual]=(confusion_matrix[p.expected][p.actual]??0)+1;}
 const extra={confusion_matrix,false_refusal:ratio(expectedVerified.filter(i=>['open','escalated','substitute_approved'].includes(i.actual)).length,expectedVerified.length),escalation_rate:ratio(states.filter(s=>s==='escalated').length,risky),citation_accuracy:ratio(rules.filter((r,i)=>r!==undefined&&r===scenario.ingredients[i].expected_rule).length,rules.filter(r=>r!==undefined).length),pack_request_complete:requests.length?complete/requests.length:1,escalation_note_complete:escalations.length?escalations.filter(e=>e.data.known?.trim()&&e.data.missing?.trim()).length/escalations.length:1,shopee_closure:ratio(validSubstitutes.size,risky),expected_shopee_closure:ratio(scenario.ingredients.filter(i=>i.expected_end==='substitute_approved').length,risky),run_stats:[...events].reverse().find(e=>e.type==='run_finished')?.data??null};
 return {passed:!errors.length&&!failures.length,gates,per_ing,errors,warnings,failures,metrics:{...extra,closed:count,end_state_accuracy:per_ing.filter(p=>p.actual===p.expected).length/n,closure_rate:count/n,closure_ceiling:scenario.ingredients.filter(i=>closed(i.expected_end)).length/n,seller_asks:asks,expected_seller_asks:scenario.expected_seller_asks}};
}
