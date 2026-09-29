import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { handleApi } from './api.mjs';

const origin = 'http://127.0.0.1:5173';
const response = () => ({
  status: null, text: null,
  writeHead(status) { this.status = status; return this; },
  end(text) { this.text = text; return this; },
});

describe('local terminal request boundary', () => {
  it('rejects a cross-origin mutation even when a session token is known', async () => {
    const sessionResponse = response();
    await handleApi({ method: 'GET', headers: {} }, sessionResponse, '/api/session', origin);
    const { token } = JSON.parse(sessionResponse.text);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const request = Readable.from([Buffer.from('{}')]);
    request.method = 'POST';
    request.headers = {
      origin: 'https://unrelated.example',
      'x-paydrip-session': token,
      'content-type': 'application/json',
    };
    const blocked = response();
    await handleApi(request, blocked, '/api/wallet/connect', origin);
    expect(blocked.status).toBe(400);
    expect(JSON.parse(blocked.text).error).toMatch(/local PayDrip terminal/);
  });
});
