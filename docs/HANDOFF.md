# 交接文档

写于 2026-11-06 02:10，v0.47.1。
**换会话先读这份，再读 `AGENTS.md`。**

---

## 一、这个项目是什么

`~/项目/dsh-destiny-inventory` —— DSH 的《命运 2》仓库插件：装备栏、仓库、悬停详情卡、拖拽移动。

### 立意（用户原话）

> 这个类 dim 界面只是为了让我们的操作可以进 agent 上下文的前提。

**界面不是目的，是给 agent 供料的手段。** 评估任何新功能时先问：它让 agent 更懂用户在干什么了吗？

### 边界（`PLAN-SELF-HOSTED-DIM.md` §1，写死不许越）

| | 谁负责 |
|---|---|
| **读** | 自己的 `src/bungie/` + `src/host/`，不碰 MCP |
| **写** | 自己的 `/action` → Bungie Platform；**前端从不转手给 MCP** |
| **MCP** | 只服务随航 agent（分析、配装、模组、战绩） |
| **token** | 只在宿主半，浏览器永不持有 |

**为什么不走 MCP**：MCP 那条路是 `浏览器 → host → MCP 进程 → Bungie`，多两跳。改直连之后拖拽从秒级降到几百毫秒。

---

## 二、现在到哪了

**版本 0.47.1**。包在 `archive/packages/`（该目录已 gitignore，只留最近 5 个）。

| 阶段 | 状态 | 说明 |
|---|---|---|
| **P1 数据面** | ✅ 完成 | 没有独立 OAuth，读 MCP 的 token（已知偏离，见下） |
| **P2 写入面** | 🟡 约 85% | 四个动作 + 乐观 + 待确认 + 回读；**缺写队列** |
| **P3 上下文** | ✅ 完成并真机验证 | 两个工具 + journal + `/context` + agent-detected |
| **P4** | 🟡 部分 | 属性条有；套装、能量条、模组写入没有；搜索语法用户明确不要 |

### P1 的已知偏离

计划要"Bungie Portal 新建独立应用 + OAuth"。实际是**读 MCP 那份 token**（`token-file-provider.ts`，只读不刷新）。

**真实约束**：token 过期要 MCP 去续。单人用没问题，但它不是计划里那个形态。要做独立 OAuth 需要用户在 Portal 建应用。

---

## 三、架构与文件地图

依赖方向 `client → mcp → host → bungie`，**有守门测试**（`tests/architecture.test.ts` 的 `dependency direction`）。

### `src/bungie/` —— Bungie Platform 直连（7898 行总量，这里约 1100）

| 文件 | 职责 |
|---|---|
| `profile.ts` (297) | `GetProfile` → 快照：角色、物品、装备、插槽、属性、目标进度 |
| `manifest.ts` (397) | 定义查询：物品 / 桶 / plug / 伤害类型 / 统计表。**已到 400 行上限** |
| `manifest-shapes.ts` (108) | 行解码纯函数：属性值、锻造槽、角标图、分类哈希、伤害表 |
| `client.ts` (200) | HTTP：GET/POST + 信封解码 + 中文错误映射 |
| `sockets.ts` (101) | 组件 305（插槽）+ 304（实例属性）的形状 |
| `write.ts` (158) | 四个写入端点 + `toItemWrite`（bridge 请求 → 写入指令） |
| `item-state.ts` | 单件状态回读（`GetItem`，不是全量） |
| `lookup.ts` (75) | `DefinitionLookup` 契约 + `buildLookup`（主机层的读取面） |
| `memberships.ts` | token 属于哪个 Destiny 账号 |
| `token-file-provider.ts` (133) | 只读 MCP 的 token，从不刷新 |
| `components.ts` | 请求哪些组件（**305 必须和 102/200/201/205 一起**） |
| `values.ts` (16) | `num` / `str` 边界读取 |

### `src/host/` —— 组合层

