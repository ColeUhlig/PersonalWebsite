import { svg, wrap } from "./svg.js";

const PAD = 12;
const HEAD_H = 34;
const LINE_H = 15;
const NUM_W = 22;
const CHAR_W = 7.6; // IBM Plex Mono at 12.5px

function layout(width, scene) {
  const n = scene.lanes.length;
  const usable = width - 2 * PAD - NUM_W;
  const headW = Math.min(124, usable / n - 6);
  const span = usable - headW;
  const laneX = Object.fromEntries(scene.lanes.map((lane, i) => [lane.id, PAD + NUM_W + headW / 2 + (span * i) / (n - 1)]));
  return { width, headW, laneX, top: HEAD_H + 14, minRowH: width < 560 ? 50 : 44, gap: span / (n - 1) };
}

function textBlock(lines, x, yLast, cls) {
  const text = svg("text", { x, y: yLast - (lines.length - 1) * LINE_H, class: cls, "text-anchor": "middle" });
  lines.forEach((line, i) => text.append(svg("tspan", { x, dy: i === 0 ? 0 : LINE_H }, line)));
  return text;
}

const clampCenter = (center, half, width) => Math.max(PAD + NUM_W + half, Math.min(width - PAD - half, center));

function messageLines(row, geo) {
  const labelW = Math.max(Math.abs(geo.laneX[row.to] - geo.laneX[row.from]) - 12, 170);
  return { labelW, lines: wrap(row.label, labelW, { charWidth: CHAR_W, maxLines: 3 }) };
}

function noteLines(row, geo) {
  const maxW = Math.min(geo.gap * 1.8, 260);
  return { maxW, lines: wrap(row.label, maxW - 16, { charWidth: CHAR_W, maxLines: 3 }) };
}

/** Height of a row: room for its wrapped label above the wire, or for its note box. */
function rowHeight(row, geo) {
  const isNote = row.kind === "note" || row.kind === "crash";
  const n = (isNote ? noteLines(row, geo) : messageLines(row, geo)).lines.length;
  return Math.max(geo.minRowH, isNote ? n * LINE_H + 24 : n * LINE_H + 28);
}

function drawMessage(row, y, geo) {
  const x1 = geo.laneX[row.from];
  const x2 = geo.laneX[row.to];
  const dir = Math.sign(x2 - x1);
  const failed = row.kind === "fail";
  const end = failed ? x1 + (x2 - x1) * 0.62 : x2 - dir * 3;
  const g = svg("g");
  g.append(svg("path", { class: "wire", d: `M${x1 + dir * 3},${y} H${end}` }));
  if (failed) g.append(svg("path", { class: "cross", d: `M${end - 6},${y - 6} l12,12 m0,-12 l-12,12` }));
  else g.append(svg("path", { class: "head", d: `M${end},${y} l${-8 * dir},-4.5 v9 z` }));
  const { labelW, lines } = messageLines(row, geo);
  g.append(textBlock(lines, clampCenter((x1 + x2) / 2, labelW / 2, geo.width), y - (failed ? 11 : 7), "label"));
  return g;
}

function drawNote(row, y, geo) {
  const { maxW, lines } = noteLines(row, geo);
  const w = Math.min(maxW, Math.max(...lines.map((l) => l.length)) * CHAR_W + 18);
  const h = lines.length * LINE_H + 10;
  const cx = clampCenter(geo.laneX[row.at], w / 2, geo.width);
  const g = svg("g");
  g.append(svg("rect", { class: "note-box", x: cx - w / 2, y: y - h / 2, width: w, height: h, rx: 3 }));
  g.append(textBlock(lines, cx, y + h / 2 - 9, "label note-label"));
  return g;
}

function drawFrame(scene, geo, height) {
  const frame = svg("g", { class: "frame" });
  for (const lane of scene.lanes) {
    const x = geo.laneX[lane.id];
    frame.append(svg("line", { class: "lifeline", x1: x, x2: x, y1: HEAD_H, y2: height - 4 }));
    frame.append(svg("rect", { class: "lane-head", x: x - geo.headW / 2, y: 2, width: geo.headW, height: HEAD_H - 4, rx: 3 }));
    const size = geo.headW < 84 ? 11 : 12.5;
    frame.append(svg("text", { class: "lane-label", x, y: HEAD_H / 2 + 4, "font-size": size, "text-anchor": "middle" }, lane.label));
  }
  return frame;
}

