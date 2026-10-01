// The controls on one panel (piece C; spec 2: "one or two sliders that change the live ocean"),
// built from the recipe's sliders through the story stage, which applies every change to this
// panel's own step. Each control shows the director's value after it clamps and snaps, carries a
// swatch in its term's colour (a slider with no term in its step's math has none), and says so when
// the tier cannot run it (the note is the disabled control's description). After each change that
// really moves a value the document gets an `ocean:slider` event for the charts; a value the
// director refuses is logged and the control goes back to what the director holds.
//
// Keyboard: a range snaps to its slider's step, and on a log track one arrow position near the low
// end is far less than a step (fetch: about 18 m against 100), so the thumb keeps its own position
// while it still snaps to the stored value, and an arrow key on a log track always moves the value
// by at least one step. The grid-size choice is a radio group: one tab stop (the checked option),
// arrows and Home/End move the choice, past any option switched off. An option whose button carries
// data-blocked (the FFT timing chart sets it on a grid this device cannot time without freezing the
// page, ui/charts.js) stays disabled through every refresh.
import { TERM_BY_SLIDER, formatValue, fromInput, inputRange, toInput } from '../page/sliderModel.js';
import { clampSlider } from '../stages/sliders.js';

export const UNAVAILABLE_NOTE = "Not on this device's lighter tier";

const UP_KEYS = new Set(['ArrowRight', 'ArrowUp']);
const DOWN_KEYS = new Set(['ArrowLeft', 'ArrowDown']);

function element(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	Object.assign(node, props);
	node.append(...children);
	return node;
}

// The term's colour dot, or nothing for a slider with no term in its math.
function swatches(slider) {
	const term = TERM_BY_SLIDER[slider.id];
	return term ? [element('span', { className: `swatch ${term}`, ariaHidden: 'true' })] : [];
}

function labelFor(slider, forId) {
	return element('label', { htmlFor: forId }, [...swatches(slider), slider.label]);
}

// Says why a control is disabled, through the unavailable note, only while it is.
function describe(target, s, noteId) {
	if (s.available) {
		target.removeAttribute('aria-describedby');
	} else {
		target.setAttribute('aria-describedby', noteId);
	}
}