| 文件 | 职责 |
|---|---|
| `bungie-service.ts` (309) | 快照缓存（30s）、详情源、角标图、状态、`invalidate()` |
| `dto.ts` (214) | 物品行 / 角色行转换；稀有度、装备三态、锻造、大师杰作 |
| `item-detail.ts` (258) | 详情卡组装：插槽列、属性行、击杀数、固有效果 |
| `details-bulk.ts` (28) | 一次性构建所有详情（1924 件 ≈ 2.8 秒） |
| `stat-order.ts` (89) | DIM 的武器属性顺序 + **护甲六维顺序** |
| `stat-lines.ts` (43) | 属性行（护甲走自己的遍历表，武器走 `statGroupHash`） |
| `enhanced-perks.ts` (441) | 强化 perk 映射（照搬 DIM 的 `trait-to-enhanced-trait.json`） |
| `types.ts` (266) | **线格式契约**：`ItemRow` / `ItemDetailView` / `CharacterRow` |
| `item-write.ts` (124) | 一次写入的编排：找物品、解析角色 id、执行、失效缓存 |
| `item-state-route.ts` (35) | 单件状态的解析（位置键 + equipped） |
| `context-store.ts` (131) | **P3**：`ViewContext` + 200 条 journal + jsonl 落盘 |
| `agent-tools.ts` (51) | **P3**：两个只读工具的注册 |
| `journal-record.ts` (37) | 写入 → 一条 journal 记录（含 `from`/`to` 映射） |
| `detect-external.ts` | **P3**：发现不是自己做的变更 |
| `http.ts` (49) | `sendJson` / `readJsonBody` / `toFailure` |

### `src/client/` —— 浏览器半

| 文件 | 职责 |
|---|---|
| `InventoryPanel.tsx` (538) | 面板主体：状态、拖拽、动作、行渲染。**590 行上限** |
| `filter.ts` (329) | 筛选、分区、行、单元格构建 |
| `buckets.ts` (108) | **唯一**的桶分类表（照 DIM 的 `D2Categories`） |
| `cells.ts` (46) | 单元格构造（vault 格带 `segments`） |
| `segments.ts` (88) | **vault 格内的分段**：武器按类型、护甲按职业；`ENGRAM_*_STYLE` |
| `CellSegments.tsx` (44) | 分段渲染（块首图标 + 物品） |
| `ItemDetail.tsx` (283) | 悬停详情卡（点击打开、点外关闭、Esc） |
| `ItemTile.tsx` (117) | 物品格（角标、光等、待确认状态） |
| `PerkColumns.tsx` (38) | perk 列 |
| `IntrinsicBlock.tsx` (27) | 异域固有效果 |
| `RecoilGauge.tsx` (32) | 后坐方向仪表 |
| `ammo-icons.ts` (22) | 三种弹药图标（抄 DIM 的 SVG） |
| `apply-move.ts` (109) | **乐观移动**：`applyMove` / `settleMove` / `confirmMove` / `applyLock` |
| `settle-by-readback.ts` (38) | 失败后的回读落定 |
| `api.ts` (200) | 桥接请求 + 详情缓存（promise + 已解析值两份） |
| `use-hover-card.ts` (41) | 卡片状态（点开 / 点外关） |
| `use-receipts.ts` | 回执栈（5 秒自动消失、可取消） |
| `Receipts.tsx` (41) | 回执渲染 |
| `use-view-report.ts` (53) | **P3**：上报视图（节流 200ms、不变不发） |
| `view-reporter.ts` (44) | 视图组装 |
| `styles.ts` (494) | 面板样式（CSS 模板字符串） |
| `styles-detail.ts` (429) | 详情卡样式 |
| `styles-store.ts` / `styles-intrinsic.ts` | 角色卡 / 固有效果样式 |

---

## 四、数据口径（改代码前必读）

### 三个正交维度，不许混

