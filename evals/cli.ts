import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {grade,type Event} from './grader.js';
export const root='datasets/pack-photos/repo';
export const yaml=(p:string)=>parse(readFileSync(p,'utf8'));
export const trace=(p:string):Event[]=>readFileSync(p,'utf8').split(/\r?\n/).filter(s=>s.trim()).map(s=>JSON.parse(s));
if(process.argv[1]?.endsWith('cli.ts')) {
 try {
 const [file,id]=process.argv.slice(2); if(!file||!id) throw Error('Usage: npm run grade -- TRACE SCENARIO_ID');
 const s=yaml(`${root}/evals/scenarios/${id.startsWith('A')?'adv':'dev'}/${id}.yaml`);
 const result=grade(trace(file),s,yaml(`${root}/evals/seed/shopee.yaml`)); console.log(JSON.stringify(result,null,2));process.exitCode=result.errors.length?2:result.passed?0:1;
 }catch(e){console.error(String(e));process.exitCode=2;}
}
