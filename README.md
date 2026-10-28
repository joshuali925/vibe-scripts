# Video Keys

A small userscript of keyboard shortcuts for HTML5 video. Each action shows a popup at the video's top-left corner that disappears after 1.5 s.

| Key | Action |
|---|---|
| `z` | Toggle between 1.0x and the last non-1.0 speed |
| `x` / `c` | Speed −0.1 / +0.1 (0.1–4) |
| `,` / `.` | Back / forward 5 s |
| `Alt+,` / `Alt+.` | Pause and step one frame (1/30 s) back / forward |
| `Esc` | Toggle maximize-in-window: YouTube gets its own fullscreen UI kept inside the window, bilibili uses its web-fullscreen button, other sites get the player container stretched over the page |

The speed is global: it's saved across sites and applied once when a video source first starts playing. If the site changes the rate later, the script leaves it alone. Seek, frame step, and maximize act on the last video that played.

## Install

Open `video-keys.user.js` in Tampermonkey or Violentmonkey and install it. The script must run in the page context (Tampermonkey's default, `@inject-into page` for Violentmonkey) so that YouTube sees its fullscreen hooks.

## Design rule

Performance comes first. The script only sets `video.playbackRate` and `currentTime`. It never wraps site listeners, polls, observes the DOM, or listens to mouse events. The only prototype patching is the fullscreen API, and only while YouTube's in-window fullscreen is being entered or is active. The only listeners are `play` (capture), `keydown` (capture), and `message`.

## Test

```sh
./test/run.sh
```

Needs `google-chrome`, `python3`, and `ffmpeg`. It serves `test/` with HTTP range support and runs `test/run.html` in headless Chrome. `test/index.html` is a fixture for manual checks with the installed script (serve with `python3 test/serve.py`).