| 维度 | 字段 | 来源 | 不许用来做什么 |
|---|---|---|---|
| **分类** | `inventoryBucketHash` / `bucket` | Manifest 的 `inventory.bucketTypeHash` | 不许用 profile 实例上的 `bucketHash`（vault 里全是 138197802） |
| **位置** | `placement` / `locationKey` | 组件来源（201 / 205 / 102） | 不许用物品类型推断 |
| **装备状态** | `equipped` 三态 | 205 的 `instanceId` 是否出现 | 不许用 300 的 `isEquipped` |

### `DestinyItemState` 位（我读错过，代价很大）

```
Locked = 1, Tracked = 2, Masterwork = 4, Crafted = 8,
HighlightedObjective = 16, Enhanced = 32
```

早期把 `& 4` 当成 Crafted → 1924 件里 933 件被误标"锻造"。真实的锻造位是 8（204 件）。

### 组件

| 组件 | 内容 | 坑 |
|---|---|---|
| 102 / 201 / 205 | 仓库 / 角色背包 / 装备 | 邮局在 **201** 里，不在 102 |
| 300 | `gearTier` / `itemLevel` / `primaryStat`（实例） | **没有 stats** |
| 304 | **实例级属性** | 护甲的六维**只在这里**；武器这里是含 perk 的实际值 |
| 305 | 插槽 | **必须和 102/200/201/205 一起请求**，单请求返回 0 |
| 309 | plug 目标进度 | 击杀数在这 |
| 310 | 可切换的 perk 候选 | 卡片上的 perk 池 |

### 位置键 vs 角色 id（两套词汇，混用会被拒）

```
位置键：hunter / warlock / titan / vault     ← 界面分列用
角色 id：2305843009679355779                  ← Bungie 写接口要的
```

`item-write.ts` 的 `idOf()` 负责转换。传错了上游会回两句误导性的话：
- `'0'` → "You have to be logged in with a character"
- `'hunter'` → "There was an unexpected problem decoding your request"

### 分组（照 DIM 的 `StoreBucket.tsx`）

**行 = 桶**（动能武器 / 能量武器 / 头盔…），不是武器类型。
**分组发生在 vault 那一格的内部**：武器按 `type`、护甲按 `classType`，块首有图标。
角色格永远平铺，不分段。

早期我把分组做成"行级"，破坏了四列对齐——`docs/GROUPING_PLAN.md` 里有对账。

---

## 五、这轮做的决定与理由

### 1. 乐观更新 + 待确认 + 回读（取代"失败按快照回滚"）

**原计划**：先本地乐观改，失败按快照回滚。
**为什么改**：Bungie 写后同步窗口 3–10 秒，**返回失败不代表没写进去**。回滚会把界面拉回旧位置，几秒后刷新又跳回去，用户看到物品跳两次。

**现在**：
```
落点即改（0ms），标 applying
成功 → 清标记
失败 → 标 unconfirmed（不回滚）→ 单件回读 → 按真实结果落定
```

实现在 `apply-move.ts` + `settle-by-readback.ts`。计划 §3.2 已同步改。

### 2. P3 按原计划规格，砍掉自动上下文

我一度提"用 `ctx.systemPrompt.context` 自动注入 120 字摘要"。**用户砍掉了**，理由：原计划用 persona + 工具已解决，自动摘要会污染上下文还丢字段（`from`/`to`/`detail`）。

**教训**：读完 DIM 之后我用它的品味覆盖了原计划——DIM 没有 agent，它一切是"给人看的界面"，而我们的取舍是"给 agent 结构化数据"。

### 3. 搜索不引 DIM 的语法

DIM 有 152 个搜索关键词（`is:dupe`、`stat:range:>=50`…）。**用户明确说不会用**，要中文名 + perk 名搜索。方案在 `docs/PLAN-SEARCH.md`，未实现。

### 4. journal 的 `result` 是 `ok | failed | unconfirmed`

原计划第三个是 `rolledback`。不做回滚了，换成 `unconfirmed`。

---

## 六、真机踩过的坑

