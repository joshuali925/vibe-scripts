#!/bin/sh
set -e
cd "$(dirname "$0")"
[ -f clip.mp4 ] || ffmpeg -loglevel error -f lavfi -i testsrc=duration=30:size=640x360:rate=30 -c:v libx264 -pix_fmt yuv420p clip.mp4
{
  echo 'const GM_getValue=(k,d)=>{const v=localStorage.getItem("gm_"+k);return v===null?d:JSON.parse(v)};const GM_setValue=(k,v)=>localStorage.setItem("gm_"+k,JSON.stringify(v));'
  cat ../video-keys.user.js
} > vk-init.js
python3 serve.py 8765 >/dev/null 2>&1 &
server=$!
trap 'kill $server; rm -rf "$profile"' EXIT
profile=$(mktemp -d)
sleep 1
timeout 40 google-chrome --headless=new --disable-gpu --autoplay-policy=no-user-gesture-required \
  --window-size=1280,800 --enable-logging=stderr --v=0 --user-data-dir="$profile" \
  http://localhost:8765/run.html 2>&1 | grep -o 'VKT.*' | sed 's/", source.*//' || true
