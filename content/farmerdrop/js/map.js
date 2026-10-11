import { ACCOUNTS, GOODS_NODES, SYSTEM_NODES, TOTAL_CENTS } from "./data.js";
import { svg, dollars, tween } from "./svg.js";

const W = 1200;
const H = 800;
const GOODS_Y = 118;
const SYSTEM_Y = 300;
const TUBE_BASE = 730;
const TUBE_MAX = 250;
const GOODS_X = [170, 460, 760, 1050];
const SYSTEM_X = [130, 320, 510, 710, 900, 1085];

const SYSTEM_EDGES = Object.freeze([
  ["checkout", "stripe", 0],
  ["stripe", "webhook", 0],
  ["webhook", "server", 0],
  ["checkout", "server", 62],
  ["server", "stripe", -58],
  ["reconciler", "server", 0],
  ["reconciler", "stripe", 92],
  ["admin", "server", -58],
]);

const goodsPos = Object.fromEntries(GOODS_NODES.map((n, i) => [n.id, { x: GOODS_X[i], y: GOODS_Y }]));
const systemPos = Object.fromEntries(SYSTEM_NODES.map((n, i) => [n.id, { x: SYSTEM_X[i], y: SYSTEM_Y }]));

function tubeLayout() {
  const gap = 22;
  const unit = 92;
  const widths = ACCOUNTS.map((a) => (a.wide ? 150 : unit));
  const total = widths.reduce((s, w) => s + w, 0) + gap * (ACCOUNTS.length - 1);
  let x = (W - total) / 2;
  return Object.fromEntries(
    ACCOUNTS.map((a, i) => {
      const slot = { x, w: widths[i], cx: x + widths[i] / 2 };
      x += widths[i] + gap;
      return [a.id, slot];
    }),
  );
}

const TUBES = tubeLayout();
const heightFor = (cents) => (Math.max(0, cents) / TOTAL_CENTS) * TUBE_MAX;

const ICONS = {
  farm: "M-20 14V-4L0-18 20-4V14ZM-7 14V2H7V14M-20-4H20",
  truck: "M-24 8V-10H6V8ZM6-4H16L22 3V8H6M-15 14A5 5 0 1 0-15 4 5 5 0 1 0-15 14M13 14A5 5 0 1 0 13 4 5 5 0 1 0 13 14",
  dropHost: "M-18 14V-2L0-16 18-2V14ZM-24 2L0-20 24 2M-6 14V4H6V14M-18 8H-10M10 8H18",
  customer: "M0-6A8 8 0 1 0 0-22 8 8 0 1 0 0-6M-14 16C-14 4-7 0 0 0S14 4 14 16Z",
};

function bandLabels(root) {
  const bands = [
    ["Goods", 14, 200, "goods"],
    ["System", 214, 170, "system"],
    ["Money", 398, 392, "money"],
  ];
  for (const [label, y, h, kind] of bands) {
    root.append(svg("rect", { class: `band band-${kind}`, x: 8, y, width: W - 16, height: h, rx: 18 }));
    root.append(svg("text", { class: "band-label", x: 30, y: y + 32 }, label));
  }
}

function goodsLayer(root) {
  const road = svg("path", {
    class: "road",
    d: `M${GOODS_X[0]} ${GOODS_Y} L${GOODS_X[3]} ${GOODS_Y}`,
  });
  root.append(road);
  const nodes = {};
  for (const node of GOODS_NODES) {
    const { x, y } = goodsPos[node.id];
    const g = svg("g", { class: "goods-node", transform: `translate(${x} ${y})` });
    g.append(svg("circle", { class: "goods-disc", r: 38 }));
    g.append(svg("path", { class: "goods-icon", d: ICONS[node.id] }));
    g.append(svg("text", { class: "node-label", y: 66 }, node.label));
    g.append(svg("text", { class: "node-sub", y: 84 }, node.sub));
    root.append(g);
    nodes[node.id] = g;
  }
  const crate = svg("g", { class: "crate", transform: `translate(${GOODS_X[0]} ${GOODS_Y - 64})` });
  crate.append(svg("rect", { class: "crate-box", x: -20, y: -14, width: 40, height: 28, rx: 3 }));
  crate.append(svg("path", { class: "crate-slats", d: "M-20-4H20M-20 5H20M-8-14V14M8-14V14" }));
  crate.append(svg("circle", { class: "crate-tick", cx: 18, cy: -14, r: 8 }));
  crate.append(svg("path", { class: "crate-tick-mark", d: "M14-14l3 3 5-6" }));
  crate.append(svg("path", { class: "crate-lost-mark", d: "M-12-10L12 10M12-10L-12 10" }));
  root.append(crate);
  return { nodes, crate };
}

function edgePath(a, b, bend) {
  const p = systemPos[a];
  const q = systemPos[b];
  if (!bend) return `M${p.x} ${p.y} L${q.x} ${q.y}`;
  const mx = (p.x + q.x) / 2;
  return `M${p.x} ${p.y + Math.sign(bend) * 28} Q${mx} ${p.y + bend * 1.9} ${q.x} ${q.y + Math.sign(bend) * 28}`;
}

