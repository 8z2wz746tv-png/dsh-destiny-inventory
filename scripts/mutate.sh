#!/usr/bin/env bash
# 退化注入：确认测试能识别某个错误实现。
#
# 两次断言，缺一不可：
#   1) 目标代码**确实**被改成了预期内容（没改成的注入，测试结果没有证明力）；
#   2) 恢复后工作树必须和注入前一致（注入脚本自己不许留手尾）。
#
# 用法: scripts/mutate.sh <file> <expected-original> <wrong-version> [test-file]
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

FILE=${1:?file}
ORIGINAL=${2:?original text}
MUTANT=${3:?mutant text}
TESTS=${4:-tests}

# 前置断言：原文必须存在，否则说明代码已经变了，这次注入什么都没测到。
if ! grep -Fq "$ORIGINAL" "$FILE"; then
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
text = Path(path).read_text()
Path(path).write_text(text.replace(original, mutant, 1))
PY

# 后置断言：文件真的变了。grep 原文还在就说明替换没落到预期位置。
if grep -Fq "$ORIGINAL" "$FILE"; then
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
