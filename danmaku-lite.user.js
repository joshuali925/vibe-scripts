// ==UserScript==
// @name         Danmaku Lite
// @namespace    video-keys
// @version      1.1.2
// @description  Lightweight danmaku overlay for any HTML5 video from a Bilibili-style XML file or link
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @inject-into  content
// @downloadURL  https://github.com/joshuali925/vibe-scripts/raw/main/danmaku-lite.user.js
// @updateURL    https://github.com/joshuali925/vibe-scripts/raw/main/danmaku-lite.user.js
// ==/UserScript==

;(() => {
  const SCROLL_SEC = 11.4
  const FIXED_SEC = 4
  const LOOKAHEAD_SEC = 0.5
  const LANE_GAP = 24
  const FONT_FAMILY = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif'
  const DEFAULTS = { show: true, opacity: 0.5, size: 24, speed: 1, density: 60, area: 100 }
  const SCROLL = 0
  const TOP = 1
  const BOTTOM = 2
  const MODES = { 1: SCROLL, 2: SCROLL, 3: SCROLL, 4: BOTTOM, 5: TOP }

  const SITE_RULES = [
    [/(^|\.)bilibili\.com$/, ".bpx-player-video-area"],
    [/^www\.acfun\.cn$/, ".player-container .player"],
    [/^www\.douyu\.com$/, "#js-player-video-case"],
    [/^www\.huya\.com$/, "#videoContainer"],
    [/^www\.twitch\.tv$/, ".player"],
  ]
  const GENERAL_RULE = ".html5-video-player, .dplayer, .video-js, .jwplayer, [data-player]"

  const isTop = window === window.top
  let settings = { ...DEFAULTS, ...GM_getValue("settings", {}) }

  let data = null
  let offset = 0
  let lastVideo = null
  let reportedVideo = false
  let childHasVideo = false

  let video = null
  let host = null
  let renderer = null
  let resizeObs = null
  let visibleObs = null
  let stalled = false
  let W = 0
  let H = 0
  let laneH = 0
  let speedPx = 0
  let cursor = 0
  let lanes = [[], [], []]

  let measureCtx = null
  let font = ""

  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }
  const decodeEntity = (m, e) => {
    if (e[0] !== "#") return ENTITIES[e] ?? m
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return code <= 0x10ffff ? String.fromCodePoint(code) : m
  }

  const parseXml = (text) => {
    const list = []
    for (const [, , attr, body] of text.matchAll(/<d\b[^>]*?\bp=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/d>/g)) {
      const p = attr.split(",")
      const time = Number(p[0])
      const mode = MODES[Number(p[1])]
      if (mode === undefined || !(time >= 0)) continue
      const raw = body.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
      const content = (raw === body ? raw.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, decodeEntity) : raw).replace(/[\r\n]+/g, " ").trim()
      if (!content) continue
      const rgb = Number(p.length > 3 && /^\d+$/.test(p[3]) ? p[3] : p[2])
      const color = Number.isInteger(rgb) ? "#" + (rgb & 0xffffff).toString(16).padStart(6, "0") : "#ffffff"
      list.push({ time, mode, color, text: content, w: 0, ws: 0 })
    }
    if (!list.length) return null
    return list.sort((a, b) => a.time - b.time)
  }

  const lowerBound = (list, t) => {
    let lo = 0
    let hi = list.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (list[mid].time < t) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  const createRenderer = (canvas) => {
    const g = canvas.getContext("2d")
    const items = new Set()
    let dpr = 1
    let raf = 0
    let playing = false
    let visible = true
    let rate = 1
    let anchorT = 0
    let anchorP = 0

    const now = () => (playing ? anchorT + ((performance.now() - anchorP) / 1000) * rate : anchorT)
    const draw = () => {
      g.clearRect(0, 0, canvas.width, canvas.height)
      const t = now()
      for (const it of items) {
        if (t < it.start || t >= it.end) continue
        const x = it.c.mode === SCROLL ? W - (t - it.start) * speedPx : (W - it.w) / 2
        g.drawImage(it.sprite, Math.round((x - 2) * dpr), Math.round(it.y * dpr))
      }
    }
    const frame = () => {
      raf = 0
      draw()
      if (playing && visible && items.size) raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame)
    }
    const sprite = (it) => {
      const s = new OffscreenCanvas(Math.ceil((it.w + 4) * dpr), Math.ceil(laneH * dpr))
      const sg = s.getContext("2d")
      sg.scale(dpr, dpr)
      sg.font = font
      sg.textBaseline = "middle"
      sg.lineJoin = "round"
      sg.lineWidth = 2
      sg.strokeStyle = "rgba(0,0,0,.75)"
      sg.strokeText(it.c.text, 2, laneH / 2)
      sg.fillStyle = it.c.color
      sg.fillText(it.c.text, 2, laneH / 2)
      return s
    }
    return {
      add(it) {
        it.sprite = sprite(it)
        items.add(it)
        kick()
      },
      sweep(t) {
        for (const it of items) if (it.end <= t) items.delete(it)
      },
      clear() {
        items.clear()
        kick()
      },
      count: () => items.size,
      resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2)
        const width = Math.round(W * dpr)
        const height = Math.round(H * dpr)
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
      },
      setVisible(next) {
        visible = next
        kick()
      },
      clock(t, nextPlaying, nextRate) {
        anchorT = t
        anchorP = performance.now()
        playing = nextPlaying
        rate = nextRate
        if (items.size) kick()
      },
    }
  }

  const mediaTime = () => video.currentTime - offset
  const ready = () => W > 0 && settings.show && !video.seeking

  const spawn = (c, t) => {
    if (renderer.count() >= settings.density) return
    if (c.ws !== settings.size) {
      c.w = measureCtx.measureText(c.text).width
      c.ws = settings.size
    }
    const w = c.w
    const scroll = c.mode === SCROLL
    const end = c.time + (scroll ? (W + w) / speedPx : FIXED_SEC)
    if (end <= t) return
    const modeLanes = lanes[c.mode]
    const lane = modeLanes.findIndex((free) => free <= c.time)
    if (lane < 0) return
    modeLanes[lane] = scroll ? c.time + (w + LANE_GAP) / speedPx : end
    renderer.add({ c, w, y: c.mode === BOTTOM ? H - (lane + 1) * laneH : lane * laneH, start: c.time, end })
  }

  const syncClock = () => renderer.clock(mediaTime(), !video.paused && !stalled, video.playbackRate)

  const tick = () => {
    if (!ready()) return
    const t = mediaTime()
    renderer.sweep(t)
    const list = data.list
    while (cursor < list.length && list[cursor].time <= t + LOOKAHEAD_SEC) spawn(list[cursor++], t)
  }

  const reset = () => {
    if (!renderer) return
    renderer.clear()
    for (const l of lanes) l.fill(-Infinity)
    if (!ready()) return
    const t = mediaTime()
    cursor = lowerBound(data.list, t - Math.max(FIXED_SEC, (2 * SCROLL_SEC) / settings.speed))
    syncClock()
    tick()
  }

  const relayout = () => {
    if (!renderer) return
    laneH = Math.round(settings.size * 1.3)
    const count = Math.max(1, Math.floor(H / laneH))
    lanes = lanes.map(() => new Array(count))
    speedPx = (W * settings.speed) / SCROLL_SEC
    font = `600 ${settings.size}px ${FONT_FAMILY}`
    if (!measureCtx) measureCtx = new OffscreenCanvas(1, 1).getContext("2d")
    measureCtx.font = font
    reset()
  }

  const applyStyle = () => {
    if (!host) return
    host.style.opacity = String(settings.opacity)
    host.style.height = `${settings.area}%`
    host.style.display = settings.show ? "" : "none"
  }

  const onSeeking = () => renderer.clear()
  const onWaiting = () => {
    stalled = true
    syncClock()
  }
  const onPlaying = () => {
    stalled = false
    syncClock()
    tick()
  }
  const onTimeupdate = () => {
    syncClock()
    tick()
  }
  const VIDEO_EVENTS = [
    ["timeupdate", onTimeupdate],
    ["seeking", onSeeking],
    ["seeked", reset],
    ["pause", syncClock],
    ["waiting", onWaiting],
    ["play", onTimeupdate],
    ["playing", onPlaying],
    ["ratechange", syncClock],
  ]

  const usable = (v) => v && v.isConnected && v.offsetWidth

  const findVideo = () => {
    if (usable(lastVideo)) return lastVideo
    let best = null
    let bestArea = 0
    for (const v of document.querySelectorAll("video")) {
      const r = v.getBoundingClientRect()
      const area = r.width * r.height
      if (area > bestArea) {
        best = v
        bestArea = area
      }
    }
    return best
  }

  const findContainer = (v) => {
    const hostname = location.hostname
    for (const [re, sel] of SITE_RULES) {
      if (re.test(hostname)) {
        const el = v.closest(sel)
        if (el) return el
        break
      }
    }
    const el = v.closest(GENERAL_RULE)
    if (el) return el
    let player = v
    let parent
    while ((parent = player.parentElement) && parent !== document.body) {
      if (Math.abs(v.offsetWidth - parent.offsetWidth) >= 15 || Math.abs(v.offsetHeight - parent.offsetHeight) >= 15) break
      player = parent
    }
    return player === v ? v.parentElement : player
  }

  const prepareContainer = (container) => {
    if (getComputedStyle(container).position === "static") container.style.position = "relative"
    return container
  }

  const detach = () => {
    if (!video) return
    for (const [type, fn] of VIDEO_EVENTS) video.removeEventListener(type, fn)
    resizeObs.disconnect()
    visibleObs.disconnect()
    renderer.clear()
    host.remove()
    video = null
    host = null
    renderer = null
    resizeObs = null
    visibleObs = null
    W = 0
    H = 0
  }

  const attach = (v) => {
    if (v === video) return
    detach()
    video = v
    stalled = false
    const container = prepareContainer(findContainer(v))
    host = document.createElement("canvas")
    host.style.cssText = "position:absolute;left:0;top:0;width:100%;margin:0;padding:0;border:0;pointer-events:none"
    renderer = createRenderer(host)
    let child = v
    while (child.parentElement && child.parentElement !== container) child = child.parentElement
    host.style.zIndex = getComputedStyle(child).zIndex
    container.insertBefore(host, child.nextSibling)
    applyStyle()
    resizeObs = new ResizeObserver(([entry]) => {
      W = entry.contentRect.width
      H = entry.contentRect.height
      renderer.resize()
      relayout()
    })
    resizeObs.observe(host)
    visibleObs = new IntersectionObserver(([entry]) => renderer.setVisible(entry.isIntersecting))
    visibleObs.observe(host)
    for (const [type, fn] of VIDEO_EVENTS) v.addEventListener(type, fn)
  }

  const reportVideo = (e) => {
    if (reportedVideo || isTop || !(e.target instanceof HTMLVideoElement)) return
    reportedVideo = true
    window.top.postMessage({ dl: "video" }, "*")
  }

  const onPlay = (e) => {
    const v = e.target
    if (!(v instanceof HTMLVideoElement)) return
    reportVideo(e)
    lastVideo = v
    if (data && v !== video && !usable(video)) {
      attach(v)
      renderPanel()
    }
  }

  const setData = (name, list) => {
    data = { name, list }
    offset = 0
    const v = findVideo()
    if (v === video) reset()
    else if (v) attach(v)
  }

  const pageKey = () => location.origin + location.pathname + location.search

  const saveLink = (url) => {
    if (url === link) return
    const links = GM_getValue("links", {})
    if (url) links[pageKey()] = url
    else delete links[pageKey()]
    GM_setValue("links", links)
    link = url
  }

  const linkName = (url) => {
    const last = new URL(url).pathname.split("/").pop()
    try {
      return decodeURIComponent(last) || url
    } catch {
      return last
    }
  }

  const fetchText = (url) =>
    new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        timeout: 30000,
        onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(`HTTP ${r.status}`)),
        onerror: () => reject("network error"),
        ontimeout: () => reject("timed out"),
      })
    })

  const loadFile = async (file) => {
    const list = file && parseXml(await file.text())
    panelError = list || !file ? "" : `Couldn't find danmaku in ${file.name}`
    if (list) {
      pendingUrl = ""
      saveLink("")
      setData(file.name, list)
    }
    renderPanel()
  }

  const loadUrl = async (url) => {
    pendingUrl = url
    panelError = ""
    renderPanel()
    const name = linkName(url)
    let list = null
    let error = ""
    try {
      list = parseXml(await fetchText(url))
      if (!list) error = `Couldn't find danmaku in ${name}`
    } catch (e) {
      error = `Couldn't load ${name}: ${e}`
    }
    if (pendingUrl !== url) return
    pendingUrl = ""
    panelError = error
    if (list) {
      saveLink(url)
      setData(name, list)
    }
    renderPanel()
  }

  const clearData = () => {
    data = null
    offset = 0
    pendingUrl = ""
    panelError = ""
    saveLink("")
    if (panel) panel.link.value = ""
    detach()
    renderPanel()
  }

  const saveSettings = () => GM_setValue("settings", settings)

  const setSetting = (key, value) => {
    settings = { ...settings, [key]: value }
    applyStyle()
    if (key === "size" || key === "speed") relayout()
    else if (key === "show" || key === "density") reset()
  }

  const PANEL_CSS = `
:host{all:initial}
*{box-sizing:border-box}
.card{position:absolute;top:12px;right:12px;width:280px;max-height:calc(100% - 24px);overflow:auto;pointer-events:auto;
  padding:14px 16px 16px;border-radius:12px;background:#1c1c21f2;color:#e8e8ec;box-shadow:0 10px 30px #0008;
  font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
h1{margin:0;font-size:15px;font-weight:650;letter-spacing:.2px}
button{font:inherit;color:inherit;cursor:pointer;border:0;border-radius:7px;background:#ffffff14;padding:5px 10px}
button:hover{background:#ffffff24}
button:focus-visible,.switch input:focus-visible+span,label.drop:focus-within{outline:2px solid #5aa9ff;outline-offset:1px}
.x{width:28px;height:28px;padding:0;font-size:18px;line-height:28px;background:none;color:#a8a8b3}
.x:hover{color:#fff}
.drop{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 10px;border:1.5px dashed #ffffff33;border-radius:10px;cursor:pointer;text-align:center;transition:border-color .15s,background .15s}
.drop:hover,.drop.over{border-color:#5aa9ff;background:#5aa9ff14}
.pick{font-weight:600;color:#7cbcff}
.hint{color:#8d8d99;font-size:12px}
.link{display:flex;gap:6px;margin-top:8px}
.link input{flex:1;min-width:0;font:inherit;color:inherit;padding:5px 8px;border:1px solid #ffffff26;border-radius:7px;background:#0000004d;outline:0;user-select:text}
.link input:focus{border-color:#5aa9ff}
.link input::placeholder{color:#8d8d99}
.status{margin:10px 2px 0;min-height:19px;color:#a8a8b3}
.status b{display:block;color:#e8e8ec;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.status.error{color:#ff8a80}
.row{display:flex;align-items:center;justify-content:space-between;margin-top:10px}
.switch{display:flex;align-items:center;gap:8px;cursor:pointer}
.drop input,.switch input{position:absolute;width:1px;height:1px;opacity:0}
.switch span{position:relative;width:34px;height:20px;border-radius:10px;background:#ffffff2e;transition:background .15s}
.switch span::after{content:"";position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .15s}
.switch input:checked+span{background:#3d8ef7}
.switch input:checked+span::after{transform:translateX(14px)}
button:disabled{opacity:.4;cursor:default;background:#ffffff14}
hr{border:0;border-top:1px solid #ffffff1a;margin:14px 0 6px}
.slider{display:grid;grid-template-columns:62px 1fr 44px;align-items:center;gap:8px;margin-top:8px}
.slider input{width:100%;margin:0;accent-color:#3d8ef7}
output{text-align:right;font-variant-numeric:tabular-nums;color:#c8c8d0}
.offset{display:flex;align-items:center;gap:4px;margin-top:12px}
.offset .label{width:62px;margin-right:4px}
.offset button{padding:5px 0;flex:1;font-variant-numeric:tabular-nums}
.offset .value{flex:1.6;background:none;font-weight:600}
.offset .value:hover{background:#ffffff14}
footer{display:flex;justify-content:flex-end;margin-top:14px}
footer button{background:none;color:#a8a8b3;padding:4px 6px}
footer button:hover{color:#fff;background:none;text-decoration:underline}
`
  const SLIDERS = [
    ["opacity", "Opacity", 0.1, 1, 0.05, (v) => `${Math.round(v * 100)}%`, "Danmaku opacity"],
    ["size", "Size", 12, 48, 1, (v) => `${v}px`, "Font size"],
    ["speed", "Speed", 0.5, 2, 0.1, (v) => `${v.toFixed(1)}×`, "Scroll speed"],
    ["density", "Density", 10, 300, 10, (v) => String(v), "Most comments on screen at once; lower is lighter on slow PCs"],
    ["area", "Area", 20, 100, 5, (v) => `${v}%`, "Share of the video height, from the top, that danmaku may use"],
  ]
  const LIVE_SLIDERS = new Set(["opacity", "area"])

  let panelHost = null
  let panel = null
  let panelError = ""
  let pendingUrl = ""
  let link = ""

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    el.append(...children)
    return el
  }

  const setOffset = (value) => {
    offset = value
    reset()
    renderPanel()
  }

  const buildPanel = () => {
    panelHost = h("div")
    panelHost.style.cssText = "inset:0;margin:0;padding:0;border:0;z-index:2147483647;pointer-events:none"
    const root = panelHost.attachShadow({ mode: "open" })
    const sliders = SLIDERS.map(([key, label, min, max, step, format, hint]) => ({
      key,
      format,
      label,
      hint,
      input: h("input", { type: "range", min, max, step }),
      output: h("output"),
    }))
    root.append(
      h("style", {}, PANEL_CSS),
      h(
        "div",
        { class: "card", role: "dialog", "aria-label": "Danmaku settings" },
        h("header", {}, h("h1", {}, "Danmaku"), h("button", { class: "x", title: "Close (Alt+D)", "aria-label": "Close" }, "×")),
        h(
          "label",
          { class: "drop" },
          h("input", { type: "file", accept: ".xml,text/xml" }),
          h("span", { class: "pick" }, "Choose XML file"),
          h("span", { class: "hint" }, "or drop it here"),
        ),
        h(
          "form",
          { class: "link" },
          h("input", { type: "url", required: "", placeholder: "or paste a direct XML link", "aria-label": "XML link" }),
          h("button", {}, "Load"),
        ),
        h("div", { class: "status", "aria-live": "polite" }),
        h(
          "div",
          { class: "row" },
          h("label", { class: "switch" }, h("input", { type: "checkbox", class: "show" }), h("span"), "Show danmaku"),
          h("button", { class: "clear" }, "Clear"),
        ),
        h("hr"),
        ...sliders.map(({ label, hint, input, output }) => h("label", { class: "slider", title: hint }, h("span", {}, label), input, output)),
        h(
          "div",
          { class: "offset" },
          h("span", { class: "label" }, "Offset"),
          h("button", { "data-d": "-1", title: "Danmaku 1s earlier" }, "−1"),
          h("button", { "data-d": "-0.1", title: "Danmaku 0.1s earlier" }, "−.1"),
          h("button", { class: "value", title: "Click to reset" }),
          h("button", { "data-d": "0.1", title: "Danmaku 0.1s later" }, "+.1"),
          h("button", { "data-d": "1", title: "Danmaku 1s later" }, "+1"),
        ),
        h("footer", {}, h("button", { class: "reset" }, "Reset styles")),
      ),
    )
    const $ = (sel) => root.querySelector(sel)
    panel = {
      status: $(".status"),
      show: $(".show"),
      clear: $(".clear"),
      offset: $(".value"),
      link: $(".link input"),
      sliders,
    }
    const file = $("input[type=file]")
    const drop = $(".drop")
    for (const type of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "keydown", "keyup", "wheel", "contextmenu"]) {
      panelHost.addEventListener(type, (e) => e.stopPropagation())
    }
    $(".x").addEventListener("click", closePanel)
    file.addEventListener("change", () => {
      loadFile(file.files[0])
      file.value = ""
    })
    drop.addEventListener("dragover", (e) => {
      e.preventDefault()
      drop.classList.add("over")
    })
    drop.addEventListener("dragleave", () => drop.classList.remove("over"))
    drop.addEventListener("drop", (e) => {
      e.preventDefault()
      drop.classList.remove("over")
      loadFile(e.dataTransfer.files[0])
    })
    $(".link").addEventListener("submit", (e) => {
      e.preventDefault()
      loadUrl(panel.link.value.trim())
    })
    panel.show.addEventListener("change", () => {
      setSetting("show", panel.show.checked)
      saveSettings()
    })
    panel.clear.addEventListener("click", clearData)
    for (const { key, format, input, output } of sliders) {
      input.addEventListener("input", () => {
        const value = Number(input.value)
        output.textContent = format(value)
        if (LIVE_SLIDERS.has(key)) setSetting(key, value)
      })
      input.addEventListener("change", () => {
        setSetting(key, Number(input.value))
        saveSettings()
      })
    }
    for (const btn of root.querySelectorAll("[data-d]")) {
      btn.addEventListener("click", () => setOffset(Math.round((offset + Number(btn.dataset.d)) * 10) / 10))
    }
    panel.offset.addEventListener("click", () => setOffset(0))
    $(".reset").addEventListener("click", () => {
      settings = { ...DEFAULTS }
      saveSettings()
      applyStyle()
      relayout()
      renderPanel()
    })
  }

  const renderPanel = () => {
    if (!isPanelOpen()) return
    const { status } = panel
    status.classList.toggle("error", !!panelError)
    status.title = ""
    if (pendingUrl) status.textContent = `Loading ${linkName(pendingUrl)}…`
    else if (panelError) status.textContent = panelError
    else if (!data) status.textContent = findVideo() ? "No file loaded" : "No video found on this page yet"
    else {
      status.textContent = ""
      status.append(h("b", {}, data.name), `${data.list.length.toLocaleString()} comments${video ? "" : " · waiting for video"}`)
      status.title = data.name
    }
    panel.show.checked = settings.show
    panel.clear.disabled = !data && !link && !pendingUrl
    panel.offset.textContent = `${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`
    for (const { key, format, input, output } of panel.sliders) {
      input.value = settings[key]
      output.textContent = format(settings[key])
    }
  }

  const onOutsidePointer = (e) => {
    if (!e.composedPath().includes(panelHost)) closePanel()
  }

  const openPanel = (v) => {
    if (!panelHost) buildPanel()
    if (v) {
      panelHost.style.position = "absolute"
      prepareContainer(findContainer(v)).appendChild(panelHost)
    } else {
      panelHost.style.position = "fixed"
      document.documentElement.appendChild(panelHost)
    }
    link = GM_getValue("links", {})[pageKey()] ?? ""
    if (link && !panel.link.value) panel.link.value = link
    if (link && !data && !pendingUrl) loadUrl(link)
    else renderPanel()
    document.addEventListener("pointerdown", onOutsidePointer, true)
  }

  const closePanel = () => {
    document.removeEventListener("pointerdown", onOutsidePointer, true)
    panelHost.remove()
  }

  const isPanelOpen = () => panelHost?.isConnected

  const togglePanel = () => {
    if (isPanelOpen()) {
      closePanel()
      return
    }
    const v = findVideo()
    if (v || (isTop && !childHasVideo)) openPanel(v)
    else for (const f of document.querySelectorAll("iframe")) f.contentWindow.postMessage({ dl: "toggle" }, "*")
  }

  const onKey = (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== "KeyD") return
    if (!isPanelOpen() && !childHasVideo && !findVideo()) return
    e.preventDefault()
    e.stopImmediatePropagation()
    togglePanel()
  }

  const onMessage = (e) => {
    const type = e.data && e.data.dl
    if (type === "toggle" && e.source === window.parent) togglePanel()
    else if (type === "video" && isTop) childHasVideo = true
  }

  document.addEventListener("play", onPlay, true)
  document.addEventListener("loadedmetadata", reportVideo, true)
  window.addEventListener("keydown", onKey, true)
  window.addEventListener("message", onMessage)
  if (isTop) GM_registerMenuCommand("Danmaku panel (Alt+D)", togglePanel)
})()
