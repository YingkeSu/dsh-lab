# dsh-remote-pure

Control a remote DeepSeek Harness project over SSH from the local Web GUI.

- **Remote runtime**: the local host half opens `ssh <host> <dshCommand> --profile sdk` and speaks the
  official newline-framed SDK JSON-RPC (`initialize` carries the remote project cwd; sessions are
  addressed by client-chosen ids).
- **Embedded remote Web UI**: the `Remote` panel defaults to an iframe of the remote host's own DSH
  Web UI, reached through a supervised SSH tunnel, so the right-hand side is the real native
  interface. The panel detects the host's installed dsh profiles when it opens and can pin the local
  tunnel port.
- **Local panel**: the sidebar entry (`Remote`) keeps the SDK chat and a terminal as secondary tabs;
  the chat tab is where you pick a remote project path and talk to the remote agent.
- **History on demand**: session lists and logs are read from the remote `$DSH_HOME/sessions`
  store when you select a session. Nothing is copied into the local session store.

## Install

**In the running Web GUI** (desktop app): open the **Plugins** page, choose install bundle, and pass
this directory's absolute path. The app installs it into its own profile and loads the panel after a
refresh. The CLI path works for any non-desktop profile:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-remote-pure
```

Then add hosts to the profile's `cordis.patch.yml` (the bundle row is `remote-pure`):

```yaml
- id: remote-pure
  name: 'dsh-remote-pure'
  config:
    hosts:
      - id: macbook
        label: MacBook
        ssh: macbook                      # ssh target, as in ~/.ssh/config
        dshCommand: 'PATH=/opt/homebrew/bin:$PATH node $HOME/labs/ds/deepseek-harness/apps/cli/lib/bin.js'
        dshHome: '$HOME/.dsh'             # optional; default
        provider: deepseek-official       # optional; default
        model: deepseek-flash             # optional; default
        webProfile: web                   # optional; default for the embedded Web UI
        webPort: 0                        # optional; local tunnel port, 0 = automatic
```

`dshCommand` is a shell command run on the remote host; the plugin appends `--profile sdk` for the
chat runtime and `<profile> --no-open --port 0` for the embedded Web UI. Do not pin a profile inside
`dshCommand` (`--profile ...`): the plugin appends its own, and the launcher rejects a second one.
The remote runtime needs its own model credentials, and non-interactive SSH must work
(key/agent). Linux and macOS are supported.

`defaultWebProfile` (default `web`) and `defaultWebPort` (default `0`) set the fallbacks for hosts
that do not override them.

**Remote `dsh` discovery**: SSH's non-interactive shell usually misses the user's interactive
`PATH`, so a bare `dsh` can fail with `command not found` even where the terminal works. When a host
has no `dshCommand` (or it is exactly `dsh`), the plugin probes the remote host first: `dsh` on the
SSH `PATH`, `~/bin/dsh`, Homebrew, `/usr/local/bin`, `~/.local/bin`, then a developer checkout at
`~/labs/ds/*/apps/cli/lib/bin.js` invoked through an absolute `node`. The result is cached for five
minutes; an explicit `dshCommand` skips the probe, and `autoDetectDsh: false` turns it off. When
nothing is found the connection error names the host and asks for `dshCommand`.

**Host dropdown**: every `Host <alias>` in your local `~/.ssh/config` is offered automatically,
and `ssh <alias>` reuses that entry's `User`/`Port`/`IdentityFile`/agent setup, so existing keys work
without extra configuration. Explicit `hosts` rows win over a discovered alias with the same id. Set
`discoverSshHosts: false` to turn discovery off, and use `defaultDshCommand` / `defaultProvider` /
`defaultModel` to change the fallbacks discovered aliases get. A per-host `identityFile` and
`sshOptions` list are also accepted.

## How it works

| Host file | Role |
|---|---|
| `lib/sdk-client.js` | line-framed JSON-RPC over the SSH stdin/stdout; rejects pending calls on disconnect |
| `lib/manager.js` | one SDK runtime per `(host, project)`; prompts, live events, remote session list/history |
| `lib/profiles.js` | lists the remote host's `$DSH_HOME/profiles/*/package.json` and flags web/sdk capable profiles |
| `lib/remote-web.js` | starts the remote `dsh <profile> --no-open --port 0`, captures its token URL |
| `lib/tunnel.js` | supervised local port forward, with an optional pinned local port and automatic conflict fallback |
| `lib/web-channel.js` | one embedded Web UI per host: profile + port + tunnel + close semantics |
| `lib/remote-log.js` | decodes concatenated zstd session-log frames and projects chat messages |
| `lib/http-api.js` | `/remote-pure/api/*` routes used by the panel |
| `client.js` | sidebar entry + main panel (embedded Web UI, SDK chat, terminal) |

## Remote DSH Web UI in the panel

The `Remote` panel opens on the **界面** tab, which embeds the remote host's own DSH Web UI instead
of opening a separate browser tab:

1. the Host half runs `<dshCommand> <profile> --no-open --port 0` on the remote host (inside tmux when
   the tmux box is checked) and captures the one-time token URL it prints (`127.0.0.1` only);
2. a supervised `ssh -N -L 127.0.0.1:<local>:127.0.0.1:<remote>` tunnel is opened, the token URL is
   rewritten to the local port, and the panel renders it as the default tab;
3. **关闭网页通道** closes the tunnel and, unless the channel attached an existing instance, stops
   the remote process and kills its tmux session. An already-running instance can still be attached
   by posting its token URL as `attachUrl` to `/remote-pure/api/web-open`; attaching never starts or
   stops a remote process.

**Profile detection**: when the panel opens (and whenever the host changes) the Host half lists
`$DSH_HOME/profiles/*/package.json` in one SSH round trip. The dropdown shows every profile whose
manifest declares `@deepseek-ai/dsh-web-app`; the others are disabled and marked `（无 web）`. The
initial choice is the last saved per-host profile, then the host's `webProfile`, then `web`. A name
that is not created yet is shown as `（未创建，将自动创建）`; the dsh CLI creates the shipped
templates on first boot. Detection failures degrade to the default profile with a warning note.

**Local port**: the port field next to the profile accepts `1–65535`; leave it empty for automatic.
A requested port that is already in use locally (or whose SSH forward never comes up) is replaced by
a free port and the panel reports the actual port plus a note such as
`端口 3080 已被占用，已改用 3081`. Changing the port, the profile, or the tmux switch while the
channel is open closes and reopens it. `webPort` on a host row and `defaultWebPort` only seed the
initial value; the port actually in use is shown in the status text as
`<host>:<localPort>→<remotePort>`.

**Embedded vs new tab**: the iframe is served from `127.0.0.1:<local port>` while the local GUI may
run on another origin. Keep the local GUI on `127.0.0.1` so both sides are the same site and the
session cookie is sent; an HTTPS page embedding an `http://127.0.0.1` frame may be blocked as mixed
content. The panel warns in those cases and keeps **新标签打开** available, which opens the same
token URL in a normal tab.

