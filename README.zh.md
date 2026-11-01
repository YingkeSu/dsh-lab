# dsh-lab

[English](README.md) | 中文

本仓库维护的 DeepSeek Harness（`dsh`）插件。

| 插件 | npm | 说明 |
|---|---|---|
| [dsh-skip-access-confirm](plugins/dsh-skip-access-confirm) | `dsh-skip-access-confirm` | 一键切换「完全权限」与「自动审查」：自动完成 Web 界面的风险确认。 |
| [dsh-remote-pure](plugins/dsh-remote-pure) | `dsh-remote-pure` | 通过 SSH 控制远端 DeepSeek Harness 项目，按需读取远端会话历史。 |

## 插件索引

仓库自带一份 [format-1 插件索引](market/index.json)，供 DSH 的「发现」页使用。先启用实验性的「自定义插件索引」组合包，然后在 **插件 → 发现 → 添加索引源** 中填入：

```text
https://raw.githubusercontent.com/YingkeSu/dsh-lab/main/market/index.json
```

## 开发

`plugins/` 下每个目录都是独立的 npm 包，各自带 README、测试和 `cordis.patch.yml` 组合包层。从源码安装一个插件：

```sh
dsh plugin --profile <profile> add ./plugins/<name>
```

插件索引由 DSH 官方参考生成器生成，用法见 [market/README.md](market/README.md)。
