# dsh-remote-pure

Control a remote DeepSeek Harness project over SSH from the local Web GUI.

- **Remote runtime**: the local host half opens `ssh <host> <dshCommand> --profile sdk` and speaks the
  official newline-framed SDK JSON-RPC (`initialize` carries the remote project cwd; sessions are
  addressed by client-chosen ids).
- **Local panel**: a sidebar entry (`Remote`) opens a main panel where you pick a configured host,
  type a remote project path, and chat with the remote agent.
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
```

`dshCommand` is a shell command run on the remote host; the plugin appends `--profile sdk`.
The remote runtime needs its own model credentials, and non-interactive SSH must work
(key/agent). Linux and macOS are supported.

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
| `lib/remote-log.js` | decodes concatenated zstd session-log frames and projects chat messages |
| `lib/http-api.js` | `/remote-pure/api/*` routes used by the panel |
| `client.js` | sidebar entry + main panel (React via the host module table) |

## Remote DSH web page

The panel can open a remote host's own DSH Web UI without exposing its port:

1. the Host half runs `<dshCommand> web --no-open --port 0` on the remote host and captures the
   one-time token URL it prints (`127.0.0.1` only);
2. a supervised `ssh -N -L 127.0.0.1:<local>:127.0.0.1:<remote>` tunnel is opened and the token URL is
   rewritten to the local port; the panel opens it in a new tab;
3. **关闭网页通道** closes the tunnel, stops the remote process, and kills its tmux session. An
   already-running instance can be attached instead by posting its token URL as `attachUrl` to
   `/remote-pure/api/web-open`; attaching never starts or stops a remote process.

**tmux option**: the `tmux` checkbox starts the remote server inside a tmux session
(`dsh-remote-pure-<host>`), so a transient SSH drop does not kill it; the tunnel is then re-established
on the same local port. When the remote host has no tmux the plugin falls back to `nohup` and reports
that in the panel. The remote `dsh web` must be able to start from the configured `dshCommand`.

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

A sidebar entry (`Remote`, beside the other panel icons) opens the main panel:
pick a host, pick or type the remote project path, press **连接**. The left column lists the remote
project's durable sessions (read from the remote store on demand), the right column shows the chat.
Selecting an old session resumes it by id through the SDK before its first prompt.

**Project picker**: **浏览** opens a remote directory browser (`cd <path> && pwd && ls -1Ap` over SSH),
with `~`, `..`, "选择此目录", and "新建并进入" (creates the directory remotely with `mkdir -p`). The last
eight `(host, path)` pairs you connected to are kept in the browser's `localStorage` and shown as
one-click chips, so repeat projects need no typing; the last project is restored on reload. Browsing
works before any project is connected.

**Remote terminal**: the **终端** tab opens an xterm.js terminal on the selected SSH host. The Host
half bridges the browser WebSocket to `ssh -tt <alias>` running under DSH's own PTY primitive, so
resize, colors, and full-screen programs work while authentication stays with the local OpenSSH
config, keys, and agent — no ssh2 dependency and no stored passwords. `ws`, `@xterm/xterm`, and
`@xterm/addon-fit` are the terminal dependencies; their browser assets are served by the plugin.

## Verification

```sh
node --test test/*.test.js            # 10 tests, fake SSH runtimes
node scripts/remote-check.mjs         # real host: connect, prompt, read back persisted history
```

Verified against a remote macOS host: connect ~0.7 s, prompt round-trip, live events, and persisted
history reads all work through the plugin routes inside a real `dsh web` runtime.