1. **`characterId` 必须真实角色 id** —— 见上，代价两轮。
2. **`ItemState` 位**读错 —— 见上。
3. **护甲六维只在组件 304**，定义里 `stats` 是空数组；`statGroupHash` 也是 null，所以 `statOrder()` 返回空 → 属性表空。护甲要用自己的 `ARMOR_STAT_ORDER` 遍历。
4. **护甲的生命值可以是 0** —— 早期 `statLines` 把 0 当空值过滤掉了。
5. **CSS 层叠踩了四轮**：`.dsh-destiny-cell__rest` 的 `display: grid` 一直被更后的 `flex` 规则覆盖。最终解法是内联样式 + 固定像素。
6. **`styles.ts` 的 CSS 在模板字符串里**，注释写反引号会截断它（报错是 `',' expected`）。
7. **DSH 预设**：`dsh-compaction-basic` 必须有 `isolate` realm，裸挂会让整个预设不显示。
8. **`dsh plugin --profile desktop` 不可用**（"managed exclusively by the Electron application"）。改插件要改 `~/.dsh/profiles/desktop/package.json` 的 `file:` 路径再 `pnpm install`。
9. **会话工具面在创建时固定**：插件中途注册的工具，schema 能出现在提示词里，但当前会话调不动。要新会话。
10. **token 会过期**：真机测试报 `AuthUnavailableError` 时，调一次 MCP 工具（如 `player_assistant`）续上。

---

## 七、工具链与命令

```bash
pnpm test              # 单测 + 架构守门（16 个模块有行数上限）
pnpm typecheck         # tsc --noEmit（开了 noUnusedLocals）
./dev.sh               # 构建 + 同步到 DSH profile；客户端改动 500ms 热更
npm pack               # 打包，然后 mv 到 archive/packages/

# 真机测试（token 过期先调一次 MCP）
BUNGIE_API_KEY="$(grep '^BUNGIE_API_KEY=' ~/项目/destiny2-mcp/.env | cut -d= -f2-)" \
  ./node_modules/.bin/vitest run
```

**改了 `src/host/` 或 `src/bungie/` 必须完全退出 DSH 再打开**。客户端改动热更即可。
**改 `package.json` 版本号会让热更静默失效**，要刷新页面（`Cmd+R`）。

---

## 八、工作习惯（用户明确要求过）

- **大改动先给计划**（`docs/PLAN-*.md`），确认后**一次做到位**，别每步问"要不要继续"
- **汇报要真实反馈**，第一人称说自己哪里做得差，不要表格堆砌
- **不要主动巡逻式找 bug** —— 只修真实咬到的问题
- **改完要验四步**：tsc → 测试 → 真机 → **眼睛**。我因为跳过最后一步交付了四版坏布局
- **测试不查 CSS**，布局只能靠截图或 computed style
- **规范**：单一出处、不许静默降级、不许兼容层、依赖只能向下、体量超限先拆、超限先抽代码不抬上限（我抬过三次，都是因为新增了委托方法）

---

## 九、待办（按优先级）

1. **搜索**（方案 `docs/PLAN-SEARCH.md` 已定；不碰写接口；日常收益最大）
2. **写队列**（并发正确性，不是功能；`busy` 现在只是 UI 标志，连点两次会发两个请求）
3. 标记体系（垃圾/保留/青睐/灌注/归档，本地存）
4. 批量选择（框选 + 批量锁定/标记）
5. 插槽可点（换 perk / 装模组，走 `InsertSocketPlugFree`）
6. 护甲卡：能量条、套装加成
7. 修「命运随航」预设（结构已改，未验证）
8. journal 的时间戳改 ISO（现在存 `Date.now()` 毫秒数，agent 要自己换算时区）

---

## 十、验证过的证据

在新会话里被问"我在看什么"，agent 调了 `destiny_workspace_view` 和
`destiny_workspace_journal`，正确说出：

- 角色 hunter、分类 all、锁定不筛、排序光等降序
- 搜索框空、没选中物品
- 三十秒前拖了「彼岸新城」进仓、「枯骨鳞片」到身上，两件都 ok
- 还推断出"看着像是在腾位置"

**这条链路是通的**，换会话不会丢（工具在宿主侧注册，与会话无关）。
