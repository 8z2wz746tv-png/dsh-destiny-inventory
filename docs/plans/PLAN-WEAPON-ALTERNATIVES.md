# 武器平替（第一版设计稿）

2026-11-14，基线 `5fb50bc`。**已实施；代码审查通过（v4）。** 真实 DSH 的 `pending → 切武器 → 原结果返回 → Hash 排除 → 精确定位` 闭环尚未验证，是独立待办；不能把 host live 8/8 当成产品闭环。限制：数据过期 / `not-in-snapshot` 仍只有单测；当前工具只能给 20/126 个实例，卡片按 10 组截断并明确标注。

## 0. 一句话

选中一把武器，Agent 先确认它的类型/frame/当前插槽，再取**玩家实际持有的同类型武器**，
把候选和真实副本做成卡片；点击任一副本，仍走已经跑通的 `instanceId` 精确定位。

**卡片只放证据；「为什么能替代、相同/损失、适用场景」由 Agent 在回复里分析，不伪装成工具字段。**
本版不做社区配装、不做配装执行、不引入第二套 MCP Runtime。

## 1. 范围

**做：**

- 从当前选中武器出发，取玩家**已持有**的同 `weapon_type` 候选。
- 候选卡：武器身份、frame/rpm、持有副本（instanceId/位置/光等/装备/锁定）、当前插槽、部分社区清单。
- 当前武器与候选的同/异事实（同类型、同 frame、同 RPM、共享的当前插槽名）用确定性字段展示。
- 点击候选的某个副本 → 复用 `locateItem(instanceId)` / 面板高亮。
- Agent 在回复中回答：为什么能替代、哪些能力相同、哪些会损失、适合什么场景；引用数据来源。

**不做：**

- 把 Manifest 全量定义候选（`catalog`）说成“你有”。
- 平替排名算法、平替分数、自动选择“更好”。
- 社区配装检索、配装预览/执行、任何账号写入。
- 新增 MCP intent、改 MCP Runtime、改 Session/Journal/State Authority。
- 为了完整 stats 去读宿主 spill 文件。

## 2. 现有契约（2026-11-14 实测）

### `weapon_assistant(intent="filter_rolls")`

- `data.scope = "owned_inventory"`，`matched[]` 是**账号持有实例**：
  `item_hash` / `name` / `name_en` / `rarity` / `weapon_type` / `frame` / `rpm` /
  `instance_id` / `location` / `power` / `is_equipped` / `locked` / `perks[]`。
- `reason` 只是“命中筛选条件”，**不是**平替理由。
- `farming_list.results[]` 对部分同名武器给社区清单：`list` / `scale` / `tier` / `note` /
  `perks` / `source` / `source_ref.updated_at` / `trust=untrusted_reference`；未命中只说明
  本地清单没有，不代表不值得用。**响应里没有 `item_hash`，只能按武器名关联；这是弱证据，
  不升级为确定身份匹配。**
- 实测 `weapon_type="手炮"`：126 个持有实例；`limit=10` 返回 **10 行**且 `truncated=true`。
  5 条不是工具上限，是探针里传的 `limit=5`；`limit` 是**实例行数**，不是去重后的候选数。
  行里**没有** `stats`，也没有“相同/损失/场景”。

### `weapon_assistant(intent="catalog")`

- `data.scope = "manifest_catalog"`，`matched[]` 是**定义级候选**：
  `item_hash` / identity / `matched_perks` / `matched_perk_details`（含 perk 描述）/ `owned=false`。
- **没有 instanceId**，`ownership_checked=false`；不能单独回答“我实际拥有哪个副本”。
- 实测 `weapon_type="手炮" + required_perks=["萤火虫"]`：228 检查 / 24 命中 / 2 返回；
  `farming_list` 只覆盖其中一部分。

### 其它

- `compare` 是**同名副本**对比，不是跨武器平替。
- `community` / `popularity` / `god_roll` 是独立的社区/愿单证据；与账号/Manifest 分三档。
- **没有 `alternatives` intent，也没有 reason/difference/scenario 字段。** 这是本设计的硬前提。

## 3. 三个词先说清

- **同类型候选**：`weapon_type` 相同、玩家实际持有。本版只承诺这一层。
- **功能替代**：实际战斗职责相近（frame/射程/伤害/操作方式/场景）；需要 stats 或实战数据，
  当前 `filter_rolls` 不提供。
- **完整平替**：关键能力与使用场景基本满足替代要求；更不能由卡片的同类型事实直接推出。

卡片只标“同类型持有候选”；“功能替代/完整平替”最多出现在 Agent 回复里，并必须写明证据、
证据缺口和不确定性。不能把同类型说成功能替代，也不能把社区清单命中说成“公认最佳平替”。

## 3.1 候选定义（推荐）

