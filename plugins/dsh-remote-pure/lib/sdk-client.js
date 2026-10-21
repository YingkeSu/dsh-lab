/**
 * Minimal line-framed JSON-RPC 2.0 client for the DeepSeek Harness SDK runtime.
 * Owns one duplex: `input` (remote -> us) and `output` (us -> remote). Requests
 * time out and every pending request is rejected when the channel dies, so a
 * stalled or dead SSH channel can never hang the panel.
 */
import { randomUUID } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 60000;

export function createSdkClient({ input, output, onClose = () => {} }) {
  if (input === undefined || input === null || output === undefined || output === null) {
    return {
      request: () => Promise.reject(new Error('remote channel unavailable')),
      onNotification: () => {},
      onClose: () => {},
      close: () => {},
    };
  }
  let buffer = '';
  let closed = false;
  const pending = new Map();
  let notificationHandler = () => {};
  let closeHandler = onClose;

  const settle = (id, error, result) => {
    const entry = pending.get(id);
    if (entry === undefined) return;
    pending.delete(id);
    clearTimeout(entry.timer);
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
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    closeHandler();
  };

  input.setEncoding?.('utf8');
  input.on('data', onData);
  input.on('end', () => fail('ended'));
  input.on('close', () => fail('closed'));
  input.on('error', (error) => fail(error.message));

  return {
    request(method, params, timeoutMs = DEFAULT_TIMEOUT_MS) {
      if (closed) return Promise.reject(new Error('remote channel closed'));
      const id = `req_${randomUUID()}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`remote ${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          output.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        } catch (error) {
          pending.delete(id);
          clearTimeout(timer);
          reject(error);
        }
      });
    },
    onNotification(handler) {
      notificationHandler = handler;
    },
    onClose(handler) {
      closeHandler = handler;
    },
    close() {
      input.off?.('data', onData);
      fail('closed locally');
    },
  };
}
