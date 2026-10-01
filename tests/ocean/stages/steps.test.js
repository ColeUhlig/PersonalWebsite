// The story's step ids (piece C2, Task 0): 27 steps in six chapters plus the finale, named so code
// and tests never hard-code a step number (spec section 10.7).
import { test } from 'node:test';
import * as expect from '../expect.js';
import { CHAPTERS, STEP_COUNT, STEP_IDS, chapterOf, idOf, stepOf } from '../../../content/ocean/js/stages/steps.js';

test('28 unique kebab-case ids, in the spec order, the finale last', () => {
	expect.equal(STEP_COUNT, 28, 'twenty-seven steps and the finale');
	expect.equal(STEP_IDS.length, STEP_COUNT, 'one id per step');
	expect.equal(new Set(STEP_IDS).size, STEP_COUNT, 'unique');
	expect.truthy(STEP_IDS.every((id) => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)), 'kebab-case');
	expect.equal(STEP_IDS.join(','), 'sine,moving-sine,sum-of-sines,into-3d,directions,many-waves,unlit,normals,slopes,diffuse,highlights,gerstner,tiling,frequency,fourier,jonswap,random-sea,time,fft,choppiness,layers,fields,sampling,mesh,painted,foam,glow,finale', 'order');
	expect.truthy(Object.isFrozen(STEP_IDS), 'frozen');
});

test('stepOf and idOf are inverses, and both refuse what is not a step', () => {
	STEP_IDS.forEach((id, i) => {
		expect.equal(stepOf(id), i + 1, id);
		expect.equal(idOf(i + 1), id, `step ${i + 1}`);
	});
	for (const bad of ['flat-plane', '', 'Sine']) {
		let message = '';
		try { stepOf(bad); } catch (error) { message = error instanceof RangeError ? error.message : String(error); }
		expect.truthy(message.includes('no step'), `stepOf(${JSON.stringify(bad)})`);
	}
	for (const bad of [0, 29, 1.5, '1']) {
		let message = '';
		try { idOf(bad); } catch (error) { message = error instanceof RangeError ? error.message : String(error); }
		expect.truthy(message.includes('step'), `idOf(${JSON.stringify(bad)})`);
	}
});

test('six chapters, in order, each starting where the spec says, every step in one', () => {
	expect.equal(CHAPTERS.map((c) => c.first).join(','), 'sine,unlit,gerstner,frequency,fields,foam', 'chapter starts');
	expect.equal(CHAPTERS.map((c) => c.number).join(','), '1,2,3,4,5,6', 'numbers');
	expect.equal(CHAPTERS.map((c) => c.title).join('|'), 'One wave|Light|Better waves|The real ocean|Textures|The look', 'titles');
	expect.equal(chapterOf(stepOf('sine')).number, 1, 'step 1');
	expect.equal(chapterOf(stepOf('highlights')).number, 2, 'the last of chapter two');
	expect.equal(chapterOf(stepOf('finale')).number, 6, 'the finale ends chapter six');
});
