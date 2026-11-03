# dsh-lab

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) plugins maintained in this repository.

| Plugin | npm | Description |
|---|---|---|
| [dsh-skip-access-confirm](plugins/dsh-skip-access-confirm) | `dsh-skip-access-confirm` | One-click switching to Full access and Auto review: confirms the Web GUI risk acknowledgement for you. |
| [dsh-remote-pure](plugins/dsh-remote-pure) | `dsh-remote-pure` | Control a remote DeepSeek Harness project over SSH, with on-demand session history. |
| [dsh-superagent-ok-receipt](plugins/dsh-superagent-ok-receipt) | — | Add an OK (👌) reaction receipt to the messages dsh-superagent receives: a source patch for `dsh-superagent`. |

## Plugin index

The repository ships a [format-1 plugin index](market/index.json) for DSH's
Discover tab. Enable the experimental **custom plugin index** bundle, then add
this index source in **Plugins → Discover**:

```text
https://raw.githubusercontent.com/YingkeSu/dsh-lab/main/market/index.json
```

## Development

Every directory under `plugins/` is a standalone npm package with its own
README and tests. An installable plugin also ships a `cordis.patch.yml` bundle
layer; install one from source with `dsh plugin --profile <profile> add
./plugins/<name>`. `dsh-superagent-ok-receipt` is a source patch for
`dsh-superagent` instead of a bundle, and its README explains how to apply it.

The market index is generated with DSH's reference generator; see
[market/README.md](market/README.md).
