# 交接：换会话时先读这份

写于 2026-11-06 01:55，v0.47.1。

## 项目是什么

`~/项目/dsh-destiny-inventory` —— DSH 的《命运 2》仓库插件。

**立意**（用户原话）："这个类 dim 界面只是为了让我们的操作可以进 agent 上下文的前提"。

即：界面不是目的，是**给 agent 供料的手段**。评估任何新功能时，先问"它让 agent 更懂用户在干什么了吗"。

**边界**（`PLAN-SELF-HOSTED-DIM.md` §1，写死）：
- 读走自己的 `src/bungie/` + `src/host/`，不碰 MCP
- 写也走自己的（`/action` → Bungie Platform），**前端从不转手给 MCP**
- MCP 只服务随航 agent（分析、配装、模组）
- token 只在宿主半

## 现在到哪了

版本 **0.47.1**，包在 `archive/packages/`（该目录 gitignore）。

| 阶段 | 状态 |
|---|---|
| P1 数据面 | 完成（没有独立 OAuth，读 MCP 的 token——已知偏离） |
| P2 写入面 | 约 85%：四个动作 + 乐观 + 待确认 + 回读；**缺写队列** |
| P3 上下文 | **完成并真机验证过** |
| P4 | 部分（属性条有、套装没有、模组写入没有、搜索语法用户明确不要） |

详见 `docs/STATUS.md`。

## 今天（11-04 ~ 11-06）的关键决定

1. **乐观更新 + 待确认 + 回读**取代了原计划的"失败按快照回滚"。
   原因：Bungie 返回失败不代表没写进去（3–10 秒双向窗口），回滚会让物品跳两次。
   实现在 `apply-move.ts`（`applyMove` / `settleMove` / `confirmMove`）+ `settle-by-readback.ts`。
   计划文档 §3.2 已同步。

2. **P3 按原计划规格做**，工具名是 `destiny_workspace_view` / `destiny_workspace_journal`。
   我自己提的"自动上下文"（`ctx.systemPrompt.context`）被用户砍掉了——理由：原计划用 persona + 工具已经解决，自动推摘要会污染上下文还丢字段。

3. **搜索不做 DIM 的语法**。用户明确说要中文名 + perk 名。方案在 `docs/PLAN-SEARCH.md`，未实现。

4. **agent-detected**：`/inventory` 每次读取时比对上次，30 秒内没有 ui 记录的移动记一条。静默。

## 真机踩过的坑（改代码前必读）

- **`characterId` 必须是真实角色 id**。传 `'0'` 或 `'hunter'` 都会被 Bungie 拒（错误措辞是 "you have to be logged in with a character" / "unexpected problem decoding"）。`item-write.ts` 的 `idOf()` 负责位置键 → id。
- **`ItemState` 位**：Locked=1, Tracked=2, **Masterwork=4**, **Crafted=8**, Enhanced=32。早期读错位导致 933 件被标成"锻造"。
- **组件 304 才有实例级属性**（护甲的六维、武器含 perk 加成的实际值）；定义里的 `stats` 对护甲是空的。
- **组件 305 必须和 102/200/201/205 一起请求**，单请求 305 上游返回 0 个插槽。
- **CSS 层叠**：给元素加样式前先确认没有同特异性的规则在后面。这个坑我踩了四轮（`.dsh-destiny-cell__rest` 的 grid 被 flex 覆盖）。
- **`styles.ts` 里的 CSS 是模板字符串**，注释里写反引号会截断它。
- **DSH 预设**：`dsh-compaction-basic` 挂在 preset 里必须有 `isolate` realm，裸挂会让整个预设不显示。
- **`dsh plugin --profile desktop` 不可用**：desktop profile 由 Electron 应用独占。改插件要改 `~/.dsh/profiles/desktop/package.json` 的 `file:` 路径再 `pnpm install`。

## 工作习惯（用户明确要求过）

- **大改动先给计划**（`docs/PLAN-*.md`），确认后**一次做到位**，别每步问"要不要继续"
- **汇报要真实反馈**，不要表格堆砌；第一人称说自己哪里做得差
- **不要主动巡逻式找 bug**——只修真实咬到的问题
- **改完要验**：tsc → 测试 → 真机 → 眼睛。我曾因为跳过最后一步交付了四版坏布局
- **测试不查 CSS**，布局问题只能靠截图或 computed style

## 待办（按优先级）

1. **搜索**（方案已定，不碰写接口，日常收益最大）
2. **写队列**（并发正确性；现在 `busy` 只是 UI 标志）
3. 标记体系（垃圾/保留/青睐，本地存）
4. 批量选择
5. 插槽可点（换 perk / 装模组，走 `InsertSocketPlugFree`）
6. 护甲卡的能量条、套装加成
7. 修「命运随航」预设（挂载结构已改，未验证）

## 关键文件地图

```
src/bungie/     Bungie Platform 直连：profile / manifest / sockets / write / item-state
src/host/       组合层：service / dto / item-detail / context-store / agent-tools
src/client/     浏览器半：InventoryPanel / ItemDetail / CellSegments / 各种 hook
docs/           除 AGENTS.md、README.md、PLAN-SELF-HOSTED-DIM.md 外的全部文档
```

依赖方向 `client → mcp → host → bungie`，有守门测试（`tests/architecture.test.ts`）。

## 现状验证过的证据

agent 在这个项目的新会话里被问"我在看什么"，调了 `destiny_workspace_view` 和
`destiny_workspace_journal`，正确说出：角色 hunter、筛选全空、排序光等降序、
没选中物品，以及三十秒前拖了「彼岸新城」进仓、「枯骨鳞片」到身上，还推断出"像是在腾位置"。
