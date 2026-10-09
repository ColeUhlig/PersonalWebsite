// The finale's Roblox / Unleashed toggle contract (piece C, Task 9): page/renderMode.js.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { renderModeControl, RENDER_MODES } from '../../../content/ocean/js/page/renderMode.js';

test('no setRenderMode on the handle, no toggle', () => {
	expect.equal(renderModeControl({}), null, 'plain handle');
	expect.equal(renderModeControl(null), null, 'no handle');
	expect.equal(renderModeControl({ setRenderMode: 'yes' }), null, 'not a function');
});

test('with setRenderMode the toggle calls it and remembers the mode', () => {
	const calls = [];
	const control = renderModeControl({ setRenderMode: (mode) => calls.push(mode) });
	expect.equal(control.modes.join(','), RENDER_MODES.join(','), 'modes');
	expect.equal(control.mode(), 'roblox', 'starts in Roblox mode');
	control.choose('unleashed');
	expect.equal(calls.join(','), 'unleashed', 'called');
	expect.equal(control.mode(), 'unleashed', 'remembered');
});

test('a mode it does not know, or a renderer that throws, leaves the mode as it was', () => {
	const control = renderModeControl({ setRenderMode: (mode) => { if (mode === 'unleashed') throw new Error('no float textures'); } });
	let message = '';
	try {
		control.choose('turbo');
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('turbo'), message);
	try {
		control.choose('unleashed');
	} catch {
		// the renderer's own error reaches the caller
	}
	expect.equal(control.mode(), 'roblox', 'unchanged');
});
