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
| **不许替调用方下结论**：没算过的事不说；"没探成"记 `null` + reason，不记成 `false` | 有 `equipped` 三态；写入侧也补了：`move` 的 `from` 必填、缺了就拒，不从可能过期的快照里猜 |
| **失败必须是失败**：`ok=false` + 稳定错误码 + 中文说明"缺什么/下一步"；裸抛算 bug | 已补：`BridgeFault` + `statusOf`，自己的拒绝走 400/404/401，不再伪装成 502（守门 `tests/http-failure.test.ts`） |
| **数据分三档不许混**：Manifest 定义 / 你的账号 / 社区资料（不可信，带来源与时间） | 加来源标注前，社区数据一律不进来（§0 的对齐口径） |
| **不让可选数据弄坏主结果**：坏的可选资料要带 `warnings` | 现在的降级（Manifest 缺表）是无声的 |
| **依赖只能向下 + 体量 ratchet**：超限先抽代码，上限只许下调 | 已有（§1、`architecture.test.ts` 的 `dependency direction` 与 `CEILINGS`） |
| **改响应形状：旧键一个不留** | 已有（§0） |
| **CI 跑 linter**（抓未定义 name / 未用 import，比测试更早） | 现在只有 `tsc --noEmit`，没有 lint |

## 1. 这个项目的分层

四层，依赖只能向下。反向引用一律判红（`tests/architecture.test.ts` 的 `dependency direction`，
会扫出每一处向上 import）。**完整清单在 §9 的代码地图**，这里只说方向。

```
src/config.ts       第 0 层  配置 schema（唯一入口，DSH 按它校验）
src/bungie/         第 1 层  Bungie Platform 与 Manifest 直连；不认识界面
src/host/           第 2 层  组合层：把数据转成线格式、注册 HTTP 路由与 agent 工具、记账
src/client/         第 3 层  浏览器半：面板、筛选、样式、写队列
src/index.ts        装配层  把上面接起来：注册路由、工具、写队列
```

线格式契约（`ItemRow` / `ItemDetailView` / `CharacterRow`）住在 `src/host/types.ts`：host 层生产、
client 层消费，**不单独成层**。

**前端从不转手给 MCP**：读和写都走自己的 `src/bungie/`（见 `docs/plans/PLAN-SELF-HOSTED-DIM.md` §1）。
agent 的能力走 `ctx.tools`（`host/agent-tools.ts`），与浏览器的数据通路是两条线。

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
| 错误码与 HTTP 状态 | `src/host/http.ts` 的 `BridgeFault` / `statusOf` | `tests/http-failure.test.ts` |
| 组件号 | `src/bungie/components.ts` | — |
| 代码地图与文档地图 | `AGENTS.md` §9 / §10 | `tests/docs.test.ts` |

## 9. 代码地图

**这张表跟着代码走**：新增文件不登记、或登记了不存在的文件，`tests/docs.test.ts` 判红。
每行一句话说"它归哪、别往它里面堆什么"——比"它是什么"更有用。

### 第 0 层 · 纯基础

| 文件 | 做什么 |
|---|---|
| `src/config.ts` | 配置 schema（token/manifest/journal/routePath 的唯一入口）。DSH 按它校验，别在别处读 env。 |

### 第 1 层 · Bungie Platform 与 Manifest（不认识界面）

| 文件 | 做什么 |
|---|---|
| `src/bungie/index.ts` | 这一层的门面。认证从外面注入，切换 token 来源不动下面任何一行。 |
| `src/bungie/types.ts` | **认证缝**（`TokenProvider`）：下面所有代码都不知道 token 从哪来。 |
| `src/bungie/token-file-provider.ts` | 只读 MCP 的 token 文件，**从不刷新**。过期就报 `AuthUnavailableError`，不偷偷续。 |
| `src/bungie/client.ts` | HTTP：挂凭据、解信封、把上游失败翻成类型化错误。只管这两件事，**不碰语义**。 |
| `src/bungie/components.ts` | 组件号的**唯一出处**。305 必须和 102/200/201/205 一起请求，单请求返回 0。 |
| `src/bungie/memberships.ts` | 这个 token 属于哪个 Destiny 账号。与"账号里有什么"是两个问题。 |
| `src/bungie/profile.ts` | `GetProfile` → 快照：角色、物品位置、装备三态、插槽。**不认识 perk 定义**。 |
| `src/bungie/profile-item.ts` | 单行 → `ProfileItem` 的组装（`profile.ts` 的行数上限靠它保住）。 |
| `src/bungie/sockets.ts` | 组件 305（当前 plug）与 310（可选池）的形状。 |
| `src/bungie/manifest.ts` | 定义查询，读 MCP 那份 sqlite。**不下载、不刷新、不版本化**；贴着 400 上限。 |
| `src/bungie/manifest-shapes.ts` | Manifest 行解码纯函数：属性值、锻造槽、角标、分类哈希、伤害表。 |
| `src/bungie/lookup.ts` | 读定义的门面（`DefinitionLookup`），host 层只认它。 |
| `src/bungie/write.ts` | 四个写端点的**实际调用** + `toItemWrite`（桥接请求 → 写入指令）。 |
| `src/bungie/values.ts` | 边界字段读取（`num`/`str`）：把"字段缺失"显式化，别让 `any` 漏进来。 |