export function mountControls({ root, step, story, onChange = () => {} }) {
	const rows = new Map();

	// Applies a change through the story, then shows what the director holds. Only a value that
	// really changed is announced; a refusal is logged and the control shows the held value again.
	function apply(id, write) {
		const before = valueNow(id);
		let value;
		try {
			value = write();
		} catch (error) {
			console.error(`[ocean] step ${step} refused ${id}`, error);
			refresh();
			return;
		}
		refresh();
		if (value !== before) {
			onChange({ step, id, value });
		}
	}

	const valueNow = (id) => story.sliders(step).find((s) => s.id === id)?.value;
	const set = (id, value) => apply(id, () => story.setSlider(step, id, value));

	function rangeRow(slider, id, noteId) {
		const track = inputRange(slider);
		const input = element('input', { type: 'range', id, min: String(track.min), max: String(track.max), step: String(track.step) });
		const output = element('output', { className: 'control-value', htmlFor: id });
		input.addEventListener('input', () => set(slider.id, fromInput(slider, Number(input.value))));
		if (slider.scale === 'log') {
			input.addEventListener('keydown', (event) => {
				const up = UP_KEYS.has(event.key);
				if (!up && !DOWN_KEYS.has(event.key)) return;
				event.preventDefault();
				const value = valueNow(slider.id);
				const position = toInput(slider, value) + (up ? 1 : -1);
				const moved = fromInput(slider, position);
				set(slider.id, up ? Math.max(moved, value + slider.step) : Math.min(moved, value - slider.step));
			});
		}
		return {
			children: [labelFor(slider, id), output, input],
			show(s) {
				// The thumb keeps its place while that place still snaps to the stored value, so a
				// small move along a log track is not undone before it adds up to a step.
				const here = clampSlider(s, fromInput(s, Number(input.value)));
				if (here !== s.value) {
					input.value = String(toInput(s, s.value));
				}
				output.textContent = formatValue(s, s.value);
				input.setAttribute('aria-valuetext', formatValue(s, s.value));
				input.disabled = !s.available;
				describe(input, s, noteId);
			},
		};
	}

	function toggleRow(slider, id, noteId) {
		const input = element('input', { type: 'checkbox', id });
		input.setAttribute('role', 'switch');
		const output = element('output', { className: 'control-value', htmlFor: id });
		input.addEventListener('change', () => set(slider.id, input.checked));
		return {
			children: [input, labelFor(slider, id), output],
			// A layer this tier does not run is off here, whatever the recipe asks, and says so.
			show(s) {
				const on = Boolean(s.value) && s.available;
				input.checked = on;
				output.textContent = formatValue(s, on);
				input.disabled = !s.available;
				describe(input, s, noteId);
			},
		};
	}

	function counterRow(slider, id, noteId) {
		const button = element('button', { type: 'button', id, className: 'control-press', textContent: slider.label });
		const output = element('output', { className: 'control-value', htmlFor: id });
		button.addEventListener('click', () => apply(slider.id, () => story.press(step, slider.id)));
		return {
			children: [...swatches(slider), button, output],
			show(s) {
				output.textContent = formatValue(s, s.value);
				button.disabled = !s.available;
				describe(button, s, noteId);
			},
		};
	}

	function choiceRow(slider, id, noteId) {
		const group = element('div', { className: 'segmented', id });
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-label', slider.label);
		const buttons = slider.options.map((option) => {
			const button = element('button', { type: 'button', textContent: formatValue(slider, option) });
			button.setAttribute('role', 'radio');
			button.dataset.option = String(option);
			button.addEventListener('click', () => set(slider.id, option));
			return button;
		});
		// Arrows move the choice round the group, Home and End to its ends; focus follows it.
		group.addEventListener('keydown', (event) => {
			const at = buttons.indexOf(document.activeElement);
			if (at === -1) return;
			const open = buttons.filter((button) => !button.disabled);
			const place = open.indexOf(buttons[at]);
			const last = open.length - 1;
			const step = UP_KEYS.has(event.key) ? (place === last ? 0 : place + 1)
				: DOWN_KEYS.has(event.key) ? (place <= 0 ? last : place - 1)
					: event.key === 'Home' ? 0
						: event.key === 'End' ? last
							: null;
			if (step === null || last < 0) return;
			const next = buttons.indexOf(open[step]);
			event.preventDefault();
			set(slider.id, slider.options[next]);
			buttons[next].focus();
		});
		group.append(...buttons);
		const label = element('span', { className: 'control-label' }, [...swatches(slider), slider.label]);
		return {
			children: [label, group],
			show(s) {
				for (const button of buttons) {
					const checked = Number(button.dataset.option) === s.value;
					button.setAttribute('aria-checked', String(checked));
					button.tabIndex = checked ? 0 : -1;
					button.disabled = !s.available || button.dataset.blocked !== undefined;
				}
				describe(group, s, noteId);
			},
		};
	}

	const BUILDERS = { range: rangeRow, toggle: toggleRow, counter: counterRow, choice: choiceRow };

	function build() {
		root.replaceChildren();
		rows.clear();
		for (const slider of story.sliders(step)) {
			const id = `control-${step}-${slider.id}`;
			const noteId = `${id}-note`;
			const row = BUILDERS[slider.kind](slider, id, noteId);
			const note = element('span', { className: 'control-note', id: noteId, textContent: UNAVAILABLE_NOTE });
			const wrapper = element('div', { className: `control control-${slider.kind}` }, [...row.children, note]);
			wrapper.dataset.slider = slider.id;
			rows.set(slider.id, { row, note, wrapper });
			root.append(wrapper);
		}
		refresh();
	}

	function refresh() {
		for (const slider of story.sliders(step)) {
			const entry = rows.get(slider.id);
			if (!entry) continue;
			entry.row.show(slider);
			entry.note.hidden = slider.available;
			entry.wrapper.classList.toggle('is-unavailable', !slider.available);
		}
	}

	build();
	return Object.freeze({ refresh });
}
