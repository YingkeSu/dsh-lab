/**
 * Minimal line-framed JSON-RPC 2.0 client for the DeepSeek Harness SDK runtime.
 * Owns one duplex: `input` (remote -> us) and `output` (us -> remote). The SDK
 * server is authoritative; when the remote stream ends or errors every pending
 * request is rejected so callers never hang on a dead SSH channel.
 */
import { randomUUID } from 'node:crypto';

export function createSdkClient({ input, output }) {
  let buffer = '';
  let closed = false;
  const pending = new Map();
  let notificationHandler = () => {};

  const settle = (id, error, result) => {
    const entry = pending.get(id);
    if (entry === undefined) return;
    pending.delete(id);
    if (error) entry.reject(error);
    else entry.resolve(result);
  };

  const onData = (chunk) => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line === '') continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.method !== undefined) {
        notificationHandler(message.method, message.params);
      } else if (message.id !== undefined) {
        const error = message.error === undefined
          ? undefined
          : Object.assign(new Error(message.error.message ?? 'remote error'), { code: message.error.code, data: message.error.data });
        settle(message.id, error, message.result);
      }
    }
  };

  const fail = (reason) => {
    if (closed) return;
    closed = true;
    const error = new Error(`remote channel closed: ${reason}`);
    for (const [id, entry] of pending) {
      pending.delete(id);
      entry.reject(error);
    }
  };

  input.setEncoding?.('utf8');
  input.on('data', onData);
  input.on('end', () => fail('ended'));
  input.on('close', () => fail('closed'));
  input.on('error', (error) => fail(error.message));

  return {
    request(method, params) {
      if (closed) return Promise.reject(new Error('remote channel closed'));
      const id = `req_${randomUUID()}`;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        output.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    onNotification(handler) {
      notificationHandler = handler;
    },
    close() {
      input.off?.('data', onData);
      fail('closed locally');
    },
  };
}
