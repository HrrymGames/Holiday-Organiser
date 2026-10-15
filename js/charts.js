// Small HTML/CSS charts for the results roundup. Every value is also written as
// text next to its mark, and every mark has a tap/hover tooltip (data-tip).

import { niceTicks, compact, fmt, fmtRange } from "./stats.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const pct = (v, min, max) => (max === min ? 0 : ((v - min) / (max - min)) * 100);

export function progress(done, total, label) {
  const p = total ? Math.round((done / total) * 100) : 0;
  return `<div class="progress" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label || "")}">
    <span style="width:${p}%"></span></div>`;
}

export function tiles(items) {
  return `<div class="tiles">${items
    .map((t) => `<div class="tile"><div class="tile-label">${esc(t.label)}</div>
      <div class="tile-value">${esc(t.value)}</div>${t.sub ? `<div class="tile-sub">${esc(t.sub)}</div>` : ""}</div>`)
    .join("")}</div>`;
}

/** One bar per person, from a zero baseline, value at the bar's tip. Optional average line. */
export function numberBars(q, rows, mean) {
  if (!rows.length) return "";
  const values = rows.map((r) => r.value);
  const { min, max } = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const zero = pct(0, min, max);
  const body = rows
    .map((r, i) => {
      const a = pct(Math.min(0, r.value), min, max);
      const b = pct(Math.max(0, r.value), min, max);
      const neg = r.value < 0;
      const tip = `${r.name}: ${fmt(q, r.value)}`;
      return `<div class="hb-label" style="grid-row:${i + 1}" title="${esc(r.name)}">${esc(r.name)}</div>
        <div class="hb-plot" style="grid-row:${i + 1}" data-tip="${esc(tip)}">
          <span class="hb-fill${neg ? " neg" : ""}" style="left:${a}%;width:max(${b - a}%,2px)"></span>
          <span class="hb-val" style="${neg ? `right:calc(${100 - a}% + 6px)` : `left:calc(${b}% + 6px)`}">${esc(fmt(q, r.value))}</span>
        </div>`;
    })
    .join("");
  const meanLine =
    mean === undefined
      ? ""
      : `<div class="hb-overlay" style="grid-row:1 / ${rows.length + 1}">
          ${min < 0 ? `<span class="hb-zero" style="left:${zero}%"></span>` : ""}
          <span class="hb-mean" style="left:${pct(mean, min, max)}%" data-tip="Average: ${esc(fmt(q, mean))}"></span>
        </div>`;
  return `<div class="hbars" style="grid-template-rows:repeat(${rows.length}, auto)">${meanLine}${body}</div>
    ${mean === undefined ? "" : `<div class="legend"><span class="key-mean"></span>Average ${esc(fmt(q, mean))}</div>`}`;
}

/** Floating bars on a shared axis, with the most-agreed stretch shaded behind them. */
export function rangeBars(q, rows, stats) {
  if (!rows.length) return "";
  // Zoom to what people actually said, not the question's full allowed range.
  const { min, max, ticks } = niceTicks(stats.minLow, stats.maxHigh, 4);
  const showBand = stats.sweet.count > 1;
  const band = showBand
    ? `<span class="rb-band" style="left:${pct(stats.sweet.low, min, max)}%;width:max(${pct(stats.sweet.high, min, max) - pct(stats.sweet.low, min, max)}%,3px)"
        data-tip="${esc(`${stats.sweet.count} of ${stats.count} people: ${fmtRange(q, stats.sweet.low, stats.sweet.high)}`)}"></span>`
    : "";
  const grid = ticks.map((t) => `<span class="rb-grid" style="left:${pct(t, min, max)}%"></span>`).join("");
  const body = rows
    .map((r, i) => {
      const a = pct(r.low, min, max), b = pct(r.high, min, max);
      const text = fmtRange(q, r.low, r.high);
      return `<div class="rb-label" style="grid-row:${i + 1}"><b title="${esc(r.name)}">${esc(r.name)}</b><small>${esc(text)}</small></div>
        <div class="rb-plot" style="grid-row:${i + 1}" data-tip="${esc(`${r.name}: ${text}`)}">
          <span class="rb-fill${a === b ? " point" : ""}" style="left:${a}%;width:${b - a}%"></span>
        </div>`;
    })
    .join("");
  const axis = ticks
    .map((t, i) => `<span style="left:${pct(t, min, max)}%" class="${i === 0 ? "first" : i === ticks.length - 1 ? "last" : ""}">${esc(compact(q, t))}</span>`)
    .join("");
  return `<div class="rbars" style="grid-template-rows:repeat(${rows.length}, auto) auto">
      <div class="rb-overlay" style="grid-row:1 / ${rows.length + 1}">${grid}${band}</div>
      ${body}
      <div class="rb-axis" style="grid-row:${rows.length + 1}">${axis}</div>
    </div>
    ${showBand ? `<div class="legend"><span class="key-band"></span>${stats.everyone ? "Works for everyone" : `Works for ${stats.sweet.count} of ${stats.count}`}</div>` : ""}`;
}

/** Option bars, most popular first, with who picked each one underneath. */
export function choiceBars(rows, total) {
  const max = Math.max(1, ...rows.map((r) => r.names.length));
  return `<div class="cbars">${rows
    .map((r) => {
      const n = r.names.length;
      const tip = `${r.label}: ${n} ${n === 1 ? "vote" : "votes"}${total ? ` (${Math.round((n / total) * 100)}%)` : ""}`;
      return `<div class="cb-row" data-tip="${esc(tip)}">
        <div class="cb-head"><span class="cb-label">${esc(r.label)}${r.other ? ` <em class="pill">write-in</em>` : ""}</span>
          <span class="cb-count">${n}</span></div>
        <div class="cb-track"><span class="cb-fill" style="width:${n ? Math.max((n / max) * 100, 2) : 0}%"></span></div>
        ${n ? `<div class="cb-names">${r.names.map(esc).join(", ")}</div>` : ""}
      </div>`;
    })
    .join("")}</div>`;
}

// ── Tooltip: hover on desktop, tap on iPhone ────────────────────────────────
const tip = document.createElement("div");
tip.className = "tooltip";
tip.setAttribute("role", "tooltip");
document.body.appendChild(tip);
let tipFor = null;

function showTip(el, x, y) {
  tipFor = el;
  tip.textContent = el.dataset.tip;
  tip.classList.add("show");
  const r = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8);
  const top = y - r.height - 14 < 8 ? y + 18 : y - r.height - 14;
  tip.style.transform = `translate(${left}px, ${top}px)`;
}
function hideTip() {
  tipFor = null;
  tip.classList.remove("show");
}
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const el = e.target.closest?.("[data-tip]");
  el ? showTip(el, e.clientX, e.clientY) : tipFor && hideTip();
});
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const el = e.target.closest?.("[data-tip]");
  el && el !== tipFor ? showTip(el, e.clientX, e.clientY) : hideTip();
});
window.addEventListener("scroll", hideTip, { passive: true });