**tmux option**: the `tmux` checkbox starts the remote server inside a tmux session
(`dsh-remote-pure-<host>`), so a transient SSH drop does not kill it; the tunnel is then re-established
on the same local port. When the remote host has no tmux the plugin falls back to `nohup` and reports
that in the panel. The remote `dsh` must be able to start the chosen profile from `dshCommand`.

## Optional auto-update

`config.autoUpdate` controls a version check against npm:

| value | behavior |
|---|---|
| `notify` (default) | the panel shows a `新版本 x.y.z` button; clicking copies `dsh plugin --profile <profile> add dsh-remote-pure@latest` |
| `auto` | the same check attempts the install through the Host's PluginManager; HMR-managed profiles may answer "restart required" and fall back to the copied command |
| `off` | no registry check at all |

The check reuses the Host PluginManager's registry access when present and falls back to a direct
`registry.npmjs.org` read, cached for one hour. It never installs silently without `auto`.

## Panel

A sidebar entry (`Remote`, beside the other panel icons) opens the main panel and immediately opens
the selected host's Web UI tab; closing the panel leaves the channel warm and reopening reuses it.

The tab strip switches between:

- **界面** (default) — the embedded remote DSH Web UI, with the host/profile/port/tmux controls in the
  toolbar above it.
- **会话** — the SDK chat. Pick or type a remote project path, press **连接**, then chat with the
  remote agent. The left column lists the remote project's durable sessions (read from the remote
  store on demand), the right column shows the chat. Selecting an old session resumes it by id
  through the SDK before its first prompt.
- **终端** — an xterm.js terminal on the selected SSH host. The Host half bridges the browser
  WebSocket to `ssh -tt <alias>` running under DSH's own PTY primitive, so resize, colors, and
  full-screen programs work while authentication stays with the local OpenSSH config, keys, and
  agent — no ssh2 dependency and no stored passwords. `ws`, `@xterm/xterm`, and
  `@xterm/addon-fit` are the terminal dependencies; their browser assets are served by the plugin.

**Project picker**: **浏览** opens a remote directory browser (`cd <path> && pwd && ls -1Ap` over SSH),
with `~`, `..`, "选择此目录", and "新建并进入" (creates the directory remotely with `mkdir -p`). The last
eight `(host, path)` pairs you connected to are kept in the browser's `localStorage` and shown as
one-click chips, so repeat projects need no typing; the last project is restored on reload. Browsing
works before any project is connected.

## Verification

```sh
node --test test/*.test.js            # fake SSH runtimes: SDK runtime, profiles, tunnel, channel, API
node scripts/remote-check.mjs         # real host: connect, prompt, read back persisted history
```

Verified against a remote macOS host: connect ~0.7 s, prompt round-trip, live events, and persisted
history reads all work through the plugin routes inside a real `dsh web` runtime.