- **候选池 = `filter_rolls(weapon_type = 当前武器类型, include_inventory=true)`**，只含持有实例。
- **排除依据是 `selectedItemHash`**（来自 `/context.selected.hash`，host 已上报的可信字段），
  不是第二次查询里的 `selectedInstanceId`。第二次查询可能 `truncated`，当前实例未必在返回行里；
  只要返回里出现**同 `item_hash` 的另一副本**，也必须整组排除，不能把它当候选。
- `selectedInstanceId` 只用于在结果里补齐当前武器的 frame/rpm/当前插槽展示；找不到就留空，
  **不因找不到而放弃 Hash 排除**。
- 如果 `selectedItemHash` 缺失/为 0，**拒绝生成候选卡**，提示“当前武器身份无法确认”；
  不靠名称、Hash 猜测或第二次结果兜底。
- **同一快照**：`selected.hash` 是 `ItemRow.hash = source.itemHash`；`selected.instanceId` 来自
  按 `picked.instanceId` 找到的同一 observed 行。`view-reporter` 若两者不是同一实例，直接
  输出 `selected: null`，不拼身份。
- **调用时绑定**：候选卡在工具调用第一次以 `pending` 气泡出现时捕获 hash/instance/name/kind/observedAt；
  结果返回后不再读实时 view。若第一次看到调用就已经是 `done`，说明没有可靠的调用时上下文，
  拒绝出卡，不用返回时的当前选择猜。用户切换装备不会改绑。
- **会话隔离**：`bubble.key` 是 `e${event.seq}`，只保证会话内唯一；`DockChat`/`Conversation`
  会跨会话复用，所以绑定键是 `sessionId + bubble.key`，不假设全局唯一、也不假设切会话必卸载。
- **提交后写入**：render 只读；绑定只在 `useLayoutEffect` 里通过 `setState` 写入，绑定函数是纯函数。
  被放弃的 render 不会留下记录；没有新 pending 时返回同一个 Map，不触发额外 state 更新。
- **kind / 过期**：选中项 `kind !== "weapon"`、`observedAt` 缺失或超过 5 分钟、hash 缺失，
  都拒绝出候选卡；不做“按名字猜”。
- 按 `item_hash`（同名多版本可再按 name）分组；每个候选保留它的全部持有副本。
- Tool 的 `limit` 是**实例行数**；同名多副本会占多行。Agent 查询建议 `limit=20`，
  前端按 `item_hash` 分组后最多展示 **10 个候选**；如果返回的去重候选不足 10 个，就按实际数量展示。
- 结果 `truncated=true` 时卡片明确写「仅展示返回的 N 个实例 / 共 M 个持有实例；
  未返回的未参与比较」；去重超过 10 组时写「当前返回结果去重后超过 10 组，仅展示其中前 10 组；
  这不是推荐排名」。不写成 Top N，不让 Agent 根据未取得的实例推断排名。
- 不按 frame 硬过滤：同类型、不同 frame 是“同类型候选”的事实差异；是否功能替代由 Agent 分析。
- 当前武器按 `selectedItemHash` 整组排除；`selectedInstanceId` 只用于当前实例详情展示。
  同一 `item_hash` 的所有副本都排除，避免把自己的其它副本当平替。
- 不把 `catalog` 的未持有定义塞进候选；需要定义/perk 描述时由 Agent 另行调用，并标 `Manifest` 来源。

## 4. 卡片模型（新，不复用单武器 parser）

`parseWeaponCard` 的前提是“所有 matched 行都是同一把武器的副本”；平替查询的 matched
是不同的武器，**不能直接复用**，否则会把别的武器标成“我的副本”。

建议新模块 `weapon-alternatives-model.ts` + `WeaponAlternativesCard.tsx`，复用样式与 locate：

```ts
interface AlternativeCopy {
  instanceId: string
  location: string
  power: number | null
  equipped: boolean
  locked: boolean
  perks: string[]           // 当前插槽名，真名，不做 slot 猜测
}

interface AlternativeCandidate {
  itemHash: number
  name: string
  nameEn: string
  weaponType: string
  frame: string
  rpm: number | null
  iconUrl: string
  copies: AlternativeCopy[]
  /** filter_rolls.farming_list 里同名的社区清单记录；不是推荐结论；没有就留空，不推断。 */
  community: { list: string; scale: string; tier: string; note: string; source: string; updatedAt: string }[]
}

interface AlternativesModel {
  /** 来自 /context；没有它就不生成候选卡。 */
  currentHash: number
  currentKnown: boolean
  currentName: string
  /** 仅当第二次结果里恰好有当前实例时才有完整详情；没有就留空。 */
  current: { instanceId: string; name: string; frame: string; rpm: number | null; slots: string[] } | null
  candidates: AlternativeCandidate[]
  matchedCount: number
  returnedCount: number
  truncated: boolean
  candidatesTruncated: boolean
  source: 'filter_rolls'
}
```

