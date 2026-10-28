// ==UserScript==
// @name         HN Modern
// @namespace    video-keys
// @version      1.1.0
// @description  Readable, modern restyle of Hacker News story lists and discussions, light and dark
// @match        https://news.ycombinator.com/*
// @run-at       document-start
// @grant        none
// @inject-into  content
// @downloadURL  https://github.com/joshuali925/vibe-scripts/raw/main/hn-modern.user.js
// @updateURL    https://github.com/joshuali925/vibe-scripts/raw/main/hn-modern.user.js
// ==/UserScript==

;(() => {
  const INDENT_LEVELS = 64
  const REPLY_DEPTH = 2

  const indentRules = Array.from(
    { length: INDENT_LEVELS },
    (_, i) => `td.ind[indent="${i}"] img { width: calc(${i} * var(--hnm-step)); }`,
  ).join("\n")

  const CSS = `
:root:root {
  --hnm-ground: #fbfbfa;
  --hnm-surface: #f1f1ef;
  --hnm-rail: #e2e2de;
  --hnm-ink: #202124;
  --hnm-muted: #6e7175;
  --hnm-accent: #3d6b73;
  --hnm-on-accent: #ffffff;
  --hnm-step: 24px;
  --hnm-lane: 14px;
  --hnm-fs-title: 17px;
  --hnm-fs-body: 16px;
  --hnm-fs-meta: 14px;
  --hnm-fs-nav: 15px;
  --hnm-fs-head: 26px;
  --hnm-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --hnm-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: light dark;
  background: var(--hnm-ground);
  -webkit-text-size-adjust: 100%;

  @media (prefers-color-scheme: dark) {
    --hnm-ground: #18191b;
    --hnm-surface: #222326;
    --hnm-rail: #34363a;
    --hnm-ink: #e4e4e1;
    --hnm-muted: #9b9ea2;
    --hnm-accent: #8fb5bb;
    --hnm-on-accent: #18191b;
  }

  @media (max-width: 640px) {
    --hnm-step: 18px;
    --hnm-lane: 12px;
    --hnm-fs-head: 22px;
  }

  body {
    margin: 0;
    background: var(--hnm-ground);
    color: var(--hnm-ink);
    font: var(--hnm-fs-body)/1.6 var(--hnm-sans);
    -webkit-font-smoothing: antialiased;
  }
  body, td, .default, .title, .subtext, .comhead, .comment, .pagetop, .yclinks, .admin td, input, textarea {
    font-family: var(--hnm-sans);
    color: var(--hnm-ink);
  }
  td { font-size: var(--hnm-fs-body); line-height: 1.6; }
  ::selection { background: var(--hnm-accent); color: var(--hnm-on-accent); }
  :focus-visible { outline: 2px solid var(--hnm-accent); outline-offset: 2px; }

  a:link, a:visited { color: var(--hnm-ink); }
  a:hover { color: var(--hnm-accent); }

  #hnmain {
    width: 100%;
    min-width: 0;
    max-width: 760px;
    padding: 0 20px 48px;
    box-sizing: border-box;
    background: transparent;
  }
  @media (max-width: 640px) {
    #hnmain { padding: 0 12px 32px; }
  }

  #hnmain > tbody > tr:first-child > td {
    background: transparent;
    padding: 22px 0 18px;
  }
  #hnmain > tbody > tr:first-child > td > table { padding: 0 !important; }
  #hnmain > tbody > tr:first-child > td > table > tbody > tr > td { line-height: 1.4 !important; height: auto !important; vertical-align: middle; }
  #hnmain > tbody > tr:first-child > td > table > tbody > tr > td:first-child { width: 18px !important; padding-right: 12px !important; }
  #hnmain > tbody > tr:first-child > td > table > tbody > tr > td:first-child > a {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    background: var(--hnm-ink);
    color: var(--hnm-ground);
    font: 700 11px/1 var(--hnm-sans);
    text-decoration: none;
  }
  #hnmain > tbody > tr:first-child > td > table > tbody > tr > td:first-child > a::after { content: "Y"; }
  #hnmain > tbody > tr:first-child > td > table > tbody > tr > td:first-child img { display: none !important; }

  .pagetop { font-size: var(--hnm-fs-nav); line-height: 1.4; color: var(--hnm-muted); }
  .pagetop a:link, .pagetop a:visited { color: var(--hnm-muted); }
  .pagetop a:hover { color: var(--hnm-ink); }
  .pagetop:has(.hnname) {
    display: block;
    margin: 0;
    font-size: 0;
  }
  .pagetop:has(.hnname) > * { font-size: var(--hnm-fs-nav); margin-right: 14px; }
  .pagetop:has(.hnname) > .hnname { display: none; }
  .topsel a:link, .topsel a:visited { color: var(--hnm-ink); font-weight: 600; }
  @media (max-width: 750px) {
    .pagetop:has(.hnname) { max-width: calc(100vw - 120px); white-space: nowrap; overflow-x: auto; scrollbar-width: none; }
    span.pagetop { margin: 0; }
  }

  #hnmain > tbody > tr:nth-child(2) { height: 0 !important; }

  .votelinks { min-width: 18px; }
  .votelinks center { line-height: 0; }
  .votelinks center > a { display: inline-block; padding: 8px; margin: -8px; }
  .votearrow {
    width: 9px;
    height: 9px;
    margin: 0 6px 0 0;
    background: var(--hnm-muted);
    opacity: 0.55;
    clip-path: polygon(50% 5%, 100% 95%, 0 95%);
    transform: none;
    transition: opacity 120ms ease, background-color 120ms ease;
  }
  tr:hover > .votelinks .votearrow { opacity: 0.8; }
  .votelinks a:hover .votearrow { opacity: 1; background: var(--hnm-accent); }
  .votearrow.rotate180 { transform: rotate(180deg); }

  #bigbox > td > table { width: 100%; border-collapse: collapse; }
  tr.athing.submission > td { padding-top: 7px; }
  tr.athing.submission > td.votelinks { padding-top: 12px; }
  tr.athing.submission > td:first-child { padding-left: 10px; }
  tr.athing.submission + tr > td:last-child { padding-right: 10px; }
  tr.athing.submission:hover, tr.athing.submission:hover + tr, tr.athing.submission:has(+ tr:hover), tr.athing.submission:has(+ tr:hover) + tr {
    background: var(--hnm-surface);
  }
  table.fatitem tr.athing.submission:hover, table.fatitem tr.athing.submission:hover + tr, table.fatitem tr.athing.submission:has(+ tr:hover), table.fatitem tr.athing.submission:has(+ tr:hover) + tr {
    background: transparent;
  }
  .rank {
    display: inline-block;
    min-width: 2ch;
    margin-right: 8px;
    color: var(--hnm-muted);
    font-size: var(--hnm-fs-meta);
    font-variant-numeric: tabular-nums;
    line-height: 1.5;
    padding-top: 2px;
  }
  td.title { font-size: var(--hnm-fs-title); line-height: 1.4; }
  .titleline > a { font-size: var(--hnm-fs-title); font-weight: 550; letter-spacing: -0.006em; }
  .titleline > a:link { color: var(--hnm-ink); }
  .titleline > a:visited { color: var(--hnm-muted); }
  .titleline > a:hover { color: var(--hnm-accent); }
  .sitebit { font-size: 0; white-space: nowrap; }
  .sitebit a:link, .sitebit a:visited { font-size: var(--hnm-fs-meta); font-weight: 400; margin-left: 7px; color: var(--hnm-muted); }

  td.subtext { padding: 2px 0 8px; }
  .subtext, .subline { color: var(--hnm-muted); }
  td.subtext, .subline { font-size: 0; }
  td.subtext > :not(.subline), .subline > * { font-size: var(--hnm-fs-meta); margin-right: 11px; font-variant-numeric: tabular-nums; }
  td.subtext > :empty, .subline > :empty { display: none; }
  .subline [id^="unv_"] { font-size: 0; }
  .subline [id^="unv_"] a { font-size: var(--hnm-fs-meta); }
  .subtext a:link, .subtext a:visited { color: var(--hnm-muted); }
  .subtext a:hover { color: var(--hnm-ink); text-decoration: none; }
  .subline > a:last-child:link, .subline > a:last-child:visited { color: var(--hnm-accent); font-weight: 550; }

  tr.spacer { height: 0 !important; }
  tr.morespace { height: 0 !important; }

  a.morelink:link, a.morelink:visited {
    display: inline-block;
    margin: 18px 0 0;
    padding: 8px 18px;
    background: var(--hnm-surface);
    color: var(--hnm-ink);
    font-size: var(--hnm-fs-nav);
    font-weight: 550;
  }
  a.morelink:hover { background: var(--hnm-rail); }

  table.fatitem { width: 100%; margin-top: 6px; }
  table.fatitem .rank { display: none; }
  table.fatitem tr.athing.submission > td { padding-top: 0; padding-left: 0; }
  table.fatitem tr.athing.submission > td.votelinks { padding-top: 12px; }
  table.fatitem td.title, table.fatitem .titleline > a {
    font-size: var(--hnm-fs-head);
    font-weight: 650;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }
  table.fatitem .titleline > a:link { color: var(--hnm-ink); }
  table.fatitem .sitebit a:link, table.fatitem .sitebit a:visited { font-size: var(--hnm-fs-nav); }
  table.fatitem td.subtext { padding-top: 6px; }
  table.fatitem tr:has(> td > form[action="comment"]) { display: none; }
  table.fatitem tr:has(> td > .toptext:empty) { display: none; }
  table.fatitem + br { display: none; }
  .toptext { font-size: var(--hnm-fs-body); line-height: 1.6; color: var(--hnm-ink); max-width: 70ch; margin-top: 8px; }
  .toptext a:link, .toptext a:visited { text-decoration: underline; text-underline-offset: 2px; text-decoration-color: var(--hnm-rail); }

  textarea {
    box-sizing: border-box;
    width: 100%;
    max-width: 70ch;
    min-height: 9em;
    padding: 10px 12px;
    background: var(--hnm-surface);
    color: var(--hnm-ink);
    border: 1px solid var(--hnm-rail);
    border-radius: 6px;
    font: var(--hnm-fs-body)/1.5 var(--hnm-sans);
    vertical-align: top !important;
  }
  textarea:focus { outline: 2px solid var(--hnm-accent); outline-offset: -1px; }
  input[type="text"], input[type="password"], input[type="url"], input[type="number"], select {
    box-sizing: border-box;
    padding: 7px 10px;
    background: var(--hnm-surface);
    color: var(--hnm-ink);
    border: 1px solid var(--hnm-rail);
    border-radius: 6px;
    font: var(--hnm-fs-nav)/1.4 var(--hnm-sans);
  }
  input[type="submit"], button {
    margin-top: 4px;
    padding: 8px 18px;
    background: var(--hnm-accent);
    color: var(--hnm-on-accent);
    border: 0;
    border-radius: 6px;
    font: 600 var(--hnm-fs-nav)/1.2 var(--hnm-sans);
    cursor: pointer;
  }
  input[type="submit"]:hover, button:hover { filter: brightness(1.1); }
  form[action="comment"] > a[href="formatdoc"] font { color: var(--hnm-muted); font-size: var(--hnm-fs-meta); }

  table.comment-tree { width: 100%; margin-top: 24px; }
  table.comment-tree, table.comment-tree table { border-collapse: collapse; border-spacing: 0; }
  table.comment-tree tr.comtr > td { padding: 0; }
  table.comment-tree tr.comtr > td > table { width: 100%; }
  tr.comtr td.votelinks { display: none; }
  tr.comtr td.ind {
    padding: 0;
    cursor: pointer;
    background: repeating-linear-gradient(to right,
      transparent 0 calc(var(--hnm-lane) / 2 - 1px),
      var(--hnm-rail) 0 calc(var(--hnm-lane) / 2 + 1px),
      transparent 0 var(--hnm-step));
  }
  tr.comtr td.default {
    position: relative;
    width: 100%;
    padding: 4px 0;
  }
  tr.comtr:has(td.ind[indent="0"]):not(:first-child) > td { padding-top: 18px; }
  td.default > div:first-of-type { margin: 0 !important; padding-left: calc(var(--hnm-lane) + 6px); }
  td.default > br { display: none; }
  .hnm-gutter {
    position: absolute;
    top: 8px;
    bottom: 0;
    left: calc(var(--hnm-lane) / 2 - 6px);
    width: 12px;
    cursor: pointer;
  }
  .hnm-gutter::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 5px;
    width: 2px;
    background: var(--hnm-rail);
    transition: background-color 120ms ease;
  }
  .hnm-gutter:hover::before { background: var(--hnm-accent); }
  tr.coll .hnm-gutter {
    top: 7px;
    bottom: auto;
    left: calc(var(--hnm-lane) / 2 - 8px);
    width: 16px;
    height: 16px;
  }
  tr.coll .hnm-gutter::before {
    left: 0;
    width: 100%;
    border-radius: 50%;
    background:
      linear-gradient(var(--hnm-muted), var(--hnm-muted)) center / 8px 2px no-repeat,
      linear-gradient(var(--hnm-muted), var(--hnm-muted)) center / 2px 8px no-repeat,
      var(--hnm-rail);
  }
  tr.coll .hnm-gutter:hover::before {
    background:
      linear-gradient(var(--hnm-on-accent), var(--hnm-on-accent)) center / 8px 2px no-repeat,
      linear-gradient(var(--hnm-on-accent), var(--hnm-on-accent)) center / 2px 8px no-repeat,
      var(--hnm-accent);
  }

  tr.comtr.hnm-deep { display: none; }
  button.hnm-more {
    display: block;
    margin: 4px 0 0 var(--hnm-step);
    padding: 2px 0;
    background: none;
    color: var(--hnm-accent);
    font: 600 var(--hnm-fs-meta)/1.4 var(--hnm-sans);
  }
  button.hnm-more:hover { filter: none; text-decoration: underline; }

  .comhead { font-size: 0; color: var(--hnm-muted); line-height: 22px; }
  .comhead > * { font-size: var(--hnm-fs-meta); margin-right: 6px; }
  .comhead > :empty { display: none; }
  .comhead > .age::before { content: "·"; margin-right: 6px; }
  .comhead .navs { font-size: 0; margin-left: 4px; }
  .comhead .navs > * { font-size: var(--hnm-fs-meta); margin-right: 8px; }
  .comhead .navs > .onstory { font-size: var(--hnm-fs-meta); }
  .comhead .navs > :empty { display: none; }
  .comhead .navs > a.clicky:not(.togg) { opacity: 0; transition: opacity 120ms ease; }
  tr.comtr:hover .comhead .navs > a.clicky, .comhead .navs > a.clicky:focus-visible { opacity: 1; }
  @media (hover: none) {
    .comhead .navs > a.clicky:not(.togg) { display: none; }
  }
  .comhead a:link, .comhead a:visited { color: var(--hnm-muted); }
  .comhead a:hover { color: var(--hnm-ink); text-decoration: none; }
  .comhead a.hnuser:link, .comhead a.hnuser:visited { color: var(--hnm-ink); font-weight: 600; }
  .comhead a.hnuser.hnm-op:link, .comhead a.hnuser.hnm-op:visited { color: var(--hnm-accent); }
  .comhead a.togg { font-variant-numeric: tabular-nums; }
  tr.coll .comhead a.togg:link, tr.coll .comhead a.togg:visited { color: var(--hnm-accent); }
  .comhead [id^="unv_"] { font-size: 0; }
  .comhead [id^="unv_"] a { font-size: var(--hnm-fs-meta); }

  table.comment-tree .comment, .comment {
    max-width: none;
    margin-top: 0;
    padding-left: calc(var(--hnm-lane) + 6px);
    font-size: var(--hnm-fs-body);
    line-height: 1.6;
    overflow: visible;
  }
  .commtext { display: block; max-width: 70ch; }
  .commtext p { margin: 0.6em 0 0; }
  .comment a:link, .comment a:visited { text-decoration: underline; text-underline-offset: 2px; text-decoration-color: var(--hnm-rail); }
  .comment a:hover { text-decoration-color: currentColor; }
  .commtext.c00, .commtext.c00 a:link { color: var(--hnm-ink); }
  .c5a, .c5a a:link, .c5a a:visited, .c73, .c73 a:link, .c73 a:visited { color: var(--hnm-muted); }
  .c82, .c82 a:link, .c82 a:visited, .c88, .c88 a:link, .c88 a:visited, .c9c, .c9c a:link, .c9c a:visited { color: var(--hnm-muted); opacity: 0.8; }
  .cae, .cbe, .cce, .cdd { color: var(--hnm-muted); opacity: 0.6; }
  .cae a:link, .cbe a:link, .cce a:link, .cdd a:link { color: var(--hnm-muted); }

  pre {
    margin: 0.6em 0 0;
    padding: 10px 12px;
    background: var(--hnm-surface);
    border-radius: 6px;
    overflow: auto;
    white-space: pre-wrap;
  }
  pre, code { font-family: var(--hnm-mono); font-size: 14px; line-height: 1.5; }

  .reply { display: flex; align-items: center; gap: 10px; min-height: 24px; margin: 2px 0 0 -6px; }
  .reply p { margin: 0; }
  .hnm-votes { display: inline-flex; align-items: center; gap: 2px; }
  .hnm-votes a { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; }
  .hnm-votes a:hover { background: var(--hnm-surface); }
  .hnm-votes .votearrow { width: 10px; height: 10px; margin: 0; opacity: 0.7; }
  .hnm-votes .nosee { display: none; }
  .reply font { font-size: var(--hnm-fs-meta); }
  .reply u { text-decoration: none; }
  .reply font a:link, .reply font a:visited { color: var(--hnm-muted); font-weight: 600; text-decoration: none; text-transform: capitalize; }
  .reply a:hover { color: var(--hnm-ink); }

  #hnmain > tbody > tr:last-child td[bgcolor] { background: transparent; }
  #hnmain > tbody > tr:last-child > td > table { margin-top: 40px; height: 0; }
  #hnmain > tbody > tr:last-child center { color: var(--hnm-muted); font-size: var(--hnm-fs-meta); }
  #hnmain > tbody > tr:last-child center a:link, #hnmain > tbody > tr:last-child center a:visited { color: var(--hnm-muted); }
  .yclinks { font-size: var(--hnm-fs-meta); color: var(--hnm-muted); line-height: 2; }
  .yclinks a:link, .yclinks a:visited { color: var(--hnm-muted); }
  .yclinks a:hover { color: var(--hnm-ink); }
  form[action="//hn.algolia.com/"] { color: var(--hnm-muted); font-size: var(--hnm-fs-meta); }
  form[action="//hn.algolia.com/"] input { margin-left: 6px; width: 16em; }

  @media (max-width: 640px) {
    tr.athing.submission > td:first-child { padding-left: 4px; }
  }

  ${indentRules}
}
`

  const style = document.createElement("style")
  style.textContent = CSS
  document.documentElement.append(style)

  const decorate = () => {
    const op = document.querySelector("table.fatitem .hnuser")?.textContent
    for (const row of document.querySelectorAll("tr.comtr")) {
      const cell = row.querySelector("td.default")
      if (!cell) continue
      const gutter = document.createElement("span")
      gutter.className = "hnm-gutter"
      gutter.setAttribute("aria-hidden", "true")
      cell.prepend(gutter)
      const user = cell.querySelector(".comhead .hnuser")
      if (op && user?.textContent === op) user.classList.add("hnm-op")
      const arrows = row.querySelectorAll("td.votelinks a[id]")
      if (arrows.length) {
        const votes = document.createElement("span")
        votes.className = "hnm-votes"
        votes.append(...arrows)
        const target = cell.querySelector(".reply") ?? cell.querySelector(".comment")
        target?.prepend(votes)
      }
    }
  }

  const indentOf = (row) => Number(row.querySelector("td.ind")?.getAttribute("indent"))

  const ancestorAt = (row, level) => {
    while ((row = row.previousElementSibling)) {
      if (row.classList.contains("comtr") && indentOf(row) === level) return row
    }
  }

  const hideDeep = () => {
    const target = document.getElementById(location.hash.slice(1))
    let parent = null
    let deep = []
    const addMore = () => {
      if (!parent || !deep.length || deep.includes(target)) return
      const rows = deep
      for (const row of rows) row.classList.add("hnm-deep")
      const more = document.createElement("button")
      more.type = "button"
      more.className = "hnm-more"
      more.textContent = `${rows.length} more ${rows.length === 1 ? "reply" : "replies"}`
      more.addEventListener("click", () => {
        for (const row of rows) row.classList.remove("hnm-deep")
        more.remove()
      })
      parent.querySelector(".comment")?.append(more)
    }
    for (const row of document.querySelectorAll("tr.comtr")) {
      const ind = indentOf(row)
      if (ind >= REPLY_DEPTH) {
        deep.push(row)
        continue
      }
      addMore()
      parent = ind === REPLY_DEPTH - 1 ? row : null
      deep = []
    }
    addMore()
  }

  const collapse = (row) => {
    row?.querySelector("a.togg")?.click()
    if (row && row.getBoundingClientRect().top < 0) row.scrollIntoView({ block: "start" })
  }

  document.addEventListener("click", (e) => {
    const gutter = e.target.closest?.(".hnm-gutter")
    if (gutter) {
      collapse(gutter.closest("tr.comtr"))
      return
    }
    const ind = e.target.closest?.("tr.comtr td.ind")
    if (!ind) return
    const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hnm-step"))
    const level = Math.floor((e.clientX - ind.getBoundingClientRect().left) / step)
    const row = ind.closest("tr.comtr")
    if (level < indentOf(row)) collapse(ancestorAt(row, level))
  })

  const init = () => {
    decorate()
    hideDeep()
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true })
  else init()
})()