function systemLayer(root) {
  const edges = {};
  for (const [a, b, bend] of SYSTEM_EDGES) {
    const path = svg("path", { class: "sys-edge", d: edgePath(a, b, bend) });
    root.append(path);
    edges[`${a}>${b}`] = path;
    edges[`${b}>${a}`] = path;
  }
  const nodes = {};
  for (const node of SYSTEM_NODES) {
    const { x, y } = systemPos[node.id];
    const g = svg("g", { class: `sys-node sys-${node.id}`, transform: `translate(${x} ${y})` });
    g.append(svg("rect", { class: "sys-box", x: -76, y: -28, width: 152, height: 56, rx: 12 }));
    g.append(svg("text", { class: "sys-label", y: -3 }, node.label));
    g.append(svg("text", { class: "sys-sub", y: 15 }, node.sub));
    const fail = svg("g", { class: "fail-mark", transform: "translate(68 -26)" });
    fail.append(svg("circle", { r: 13 }));
    fail.append(svg("path", { d: "M-5-5L5 5M5-5L-5 5" }));
    g.append(fail);
    const badge = svg("g", { class: "badge", transform: "translate(0 -46)" });
    badge.append(svg("rect", { class: "badge-bg", y: -13, height: 24, rx: 12 }));
    badge.append(svg("text", { class: "badge-text", y: 4 }, ""));
    g.append(badge);
    root.append(g);
    nodes[node.id] = g;
  }
  return { nodes, edges };
}

function moneyLayer(root) {
  const defs = svg("defs");
  const hatch = svg("pattern", {
    id: "hatch", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)",
  });
  hatch.append(svg("rect", { class: "hatch-bg", width: 8, height: 8 }));
  hatch.append(svg("line", { class: "hatch-line", x1: 0, y1: 0, x2: 0, y2: 8 }));
  defs.append(hatch);
  root.append(defs);

  const tubes = {};
  for (const account of ACCOUNTS) {
    const { x, w, cx } = TUBES[account.id];
    const g = svg("g", { class: `tube party-${account.party}${account.paid ? " tube-paid" : ""}` });
    g.append(svg("rect", { class: "tube-glass", x, y: TUBE_BASE - TUBE_MAX, width: w, height: TUBE_MAX, rx: 10 }));
    const fill = svg("rect", { class: "tube-fill", x: x + 3, y: TUBE_BASE - 3, width: w - 6, height: 0, rx: 7 });
    g.append(fill);
    const amount = svg("text", { class: "tube-amount", x: cx, y: TUBE_BASE - 12 }, "$0.00");
    g.append(amount);
    g.append(svg("text", { class: "tube-label", x: cx, y: TUBE_BASE + 26 }, account.label));
    root.append(g);
    tubes[account.id] = { g, fill, amount, cents: 0 };
  }
  const chips = svg("g", { class: "chips" });
  root.append(chips);
  return { tubes, chips };
}

function setTube(tube, cents) {
  const h = heightFor(Math.abs(cents));
  const fillH = Math.round(cents) !== 0 ? Math.max(3, h - 6) : 0;
  tube.fill.setAttribute("height", String(fillH));
  tube.fill.setAttribute("y", String(TUBE_BASE - 3 - fillH));
  tube.amount.textContent = dollars(Math.round(cents));
  tube.amount.setAttribute("y", String(Math.min(TUBE_BASE - 12, TUBE_BASE - h - 12)));
  tube.g.classList.toggle("is-empty", Math.round(cents) === 0);
  tube.g.classList.toggle("is-negative", Math.round(cents) < 0);
}

const isNode = (end) => end.startsWith("@");

function endpoint(end) {
  if (isNode(end)) {
    const p = systemPos[end.slice(1)];
    return { x: p.x, y: p.y + 30 };
  }
  return { x: TUBES[end].cx, y: TUBE_BASE - TUBE_MAX - 6 };
}

function chipPath(from, to) {
  const a = endpoint(from);
  const b = endpoint(to);
  const both = !isNode(from) && !isNode(to);
  const cy = both ? 410 + Math.min(40, Math.abs(a.x - b.x) / 20) : Math.min(a.y, b.y) + 40;
  const cx = (a.x + b.x) / 2;
  return (t) => ({
    x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x,
    y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y,
  });
}

function setBadge(g, text) {
  const badge = g.querySelector(".badge");
  badge.classList.toggle("is-shown", Boolean(text));
  if (!text) return;
  const label = badge.querySelector("text");
  label.textContent = text;
  const width = Math.max(60, text.length * 7.1 + 24);
  const bg = badge.querySelector("rect");
  bg.setAttribute("x", String(-width / 2));
  bg.setAttribute("width", String(width));
}

/**
 * Build the system map inside `host`. Returns a controller with `show(step)`.
 * @param {HTMLElement} host
 */
