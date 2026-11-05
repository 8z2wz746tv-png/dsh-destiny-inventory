# 计划：自建 DIM 前端 + 自有数据/写入面，MCP 只做随航 agent

> 状态：**待用户确认后开工**。本文件是架构契约，确认后按它一次做到位，不分步反复问。
> 前身文档：`PLAN-P2-P3.md`（旧路线：前端吃 MCP 载荷）。本文件推翻它的取数/写入两节，保留其"评分与取舍"思路。

## 0. 一句话

前端是一个**不经过 MCP 的完整 DIM**：自己登录 Bungie、自己读组件与 Manifest、自己写账号。
MCP 只服务随航 agent（分析、配装、模组），前端把"用户在看什么、刚做了什么"交给 agent 作为上下文。

```
┌────────────────── DSH 宿主 ──────────────────┐
│  自制 DIM 前端（React，吃 --dsw-alias-*）      │
│      │ 同一进程 HTTP，仅 127.0.0.1，带启动令牌  │
│  ┌───▼────────────── 插件 host 半 ──────────┐  │
│  │ bungie/  自有 OAuth + GetProfile + 写队列 │  │
│  │ manifest/ 定义查询（公开数据）            │  │
│  │ journal/  操作流水 + 当前视图快照          │  │
│  │ 两个只读工具（暴露给 agent）               │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  随航 agent ──ctx.tools──► MCP(destiny)        │
│                ▲                               │
│                └── 读 context 工具 / 技能       │
└────────────────────────────────────────────────┘
```

## 1. 边界（写死，不许越）

| 事 | 谁做 | 不许谁做 |
|---|---|---|
| 读角色/背包/仓库 | 前端自己的 `bungie/` | 前端不许再吃 MCP 的 `webui_sidecar`、插件 `/dsh-destiny-inventory/*` |
| 拖拽/装备/锁定/取回 | 前端自己的写队列 → Bungie | 不许转手给 MCP 工具再执行 |
| 分析/平替/配装/模组/调谐 | MCP（agent 调用） | 前端不复刻这些 |
| 账号 token | 只在 host 半内存与磁盘 | **浏览器半绝不持有 token** |
| 上下文 | host 半 journal + 视图快照，注册成工具给 agent | 不用 postMessage、不用 iframe |

## 2. 数据面（host 半 `src/bungie/`）

### 2.1 登录：独立 Bungie 应用

- **不复用** MCP 的 `BUNGIE_CLIENT_ID`：Bungie 的 refresh token 单次轮换，两个客户端各自刷新会互相踢下线。
- 前端用独立应用：`redirect = http://127.0.0.1:<port>/callback`（端口进配置，默认 8790）。
- token 落 `~/.dsh/destiny-workspace/tokens.json`（`0600`）：`accessToken{value,expiresAt}` / `refreshToken` / `membershipId`。结构对齐 DIM 的 `oauth-tokens.ts`，但**不写 localStorage**。
- 需要用户在 Bungie Portal 提供：`API Key`、`OAuth client_id`、`client_secret`。缺这三个，OAuth 走不通，其它模块可以先写。

### 2.2 读：一次 GetProfile，组件要带全

`GET /Platform/Destiny2/{membershipType}/Profile/{membershipId}/?components=100,102,200,201,205,300,305,900`

- **坑（已踩过）**：只请求 305 时上游一个插槽都不返回，必须带 102/200/201/205，否则静默读空、伪装成"匹配逻辑错"。
- 组件用途：100 档案、102 profile 清单、200 角色、201 角色清单、205 角色装备、300 物品实例（`isEquipped` 只在 `itemComponents.instances.data[inst].isEquipped`）、305 插槽、900 记录。
- 缓存：内存 + `fetchedAt`；拖动/写入后只做**轻量回读**（200/201/205），不重拉 305。
- 写后回读有 **3–10 秒同步窗口**：写完立刻读会读回旧值。回读策略 = 8 次 × 1.5 秒，超出窗口报 `unverified`，不报"没成功"。

### 2.3 Manifest（定义层）

