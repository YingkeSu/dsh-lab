/**
 * Remote path helpers shared by the SSH-side commands. A configured `$HOME`
 * prefix must stay expandable by the remote shell while the rest of the path is
 * quoted, so it is rendered as `"$HOME"` glued to a quoted suffix.
 */
import { shellQuote } from './ssh.js';

/** Quote a remote path, letting a configured `$HOME` prefix expand. */
export function remotePath(value) {
  const text = String(value);
  if (text === '$HOME') return '"$HOME"';
  if (text.startsWith('$HOME/')) return `"$HOME"${shellQuote(text.slice(5))}`;
  return shellQuote(text);
}
