import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { confirmation, observation, type Media } from './contracts.js';
import { createModel, isSupportedMedia } from './model.js';
import { buildPacket, packetHtml } from './packet.js';
import { append, CaseService, RequestError } from './service.js';

const app = express();
const store = new CaseService(createModel());
const upload = multer({ limits: { fileSize: 12 * 1024 * 1024, files: 4, fields: 12 } });
const revision = z.coerce.number().int().positive();
const id = z.string().uuid();
const auth = (request: express.Request) => request.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] ?? '';
const readFiles = (request: express.Request, field: string) =>
  (request.files as Record<string, Express.Multer.File[]> | undefined)?.[field] ?? [];
function media(file: Express.Multer.File | undefined, kind: 'audio' | 'image'): Media {
  if (!file?.size || !isSupportedMedia(file.mimetype, kind)) throw new RequestError(400, `Provide a supported ${kind} file.`);
  return { bytes: file.buffer, mime: file.mimetype, name: file.originalname };
}
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set('Content-Security-Policy', "default-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
});
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '64kb' }));
app.use(express.static('public'));

app.post('/api/cases', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'label', maxCount: 1 }]), async (req, res) => {
  const result = await store.create(media(readFiles(req, 'audio')[0], 'audio'), media(readFiles(req, 'label')[0], 'image'));
  res.status(201).json(result);
});
app.get('/api/cases/:id', (req, res) => {
  const view = store.read(id.parse(req.params.id));
  const { draft: _privateDraft, ...observer } = view;
  res.json(observer);
});
app.post('/api/cases/:id/confirm', async (req, res) => {
  const input = confirmation.parse(req.body);
  await store.mutate(id.parse(req.params.id), auth(req), revision.parse(req.body.revision), entry => store.confirm(entry, input));
  res.json({ case: store.read(id.parse(req.params.id)) });
});
app.post('/api/cases/:id/pack', upload.fields([{ name: 'images', maxCount: 4 }]), async (req, res) => {
  const input = z.object({
    revision, request_id: id,
    condition: z.enum(['sealed', 'repacked', 'loose', 'unknown']),
    mode: z.enum(['photo', 'typed', 'no_pack']),
    confirmed_current: z.enum(['true', 'false']).transform(value => value === 'true'),
    observed: z.string().optional(),
  }).parse(req.body);
  await store.mutate(id.parse(req.params.id), auth(req), input.revision, entry => store.pack(entry, {
    ...input, images: readFiles(req, 'images').map(file => media(file, 'image')),
    observed: input.mode === 'typed' && input.observed ? observation.parse(JSON.parse(input.observed)) : undefined,
  }));
  res.json({ case: store.read(id.parse(req.params.id)) });
});
app.post('/api/cases/:id/decision', async (req, res) => {
  const input = z.object({ revision, proposal_id: id, decision: z.enum(['approve', 'decline']) }).parse(req.body);
  await store.mutate(id.parse(req.params.id), auth(req), input.revision, entry => store.decide(entry, input.proposal_id, input.decision));
  res.json({ case: store.read(id.parse(req.params.id)) });
});
app.post('/api/cases/:id/retry', async (req, res) => {
  await store.mutate(id.parse(req.params.id), auth(req), revision.parse(req.body.revision), entry => store.retry(entry));
  res.json({ case: store.read(id.parse(req.params.id)) });
});
app.post('/api/cases/:id/export', async (req, res) => {
  const packet = await store.mutate(id.parse(req.params.id), auth(req), revision.parse(req.body.revision), ({ view }) => {
    if (!view.confirmed_ingredient_ids.length) throw new RequestError(409, 'Confirm ingredients before exporting.');
    const packet = buildPacket(view);
    append(view, 'packet_exported', 'Exported the current ingredients and conditional plans.', { evidence_complete: packet.evidence_complete });
    return packet;
  });
  res.json({ case: store.read(id.parse(req.params.id)), packet, html: packetHtml(packet) });
});
const handleError: express.ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof RequestError) { res.status(error.status).json({ error: error.message }); return; }
  if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof multer.MulterError) {
    res.status(400).json({ error: 'Check the submitted fields and file sizes.' }); return;
  }
  res.status(500).json({ error: 'The local service could not finish this request.' });
};
app.use(handleError);
const port = Number(process.env.PORT ?? 4173);
app.listen(port, '127.0.0.1', () => console.log(`Telusur Halal listening at http://127.0.0.1:${port}`));