- 只读标准定义库：`/Users/husky/项目/destiny2-mcp/manifest/destiny_manifest.sqlite3`（`DestinyInventoryBucketDefinition`、`DestinyItemCategoryDefinition` 等标准表）。这是公开数据的本地副本，MCP 的业务代码不参与。
- 需要覆盖的定义：item（名/描述/图标/类型/稀有度/伤害/弹药/职业）、bucket（桶名/inArmor/inPostmaster/inWeapons）、plug（perk 名/描述/图标/stat 效果）、stat、socketType（`socketCategory`：决定 perk 列）。
- 备用：插件自己下 JSON manifest 到 `~/.dsh/destiny-workspace/manifest/`。接口保持一致，换实现不动上层。

## 3. 写入面（host 半 `src/bungie/actions.ts`）

### 3.1 端点（Bungie Platform）

| 前端动作 | 端点 | body 关键字段 |
|---|---|---|
| 拖到角色/仓库 | `POST /Destiny2/TransferItem/` | `itemReferenceHash, stackSize, transferToVault, itemId, characterId, membershipType` |
| 拖到角色身上（装备） | `POST /Destiny2/EquipItem/` | `itemId, characterId, membershipType` |
| 批量装备（多选） | `POST /Destiny2/EquipItems/` | `itemIds[], characterId, membershipType` |
| 上锁/解锁 | `POST /Destiny2/SetLockState/` | `state, itemId, characterId, membershipType` |
| 从邮政官取回 | `POST /Destiny2/PullFromPostmaster/` | `itemReferenceHash, stackSize, itemId, characterId, membershipType` |
| 装护甲模组（P3） | `POST /Destiny2/InsertSocketPlugFree/` | `plug{socketIndex, socketArrayType, plugItemHash}, itemId, characterId, membershipType` |

- 免费插槽接口字段是 **`itemId`**（付费接口才是 `itemInstanceId`）；`plugItemHash` 要走**无符号**（负数会被拒）。
- 上游 `1663 "This action can only be done in-game."` 不是权限问题，是这条写入只能游戏内做 → 翻成人话直接告诉用户。
- 常见拒绝：背包满、物品不在该位置、不可转移、装备中不能动。错误码统一过一层 `DestinyErrorCodes` → 中文一句话，别把原始码糊到界面。

### 3.2 手感（与 DIM 一致）

拖拽即执行，**不弹确认**。DIM 的手感来源是"落点本身就是意图"，我们照抄：

1. 拖起：`hideItemPopup()`，暂停自动刷新（`isDragging` 只在视图层，不进数据层）。
2. 落到目标：**先本地乐观改**（reduce 一次 `itemMoved`），再发写请求。
3. 回执：成功 → 落定 + 角落一条可点开的回执；失败 → **按快照回滚那一次**并显示原因。
4. 写后不立刻全量重拉；用轻量组件回读确认最终状态。

**与 DIM 的刻意差异**：DIM 是"写成功才改模型"。我们改成**乐观 + 待确认 + 回读落定**（2026-11-06 修订，取代原先的"失败按快照回滚"）。

改的原因是回滚有坑：Bungie 的写接口返回失败**不代表没写进去**（写后同步窗口 3–10 秒，反向也成立）。按快照回滚会把界面拉回旧位置，几秒后刷新又跳到新位置，用户看到物品来回跳两次。

现在的流程：

1. 落点即改界面（乐观，0 ms），那件物品标 `applying`。
2. 请求成功 → 清标记，界面不动（本来就对）。
3. 请求失败或超时 → 标 `unconfirmed`，**不回滚**，发一次**单件回读**（`GetItem`，不是全量）。
4. 回读给出真实位置 → 按它落定；回读也失败 → 保持 `unconfirmed` 并提示"状态未知，刷新确认"。

`applying` / `unconfirmed` 都只是视图标记，不进数据面：真实位置永远以 Bungie 为准。

### 3.3 串行化与竞争

- host 半一条**单飞写队列**：同一时刻只允许一个写请求在途，其余排队。Bungie 没有事务，并发写同一件物品必产生幽灵状态。
- 队列项携带 `itemId` 与"期望终态"，冲突（同 item 在途）直接合并或拒绝。
- agent 通过 MCP 写入时前端**不知情**：面板重新获得焦点、以及每 60 秒，做一次轻量回读；发现本地快照与服务器不一致就整页静默刷新（不打断当前滚动与选中）。
- 所有写入（无论前端还是 agent 触发的结果被观察到）都落 journal，带 `source: 'dim' | 'agent-detected'`。

## 4. 上下文面（随航）

### 4.1 host 半维护两样东西

