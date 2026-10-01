// The controls on one panel (piece C; spec 2: "one or two sliders that change the live ocean"),
// built from the recipe's sliders through the story stage, which applies every change to this
// panel's own step. Each control shows the director's value after it clamps and snaps, carries a
// swatch in its term's colour, and says so when the tier cannot run it. After each change the
// document gets an `ocean:slider` event for the charts.
import { TERM_BY_SLIDER, formatValue, fromInput, inputRange, toInput } from '../page/sliderModel.js';

export const UNAVAILABLE_NOTE = "Not on this device's lighter tier";

function element(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	Object.assign(node, props);
	node.append(...children);
	return node;
}

function labelFor(slider, forId) {
	const label = element('label', { htmlFor: forId });
	label.append(element('span', { className: `swatch ${TERM_BY_SLIDER[slider.id] ?? ''}`, ariaHidden: 'true' }), slider.label);
	return label;
}

export function mountControls({ root, step, story, onChange = () => {} }) {
	const rows = new Map();

	function changed(id, value) {
		refresh();
		onChange({ step, id, value });
	}

	function rangeRow(slider, id) {
		const track = inputRange(slider);
		const input = element('input', { type: 'range', id, min: String(track.min), max: String(track.max), step: String(track.step) });
		const output = element('output', { className: 'control-value', htmlFor: id });
		input.addEventListener('input', () => changed(slider.id, story.setSlider(step, slider.id, fromInput(slider, Number(input.value)))));
		return {
			children: [labelFor(slider, id), output, input],
			show(s) {
				input.value = String(toInput(s, s.value));
				output.textContent = formatValue(s, s.value);
				input.disabled = !s.available;
			},
		};
	}

	function toggleRow(slider, id) {
		const input = element('input', { type: 'checkbox', id });
		input.setAttribute('role', 'switch');
		const output = element('output', { className: 'control-value', htmlFor: id });
		input.addEventListener('change', () => changed(slider.id, story.setSlider(step, slider.id, input.checked)));
		return {
			children: [input, labelFor(slider, id), output],
			// A layer this tier does not run is off here, whatever the recipe asks, and says so.
			show(s) {
				const on = Boolean(s.value) && s.available;
				input.checked = on;
				output.textContent = formatValue(s, on);
				input.disabled = !s.available;
			},
		};
	}

	function counterRow(slider, id) {
		const button = element('button', { type: 'button', id, className: 'control-press', textContent: slider.label });
		const output = element('output', { className: 'control-value', htmlFor: id });
		button.addEventListener('click', () => changed(slider.id, story.press(step, slider.id)));
		return {
			children: [element('span', { className: `swatch ${TERM_BY_SLIDER[slider.id] ?? ''}`, ariaHidden: 'true' }), button, output],
			show(s) {
				output.textContent = formatValue(s, s.value);
				button.disabled = !s.available;
			},
		};
	}

	function choiceRow(slider, id) {
		const group = element('div', { className: 'segmented', id });
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-label', slider.label);
		const buttons = slider.options.map((option) => {
			const button = element('button', { type: 'button', textContent: formatValue(slider, option) });
			button.setAttribute('role', 'radio');
			button.dataset.option = String(option);
			button.addEventListener('click', () => changed(slider.id, story.setSlider(step, slider.id, option)));
			return button;
		});
		group.append(...buttons);
		const label = element('span', { className: 'control-label' });
		label.append(element('span', { className: `swatch ${TERM_BY_SLIDER[slider.id] ?? ''}`, ariaHidden: 'true' }), slider.label);
		return {
			children: [label, group],
			show(s) {
				for (const button of buttons) {
					button.setAttribute('aria-checked', String(Number(button.dataset.option) === s.value));
					button.disabled = !s.available;
				}
			},
		};
	}

	const BUILDERS = { range: rangeRow, toggle: toggleRow, counter: counterRow, choice: choiceRow };

	function build() {
		root.replaceChildren();
		rows.clear();
		for (const slider of story.sliders(step)) {
			const id = `control-${step}-${slider.id}`;
			const row = BUILDERS[slider.kind](slider, id);
			const note = element('span', { className: 'control-note', textContent: UNAVAILABLE_NOTE });
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
