# P0 探针（tools 瀑布）

验证 `tools/pre-execute` / `tools/post-execute` 的触发、会话标识与 await 安全性。
只写日志，不改行为。

## 实测结论（2026-11-04，headless profile）

| 项 | 结果 |
|---|---|
| pre / post 成对 | ✅ 正常返回与业务失败（exit 1）都触发 post |
| 会话标识 | ✅ `exec.agent.session.id` 稳定，同一会话两次调用相同 |
| pre 里 await | ✅ 挂 3 秒，工具照常执行，无超时/取消 |
| 参数可读 | ✅ `exec.arguments` 完整（可判写 intent） |
| 关联 ID | ✅ `callId` / `rootCallId` 都在 |
| 工具级异常 | ⚠️ 未测（headless 无 MCP）；锁设计已用租约兜底，不依赖 post |

## 跑法

```sh
# 装进某个 profile（示例用 headless）
cd ~/.dsh/profiles/headless
pnpm add "file:$HOME/项目/dsh-destiny-inventory/probe"
# cordis.patch.yml 末尾追加：
#   - insert:
#       - id: dsh-probe-tools
#         name: dsh-probe-tools

export DEEPSEEK_API_KEY=...        # headless 不会自动注入凭据服务里的 key
DSH_PROBE_LOG=/tmp/dsh-probe-tools.log DSH_PROBE_HOLD_MS=3000 \
  dsh headless "用 bash 执行 echo probe-check 并原样告诉我输出"
cat /tmp/dsh-probe-tools.log
```

`DSH_PROBE_HOLD_MS` 用来在 pre 里挂住指定毫秒，验"等锁会不会被取消"。
