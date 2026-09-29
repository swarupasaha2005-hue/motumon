import { randomBytes } from 'node:crypto';
import { InputError, PreviewService, friendlyError } from './preview-service.mjs';

const service = new PreviewService();
const sessionToken = randomBytes(32).toString('hex');
const jobs = new Map();
let activeJob = null;

function reply(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }).end(JSON.stringify(body));
}

async function bodyOf(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new InputError('Send JSON to the local terminal.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new InputError('The request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new InputError('The request contains invalid JSON.'); }
}

function authorize(request, origin) {
  if (request.headers.origin !== origin || request.headers['x-paydrip-session'] !== sessionToken) {
    throw new InputError('This action must come from the local PayDrip terminal.');
  }
}

function startJob(action, input) {
  if (activeJob) throw new InputError('Another contract action is already in progress.');
  const id = randomBytes(16).toString('hex');
  const job = { id, status: 'running', stage: 'Preparing', result: null, error: null, createdAt: Date.now() };
  jobs.set(id, job);
  activeJob = id;
  void service.perform(action, input, (stage) => { job.stage = stage; }).then((result) => {
    job.status = 'confirmed';
    job.stage = 'Confirmed on Preview';
    job.result = result;
  }).catch((error) => {
    job.status = 'failed';
    job.stage = 'Failed';
    job.error = friendlyError(error);
  }).finally(() => { activeJob = null; });
  return { id, status: job.status };
}

export async function handleApi(request, response, pathname, origin) {
  if (!pathname.startsWith('/api/')) return false;
  for (const [id, job] of jobs) if (Date.now() - job.createdAt > 3_600_000) jobs.delete(id);
  try {
    if (request.method === 'GET') {
      if (pathname === '/api/session') { reply(response, 200, { token: sessionToken }); return true; }
      if (pathname === '/api/meta') { reply(response, 200, await service.meta()); return true; }
      if (pathname === '/api/state') { reply(response, 200, await service.state()); return true; }
      if (pathname === '/api/wallet') { reply(response, 200, service.walletInfo()); return true; }
      if (/^\/api\/jobs\/[0-9a-f]{32}$/.test(pathname)) {
        const job = jobs.get(pathname.slice('/api/jobs/'.length));
        reply(response, job ? 200 : 404, job ?? { error: 'Action not found in this terminal session.' });
        return true;
      }
      if (/^\/api\/claim\/[0-9a-fA-F]{64}$/.test(pathname)) {
        reply(response, 200, await service.claim(pathname.slice('/api/claim/'.length)));
        return true;
      }
    }
    if (request.method === 'POST') {
      authorize(request, origin);
      const input = await bodyOf(request);
      if (pathname === '/api/wallet/connect') { reply(response, 200, await service.connect()); return true; }
      if (pathname === '/api/wallet/disconnect') {
        if (activeJob) throw new InputError('Wait for the current action before disconnecting.');
        reply(response, 200, await service.disconnect()); return true;
      }
      if (pathname === '/api/pseudonym') { reply(response, 200, await service.derivePseudonym(input)); return true; }
      if (pathname === '/api/record/check') { reply(response, 200, await service.checkRecord(input)); return true; }
      if (pathname === '/api/actions') {
        if (!input || typeof input !== 'object' || typeof input.action !== 'string') throw new InputError('Choose a contract action.');
        reply(response, 202, startJob(input.action, input));
        return true;
      }
    }
    reply(response, 404, { error: 'No such local terminal endpoint.' });
  } catch (error) {
    reply(response, error instanceof InputError ? 400 : 503, { error: friendlyError(error) });
  }
  return true;
}
