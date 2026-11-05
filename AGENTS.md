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

## 0.5 借来的通用条款

两组外部规范，只保留本项目**没有**或**写得不够硬**的部分。

### 来自 `andrej-karpathy-skills`（通用 LLM 编码习惯）

| 规矩 | 落地方式 |
|---|---|
| **先想再写**：把假设说出来，有多种解释就摆出来，别静默挑一个 | 大改动先出计划（§7 已要求）；不确定就停下来问，不要猜着写完再问 |
| **简单优先**：只写解决问题的最小代码，不做没人要的抽象与配置项 | 没有第二个调用方的抽象算 bug；"将来可能要"不算理由 |
| **外科手术式改动**：只碰必须碰的，不顺手"改进"相邻代码 | 与 §4「旧实现整段删掉」不冲突：删旧是**任务本身**，顺手重排别人的代码不是 |
| **目标可验证**：把任务写成"可判定的成功条件"，再循环到达成 | 每条守门测试都要**注入违规确认变红**（§5 已要求），否则不知道它会不会咬人 |

**自查句**：diff 里每一行都能追溯到这次请求；如果有一行是"顺便"，删掉它。

### 来自 `destiny2-mcp`（同作者的命运 2 工具链，踩坑更早）

| 规矩 | 我们这里缺什么 |
|---|---|
| **不许替调用方下结论**：没算过的事不说；"没探成"记 `null` + reason，不记成 `false` | 我们有 `equipped` 三态，但**没有一条通则**——写入失败、插槽读空、Manifest 缺表都可能被静默当成"没有" |
| **失败必须是失败**：`ok=false` + 稳定错误码 + 中文说明"缺什么/下一步"；裸抛算 bug | 现在 `toFailure(error)` 直接透传上游文案 |
| **数据分三档不许混**：Manifest 定义 / 你的账号 / 社区资料（不可信，带来源与时间） | 加来源标注前，社区数据一律不进来（§0 的对齐口径） |
| **不让可选数据弄坏主结果**：坏的可选资料要带 `warnings` | 现在的降级（Manifest 缺表）是无声的 |
| **依赖只能向下 + 体量 ratchet**：超限先抽代码，上限只许下调 | 已有（§1 与 `architecture.test.ts`），但**单向依赖还没有守门** |
| **改响应形状：旧键一个不留** | 已有（§0） |
| **CI 跑 linter**（抓未定义 name / 未用 import，比测试更早） | 现在只有 `tsc --noEmit`，没有 lint |

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
src/mcp/       只服务 agent：工具调用与信封解析，前端不走这里
               ├ client.ts    工具调用（命名空间、错误分类）
               └ envelope.ts  工具信封解析
src/host/types.ts  线格式契约（ItemRow / ItemDetailView / CharacterRow …）
src/client/    浏览器侧：面板、筛选、样式
```

依赖只能向下：`client → mcp → host → bungie`。反向引用一律判红（`tests/architecture.test.ts` 的
`dependency direction`，会扫出每一处向上 import）。

线格式契约（`ItemRow` / `ItemDetailView` / `CharacterRow`）住在 `src/host/types.ts`：它们由 host
层生产，client 层消费，**不属于** `mcp/`。`mcp/` 只剩 agent 通道（工具调用与信封解析），
不依赖任何一层。

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
