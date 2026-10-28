// ==UserScript==
// @name         Video Keys
// @namespace    video-keys
// @version      1.0.0
// @description  Lightweight keyboard shortcuts for HTML5 video: speed, seek, frame step, maximize in window
// @match        *://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @inject-into  page
// ==/UserScript==

;(() => {
  const MIN_SPEED = 0.1
  const MAX_SPEED = 4
  const SEEK_STEP = 5
  const FRAME_STEP = 1 / 30
  const POPUP_MS = 1500

  const SITE_RULES = [
    [/^www\.acfun\.cn$/, ".player-container .player"],
    [/^www\.douyu\.com$/, "#js-player-video-case"],
    [/^www\.huya\.com$/, "#videoContainer"],
    [/^v\.huya\.com$/, "#video_embed_flash>div"],
    [/^www\.twitch\.tv$/, ".player"],
    [/^www\.yy\.com$/, "#player"],
    [/(^|\.)weibo\.com$/, '[aria-label="Video Player"], .html5-video-live .html5-video'],
  ]
  const GENERAL_RULE = ".html5-video-player, .dplayer, .video-js, .jwplayer, [data-player]"
  const BILIBILI_WEB_FULLSCREEN =
    ".bpx-player-ctrl-web-enter, .bpx-player-ctrl-web-leave, .bilibili-player-iconfont-web-fullscreen-off, .bilibili-player-iconfont-web-fullscreen-on, .squirtle-video-pagefullscreen"

  const FULLSCREEN_ELEMENT_PROPS = ["fullscreenElement", "webkitFullscreenElement", "webkitCurrentFullScreenElement", "mozFullScreenElement"]
  const FULLSCREEN_FLAG_PROPS = ["fullscreen", "webkitIsFullScreen", "mozFullScreen"]
  const REQUEST_FULLSCREEN = ["requestFullscreen", "webkitRequestFullscreen", "mozRequestFullScreen"]
  const EXIT_FULLSCREEN = ["exitFullscreen", "webkitExitFullscreen", "webkitCancelFullScreen", "mozCancelFullScreen"]
  const FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange"]

  const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow
  const isTop = window === window.top
  const appliedSrc = new WeakMap()
  let lastVideo = null
  let full = null
  let popup = null
  let popupTimer = 0

  const getSpeed = () => GM_getValue("speed", 1)

  const onPlay = (e) => {
    const v = e.target
    if (!(v instanceof HTMLVideoElement)) return
    lastVideo = v
    if (appliedSrc.get(v) === v.currentSrc) return
    appliedSrc.set(v, v.currentSrc)
    v.playbackRate = getSpeed()
  }

  const findVideo = () => {
    if (lastVideo && lastVideo.isConnected) return lastVideo
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

  const showPopup = (video, text) => {
    if (!popup) {
      popup = document.createElement("div")
      popup.style.cssText =
        "position:fixed;pointer-events:none;z-index:2147483647;" +
        "padding:12px 22px;border-radius:8px;background:rgba(0,0,0,.6);color:#fff;" +
        "font:600 24px/1.2 system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity .15s;"
    }
    const host = document.fullscreenElement || document.documentElement
    if (popup.parentNode !== host) host.appendChild(popup)
    const r = video.getBoundingClientRect()
    const x = Math.min(Math.max(r.left, 0), window.innerWidth) + 16
    const y = Math.min(Math.max(r.top, 0), window.innerHeight) + 16
    popup.style.left = x + "px"
    popup.style.top = y + "px"
    popup.textContent = text
    popup.style.opacity = "1"
    clearTimeout(popupTimer)
    popupTimer = setTimeout(() => (popup.style.opacity = "0"), POPUP_MS)
  }

  const setSpeed = (video, speed) => {
    speed = Math.round(Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED) * 10) / 10
    GM_setValue("speed", speed)
    for (const v of document.querySelectorAll("video")) v.playbackRate = speed
    showPopup(video, speed.toFixed(1) + "x")
  }

  const toggleSpeed = (video) => {
    const speed = getSpeed()
    if (speed !== 1) {
      GM_setValue("prevSpeed", speed)
      setSpeed(video, 1)
    } else {
      setSpeed(video, GM_getValue("prevSpeed", 1))
    }
  }

  const seek = (video, delta) => {
    video.currentTime = Math.min(Math.max(video.currentTime + delta, 0), video.duration || Infinity)
    showPopup(video, (delta > 0 ? "+" : "") + delta + "s")
  }

  const stepFrame = (video, dir) => {
    video.pause()
    video.currentTime = Math.max(video.currentTime + dir * FRAME_STEP, 0)
    showPopup(video, dir > 0 ? "frame ▶" : "◀ frame")
  }

  let styleInjected = false
  const injectStyle = () => {
    if (styleInjected) return
    styleInjected = true
    const p = "html.vk-full:not(#vk_):not(#vk_)"
    const style = document.createElement("style")
    style.textContent = `
${p}, ${p} body {overflow:hidden !important;zoom:100% !important;}
${p} .vk-parent {overflow:visible !important;z-index:auto !important;transform:none !important;-webkit-transform-style:flat !important;transition:none !important;contain:none !important;}
${p} .vk-abs {position:absolute !important;}
${p} .vk-player {position:fixed !important;top:0 !important;left:0 !important;width:100vw !important;height:100vh !important;max-width:none !important;max-height:none !important;min-width:0 !important;min-height:0 !important;margin:0 !important;padding:0 !important;z-index:2147483646 !important;border:none !important;background-color:#000 !important;transform:none !important;}
${p} .vk-parent video, ${p} video.vk-player {object-fit:contain !important;}
`
    document.head.appendChild(style)
  }

  const findContainer = (video) => {
    const host = location.hostname
    for (const [re, sel] of SITE_RULES) {
      if (re.test(host)) {
        const el = video.closest(sel)
        if (el) return el
        break
      }
    }
    const el = video.closest(GENERAL_RULE)
    if (el) return el
    let player = video
    let parent
    while ((parent = player.parentElement) && parent !== document.body) {
      if (Math.abs(video.offsetWidth - parent.offsetWidth) >= 15 || Math.abs(video.offsetHeight - parent.offsetHeight) >= 15) break
      player = parent
    }
    return player
  }

  const enter = (container, childWin) => {
    injectStyle()
    const parents = []
    for (let el = container.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      parents.push(el)
    }
    for (const el of parents) {
      el.classList.add("vk-parent")
      if (getComputedStyle(el).position === "fixed") el.classList.add("vk-abs")
    }
    container.classList.add("vk-player")
    full = { container, parents, childWin, controls: null, fake: null }
    if (container instanceof HTMLVideoElement) {
      full.controls = container.controls
      container.controls = true
    }
    document.documentElement.classList.add("vk-full")
    window.dispatchEvent(new Event("resize"))
    if (!isTop) window.parent.postMessage({ vk: "full" }, "*")
  }

  const swapMethods = (proto, names, fn) => {
    const saved = []
    for (const name of names) {
      if (typeof proto[name] !== "function") continue
      saved.push([name, proto[name]])
      proto[name] = fn
    }
    return () => {
      for (const [name, original] of saved) proto[name] = original
    }
  }

  const sendFullscreenChange = () => {
    for (const type of FULLSCREEN_EVENTS) page.document.dispatchEvent(new page.Event(type, { bubbles: true }))
  }

  const enterFakeFullscreen = (element) => {
    enter(element)
    const doc = page.document
    const overrides = []
    const override = (obj, prop, value) => {
      if (!(prop in obj)) return
      Object.defineProperty(obj, prop, { configurable: true, get: () => value })
      overrides.push([obj, prop])
    }
    for (const prop of FULLSCREEN_ELEMENT_PROPS) override(doc, prop, element)
    for (const prop of FULLSCREEN_FLAG_PROPS) override(doc, prop, true)
    // YouTube sizes its fullscreen player from the screen dimensions.
    override(page.screen, "width", Math.max(page.outerWidth, page.innerWidth))
    override(page.screen, "height", Math.max(page.outerHeight, page.innerHeight))
    const restoreExit = swapMethods(page.Document.prototype, EXIT_FULLSCREEN, function () {
      if (full) exit("self")
      return page.Promise.resolve()
    })
    full.fake = { overrides, restoreExit }
    element.focus()
    sendFullscreenChange()
  }

  const requestFakeFullscreen = (button, fallback) => {
    let timer = 0
    const restoreRequest = swapMethods(page.Element.prototype, REQUEST_FULLSCREEN, function () {
      restoreRequest()
      clearTimeout(timer)
      if (!full) enterFakeFullscreen(this)
      return page.Promise.resolve()
    })
    timer = setTimeout(() => {
      restoreRequest()
      fallback()
    }, 1000)
    button.click()
  }

  const exit = (from) => {
    const { container, parents, childWin, controls, fake } = full
    full = null
    if (fake) {
      for (const [obj, prop] of fake.overrides) delete obj[prop]
      fake.restoreExit()
    }
    document.documentElement.classList.remove("vk-full")
    container.classList.remove("vk-player")
    for (const el of parents) el.classList.remove("vk-parent", "vk-abs")
    if (controls !== null) container.controls = controls
    if (fake) sendFullscreenChange()
    window.dispatchEvent(new Event("resize"))
    if (from !== "parent" && !isTop) window.parent.postMessage({ vk: "small" }, "*")
    if (from !== "child" && childWin) childWin.postMessage({ vk: "small" }, "*")
  }

  const maximize = (video) => {
    if (location.hostname === "www.bilibili.com") {
      const btn = document.querySelector(BILIBILI_WEB_FULLSCREEN)
      if (btn) {
        btn.click()
        return
      }
    }
    const fallback = () => !full && video.isConnected && enter(findContainer(video))
    const youtubeButton = video.closest(".html5-video-player")?.querySelector(".ytp-fullscreen-button")
    if (youtubeButton) requestFakeFullscreen(youtubeButton, fallback)
    else fallback()
  }

  const onMessage = (e) => {
    const type = e.data && e.data.vk
    if (type === "full") {
      if (full) return
      for (const f of document.querySelectorAll("iframe")) {
        if (f.contentWindow === e.source) {
          enter(f, e.source)
          return
        }
      }
    } else if (type === "small" && full) {
      if (e.source === full.childWin) exit("child")
      else if (e.source === window.parent && !isTop) exit("parent")
    }
  }

  const isEditable = (el) =>
    el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing || isEditable(e.target)) return
    const key = e.key
    let action
    if (e.altKey) {
      if (e.code === "Comma") action = (v) => stepFrame(v, -1)
      else if (e.code === "Period") action = (v) => stepFrame(v, 1)
    } else if (key === "z") action = toggleSpeed
    else if (key === "x") action = (v) => setSpeed(v, getSpeed() - 0.1)
    else if (key === "c") action = (v) => setSpeed(v, getSpeed() + 0.1)
    else if (key === ",") action = (v) => seek(v, -SEEK_STEP)
    else if (key === ".") action = (v) => seek(v, SEEK_STEP)
    else if (key === "Escape") {
      if (full) {
        e.preventDefault()
        e.stopImmediatePropagation()
        exit("self")
        return
      }
      if (document.fullscreenElement) return
      action = maximize
    }
    if (!action) return
    const video = findVideo()
    if (!video) return
    e.preventDefault()
    e.stopImmediatePropagation()
    action(video)
  }

  document.addEventListener("play", onPlay, true)
  window.addEventListener("keydown", onKey, true)
  window.addEventListener("message", onMessage)
})()
