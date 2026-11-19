#!/bin/bash
#
# 把 deb 归档内的 chrome-sandbox 修正为 root:root + 4755。
#
# 为什么需要：postinst 已经会 chmod 4755，但在「依赖未满足、包停在 unconfigured
# 状态」或 `dpkg --unpack` 等场景下 postinst 不会执行，此时归档内的权限就是
# 最终权限。Electron 的 SUID sandbox helper 必须是 4755，否则启动直接 FATAL。
# 这个脚本让安装包本身自带正确权限，postinst 作为二次保险。
#
# 用法：scripts/fix-deb-sandbox.sh [path/to/*.deb]
# 不传参数时，取 release/ 目录下最新的 *-linux-x64.deb 或 *_amd64.deb。

set -euo pipefail

cd "$(dirname "$0")/.."

DEB="${1:-}"
if [ -z "$DEB" ]; then
  DEB=$(ls -t release/*-linux-x64.deb release/*_amd64.deb 2>/dev/null | head -n 1 || true)
fi

if [ -z "$DEB" ] || [ ! -f "$DEB" ]; then
  echo "未找到 deb 文件：${DEB:-<empty>}" >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "需要 root 权限重打包（保证归档内属主为 root:root），请用 sudo 运行本脚本。" >&2
  exit 1
fi

WORK=$(mktemp -d)
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "解包 $DEB"
dpkg-deb -R "$DEB" "$WORK/pkg"

SANDBOX="$WORK/pkg/opt/FreeMD/chrome-sandbox"
if [ ! -f "$SANDBOX" ]; then
  echo "归档内没有 opt/FreeMD/chrome-sandbox，跳过。" >&2
  exit 0
fi

# chown 会清掉 setuid 位，所以先 chown 再 chmod
chown root:root "$SANDBOX"
chmod 4755 "$SANDBOX"

echo "重新打包 $DEB"
# 显式用 xz：dpkg 从 1.21 起默认 zstd，老系统的 dpkg 不认 zstd 压缩的 deb
dpkg-deb -Zxz -z9 -b "$WORK/pkg" "$DEB" >/dev/null

echo "校验："
dpkg-deb -c "$DEB" | grep 'opt/FreeMD/chrome-sandbox'
