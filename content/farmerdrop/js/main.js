import { SCENES } from "./scenes.js";
import { createSequence } from "./sequence.js";
import { createStrip } from "./strip.js";
import { renderSplit } from "./split.js";

const stripHost = document.getElementById("strip");
const strip = createStrip(stripHost);
// Pinned diagrams sit just under the strip, whose height changes with the legend.
new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty("--strip-h", `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`);
}).observe(stripHost);
renderSplit(document.getElementById("split"));

/** Each scrolly block owns one sequence diagram; its steps reveal the diagram's rows. */
const scrollies = [...document.querySelectorAll(".scrolly[data-scene]")].map((block) => {
  const scene = SCENES[block.dataset.scene];
  const canvas = block.querySelector(".seq-canvas");
  block.querySelector(".seq-title").textContent = scene.title;
  return { block, diagram: createSequence(canvas, scene) };
});

function activate(marker) {
  strip.set({ money: marker.dataset.money, crate: marker.dataset.crate });
  const block = marker.closest(".scrolly");
  if (!block) return;
  const owner = scrollies.find((s) => s.block === block);
  owner.diagram.setStep(Number(marker.dataset.step));
  block.querySelectorAll(".step").forEach((s) => s.classList.toggle("is-active", s === marker));
}

// A marker becomes current when it crosses a line across the viewport. On narrow screens the diagram
// is pinned over the top half, so the line sits lower, where the text is visible.
const narrow = window.matchMedia("(max-width: 900px)").matches;
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) if (entry.isIntersecting) activate(entry.target);
  },
  { rootMargin: narrow ? "-80% 0px -20% 0px" : "-45% 0px -55% 0px" },
);
document.querySelectorAll("[data-money]").forEach((marker) => observer.observe(marker));
strip.set({ money: "card", crate: "farm" });