### 第 2 层 · 组合层（转形状、注册路由、记账）

| 文件 | 做什么 |
|---|---|
| `src/host/types.ts` | **线格式契约**：`ItemRow` / `ItemDetailView` / `CharacterRow` / `ActionRequest`。改形状是破坏性变更。 |
| `src/host/bungie-service.ts` | 数据服务：快照、详情、角标、状态。**贴着 305 上限**，只做组合。 |
| `src/host/snapshot-cache.ts` | 快照三态：`current`（读者）/ `stable`（写者）/ `markStale`。写者读陈旧不是降级，是它们要的值不会变。 |
| `src/host/dto.ts` | 线格式转换：物品行、角色行、账号头。稀有度与装备三态的口径都在这里。 |
| `src/host/item-detail.ts` | 详情卡组装：插槽候选、属性行、击杀数、固有效果。 |
| `src/host/details-bulk.ts` | 一次性构建全部详情（1924 件 ≈2.8 秒），给前端一个请求预热。 |
| `src/host/stat-order.ts` | DIM 的属性白名单与顺序（照搬 `itemStatAllowList`）。**护甲六维不走这里**。 |
| `src/host/stat-lines.ts` | 属性表：护甲走自己的遍历表，武器走 `statGroupHash`。 |
| `src/host/enhanced-perks.ts` | 强化 perk 映射，照搬 DIM 的 `trait-to-enhanced-trait.json`（441 行，纯数据）。 |
| `src/host/action-route.ts` | `/action` 的编排：串行 → 写 → journal。**唯一的 `service.write(` 调用点**，守门会查。 |
| `src/host/journal-resolve-route.ts` | `POST /journal/resolve`：把回读的真实结果贴回那条 `failed` 记录。前端是唯一会问"到底落没落"的一侧。 |
| `src/host/serialize-writes.ts` | host 侧串行：多标签页不打架，journal 顺序 = 真实顺序。 |
| `src/host/item-write.ts` | 一次写入的分发：lock / equip / pull / move。**move 的实体在 `move-item.ts`**。 |
| `src/host/move-item.ts` | 移动的实体：`from` 由调用方给；**角色→角色必须先回仓库**（Bungie 对直连回 1623）。 |
| `src/host/check-room.ts` | 目标桶还有没有位置：容量来自 Manifest 的 `itemCount`（**含装备位**），占用来自快照。只判断，不动手。 |
| `src/host/make-room.ts` | 满了就腾一件进仓库再继续。**绝不腾**穿着/锁定/不可转移/本次要放的/已在仓库的；判据照 MCP 的 ADR-029。只搬一趟，仓库满就如实失败。 |
| `src/host/item-state-route.ts` | 单件位置。**从强制刷新的 profile 读**——`.../Item/{id}/` 从不回 characterId。 |
| `src/host/journal-record.ts` | 一次写入 → 一条 journal 记录（含 `from`/`to` 映射）。 |
| `src/host/context-store.ts` | 面板当前视图 + 200 条 journal，落盘 jsonl，**启动时读回**（否则重启一次"刚才那件"就没了）。给 agent 读，不给 agent 写。 |
| `src/host/detect-external.ts` | **观测到的**外部变更：位置差异先进候选，扛过同步窗口（实测 56–64 秒，取 90）才记事件，来源只写 `external`，不推断是谁。基线只在稳定时前进。 |
| `src/host/agent-tools.ts` | 两个只读工具 `destiny_workspace_*`：回答"这件""刚刚"。只读是设计，不是还没做。 |
| `src/host/http.ts` | `sendJson` / `readJsonBody` / `BridgeFault` / `toFailure` / `statusOf`。**错误码与 HTTP 状态的唯一出口**。 |

### 第 3 层 · 浏览器半

