# dsh-destiny-inventory

DeepSeek Harness 的《命运 2》仓库插件：装备栏、仓库、悬停详情卡、拖拽移动。

## 装

```bash
dsh plugin add /绝对路径/dsh-destiny-inventory-<版本>.tgz
```

装完**完全退出 DSH 再打开**（宿主侧代码不在热更范围里）。

## 它是什么

- **自己的数据面**：`src/bungie/` 直连 Bungie Platform API，`src/host/` 组装成线格式。
- **自己的写入**：移动 / 装备 / 锁定 / 邮政官取回都直接 POST Bungie，不经 MCP。
- **MCP 只服务随航 agent**：分析、配装、模组那些留给它。

边界写在 [`PLAN-SELF-HOSTED-DIM.md`](PLAN-SELF-HOSTED-DIM.md) §1，动代码前先看那份。

## 开发

```bash
pnpm test          # 单测 + 架构守门
pnpm typecheck
./dev.sh           # 构建并同步到 DSH profile；客户端改动 500ms 热更
```

`src/host/` 或 `src/bungie/` 改了必须重启 DSH。规矩见 [`AGENTS.md`](AGENTS.md)，文档索引在 [`docs/README.md`](docs/README.md)。

## 许可

MIT。DIM 的素材（图标、属性顺序、强化 perk 表）来自 [DIM](https://github.com/DestinyItemManager/DIM)，许可见 [`LICENSE-DIM.md`](LICENSE-DIM.md)；上游声明见 [`UPSTREAM.md`](UPSTREAM.md)。