- `ViewContext`：当前角色、筛选、排序、选中物品（instanceId/hash/名字/所在位置）、最近一次拖拽的落点。
- `Journal`：环形 200 条 —— 时间、动作、物品（id/hash/名）、from→to、结果（ok/failed/rolledback）、source。

落盘：`~/.dsh/destiny-workspace/journal.jsonl`（追加写，保留最近 200 条），便于排查；内存里是唯一真源。

### 4.2 暴露给 agent 的两个只读工具（host 半 `ctx.tools.register`）

- `destiny_workspace_view()` → 当前视图快照（"用户正盯着哪件、哪个角色、筛了什么"）。
- `destiny_workspace_journal({limit})` → 最近操作流水（"他刚把哪件从仓库拖到猎人身上、成没成"）。

这两个工具属于插件，不属于 MCP。preset 的 persona 写一句："用户说'这件/刚才那件/我刚拖的'时，先调 `destiny_workspace_view` / `destiny_workspace_journal`，不要反问。"

### 4.3 专用预设（`~/.dsh/.agent-presets/destiny/`）

- `preset.yml`：`name: 命运随航`、`description`、`order`。
- `agent.cordis.yml`：只挂需要的行 —— `dsh-persona`（随航人设）、`dsh-skill-filesystem` + `dsh-tool-skill`（技能 `destiny2-mcp`、`destiny2-render`）、计划/压缩分组；**不挂** `tool-bash`、`tool-pwsh`、`tool-fs-search`，这就是"专门模式"。
- MCP 工具由 profile 的 `dsh-mcp-client` 在宿主平面提供，preset 不重复注册。

## 5. 前端落点（改哪些现有文件）

| 文件 | 处理 |
|---|---|
| `src/client/api.ts` | 改指向 host 半自有路由（`/characters`、`/inventory`、`/item`、`/action` 保留同名但换实现） |
| `src/client/InventoryPanel.tsx` | 保留；拖拽改走新 action 路由；回执条承接乐观/回滚 |
| `src/client/ItemDetail.tsx` | 保留；数据来自新 `bungie/item`（实例插槽 + Manifest perk 池） |
| `src/client/filter.ts` | 保留；桶分类仍按 DIM 的 categories，payload 不再受 MCP 字段限制 |
| `src/client/styles.ts` | 保留；`--dsw-alias-*` 已是正确姿势 |
| `src/client/index.ts` | 注册从 `LegacyInventoryPanel` 切回 `InventoryPanel` |
| `src/client/legacy/**` | **不再注册**；等自研视觉追平后删除 |
| `src/mcp/inventory.ts`、`item.ts`、`queries.ts`、`types.ts` 的 UI 部分 | 废弃（MCP 只剩 agent 的事）；`src/mcp/client.ts` 保留给 journal/诊断用 |
| `src/mcp/actions.ts` | 从前端调用链移除；MCP 的写入能力仍由 agent 使用 |

## 6. 阶段

- **P1 数据面**：OAuth（独立应用）+ GetProfile + Manifest 定义 → 前端能登录、看角色/仓库/装备格。验收：真机打开面板，1900+ 件、角色切换、桶分类正确。
- **P2 写入面**：写队列 + 四个动作 + 乐观/回滚 + 轻量回读。验收：拖一件仓库武器到猎人身上装备成功、失败能回滚且原因正确、回执可点开。
- **P3 上下文 + 预设**：两个只读工具 + journal + `destiny` preset。验收：agent 被问"我刚拖的那件成没成"能直接答对。
- **P4（之后再看）**：模组写入（InsertSocketPlugFree）、套装/属性条、搜索语法。

## 7. 明确不做

- 不做 DIM 整页嵌入、不做 iframe、不做 postMessage 桥。
- 不复刻 MCP 的分析/求解（平替、配装、DPS）。
- 不在浏览器里存 token、不让前端直连 Bungie（token 只在 host 半）。
- 不为了"看起来像 DIM"去搬 `*.m.scss`、`--item-size` 网格变量、i18n。

## 8. 需要用户提供 / 决定

1. Bungie Portal 新建一个应用，给到 `API Key` / `client_id` / `client_secret`，redirect 填 `http://127.0.0.1:8790/callback`（端口可改，改了同步告诉我）。
2. Manifest 走哪条：**读 MCP 那份 sqlite（推荐，零下载）** / 插件自己下一份。