| 文件 | 做什么 |
|---|---|
| `src/client/index.ts` | 客户端入口：把面板注册进宿主槽位。 |
| `src/client/InventoryPanel.tsx` | 面板主体：状态、拖拽、行渲染。**贴着 450 上限**，新逻辑往 hook 里放。 |
| `src/client/use-item-actions.ts` | 动作编排：`move`/`equip`/`lock` 进队列、回执、失败回读。面板只调它。 |
| `src/client/write-queue.ts` | 客户端写队列：串行、同物品未启动的 move 被替换、可取消。**纯逻辑，不碰 React**。 |
| `src/client/pending-ops.ts` | **未核验的操作**：状态机、每物品序号、观测折叠、失败分类。没确认的操作不许被快照抹掉。**纯逻辑**。 |
| `src/client/pending-ops-render.ts` | 把 rows 画过 overlay：未核验的行保持目标位置。**纯函数，只出 rows**。 |
| `src/client/send-action.ts` | 一次写从发出到落定：接受/拒绝/不明三路分流。**拒绝恢复原位，不明才回读**。 |
| `src/client/apply-move.ts` | 乐观移动：`applyMove`/`settleMove`/`confirmMove`/`applyLock`。 |
| `src/client/settle-by-readback.ts` | 失败后按 Bungie 的真实位置落定，不回滚到可能已经过期的快照。 |
| `src/client/api.ts` | 桥接请求 + 详情缓存（promise 与已解析值两份）。**浏览器唯一出口**。 |
| `src/client/use-receipts.ts` | 回执栈：5 秒自动消失、可取消、排队中改文案。 |
| `src/client/Receipts.tsx` | 回执渲染。 |
| `src/client/use-hover-card.ts` | 详情卡状态（点开、点外关、Esc）。 |
| `src/client/ItemDetail.tsx` | 悬停详情卡本体。 |
| `src/client/ItemTile.tsx` | 一个物品格（角标、光等、待确认环）。 |
| `src/client/PerkColumns.tsx` | perk 列：一列一个插槽，池子竖着摞。 |
| `src/client/IntrinsicBlock.tsx` | 异域固有效果块（perk 之上）。 |
| `src/client/RecoilGauge.tsx` | 后坐方向仪表（照 DIM 的 `RecoilStat`）。 |
| `src/client/ammo-icons.ts` | 三种弹药图标（抄 DIM 的 SVG）。 |
| `src/client/InventoryToolbar.tsx` | 筛选栏：搜索、分类、类型、锁定、排序、刷新、版本号（构建时注入）。 |
| `src/client/InventoryPanelIcon.tsx` | 侧边栏行图标（游戏自己的 Vault 标记）。 |
| `src/client/filter.ts` | 纯视图逻辑：筛选、分区、行、单元格。**分区顺序由 `buckets.ts` 派生**。 |
| `src/client/buckets.ts` | **唯一的桶分类表**（`BUCKET_SECTIONS`/`ALWAYS_SHOWN`）。新增分类只改这里。 |
| `src/client/cells.ts` | 单元格构造（仓库格带 `segments`）。 |
| `src/client/segments.ts` | 仓库格内怎么分段：武器按类型、护甲按职业。角色格永不分段。 |
| `src/client/CellSegments.tsx` | 分段渲染（块首图标 + 物品）。 |
| `src/client/group-glyphs.ts` | 分组块首图标（武器类型 / 职业）。 |
| `src/client/slots.ts` | 客户端槽位缝，本地声明（宿主没导出这些类型）。 |
| `src/client/use-view-report.ts` | 节流上报视图（200ms、不变不发）。 |
| `src/client/view-reporter.ts` | 视图组装：决定报什么给 agent（这是唯一一处）。 |
| `src/client/styles.ts` | 面板样式（模板字符串）。**注释里写反引号会截断它**。 |
| `src/client/styles-detail.ts` | 详情卡样式。 |
| `src/client/styles-store.ts` | 角色卡样式。 |
| `src/client/styles-intrinsic.ts` | 固有效果样式。 |

### 装配层

| 文件 | 做什么 |
|---|---|
| `src/index.ts` | 把服务、路由、agent 工具、写队列接起来（`apply(ctx, config)`）。只做装配。 |

## 10. 文档地图

根目录只留四份（AGENTS / README / UPSTREAM / LICENSE-DIM），其余全在 `docs/`。
**这份清单与磁盘双向核对**：`docs/` 下有而这里没登记、或这里登记了却没有文件，`tests/docs.test.ts` 判红。
新增文档补一行，删文档同步删行——**同一件事有两份文档时，先合并再删**，别让它们各自漂。

### 接手 / 动手前

- `docs/HANDOFF.md` — **换会话先读这份**：现状、这轮的决定与理由、真机踩过的坑、待办（带优先级）。
- `docs/CODING-STANDARDS.md` — 要把本仓的编码规范搬到另一个仓库时看它；**本仓仍以 `AGENTS.md` 为准**，冲突时以那份为准。
- `AGENTS.md` — 本文件。规矩、分层、代码地图、唯一出处表。
- `README.md` — 装与用：怎么构建、怎么装进 DSH、热更怎么用；也有一份按「我要干什么」排的入口表。
- `UPSTREAM.md` — 引用或再分发 DIM 的素材（图标、属性顺序、强化 perk 表）之前看来源与版本。
- `LICENSE-DIM.md` — DIM 的 MIT 许可原文；改了素材出处要一起看这份。

