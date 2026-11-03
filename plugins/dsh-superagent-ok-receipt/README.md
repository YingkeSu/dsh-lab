# dsh-superagent-ok-receipt

Adds an **OK (👌) reaction receipt** to the messages [dsh-superagent](https://github.com/deepseek-ai/dsh-superagent-prototype)
receives, a second or two after they arrive — before evaluation and before the text acknowledgement.

> **This is a source patch for `dsh-superagent`, not a standalone DSH bundle.** Whether a message earns a receipt is decided
> inside dsh-superagent's intake, which has no plugin extension point, so the change ships as a patch against
> dsh-superagent 0.1.0 (commit `6337fc8`) instead of an installable bundle. `dsh plugin add` does not install it; use
> [`scripts/apply.mjs`](scripts/apply.mjs) on a checkout.

## What the receipt does

- It adds a Feishu **message reaction** (`POST /open-apis/im/v1/messages/{message_id}/reactions`, emoji `OK`), so nothing new
  is posted and the conversation is not interrupted.
- It reacts only to messages that will be handled: a person's message, in a listened chat or direct message, admitted by the
  Policy, addressed to the bot or on a Ticket's own Thread, and no older than five minutes. History backfill, a long pause,
  bot messages and messages from outside the allowed list stay quiet.
- Delivery reuses the outbox: a `receipt` effect with its own retries and health entry, the permanent `receipt:<triggerId>`
  receipt for idempotence, and a five-minute freshness window — a receipt that waited too long is dropped, not sent late.
- The reaction is added through the raw reaction API because the typed `im reactions` shortcut intermittently failed with a
  transport EOF on the machine this was developed on.
- v1 is Feishu only and has no settings: the emoji is the fixed `OK`. `SourceChannel` gains an optional `react`, so another
  Source can follow later.

## Requirements

- dsh-superagent 0.1.0 at commit `6337fc8`, with a clean working tree.
- A Feishu bot with `im:message.reactions:write_only` (the app used in development already had it; see
  [docs/006-deployment.md](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md)).
- Node.js 22.19+ or 24+, pnpm.

## Install

```sh
git clone https://github.com/deepseek-ai/dsh-superagent-prototype.git ~/dsh-superagent
node scripts/apply.mjs ~/dsh-superagent --build
```

`apply.mjs` refuses a checkout whose package name is not `dsh-superagent`, a dirty git tree, and an already-applied patch.
`--build` runs `pnpm install --frozen-lockfile` and `pnpm build` after applying. Restart the DSH profile that loads
dsh-superagent, for example with the reference deployment's helper:

```sh
~/dsh-superagent/scripts/dsh-superagent restart
```

## Verify

```sh
cd ~/dsh-superagent && pnpm test
```

The suite includes the added `tests/feishu-receipt.spec.ts` plus the intake and outbox cases. Then send the bot a direct
message from a person the Policy admits: 👌 appears under it within a couple of seconds, followed by the usual text
acknowledgement. The overview shows a `receipt` health entry separately from `reply`.

## Rollback

Restore the tracked files and remove the added test, then rebuild and restart:

```sh
cd ~/dsh-superagent
git checkout -- .
rm tests/feishu-receipt.spec.ts
pnpm build
scripts/dsh-superagent restart
```

No data migration is needed: leftover `receipt` effects are dropped as gone or stale on the next start.

## Files

| File | Purpose |
| --- | --- |
| [`ok-receipt.patch`](ok-receipt.patch) | The change: the intake decision, the outbox/effect/store plumbing, the Feishu reaction, docs and tests |
| [`scripts/apply.mjs`](scripts/apply.mjs) | Applies the patch to a checkout and optionally builds it |
| [`test/`](test) | Tests for the patch's shape and the apply script |

## 中文说明

这个目录**不是可直接安装的 DSH 插件包**，而是 `dsh-superagent` 的源码补丁：表情回执的判断发生在 superagent 的消息入库
（`Intake.receive`）里，那里目前没有插件扩展点。补丁针对 `dsh-superagent` 0.1.0（commit `6337fc8`），用
`node scripts/apply.mjs <checkout> --build` 应用并构建，然后重启加载它的 DSH profile，例如
`~/dsh-superagent/scripts/dsh-superagent restart`。

回执只发给"会被处理"的真人消息（已监听、通过准入、被指向或工单自己的线程、5 分钟内），走 superagent 的出站队列，
有独立的 `receipt` health 与重试；历史补收、暂停期间和名单外的人保持安静。回滚与验证步骤见上文。
