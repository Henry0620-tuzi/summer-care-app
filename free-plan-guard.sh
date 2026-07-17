#!/bin/zsh
set -e
cd "$(dirname "$0")"

files=(
  index.html
  admin.html
  app.js
  admin.js
  daily-state.js
  supabase-config.js
  sw.js
  manifest.webmanifest
)

patterns=(
  'supabaseClient[[:space:]]*\.[[:space:]]*storage'
  'supabaseClient[[:space:]]*\.[[:space:]]*channel'
  'supabaseClient[[:space:]]*\.[[:space:]]*functions'
  'signInWithSSO'
  '/functions/v1/'
  'image[[:space:]_-]*transform'
)

for pattern in "${patterns[@]}"; do
  if rg -n --pcre2 "$pattern" "${files[@]}"; then
    echo ""
    echo "免费套餐护栏：检测到可能增加 Supabase 用量的功能。"
    echo "请先确认该功能能够在免费额度内长期运行，再修改 free-plan-guard.sh。"
    exit 1
  fi
done

if rg -n --pcre2 '(service[_-]?role|sb_secret_)' "${files[@]}"; then
  echo ""
  echo "安全护栏：前端文件中不能出现 Supabase Service Role 或 Secret Key。"
  exit 1
fi

echo "免费套餐护栏通过：仅使用 Supabase Auth、Database 和 RPC。"