### 计划（`docs/plans/`）：要做什么、为什么这么定

- `docs/plans/PLAN-SELF-HOSTED-DIM.md` — **架构契约**：前端自己读自己写、MCP 只做随航 agent。§1 的边界写死不许越，动数据面之前先看它。
- `docs/plans/PLAN-WRITE-QUEUE.md` — 动写入路径之前看它：两层串行的理由、`from` 为什么必填、真机验证记录、撞出来的两个问题。
- `docs/plans/PLAN-OPERATION-EVENTS.md` — 动 journal 形状（事件模型、`submitted`、`verified`）之前看它：P1.2–P1.5 的地基与三项待拍板。
- `docs/plans/PLAN-CONSISTENCY-LAYER.md` — **动面板的写入/刷新/核验之前看它**：四套状态各是什么、Pending Overlay 的两条硬约束、七个端到端场景。设计稿，未实施。
- `docs/plans/PLAN-LOCAL-CACHE.md` — **动前端加载/缓存之前看它**：实测上游 0.6–15 秒、DIM 靠缓存不等、加一层 IndexedDB 的取舍与验收。设计稿，未实施。
- `docs/plans/PLAN-AGENT-CONTEXT.md` — 动 agent 层（工具、journal、`/context`）之前看它：P3 的规格与被砍掉的自动摘要。
- `docs/plans/PLAN-SEARCH.md` — 要做搜索之前看它：中文名 + perk 名，**明确不引 DIM 的 152 个关键词**。
- `docs/plans/GROUPING_PLAN.md` — 动分组/分行之前看它：行 = 桶、分段在 vault 格内部；已实现（v0.42.9），留作依据。

### 测试记录（`docs/testing/`）：怎么验、验到哪

- `docs/testing/P1-CONSISTENCY-ACCEPTANCE.md` — **做一致性层的真机验收之前看它**：六项场景怎么造、看什么、什么算通过，以及哪些还没验。

### 调研与提案（`docs/research/`）：看了什么、差在哪、向别人要什么

- `docs/research/DIM-GAP-ANALYSIS.md` — 决定下一步做什么之前看它：DIM 有什么我们没有（2026-11-06 普查）。
- `docs/research/CONTEXT-PLAN-DIFF.md` — 要理解上下文面为什么长这样时看它：原计划与实际取舍的对账。
- `docs/research/RESEARCH-session-presentation-layers.md` — 要给 DSH 提呈现层需求之前看它。
- `docs/research/FR-SESSION-ACTIVATION.md` — 同上，会话激活那份需求。
- `docs/research/FR-SESSION-ACTIVATION.zh.md` — 上一份的中文版，对外沟通时用这份。

### 归档（`archive/`）：历史，**别再改内容**

已完成、已过时、或已被取代的。要复活里面的东西，先看它的状态行。

- `archive/docs/STATUS.md` — 已退役：与 `HANDOFF.md` 答同一个问题（"到哪了"），且已经漂了（它说没写队列，而 v0.48.0 早做了）。**别再维护两份**。
- `archive/docs/IMPL-P0-DATA-MODEL.md` — 已完成，里面的"待做"全部落地。
- `archive/docs/DIAG-EQUIP-VS-INVENTORY.md` — 已修复（装备区/携带区已分开）。
- `archive/docs/PLAN-OPERATION-CONTEXT-v2.md` — 已过时，实际走了自建数据面。
- `archive/docs/PLAN-P2-P3.md` — 已过时，被 `docs/plans/PLAN-SELF-HOSTED-DIM.md` 取代。
- `archive/scaffold/README-es.md` — 脚手架遗留的西班牙语 README，与本项目无关。
- `archive/scaffold/README-hi.md` — 同上，印地语。
- `archive/scaffold/README-pt.md` — 同上，葡萄牙语。
- `archive/scaffold/README-zh.md` — 同上，中文。

### 不算文档的 md

- `probe/README.md` — 探测脚本的说明，跟着脚本走。
- `.workbuddy/memory/*.md` — 外部工具的记忆目录，不归本文档体系管。

### 写法约定

- **一个新的计划**写 `docs/plans/PLAN-<主题>.md`；做完移进 `archive/docs/`，这里改状态，别让"已实现"的计划混在现行区。
- **引用写法**：Markdown 链接用**从引用文件出发的相对路径**（否则点不开）；纯文本提及（代码注释、yaml、json、本文档）用**仓库根相对路径** `docs/plans/<文件>.md`。
- **一个决定只在一处解释**，其他处引用它，不复制理由。
