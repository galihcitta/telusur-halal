import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {grade} from './grader.js';
import {root,yaml,trace} from './cli.js';

export interface BatchEntry {scenario:string; trace:string}
export interface Manifest {label:string;kind:'fixture'|'agent';runs:BatchEntry[]}
export function evaluateBatch(manifest:Manifest,baseDir:string,datasetRoot=resolve(root)) {
 if(!manifest||!['fixture','agent'].includes(manifest.kind)||typeof manifest.label!=='string'||!Array.isArray(manifest.runs)||!manifest.runs.length) throw Error('Manifest requires label, kind (fixture|agent), and a nonempty runs array');
 const catalog=yaml(`${datasetRoot}/evals/seed/shopee.yaml`);
 const rows=manifest.runs.map(entry=>{
  try {
   if(!entry||! /^(D\d{2}|A\d{2})$/.test(entry.scenario)||typeof entry.trace!=='string') throw Error('Invalid scenario ID or trace path');
   const events=trace(resolve(baseDir,entry.trace));
   const scenario=yaml(`${datasetRoot}/evals/scenarios/${entry.scenario.startsWith('A')?'adv':'dev'}/${entry.scenario}.yaml`);
   if(events.find(e=>e.type==='run_started')?.data.scenario_id!==entry.scenario) throw Error('Trace scenario does not match manifest');
   const result=grade(events,scenario,catalog);
   return {...entry,status:result.errors.length?'invalid':result.passed?'pass':'fail',run_id:events[0]?.run_id,model:events.find(e=>e.type==='run_started')?.data.model,result};
  }catch(error){return {...entry,status:'invalid',result:undefined,error:String(error)};}
 });
 let commit='unknown';try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{/* Provenance remains explicitly unknown outside Git. */}
 return {label:manifest.label,kind:manifest.kind,commit,dataset:datasetRoot,generated_at:new Date().toISOString(),summary:{total:rows.length,passed:rows.filter(r=>r.status==='pass').length,failed:rows.filter(r=>r.status==='fail').length,invalid:rows.filter(r=>r.status==='invalid').length},runs:rows};
}
export function markdown(report:ReturnType<typeof evaluateBatch>) {
 const lines=[`# ${report.label.replace(/[\r\n]/g,' ')}`, '',`Evaluation kind: **${report.kind}**. Fixture results do not measure main-agent performance.`, '',`Commit: ${report.commit}`,`Dataset: ${report.dataset}`,`Generated: ${report.generated_at}`, '',`Runs: ${report.summary.total}; passed: ${report.summary.passed}; failed: ${report.summary.failed}; invalid: ${report.summary.invalid}.`, '', '| Scenario | Trace | Status | Gates (wrong / authority / ready / ask) |','| --- | --- | --- | --- |'];
 const cell=(v:unknown)=>String(v).replace(/[|\r\n]/g,' ');
 for(const row of report.runs){const g=row.result?.gates;lines.push(`| ${cell(row.scenario)} | ${cell(row.trace)} | ${row.status} | ${g?`${g.wrong_approval} / ${g.authority_breach} / ${g.false_ready} / ${g.wasted_ask}`:'unavailable'} |`);}
 lines.push('', 'See report.json for per-ingredient findings, errors, models, run IDs, and metrics.');return lines.join('\n')+'\n';
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try{
 const [input,output]=process.argv.slice(2);if(!input||!output) throw Error('Usage: npm run evaluate -- MANIFEST.json OUTPUT_DIRECTORY');
 const report=evaluateBatch(JSON.parse(readFileSync(input,'utf8')),dirname(resolve(input)));
 mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');writeFileSync(resolve(output,'report.md'),markdown(report));
 console.log(JSON.stringify(report.summary));process.exitCode=report.summary.invalid?2:report.summary.failed?1:0;
 }catch(error){console.error(String(error));process.exitCode=2;}
}