const DRAW_MS = 420;
const STAGGER_MS = 260;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const drawing = new WeakMap(); // row node -> { frame, clip } of its running draw-in

/** Stops a row's draw-in, if one is running, and leaves the row fully drawn. */
function stopDrawIn(node) {
  const run = drawing.get(node);
  if (!run) return;
  cancelAnimationFrame(run.frame);
  run.clip.remove();
  node.removeAttribute("clip-path");
  drawing.delete(node);
}

/** Draws a message row in along its arrow's direction by growing a clip rectangle over it. */
function drawIn(root, node, row, geo, delay) {
  stopDrawIn(node);
  const box = node.getBBox();
  const id = `clip-${Math.random().toString(36).slice(2)}`;
  const rect = svg("rect", { x: box.x - 4, y: box.y - 4, width: 0, height: box.height + 8 });
  const clip = svg("clipPath", { id });
  clip.append(rect);
  root.append(clip);
  node.setAttribute("clip-path", `url(#${id})`);
  const leftward = row.from && geo.laneX[row.to] < geo.laneX[row.from];
  const full = box.width + 8;
  const t0 = performance.now() + delay;
  const run = { frame: 0, clip };
  drawing.set(node, run);
  const tick = (now) => {
    const t = Math.min(1, Math.max(0, (now - t0) / DRAW_MS));
    const w = full * (1 - (1 - t) ** 3);
    rect.setAttribute("width", w);
    if (leftward) rect.setAttribute("x", box.x - 4 + full - w);
    if (t < 1) run.frame = requestAnimationFrame(tick);
    else stopDrawIn(node);
  };
  run.frame = requestAnimationFrame(tick);
}

/**
 * Render a sequence diagram with numbered rows. `show(upto, from)` shows rows 1..upto (1-based):
 * rows after `from` are the current step and are drawn in, rows up to `from` are earlier steps and
 * are muted, and later rows are hidden until their step.
 */
export function createSequence(host, scene) {
  let rows = [];
  let geo = null;
  let root = null;
  let state = { upto: scene.rows.length, from: 0 };

  function apply(animate) {
    let order = 0;
    rows.forEach(({ node, row }, i) => {
      const n = i + 1;
      const fresh = n > state.from && n <= state.upto;
      node.classList.toggle("is-hidden", n > state.upto);
      node.classList.toggle("is-past", n <= state.from);
      node.classList.toggle("is-focus", fresh);
      node.classList.remove("is-arriving");
      stopDrawIn(node);
      if (!fresh || !animate || reducedMotion()) return;
      const delay = order++ * STAGGER_MS;
      if (row.from) drawIn(root, node, row, geo, delay);
      else {
        node.style.animationDelay = `${delay}ms`;
        void node.getBBox();
        node.classList.add("is-arriving");
      }
    });
  }

  function draw() {
    const width = host.getBoundingClientRect().width;
    if (width < 50) return;
    geo = layout(width, scene);
    const heights = scene.rows.map((row) => rowHeight(row, geo));
    const height = geo.top + heights.reduce((a, b) => a + b, 0) + 8;
    root = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": scene.title });
    root.append(drawFrame(scene, geo, height));
    let cursor = geo.top;
    rows = scene.rows.map((row, i) => {
      const isNote = row.kind === "note" || row.kind === "crash";
      const y = isNote ? cursor + heights[i] / 2 : cursor + heights[i] - 12;
      cursor += heights[i];
      const node = isNote ? drawNote(row, y, geo) : drawMessage(row, y, geo);
      node.setAttribute("class", `row kind-${row.kind || "msg"}`);
      node.prepend(svg("text", { class: "row-num", x: PAD, y: y + 4 }, String(i + 1)));
      root.append(node);
      return { node, row };
    });
    host.replaceChildren(root);
    apply(false);
  }

  let lastWidth = 0;
  new ResizeObserver(() => {
    const width = host.getBoundingClientRect().width;
    if (Math.abs(width - lastWidth) < 1) return;
    lastWidth = width;
    draw();
  }).observe(host);
  draw();

  return {
    rowCount: scene.rows.length,
    show(upto, from, { animate = true } = {}) {
      state = { upto, from };
      apply(animate);
    },
  };
}
