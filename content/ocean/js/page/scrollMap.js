// The scroll story's arithmetic (piece C; browser-free): where the reading line sits, which step
// section it is in and how far through, and the continuous position (step + progress) the story
// stage smooths before handing it to A3's director. A position that would move more than one step
// in one go is taken at once rather than eased, so a fling never sweeps the engine through every
// recipe in between.
export const NARROW_QUERY = '(max-width: 899.98px)';
// The recipes' STEP_COUNT (stages/recipes.js); scrollMap.test.js checks they agree.
export const LAST_STEP = 13;
export const SMOOTH_SECONDS = 0.25;
// Cole's ruling: a step holds its own recipe (shot and sea) until this far through its section,
// while its panel is read, and eases into the next step's over the rest.
export const HOLD_UNTIL = 0.5;
// A sticky panel's top in style.css, and the gap kept under a panel taller than the view.
export const PANEL_TOP = '10vh';
export const PANEL_BOTTOM_GAP_PX = 16;

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

// The line the visitor reads at: the middle of the viewport, or on a narrow screen (where the ocean
// covers the top half) the middle of the lower half.
export function readingLine(viewportHeight, narrow) {
	return viewportHeight * (narrow ? 0.75 : 0.5);
}

// sections: the step sections in document order, as { step, top, height } in document pixels;
// anchor: the document y of the reading line.
export function readScroll(sections, anchor) {
	if (sections.length === 0 || !(anchor >= sections[0].top)) {
		return { phase: 'opening', step: 1, progress: 0 };
	}
	let current = sections[0];
	for (const section of sections) {
		if (section.top > anchor) break;
		current = section;
	}
	const progress = current.height > 0 ? clamp01((anchor - current.top) / current.height) : 0;
	return { phase: 'step', step: current.step, progress };
}

// The progress the director blends by, from the progress through the section: 0 (the step's own
// recipe) until HOLD_UNTIL, then smoothstep up to 1 (the next step's) at the section's end, so a
// snap the director makes halfway through a blend lands at about 0.75 of the section.
export function holdThenBlend(progress) {
	const x = clamp01((progress - HOLD_UNTIL) / (1 - HOLD_UNTIL));
	return x * x * (3 - 2 * x);
}

export function positionOf(reading) {
	return reading.step + (reading.step >= LAST_STEP ? 0 : reading.progress);
}

export function splitPosition(position) {
	const p = Math.min(Math.max(position, 1), LAST_STEP);
	const step = Math.min(Math.floor(p), LAST_STEP);
	return { step, progress: step === LAST_STEP ? 0 : p - step };
}

export function smoothPosition(current, target, dt, tau = SMOOTH_SECONDS) {
	if (!Number.isFinite(current) || Math.abs(target - current) > 1) {
		return target;
	}
	if (!(dt > 0)) {
		return current;
	}
	const next = current + (target - current) * (1 - Math.exp(-dt / tau));
	return Math.abs(target - next) < 1e-4 ? target : next;
}

// The sticky top for a panel `panelHeight` px tall: the stylesheet's 10vh, or, for a panel too tall
// for that, high enough (above the top of the view) that its bottom stays PANEL_BOTTOM_GAP_PX inside
// the view while it sticks, so the end of a long panel can be read before the step moves on.
export function stickyTop(panelHeight) {
	if (!(panelHeight >= 0)) {
		return PANEL_TOP;
	}
	return `min(${PANEL_TOP}, 100svh - ${panelHeight}px - ${PANEL_BOTTOM_GAP_PX}px)`;
}
