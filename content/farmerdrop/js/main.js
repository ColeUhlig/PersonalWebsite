import { HAPPY_PATH } from "./data.js";
import { SCENARIOS } from "./scenarios.js";
import { createMap } from "./map.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, text) => {
  const node = Object.assign(document.createElement(tag), props);
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Fill in balances a scenario step leaves out by carrying the previous ones forward. */
function resolveSteps(scenario) {
  let current = scenario.start.balances;
  return Object.freeze(
    scenario.steps.map((step) => {
      current = step.balances || current;
      return Object.freeze({ ...step, balances: current });
    }),
  );
}

const TRACKS = Object.freeze({
  order: { steps: HAPPY_PATH, outcome: null },
  ...Object.fromEntries(
    SCENARIOS.map((s) => [s.id, { steps: resolveSteps(s), outcome: s.outcome, scenario: s }]),
  ),
});

const map = createMap($("map"));
let track = TRACKS.order;
let index = 0;
let playing = false;
let stepButtons = [];

function buildStepRail() {
  const rail = $("stages");
  stepButtons = track.steps.map((step, i) => {
    const button = el("button", { type: "button", className: `tone-${step.tone || "ok"}` }, step.title);
    button.addEventListener("click", () => go(i));
    const li = el("li");
    li.append(button);
    return { li, button };
  });
  rail.replaceChildren(...stepButtons.map((b) => b.li));
}

function render(step) {
  const last = index === track.steps.length - 1;
  $("step-title").textContent = step.title;
  $("step-title").className = `tone-${step.tone || "ok"}`;
  $("step-caption").textContent = step.caption;
  $("step-ledger").replaceChildren(...step.ledger.map((line) => el("li", {}, line)));
  const outcome = $("outcome");
  outcome.hidden = !(track.outcome && last);
  outcome.textContent = track.outcome || "";
  stepButtons.forEach(({ button }, i) => {
    button.toggleAttribute("aria-current", i === index);
    button.classList.toggle("is-done", i < index);
  });
  $("prev").disabled = index === 0;
  $("next").disabled = last;
}

function go(i, { animate = true } = {}) {
  const forward = i === index + 1;
  index = Math.max(0, Math.min(track.steps.length - 1, i));
  render(track.steps[index]);
  return map.show(track.steps[index], { animate: animate && forward });
}

function stop() {
  playing = false;
  $("play").textContent = "Play";
}

async function play() {
  if (playing) return stop();
  playing = true;
  $("play").textContent = "Pause";
  if (index === track.steps.length - 1) await go(0, { animate: false });
  while (playing && index < track.steps.length - 1) {
    await go(index + 1);
    await new Promise((r) => setTimeout(r, 1500));
  }
  stop();
}

function useTrack(id) {
  stop();
  track = TRACKS[id];
  index = 0;
  buildStepRail();
  document.querySelectorAll("[data-track]").forEach((b) => {
    b.toggleAttribute("aria-pressed", b.dataset.track === id);
  });
  $("question").textContent = track.scenario ? track.scenario.question : "";
  $("question").hidden = !track.scenario;
  go(0, { animate: false });
}

function buildScenarioPicker() {
  const groups = new Map();
  for (const s of SCENARIOS) {
    if (!groups.has(s.category)) groups.set(s.category, []);
    groups.get(s.category).push(s);
  }
  const picker = $("picker");
  const orderButton = el("button", { type: "button", className: "pick pick-order" }, "Follow one $10.00 order");
  orderButton.dataset.track = "order";
  const blocks = [el("div", { className: "pick-group pick-group-order" })];
  blocks[0].append(orderButton);
  for (const [category, list] of groups) {
    const block = el("div", { className: "pick-group" });
    block.append(el("h3", {}, category));
    for (const s of list) {
      const b = el("button", { type: "button", className: "pick" }, s.question);
      b.dataset.track = s.id;
      block.append(b);
    }
    blocks.push(block);
  }
  picker.replaceChildren(...blocks);
  picker.addEventListener("click", (e) => {
    const target = e.target.closest("[data-track]");
    if (!target) return;
    useTrack(target.dataset.track);
    if (target.dataset.track !== "order") $("explorer").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

$("prev").addEventListener("click", () => go(index - 1));
$("next").addEventListener("click", () => go(index + 1));
$("play").addEventListener("click", play);
document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
  if (e.key === "ArrowRight") go(index + 1);
  if (e.key === "ArrowLeft") go(index - 1);
});
document.querySelectorAll("[data-replay]").forEach((b) =>
  b.addEventListener("click", () => {
    useTrack(b.dataset.replay);
    $("explorer").scrollIntoView({ behavior: "smooth", block: "start" });
  }),
);

buildScenarioPicker();
useTrack("order");
