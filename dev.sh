#!/usr/bin/env bash
# 构建并热更到桌面 profile 里已安装的插件，不用重启 DSH。
#
# 原理：宿主 @deepseek-ai/dsh-client-hmr 每 500ms stat 一次插件的 client bundle，
# mtime/ctime/size 一变就走 SSE {type:'rebuilt'} → 浏览器 entries.reload() 重载该插件。
#
# 限制：只热更浏览器侧（lib/client.js）。宿主侧（lib/index.js，比如路由、工具）
# 改动仍然需要完全退出 DSH 再启动。
set -euo pipefail
cd "$(dirname "$0")"

PROFILE_ROOT="${DSH_PROFILE_HOME:-$HOME/.dsh/profiles/desktop}"
TARGET="$PROFILE_ROOT/node_modules/dsh-destiny-inventory"

if [ ! -d "$TARGET" ]; then
  echo "找不到已安装的插件目录：$TARGET" >&2
  echo "先装一次 tgz（或设置 DSH_PROFILE_HOME 指向实际 profile）" >&2
  exit 1
fi

./node_modules/.bin/tsdown >/dev/null
./node_modules/.bin/tsdown --config tsdown.client.config.mjs >/dev/null
node scripts/wrap-client.mjs >/dev/null

HOST_CHANGED=0
if ! cmp -s lib/index.js "$TARGET/lib/index.js"; then
  HOST_CHANGED=1
fi

cp lib/client.js "$TARGET/lib/client.js"
cp lib/index.js "$TARGET/lib/index.js"
touch "$TARGET/lib/client.js"

echo "client bundle → $TARGET/lib/client.js"
if [ "$HOST_CHANGED" = "1" ]; then
  echo "host bundle  → $TARGET/lib/index.js  (已更新)"
  echo ""
  echo "⚠ 宿主侧变了：热更不会重载它，必须完全退出 DSH 再打开。"
else
  echo "host bundle 未变；约 500ms 后浏览器自动重载，无需重启。"
fi
