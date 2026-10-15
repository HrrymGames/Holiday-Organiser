// Pure number-crunching for the results roundup. No DOM in here.

export const TYPES = {
  text: { label: "Word", icon: "Aa", blurb: "Free-text answer" },
  number: { label: "Number", icon: "#", blurb: "A single number" },
  range: { label: "Range", icon: "↔", blurb: "A from–to range" },
  choice: { label: "Choice", icon: "☰", blurb: "Pick from options" },
};

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** Format a number with the question's prefix/suffix, e.g. "£1,200" or "7 nights". */
export function fmt(q, n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const pre = q.prefix || "";
  const suf = q.suffix ? (/^[%°]/.test(q.suffix) ? q.suffix : " " + q.suffix) : "";
  return `${pre}${nf.format(n)}${suf}`;
}

export function fmtRange(q, low, high) {
  if (low === high) return fmt(q, low);
  return `${fmt(q, low)} – ${fmt(q, high)}`;
}

/** Turn a stored answer into a short human string. */
export function describe(q, value) {
  if (value === undefined || value === null) return "";
  switch (q.type) {
    case "number": return fmt(q, value);
    case "range": return fmtRange(q, value.low, value.high);
    case "choice": return value.join(", ");
    default: return String(value);
  }
}

/** Members (in join order) split into who has / hasn't answered a question. */
export function answeredSplit(q, members) {
  const done = [], waiting = [];
  for (const m of members) (q.responses?.[m.key] ? done : waiting).push(m);
  return { done, waiting };
}

/** Members of a group as a sorted array of { key, name, joinedAt }. */
export function memberList(group) {
  return Object.entries(group?.members || {})
    .map(([key, m]) => ({ key, ...m }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

export function numberStats(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return {
    count: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    min: s[0],
    max: s[s.length - 1],
  };
}

/**
 * Ranges → averages plus the "sweet spot": the stretch of values covered by the
 * most people. If that's everyone, it's the range the whole group agrees on.
 */
export function rangeStats(ranges) {
  if (!ranges.length) return null;
  const pts = [...new Set(ranges.flatMap((r) => [r.low, r.high]))].sort((a, b) => a - b);
  const covers = (lo, hi) => ranges.filter((r) => r.low <= lo && r.high >= hi).length;

  // Walk the number line as alternating points and open gaps between them.
  const pieces = [];
  pts.forEach((p, i) => {
    pieces.push({ low: p, high: p, n: covers(p, p) });
    if (i < pts.length - 1) pieces.push({ low: p, high: pts[i + 1], n: covers(p, pts[i + 1]) });
  });
  const best = Math.max(...pieces.map((p) => p.n));
  let sweet = null;
  for (const p of pieces) {
    if (p.n === best) {
      if (!sweet) sweet = { low: p.low, high: p.high };
      else sweet.high = p.high;
    } else if (sweet) break;
  }
  return {
    count: ranges.length,
    avgLow: ranges.reduce((a, r) => a + r.low, 0) / ranges.length,
    avgHigh: ranges.reduce((a, r) => a + r.high, 0) / ranges.length,
    minLow: Math.min(...ranges.map((r) => r.low)),
    maxHigh: Math.max(...ranges.map((r) => r.high)),
    sweet: { ...sweet, count: best },
    everyone: best === ranges.length,
  };
}

/** Options with who picked them, most popular first. Write-in answers are grouped. */
export function choiceStats(q, entries) {
  const rows = new Map();
  for (const opt of q.options || []) rows.set(opt.toLowerCase(), { label: opt, names: [], other: false });
  for (const { name, value } of entries) {
    for (const pick of value || []) {
      const k = pick.toLowerCase().trim();
      if (!rows.has(k)) rows.set(k, { label: pick.trim(), names: [], other: true });
      rows.get(k).names.push(name);
    }
  }
  return [...rows.values()].sort((a, b) => b.names.length - a.names.length || a.other - b.other);
}

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min, max, target = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { min: lo, max: hi, ticks };
}

/** Compact tick label: 1500 → 1.5K. */
export function compact(q, n) {
  const short = Math.abs(n) >= 1000
    ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
    : nf.format(n);
  return `${q.prefix || ""}${short}`;
}
