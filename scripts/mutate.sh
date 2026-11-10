#!/usr/bin/env bash
# 退化注入：确认测试能识别某个错误实现。
#
# 两道断言，缺一不可：
#   1) 目标代码里**确实**有要替换的那段（多行也算），否则这次注入什么都没测到；
#   2) 替换之后那段**确实**没了，否则说明替换没落到预期位置。
# 两步都过才跑测试。注入没生效时的测试结果没有证明力。
#
# 用法: scripts/mutate.sh <file> <expected-original> <replacement-or-empty> [tests]
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

FILE=${1:?file}
ORIGINAL=${2:?original text}
MUTANT=${3-}          # 空表示"删掉这段"
TESTS=${4:-tests}

exists() {
  python3 - "$FILE" "$ORIGINAL" <<'PY'
import sys
from pathlib import Path
sys.exit(0 if sys.argv[2] in Path(sys.argv[1]).read_text() else 1)
PY
}

if ! exists; then
  echo "ABORT: target text not found in $FILE" >&2
  echo "       注入没有生效，后面的测试结果没有证明力。" >&2
  exit 2
fi

cp "$FILE" "$FILE.mutate-backup"
trap 'mv "$FILE.mutate-backup" "$FILE"' EXIT

python3 - "$FILE" "$ORIGINAL" "$MUTANT" <<'PY'
import sys
from pathlib import Path
path, original, mutant = sys.argv[1], sys.argv[2], sys.argv[3]
Path(path).write_text(Path(path).read_text().replace(original, mutant, 1))
PY

if exists; then
  echo "ABORT: mutation did not take effect in $FILE" >&2
  exit 3
fi

echo "mutated: $FILE"
./node_modules/.bin/vitest run "$TESTS" > /tmp/mutate.log 2>&1
code=$?
grep -oE "Tests +[0-9]+ failed.*" /tmp/mutate.log | head -1
if [ "$code" -eq 0 ]; then
  echo "SURVIVED: 测试没有识别这个退化" >&2
  exit 1
fi
echo "KILLED"
