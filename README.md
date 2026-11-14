# dsh-destiny-inventory

DeepSeek Harness 的《命运 2》仓库插件：装备栏、仓库、悬停详情卡、拖拽移动。

**界面不是目的，是给 agent 供料的手段**——面板存在的意义是让随航 agent 知道你在看什么、刚做了什么。

## 装

```bash
dsh plugin add /绝对路径/dsh-destiny-inventory-<版本>.tgz
```

装完**完全退出 DSH 再打开**（宿主侧代码不在热更范围里）。

## 它是什么

- **自己的数据面**：`src/bungie/` 直连 Bungie Platform API，`src/host/` 组装成线格式。
- **自己的写入**：移动 / 装备 / 锁定 / 邮政官取回都直接 POST Bungie，不经 MCP。
  连续操作会排队，串行落到账号上。
- **MCP 只服务随航 agent**：分析、配装、模组那些留给它，浏览器从不转手过去。

## 开发

```bash
pnpm test          # 单测 + 架构守门
pnpm typecheck
./dev.sh           # 构建并同步到 DSH profile；客户端改动 500ms 热更
```

`src/host/` 或 `src/bungie/` 改了必须重启 DSH。

## 文档地图

按"你要干什么"找，不用从头读：

| 我要… | 读这份 |
|---|---|
| **接手这个项目**（新会话、换人） | [`docs/HANDOFF.md`](docs/HANDOFF.md) — 现状、决定与理由、真机踩过的坑、待办 |
| **碰随航浮窗 / Agent** | [`docs/AGENT-SHELL-STATUS.md`](docs/AGENT-SHELL-STATUS.md) — A2–A8 哪些真能用、已知缺陷、DSH 的 Session 语义 |
| 改代码之前知道规矩 | [`AGENTS.md`](AGENTS.md) — 分层、唯一出处、守门测试、提交格式 |
| 知道**哪个文件管什么** | [`AGENTS.md`](AGENTS.md) §9 代码地图（65 个文件，一句一句职责） |
| 理解**为什么长成这样** | [`docs/plans/PLAN-SELF-HOSTED-DIM.md`](docs/plans/PLAN-SELF-HOSTED-DIM.md) — 架构契约，§1 的边界写死 |
| 动**写入路径** | [`docs/plans/PLAN-WRITE-QUEUE.md`](docs/plans/PLAN-WRITE-QUEUE.md) — 两层串行、`from` 为什么必填 |
| 做**搜索** | [`docs/plans/PLAN-SEARCH.md`](docs/plans/PLAN-SEARCH.md) — 中文名 + perk 名，不引 DIM 语法 |
| 看 **DIM 差在哪** / 下一步做什么 | [`docs/research/DIM-GAP-ANALYSIS.md`](docs/research/DIM-GAP-ANALYSIS.md) |
| 把规范搬到别处 / 开新项目 | [`docs/CODING-STANDARDS.md`](docs/CODING-STANDARDS.md) |

全部文档（含归档与每份的状态）登记在 [`AGENTS.md`](AGENTS.md) §10，**那张表与磁盘双向核对**：
`docs/` 下漏登记或登记了不存在的文件，`pnpm test` 会红。

## 代码在哪

四层，依赖只能向下：

```
src/config.ts   配置          src/bungie/   Bungie 与 Manifest 直连
src/host/       组合层        src/client/   浏览器半
src/index.ts    装配
```

每个文件做什么见 [`AGENTS.md`](AGENTS.md) §9。

## 许可

MIT。DIM 的素材（图标、属性顺序、强化 perk 表）来自 [DIM](https://github.com/DestinyItemManager/DIM)，
许可见 [`LICENSE-DIM.md`](LICENSE-DIM.md)；上游声明见 [`UPSTREAM.md`](UPSTREAM.md)。
