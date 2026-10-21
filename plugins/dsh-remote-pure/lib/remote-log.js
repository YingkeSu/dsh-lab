/**
 * Read-only access to a remote Harness session store.
 *
 * A session log is a concatenation of zstd frames (one per persisted append
 * batch in the default JSONL backend), each frame decoding to newline-delimited
 * events. Nothing here writes: the remote host owns its history.
 */
import { zstdDecompressSync } from 'node:zlib';

const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Normalize a POSIX remote project path: collapse duplicate/trailing slashes. */
export function normalizeRemotePath(path) {
  const trimmed = String(path).trim().replace(/\/{2,}/g, '/');
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
}

/** Directory name the JSONL backend uses for a project cwd. */
export function projectDirName(remotePath) {
  const path = normalizeRemotePath(remotePath);
  return `--${path.slice(1).replaceAll('/', '-')}--`;
}

/**
 * Decode a whole session log. Zstd frames are located by magic so a log read
 * mid-append (torn final frame) still yields its committed prefix.
 * @param {Buffer} buffer raw session file bytes
 * @returns {object[]} session events in log order
 */
export function decodeSessionLog(buffer) {
  const events = [];
  const offsets = [];
  let index = 0;
  while ((index = buffer.indexOf(FRAME_MAGIC, index)) >= 0) {
    offsets.push(index);
    index += FRAME_MAGIC.length;
  }
  if (offsets.length === 0) return parseLines(buffer.toString('utf8'), events);
  for (let frame = 0; frame < offsets.length; frame += 1) {
    const start = offsets[frame];
    const end = frame + 1 < offsets.length ? offsets[frame + 1] : buffer.length;
    let text;
    try {
      text = zstdDecompressSync(buffer.subarray(start, end)).toString('utf8');
    } catch {
      continue;
    }
    parseLines(text, events);
  }
  return events;
}

function parseLines(text, events) {
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const event = JSON.parse(line);
      if (event !== null && typeof event === 'object' && typeof event.type === 'string') events.push(event);
    } catch {
      // A torn or non-event line is not part of the committed history.
    }
  }
  return events;
}

/** Project a log onto the chat view: user and assistant text, reasoning dropped. */
export function readMessages(events) {
  const messages = [];
  for (const event of events) {
    if (event.type === 'user/message') {
      const source = event.data?.source?.kind;
      if (source !== undefined && source !== 'user') continue;
      const text = textOf(event.data?.content);
      if (text !== '') messages.push({ role: 'user', text, time: event.time ?? 0 });
    } else if (event.type === 'assistant/message') {
      const text = textOf(event.data?.message?.content);
      if (text !== '') messages.push({ role: 'assistant', text, time: event.time ?? 0 });
    }
  }
  return messages;
}

function textOf(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}