- `current` 由 `selectedInstanceId` 在 matched 里找到；找不到就只列候选，不猜当前。
- **v1 没有把 `sharedSlots/currentOnlySlots` 放进模型或卡片**；当前插槽交集/差异由 Agent 根据
  副本的 `perks[]` 分析。上面接口是设计稿里已删掉的部分，不能当成当前实现事实。
- community 只读 `farming_list.results[]`，带 `list/scale/tier/note/source/updated_at`；没有就空。
- 不显示 stats（filter_rolls 没给）；需要 stats 的结论由 Agent 另行取证或明确说“没查”。
- 卡片在 `filter_rolls` 的工具气泡里；识别条件：`data.scope=owned_inventory` 且 matched 里
  出现多个不同 `item_hash`，或 args 里是 `weapon_type` 而不是 `weapon_name`。
- 点击副本 → `locateItem(instanceId)`；当前武器不提供“平替”按钮。

## 5. Agent 流程与回答

1. 从 `/context` 拿到选中武器名/instanceId/**hash**；hash 是排除当前武器的唯一可信依据。
2. 先用 `weapon_assistant(intent="filter_rolls", weapon_name=当前名, include_inventory=true)` 确认
   当前副本、类型、frame/rpm、当前插槽（这条结果可作为当前基线；也可由 analyze 提供）。
3. 再调 `weapon_assistant(intent="filter_rolls", weapon_type=当前类型, include_inventory=true, limit=20)`；
   解析器用 `selectedItemHash` 排除整个 `item_hash` 组。**不要求**当前实例出现在第二次返回里；
   如果返回里没有当前实例、但有同 Hash 的副本，同样整组排除。
4. 回复必须回答：
   - 先说明这是「同类型持有候选」，不自动等于「功能替代/完整平替」；
   - 为什么可能替代（基于同类型/frame/rpm/共享插槽/社区 note，逐条指来源）；
   - 相同的是什么（只写有证据的：同类型、同 frame、同 RPM、同名当前插槽）；
   - 损失/风险是什么（当前有而候选没有的插槽；没有 stats/实战数据就说没查，不推断）；
   - 适合什么场景（明确是 Agent 分析，不是工具字段；社区 note 引用来源和日期；
     清单命中只说明“出现在该清单”，不说明当前版本强势或最佳替代）；
   - 我实际拥有哪个副本（instanceId、位置、光等、是否装备/锁定）。
5. 不把 `catalog` 的 `owned=false` 候选说成“你有”；不把社区 note 当官方结论或“最佳替代”；
   不把 `reason="命中筛选条件"` 当平替理由；未取得的 116 个实例不能用来推断完整排名。
6. 点击卡片副本仍走现有定位；定位失败/面板关闭沿用现有文案和副作用约束。

## 6. 快捷入口

- 选中武器时，在现有「分析武器」之外增加「找平替」；仍只对 `kind=weapon` 出现。
- Prompt 明确：先确认当前武器，再按 `weapon_type` 取持有候选；只展示实际拥有的副本；
  理由/差异/场景用证据回答，不补 stats/定义池。
- 不把「找平替」放进非武器选中项；不在本版恢复配装按钮。

## 7. 文件落点（预计）

| 文件 | 改动 |
|---|---|
| `src/client/agent/weapon-alternatives-model.ts` | 新：filter_rolls 候选解析、当前识别、分组、社区/截断 |
| `src/client/agent/WeaponAlternativesCard.tsx` | 新：候选卡、副本按钮、来源标签 |
| `src/client/agent/DockChat.tsx` | 识别候选结果并渲染新卡；不改变现有单武器卡 |
| `src/client/agent/quick-actions.ts` | 增加「找平替」与明确 prompt |
| `src/client/agent/styles-dock.ts` | 候选卡样式（复用现有卡片变量/密度） |
| `src/client/locate-bus.ts` / `use-locate.ts` / `ItemTile.tsx` | 不改；复用精确定位 |
| `AGENTS.md` | §9 代码地图（新文件）、§10 本文档 |

**不碰**：MCP、Host 路由、Journal、State Authority、Session、`weapon-card-model.ts` 的单武器语义。

## 8. 测试与验收

- 解析器：真实 `filter_rolls(weapon_type=手炮, limit=10)` fixture（126 total / 10 returned /
  truncated）；**当前实例不在返回里、但同 Hash 的另一副本在返回里 → 该组必须被排除**；
  当前 Hash 缺失 → `currentKnown=false` 且不出候选；多个不同 `item_hash` 分组；同一武器多副本；
  去重候选不足 10 按实际；社区清单部分命中/未命中；
- 上下文：`viewOf` 在 picked/observed 不是同一实例时输出 `selected: null`；`contextIsStale`
  对缺失/0/超 5 分钟返回 true；候选卡绑定工具调用 pending 时的上下文，之后切装备不改绑；
  竞态测试覆盖「A 发起、结果前切 B、结果仍绑定 A」；跨会话同 `bubble.key` 用
  `sessionId + bubble.key` 分开绑定；绑定函数输入不被修改、无新 pending 返回同 Map。
  没有 `selectedInstanceId` 时不猜当前。
- 卡片：候选数、副本数、shared/currentOnly 只是名字交集；没有 stats 不渲染；社区来源/日期可见；
  点击副本传给 locate 的是 instanceId。
- 快捷入口：武器选中出现「分析武器」「找平替」；非武器不出现。
- 定位：复用现有 `locate-bus` 测试；真机点候选副本，卡片 instanceId == `.dsh-destiny-tile.is-located`。
- 真机：
  1. 选中武器，确认快照新鲜；
  2. 点「找平替」，确认 `filter_rolls(weapon_type=...)` 参数；
  3. 卡片候选均为持有武器，当前武器不在候选里；
  4. 点候选副本，精确高亮；
  5. 面板关闭/定位失败无副作用。
- 变异：至少注入“把当前武器列为候选”和“按 item_hash 错配副本”两个错误，确认测试变红。

## 9. 已拍板（2026-11-14）

1. **候选池 = 同 `weapon_type` 的持有武器**（推荐）；不按 frame 硬过滤，frame/rpm 作为事实。
2. **候选上限 10 有真实取数能力**：`filter_rolls(limit=10)` 实测返回 10 行；`limit` 是实例行数，
   不是候选数；分组后不足 10 按实际。126 total / truncated 时明确提示，不写成 Top N。
3. **理由/差异/场景只在 Agent 回复**，卡片只放证据（推荐；工具没有这些字段，模型生成 JSON
   不进入卡片数据）。当前武器排除用 `/context.selected.hash`；Hash 缺失拒绝出卡。
4. **新增候选卡组件**，不复用单武器 `parseWeaponCard`；locate/样式复用（推荐）。
5. **本版不做社区配装/配装执行**；社区清单只作证据。

### 实施记录（2026-11-14 / 审查修正 2026-11-15）

- `filter_rolls(weapon_type=手炮, limit=20)` 真机返回 20 个实例 / 126 total，`truncated=true`；
  卡片按 `item_hash` 分组展示 10 组，并写明「未返回的未参与比较」。
- 当前选中实例 Hash `1216319404` 已按 context Hash 整组排除；单测覆盖「选中实例 A 不在返回、
  同 Hash 的 B 在返回」的场景，B 仍被排除。Hash 缺失时 `currentKnown=false`，不出候选。
- 点击候选「三冠得主」副本，卡片按钮 `定位 6917530183210837452` 与最终
  `.dsh-destiny-tile.is-located` 的 `data-instance-id` 完全一致。
- 关闭面板后点副本：无 tile、无高亮，显示「先在左侧打开…」。
- 非 live 577 passed / 1 skipped；host live 8/8；`tsc --noEmit` 干净。
- 变异：移除当前 Hash 排除 → 3 failed KILLED；把分组的 `get(itemHash)` 改成 `get(0)` →
  2 failed KILLED；移除调用时 context 的 bound 守卫 / pending 守卫 → 各 1 failed KILLED。
- 上下文身份：`hash` 是 `source.itemHash`；`viewOf` 强制 observed/picked 同一实例；候选卡在工具调用
  首次以 `pending` 气泡出现时按 `sessionId + bubble.key` 绑定上下文；绑定只在提交后的
  `useLayoutEffect` + state 写入，render 只读；首次看到已完成则拒绝；`kind !== weapon`、
  `observedAt` 缺失/超 5 分钟、hash 缺失都拒绝出卡。`tool-context.test.ts` 覆盖「A 发起、结果前切 B、
  结果仍绑定 A」与「跨会话同 key 分开绑定」；`view-reporter.test.ts` / `tool-card.test.ts` 覆盖同实例与过期。浏览器 DevTools socket
  关闭后没有做第二次真机候选卡回归，之前的候选卡/定位真机证据仍成立。
- P1 截断文案：`当前返回结果去重后超过 10 组，仅展示其中前 10 组；这不是推荐排名。`
- P2 社区关联：`farming_list.results[].name` 是武器名，响应没有 `item_hash`；卡片标「按名称关联，
  弱证据」，不升级为确定身份匹配。
- 限制：卡片不展示 stats/理由/损失/场景（工具没有这些字段）；同类型候选不等于功能替代；
  `farming_list` 只作社区清单记录，不是推荐结论。

实现顺序：解析器/模型 → 候选卡 → 快捷入口 → 真机定位 → 测试。
