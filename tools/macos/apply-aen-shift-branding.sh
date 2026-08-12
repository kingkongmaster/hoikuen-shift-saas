#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
repo_root=${script_dir:h:h}
source_png="$repo_root/apps/web/public/icons/AeN-Shift-icon.png"
generated_icns="$script_dir/AeN Shift.icns"
launcher_app=${AEN_SHIFT_LAUNCHER_APP:-"$HOME/Applications/AeN Shift.app"}
web_app=${AEN_SHIFT_WEB_APP:-"$HOME/Library/Application Support/AeN Shift/Internal/AeN Shift Web.app"}

if [[ ! -f "$source_png" ]]; then
  print -u2 "正式アイコン原本が見つかりません: $source_png"
  exit 1
fi

work_dir=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/aen-shift-branding.XXXXXX")
trap '/bin/rm -rf "$work_dir"' EXIT
iconset="$work_dir/AeN Shift.iconset"
/bin/mkdir -p "$iconset"

typeset -a specs=(
  "16 icon_16x16.png"
  "32 icon_16x16@2x.png"
  "32 icon_32x32.png"
  "64 icon_32x32@2x.png"
  "128 icon_128x128.png"
  "256 icon_128x128@2x.png"
  "256 icon_256x256.png"
  "512 icon_256x256@2x.png"
  "512 icon_512x512.png"
  "1024 icon_512x512@2x.png"
)

for spec in "${specs[@]}"; do
  size=${spec%% *}
  name=${spec#* }
  /usr/bin/sips -z "$size" "$size" "$source_png" --out "$iconset/$name" >/dev/null
done

/usr/bin/iconutil -c icns "$iconset" -o "$generated_icns"

apply_bundle_branding() {
  local app=$1
  local icon_name=$2
  local plist="$app/Contents/Info.plist"
  local icon_path="$app/Contents/Resources/$icon_name"

  if [[ ! -d "$app" || ! -f "$plist" ]]; then
    print -u2 "アプリが見つかりません: $app"
    exit 1
  fi

  /bin/cp "$generated_icns" "$icon_path"
  /usr/libexec/PlistBuddy -c "Set :CFBundleName AeN Shift" "$plist"
  /usr/libexec/PlistBuddy -c "Delete :CFBundleDisplayName" "$plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string AeN Shift" "$plist"
}

apply_bundle_branding "$launcher_app" "applet.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile applet.icns" "$launcher_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$launcher_app/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier jp.aen.shift.launcher" "$launcher_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 0.1.0" "$launcher_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion 20260812.1" "$launcher_app/Contents/Info.plist"

/usr/bin/codesign --force --deep --sign - "$launcher_app"

if [[ -d "$web_app" ]]; then
  web_name=$(/usr/libexec/PlistBuddy -c "Print :CrAppModeShortcutName" "$web_app/Contents/Info.plist" 2>/dev/null || true)
  if [[ "$web_name" != "AeN Shift" ]]; then
    print -u2 "内部Chrome WebアプリはChromeの『アプリの更新を確認』でManifestを再取得してください。"
  fi
fi

print "AeN Shift branding applied."
print "ICNS: $generated_icns"
