# dsh-skip-access-confirm

A DeepSeek Harness Web GUI plugin: one-click switching to **Full access** and
**Auto review (EXP)**. It confirms the permission risk acknowledgement for you
in the composer picker, the `/permission` popup, and the General-settings
default-permission row, so picking those modes no longer requires ticking
"I understand the risks" first.

`dsh-bundle` · Web/Desktop client plugin · DSH `>=0.2.0 <0.3.0` · MIT

## Install

```sh
dsh plugin --profile desktop add dsh-skip-access-confirm
```

Use the profile you actually boot (`desktop` for the DSH Desktop app, `web`
for `dsh web`). Restart the app or the `dsh web` process to load the new
bundle: bundle-list changes are not hot-reloaded.

From the plugin index: enable the experimental **custom plugin index** bundle,
then add this index source in **Plugins → Discover**:

```text
https://raw.githubusercontent.com/YingkeSu/dsh-lab/main/market/index.json
```

## What it does

The acknowledgement is not configurable. It is hard-coded in the shipped Web
client (`ui-permission-presets` / `ui-primitives` `RiskConfirmation`): every
visible pick of `danger-full-access` or `auto` opens a modal whose confirm
button stays disabled until the checkbox is ticked. Only typing the complete
command (`/permission danger-full-access`, `/permission auto`) skips it.

This plugin keeps the pickers: `client.js` is a hand-written client-module
bundle (no build step) mounted by the host half `index.js`. Its `apply`
installs a `MutationObserver` on the page:

- a dialog is a target only when its `aria-label` / heading is one of the two
  permission risk confirmations across the shipped locales
  (`Enable Full access?` / `确认启用完全权限？`, `Enable Auto review (experimental)?`
  / `确认启用自动审查（实验）？`, …), and it contains both a checkbox and a
  disabled button;
- the observer ticks the checkbox and clicks the action button once React
  enables it, so the dialog closes immediately and the preset switch lands.

Any other dialog — deleting a project, plugin risk grants, workspace prompts —
is ignored, even when it has a checkbox and a disabled primary button.

## Verify

```sh
node --test test/*.test.mjs     # manifest, published files, bundle contract
```

The browser-level behaviour has a Playwright harness:

```sh
npm install --no-save playwright
node test/harness.mjs
```

It mounts the bundle in a page with a fake `__ModuleLoader__` and checks that
the Full-access and Auto-review dialogs are confirmed while an unrelated
checkbox dialog is not.

## Compatibility

- Verified against the DSH Desktop `0.2.1-rc.5` client bundle (the
  `RiskConfirmation` component and both pickers) and end-to-end against a
  `0.2.2-alpha.2` `dsh web` process: with the plugin the risk dialog appears
  and is confirmed automatically; without it the action button stays disabled
  and the mode does not switch.
- The dialog text is matched in every shipped locale; the plugin does nothing
  on clients without those dialogs.

## Known limitations

- The acknowledgement still renders for one animation frame before it is
  confirmed; the click is automatic, the dialog is not deleted from the client
  code.
- If the session is locked or the host rejects the switch, the action button
  never enables and the dialog stays open; the plugin gives up after ~2s.
- The Desktop host does not hot-reload profile or bundle changes; restart it
  after installing or updating.

## Development

```sh
./install.sh desktop            # link this checkout into ~/.dsh/profiles/desktop
./install.sh --uninstall desktop
```

`install.sh` is a local-source helper only; npm users install through
`dsh plugin`. For the repository layout and other plugins see
[YingkeSu/dsh-lab](https://github.com/YingkeSu/dsh-lab).

## License

MIT
