import { readFileSync } from 'node:fs';
import { gradeD01 } from '../src/grader.js';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npx tsx demo/grade-d01.ts <saved export response JSON>');
  process.exit(2);
}
try {
  const { case: trace, packet } = JSON.parse(readFileSync(path, 'utf8'));
  const result = gradeD01(trace, packet);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} catch {
  console.error('Could not read a saved export response.');
  process.exitCode = 2;
}