export function createMap(host) {
  const root = svg("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "map",
    role: "img",
    "aria-labelledby": "map-title map-desc",
  });
  root.append(svg("title", { id: "map-title" }, "Farmerdrop system map"));
  const desc = svg("desc", { id: "map-desc" }, "");
  root.append(desc);
  bandLabels(root);
  const trigger = svg("path", { class: "trigger", d: "" });
  root.append(trigger);
  const goods = goodsLayer(root);
  const system = systemLayer(root);
  const money = moneyLayer(root);
  host.append(root);

  let crateAt = { x: GOODS_X[0], y: GOODS_Y - 64 };
  let run = 0;

  function moveCrate(target, state) {
    const to = { x: goodsPos[target].x, y: GOODS_Y - 64 };
    const from = crateAt;
    goods.crate.setAttribute("class", `crate crate-${state}`);
    crateAt = to;
    return tween(900, (p) => {
      const x = from.x + (to.x - from.x) * p;
      const hop = Math.sin(Math.PI * p) * (from.x === to.x ? 0 : 18);
      goods.crate.setAttribute("transform", `translate(${x} ${from.y - hop})`);
    });
  }

  function highlightSystem(step) {
    const active = new Set(step.system);
    const badges = step.badges || {};
    for (const [id, g] of Object.entries(system.nodes)) {
      g.classList.toggle("is-active", active.has(id));
      g.classList.toggle("is-failed", (step.failed || []).includes(id));
      setBadge(g, badges[id]);
    }
    const live = new Set((step.edges || []).map(([a, b]) => system.edges[`${a}>${b}`]));
    const broken = new Set((step.brokenEdges || []).map(([a, b]) => system.edges[`${a}>${b}`]));
    for (const path of new Set(Object.values(system.edges))) {
      path.classList.toggle("is-active", live.has(path));
      path.classList.toggle("is-broken", broken.has(path));
    }
    for (const [id, g] of Object.entries(goods.nodes)) {
      g.classList.toggle("is-here", step.goods.at === id);
      g.classList.toggle("is-failed", (step.goodsFailed || []).includes(id));
    }
  }

  function drawTrigger(step) {
    if (!step.trigger) {
      trigger.setAttribute("d", "");
      return;
    }
    const g = goodsPos[step.trigger];
    const s = systemPos.server;
    const t = TUBES.holding;
    const top = TUBE_BASE - TUBE_MAX - 8;
    trigger.setAttribute(
      "d",
      `M${g.x} ${GOODS_Y + 92} C${g.x} ${s.y - 50} ${s.x} ${s.y - 70} ${s.x} ${s.y - 30}` +
        ` M${s.x} ${s.y + 30} C${s.x} ${s.y + 90} ${t.cx} ${top - 60} ${t.cx} ${top}`,
    );
    trigger.classList.remove("is-drawn");
    void trigger.getBoundingClientRect();
    trigger.classList.add("is-drawn");
  }

  function animateFlows(step, id) {
    const jobs = (step.flows || []).map(([from, to, cents], i) => {
      const point = chipPath(from, to);
      const party = isNode(to) ? "customer" : ACCOUNTS.find((a) => a.id === to).party;
      const chip = svg("g", { class: `chip party-${party}` });
      chip.append(svg("circle", { r: 9 }));
      money.chips.append(chip);
      const none = { cents: 0, ghost: true };
      const src = isNode(from) ? none : money.tubes[from];
      const dst = isNode(to) ? none : money.tubes[to];
      const srcStart = src.cents;
      const dstStart = dst.cents;
      return tween(
        1100,
        (p) => {
          if (id !== run) return;
          const { x, y } = point(p);
          chip.setAttribute("transform", `translate(${x} ${y})`);
          if (!src.ghost) setTube(src, (src.cents = srcStart - cents * p));
          if (!dst.ghost) setTube(dst, (dst.cents = dstStart + cents * p));
        },
        i * 220,
      ).then(() => chip.remove());
    });
    return Promise.all(jobs);
  }

  function settle(step) {
    for (const [id, tube] of Object.entries(money.tubes)) {
      tube.cents = step.balances[id];
      setTube(tube, tube.cents);
    }
  }

  return {
    /** @param {object} step @param {{animate?: boolean}} [opts] */
    async show(step, { animate = true } = {}) {
      const id = ++run;
      money.chips.replaceChildren();
      desc.textContent = `${step.title}. ${step.caption}`;
      highlightSystem(step);
      drawTrigger(step);
      if (!animate) {
        settle(step);
        const to = goodsPos[step.goods.at];
        crateAt = { x: to.x, y: GOODS_Y - 64 };
        goods.crate.setAttribute("class", `crate crate-${step.goods.state}`);
        goods.crate.setAttribute("transform", `translate(${to.x} ${GOODS_Y - 64})`);
        return;
      }
      await moveCrate(step.goods.at, step.goods.state);
      if (id !== run) return;
      await animateFlows(step, id);
      if (id === run) settle(step);
    },
  };
}
