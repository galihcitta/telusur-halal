import {it,expect} from 'vitest';
import {resolve} from 'node:path';
import {evaluateBatch,markdown} from '../batch.js';
const base=resolve('datasets/pack-photos/repo');
it('grades independent runs and continues after unreadable input',()=>{
 const r=evaluateBatch({label:'Regression fixtures',kind:'fixture',runs:[{scenario:'D01',trace:'fixtures/traces/D01_golden.jsonl'},{scenario:'D01',trace:'evals/tests/traces/G01.jsonl'},{scenario:'D01',trace:'missing.jsonl'}]},base);
 expect(r.summary).toEqual({total:3,passed:1,failed:1,invalid:1});
 expect(markdown(r)).toContain('do not measure main-agent performance');
});
it('rejects trace/scenario mismatch',()=>{
 const r=evaluateBatch({label:'Mismatch',kind:'agent',runs:[{scenario:'D02',trace:'fixtures/traces/D01_golden.jsonl'}]},base);expect(r.summary.invalid).toBe(1);
});
it('rejects an empty manifest',()=>expect(()=>evaluateBatch({label:'Empty',kind:'fixture',runs:[]},base)).toThrow('nonempty'));
