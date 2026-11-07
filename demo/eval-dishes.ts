import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dishEvalManifest, evaluateDishes, loadDishAsset } from '../src/dish-eval.js';
import { createModel } from '../src/model.js';

const args = process.argv.slice(2);
const validate = args.includes('--validate');
const paths = args.filter(arg => arg !== '--validate');
if (paths.length > 1 || paths.some(arg => arg.startsWith('--'))) throw new Error('Usage: npm run eval:dishes -- [manifest.json] [--validate]');
const path = resolve(paths[0] ?? 'datasets/dish-photos/manifest.json');
const raw = await readFile(path, 'utf8');
const manifest = dishEvalManifest.parse(JSON.parse(raw));
if (validate) {
  for (const sample of manifest.cases) await loadDishAsset(sample, path);
  console.log(JSON.stringify({ mode: 'asset_validation_only', version: manifest.version, cases: manifest.cases.length, passed: true }, null, 2));
} else {
  const report = await evaluateDishes(manifest, path, createModel().readDish);
  console.log(JSON.stringify({
    mode: 'live_model', version: manifest.version, split: manifest.split,
    manifest_sha256: createHash('sha256').update(raw).digest('hex'),
    model: process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini', timestamp: new Date().toISOString(),
    ...report,
  }, null, 2));
  if (report.passed !== report.attempted) process.exitCode = 1;
}
