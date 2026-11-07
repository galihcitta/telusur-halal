import {describe,it,expect} from 'vitest';
import {grade,validate} from '../grader.js';
import {root,yaml,trace} from '../cli.js';
const catalog=yaml(`${root}/evals/seed/shopee.yaml`);
const scenario=(id:string)=>yaml(`${root}/evals/scenarios/${id.startsWith('A')?'adv':'dev'}/${id}.yaml`);
describe('published grader fixtures',()=>{
 for(const f of yaml(`${root}/evals/tests/traces/expected.yaml`)) it(f.id,()=>{
 const result=grade(trace(`${root}/${f.trace}`),scenario(f.scenario),catalog);
 for(const [k,v] of Object.entries(f.expect)) expect(k==='pass'?result.passed:k==='closed'?result.metrics.closed:result.gates[k as keyof typeof result.gates],k).toBe(v);
 });
});
it('golden D01 passes',()=>expect(grade(trace(`${root}/fixtures/traces/D01_golden.jsonl`),scenario('D01'),catalog).passed).toBe(true));
it('rejects broken seq',()=>{const e=trace(`${root}/fixtures/traces/D01_golden.jsonl`);e[1].seq=99;expect(validate(e).length).toBeGreaterThan(0);});
it('rejects forged source',()=>{const e=trace(`${root}/fixtures/traces/D01_golden.jsonl`);e[1].src='agent';expect(validate(e).length).toBeGreaterThan(0);});
const golden=()=>trace(`${root}/fixtures/traces/D01_golden.jsonl`);
const renumber=(events:ReturnType<typeof golden>)=>events.map((e,seq)=>({...e,seq}));
it('T10 incomplete request template',()=>{const e=golden();e.find(e=>e.type==='pack_requested')!.data.summary='Please send evidence';expect(grade(e,scenario('D01'),catalog).metrics.pack_request_complete).toBeLessThan(1);});
it('T10 extra request increases seller asks',()=>{const e=golden();e.splice(9,0,structuredClone(e.find(e=>e.type==='pack_requested')!));expect(grade(renumber(e),scenario('D01'),catalog).metrics.seller_asks).toBe(5);});
it('T10 missing closure causes false ready',()=>{const e=renumber(golden().filter(e=>!(e.type==='gap_closed'&&e.data.ing==='ing-4')));expect(grade(e,scenario('D01'),catalog).gates.false_ready).toBe(1);});
it('T10 wrong certified substitute record',()=>{const e=golden();e.find(e=>e.type==='gap_closed'&&e.data.basis==='substitute')!.data.source='L-21';expect(grade(e,scenario('D01'),catalog).gates.wrong_approval).toBe(1);});
it('T10 exempt ingredient must not be asked',()=>{const e=golden();e.find(e=>e.type==='pack_requested')!.data.ings.push('ing-1');const r=grade(e,scenario('D01'),catalog);expect(r.gates.wasted_ask).toBe(1);expect(r.gates.authority_breach).toBe(0);});
it('T10 escalation is not closure and incomplete note is measured',()=>{const e=golden();const v=e.find(e=>e.type==='gap_closed'&&e.data.ing==='ing-2')!;v.type='escalated';v.data={ing:'ing-2',rule_id:'R-ESCALATE',reason_code:'ambiguous',known:'',missing:''};const r=grade(e,scenario('D01'),catalog);expect(r.per_ing[1].actual).toBe('escalated');expect(r.metrics.escalation_note_complete).toBe(0);expect(r.passed).toBe(false);});
it('T10 missing submitted fails',()=>expect(grade(renumber(golden().filter(e=>e.type!=='submitted')),scenario('D01'),catalog).passed).toBe(false));
it('T10 last verdict wins',()=>{const e=golden();e.splice(e.length-1,0,{...structuredClone(e.find(e=>e.type==='gap_closed'&&e.data.ing==='ing-3')!),t:e.at(-1)!.t});e.at(-2)!.data.reg_id='R-201';const r=grade(renumber(e),scenario('D01'),catalog);expect(r.gates.wrong_approval).toBe(1);});
it('unknown event is a warning, not an error',()=>{const e=golden();e.splice(e.length-1,0,{...e.at(-1)!,type:'future_event',src:'agent',data:{}});const r=grade(renumber(e),scenario('D01'),catalog);expect(r.passed).toBe(true);expect(r.warnings).toHaveLength(1);});
it('missing required event data is invalid',()=>{const e=golden();delete e[0].data.model;expect(validate(e)).toContain('event 0: missing model');});
it('timestamps cannot run backwards',()=>{const e=golden();e[2].t='2000-01-01T00:00:00Z';expect(validate(e).length).toBeGreaterThan(0);});
it('uncertified substitute is not counted as a successful Shopee closure',()=>{
 const e=trace(`${root}/evals/tests/traces/G03.jsonl`);
 expect(grade(e,scenario('D01'),catalog).metrics.shopee_closure).toBe(0);
});
it('unapproved substitute is not counted as a successful Shopee closure',()=>{
 const e=trace(`${root}/evals/tests/traces/G04.jsonl`);
 expect(grade(e,scenario('D01'),catalog).metrics.shopee_closure).toBe(0);
});
it('malformed request arrays return validation errors instead of throwing',()=>{
 const e=golden();e.find(e=>e.type==='pack_requested')!.data.ings=[42];
 const result=grade(e,scenario('D01'),catalog);
 expect(result.passed).toBe(false);expect(result.errors.length).toBeGreaterThan(0);
});
