# AGENTS.md — dsh-destiny-inventory

规矩 / 为什么 / 怎么守。能自动化的都有一条守门测试，跑 `pnpm test` 会红。

> 通用骨架见 `docs/CODING-STANDARDS.md`。两者冲突时以本文件为准（这里含项目落点）。

---

## 0. 总原则

| 规矩 | 为什么 | 怎么守 |
|---|---|---|
| **单一出处**：一个事实只写一次 | 分类表曾经分散在 `profile.ts` / `buckets.ts` / `filter.ts` 三处，改一处另两处不动，症状是"邮电显示 0 件" | `tests/architecture.test.ts` 的 `single source of truth` |
| **不许静默降级** | 205 组件缺失时如果读成"未装备"，1500 件物品的装备状态全错且看不出来 | `equipped` 三态 + `tests/bungie-dto.test.ts` |
| **不许做兼容层** | 旧形状留双写会把"回到上一版"这件事变成不可能 | `no dead paths` 守门 |

## 1. 这个项目的分层

```
src/bungie/    Bungie API 与 Manifest（数据源，不含 UI 概念）
               ├ profile.ts      GetProfile → 快照（角色、物品、装备、插槽）
               ├ memberships.ts  这个 token 属于哪个 Destiny 账号
               ├ sockets.ts      组件 305 的插槽形状
               ├ manifest.ts     定义查询（物品/桶/plug/伤害类型）
               └ token-file-provider.ts  只读 MCP 的 token，从不刷新
src/host/      组合层：把 bungie 的输出转成 DTO，注册 HTTP 路由与工具
               ├ bungie-service.ts  快照缓存、详情源、角标图
               ├ dto.ts             物品行/角色行的形状转换（含 craft 与稀有度口径）
               ├ item-detail.ts     详情卡组装（插槽候选、属性行、击杀数）
               ├ stat-order.ts      DIM 的属性白名单与顺序（照搬 itemStatAllowList）
               └ enhanced-perks.ts  强化 perk 映射（照搬 trait-to-enhanced-trait.json）
src/mcp/       与 destiny MCP 的接口契约；只服务 agent，前端不走这里
               ├ types.ts     线格式契约（ItemRow / ItemDetailView …）
               ├ client.ts    工具调用（命名空间、错误分类）
               ├ envelope.ts  工具信封解析（写入链路在用）
               └ actions.ts   写入封装（**仍由 /action 使用，待迁到自有写链路**）
src/client/    浏览器侧：面板、筛选、样式
```

依赖只能向下：`client → mcp → host → bungie`。反向引用一律判红。

**唯一的跨层例外**：`client/filter.ts` 从 `buckets.ts` 取分类表，因为那是纯数据。

## 2. 分类的唯一出处

`src/client/buckets.ts` 是**唯一**的桶分类表：

- `BUCKET_SECTIONS` —— 分类顺序与归属（照 DIM 的 `D2Categories`）
- `ALWAYS_SHOWN` —— 空也要占位的货架（邮政官 21 格、记忆水晶 10 格）
- `sectionOfBucket` / `bucketRank` —— 由上面两张表派生

`src/bungie/profile.ts` 的 `POSTMASTER_BUCKETS` 是**唯一**的"哪些桶算邮局"。

新增分类只改这两处，`filter.ts` 会自动跟随（它 `BUCKET_SECTIONS.map` 生成顺序，不复制表）。

## 3. 位置与分类是两个维度

| 维度 | 字段 | 来源 | 不许用来做什么 |
|---|---|---|---|
| **分类** | `inventoryBucketHash` / `bucket` | Manifest 的 `inventory.bucketTypeHash` | 不许用 profile 实例上的 `bucketHash`（vault 里全是 138197802） |
| **位置** | `placement` / `locationKey` | 组件来源（201 / 205 / 102） | 不许用物品类型推断 |
| **装备状态** | `equipped` 三态 | 205 的 `instanceId` 是否出现 | 不许用 300 的 `isEquipped` |

**邮局在组件 201（角色背包）里，不在 102（仓库）里**——2026-11-04 实测，此前找错组件导致邮政官永远 0 件。

## 4. 数据与布局的约定

- 装备格与携带格**分开**：`worn` 一块 + 携带 3 列网格（`3×3`）
- 仓库格**不是**九宫格：`flex: 1 1 0` 吃剩余宽度，横向铺满
- 四个 store 列固定 `60×4+20 = 260px`；行宽永远等于容器宽
- 尺寸变量只有 `--dsh-item-size`（60px），邮政官 42px / 记忆水晶 25px 是派生值

## 5. 测试与验证

| 类别 | 命令 | 何时跑 |
|---|---|---|
| 单测 + 架构守门 | `pnpm test` | 每次改完 |
| 真机（读账号） | `BUNGIE_API_KEY=... pnpm test -- host-routes` | 改数据层后，需要 token 有效 |

**单测绿 ≠ 真机对**：数据层的改动必须跑一次 `host-routes` 的 live 用例。

## 6. 开发循环

纯 UI 改动**不用重启**：

```bash
./dev.sh
```

原理：宿主 `dsh-client-hmr` 每 500ms stat 一次 `lib/client.js`，变了就 SSE 通知浏览器重载那个插件。

`src/host/` 的改动仍然要完全退出 DSH——宿主侧不在 HMR 范围里。

**升过版本号之后，热更会静默失效**：`dsh-client-modules` 用 `release`（版本 + commit）判断页面是否过期，
不匹配时所有插件 reload 被丢弃，只在控制台留一句 `plugin updates pause until this page reloads`。
此时按 `Cmd+R` 刷新页面即可对齐，不用重启 DSH。每次 `dev.sh` 前若改过 `package.json` 版本，先刷新。

`dev.sh` 会同时同步 `lib/client.js` 和 `lib/index.js`，并在宿主文件变化时明确提示"必须重启"。
**只复制 client 是个陷阱**：重启也拿不到新的宿主代码，症状是"改了没效果"却查不出原因（2026-11-04 踩过一次，/item 因此一直走旧链路）。

## 7. 提交与版本

- 打包前先提交，版本号与提交一一对应
- 破坏性变更（`ItemRow` 形状、路由响应）在提交标题点名
- 一次只做一件事

## 8. 唯一出处表

| 事实 | 在哪 | 守门 |
|---|---|---|
| 桶 → 分类 | `src/client/buckets.ts` | `architecture.test.ts` |
| 邮局桶集合 | `src/bungie/profile.ts` | 同上 |
| 装备三态判定 | `src/host/dto.ts` | `bungie-dto.test.ts` |
| 尺寸变量 | `src/client/styles.ts` | 目测（截图） |
| 错误码 | 无（本插件不产生业务错误码） | — |
