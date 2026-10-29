# P2 / P3 方案：从"能看"到"能看透 + 能用"

## 现在是什么

只读图标网格：全部 1922 件按 位置 → 桶 分组，能搜、能筛、能排序。
点不开、拿不动、装备不了。你说得对，这就是毛坯。

## 老 web 的交互是什么（已读源码，不是印象）

`Destiny_MCP/webui/src/features/inventory`：

- **DIM 式拖拽**：`InventoryStores.tsx` 自己实现 drag/drop，支持多选一起拖，
  拖到目标 store 上直接执行，没有二次确认弹窗。
- 四个动作：`transfer`（角色↔仓库）、`equip`、`lock`、`pull_postmaster`。
- 详情卡：`InventoryItemHoverCard` 405 行，perk 按槽位列式排布、可选 perk 在同列堆叠、
  武器模组与大师杰作单独一行。
- 乐观更新：动作成功后本地改 store，失败回滚并弹错误。

## MCP 这边给什么（已读源码）

- `move` / `transfer` / `lock` / `pull_postmaster` 走**通用确认入口**：
  不带 `confirmed` 时返回确认信封（要改什么 + 可回放参数），带 `confirmed=true` 才执行。
- `equip` / `equip_mod` / `equip_build` 是**自带守卫**的，走自己的候选/执行编号流程。
- 物品详情的 perk 数据来自 `inventory_assistant(intent="item")`：单件约 7.4 KB，
  含完整 sockets（intrinsic / 枪管 / 弹匣 / 特性 / 大师杰作 / 模组），按需拉。

## 打算怎么做

### P2 —— 看透一件东西

1. host 半加 `/item?id=<instanceId>`：调 `inventory_assistant(intent="item")`，
   把 sockets 压成"列"：`{ 类别, 槽位, 当前选中, 可选 perk 列表 }`。单件缓存 10 分钟。
2. client 半做详情卡：点物品 → 浮层，左边物品大图与光等，右边 perk 列。
   perk 列按 DIM 排布：枪管/弹匣/特性各一列，同槽位的可选项在同一列里堆叠。
3. 键位：点开、Esc 关、方向键在网格里走。

### P3 —— 拿得动

1. host 半加 `/action`（POST）：接收 `{ kind, itemId, destination }`。
   - `move` / `transfer` / `lock` / `pull_postmaster`：先发一次不带 `confirmed` 的调用，
     把 MCP 回的信封**原样**带回给前端，再带 `confirmed=true` 发第二次。
   - `equip`：走过去它自己的候选流程，回执里带回 `requires` 与 `execution_id`。
2. client 半做拖拽：拖物品到角色栏/仓库栏即移动；拖到角色身上即装备。
   拖拽过程中显示目标与"会不会顶掉哪件"。
3. 锁定：双击或右键切换，走 `lock`。
4. 所有动作完成后回读一次受影响的位置，不靠本地猜测（Bungie 有写入同步窗口）。

### 明确不做

- **拆解**：MCP 没有 dismantle，不做假按钮。
- **对比**（`weapon_assistant compare`）：P2 之后再谈。
- **元素/稀有度筛选**：载荷里没有（见上一轮的实证），除非另开 Manifest 通道。

## 两条需要你拍的

**一、先做哪半。** 我推荐 P2 先做——perk 是这仓库页存在的理由，
而且 P3 的拖拽做得再顺，也解决不了"我看不出这把枪值不值得留"。
反过来先做 P3，你会得到一个能搬家具但没有抽屉的房子。

**二、写入要不要每次弹确认。** 三种口径：
- 拖拽即执行（DIM 手感，拖本身就是意图），只有**装备**弹一次（会顶掉身上那件）；
- 全部动作都先弹一次确认（安全，但拖十次要弹十次，很快就不想用了）；
- 拖拽即执行，但每次动作在角落留一条可点开的回执（做了什么、结果如何）。

我推荐第三种：手感不被打断，同时"我刚才拖的是哪件、成没成"有据可查。
