#!/bin/bash
#
# FreeMD — Debian postinst
#
# 说明：electron-builder 的默认 after-install 模板会用
#   if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then chmod 4755 ... else chmod 0755 ... fi
# 来判断是否需要 SUID sandbox helper。但 postinst 是 dpkg 以 root 身份执行的，
# `unshare --user true` 用 root 跑必然成功，于是永远走 chmod 0755 分支；
# 而 Ubuntu 23.10+/24.04、Debian 12 起默认用 AppArmor 限制「非特权」user namespace，
# 普通用户启动时仍然只能走 SUID sandbox helper，helper 权限不合法就会直接 FATAL：
#   The SUID sandbox helper binary was found, but is not configured correctly ...
#   You need to make sure that /opt/FreeMD/chrome-sandbox is owned by root and has mode 4755.
# 因此这里去掉条件判断，始终按 Chromium 的要求把 chrome-sandbox 设为 root:root 4755。

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Electron SUID sandbox helper：必须 root:root + 4755
if [ -f '/opt/${sanitizedProductName}/chrome-sandbox' ]; then
    chown root:root '/opt/${sanitizedProductName}/chrome-sandbox' || true
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

exit 0
