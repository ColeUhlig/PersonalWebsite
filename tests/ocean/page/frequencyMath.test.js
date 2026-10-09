// The frequency charts' arithmetic (piece C2, lane E; spec 10.7 steps 14 and 15): one tile of the
// flat graph's waves, its spectrum through the engine's own FFT, and a chord taken apart and rebuilt.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { SAMPLES, TONES, amplitudes, bankSpikes, chord, forward, inverse, lineProfile, peaks } from '../../../content/ocean/js/page/frequencyMath.js';

const line = (count) => WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), count);

test('a pure sine of n cycles and height A is one spike of height A at n', () => {
	const signal = Float64Array.from({ length: SAMPLES }, (_, m) => 1.7 * Math.sin((2 * Math.PI * 9 * m) / SAMPLES + 0.4));
	const a = amplitudes(forward(signal));
	expect.equal(a.length, SAMPLES / 2 + 1, 'up to the Nyquist bin');
	expect.near(a[9], 1.7, 1e-9, 'the spike');
	for (let k = 0; k < a.length; k++) if (k !== 9) expect.near(a[k], 0, 1e-9, `bin ${k}`);
	expect.equal(peaks(a).join(','), '9', 'one peak');
});

test('forward then inverse gives the signal back', () => {
	const signal = lineProfile(line(6), 3.3);
	const back = inverse(forward(signal));
	for (let m = 0; m < SAMPLES; m++) expect.near(back[m], signal[m], 1e-12, `sample ${m}`);
});

test("the flat graph's waves are spikes at their own lattice frequencies, with their own heights", () => {
	for (const count of [1, 2, 4]) {
		const waves = line(count);
		const spikes = bankSpikes(waves);
		expect.equal(spikes.length, count, `${count} waves`);
		const a = amplitudes(forward(lineProfile(waves, 5.5)));
		const bins = new Set(spikes.map((s) => s.n));
		expect.equal(bins.size, count, 'the first waves sit on different bins');
		expect.equal(peaks(a).join(','), [...bins].sort((x, y) => x - y).join(','), `the spectrum finds exactly them at ${count}`);
		for (const spike of spikes) expect.near(a[spike.n], spike.amplitude, 1e-9, `the spike at ${spike.n}`);
	}
});

test('the chord: all tones rebuild it exactly; a tone switched off is gone from both pictures', () => {
	const all = chord([true, true, true]);
	for (let m = 0; m < SAMPLES; m++) expect.near(all.rebuilt[m], all.chord[m], 1e-12, `sample ${m}`);
	expect.equal(peaks(all.before).join(','), TONES.map((t) => t.cycles).join(','), 'three spikes');
	const without = chord([true, false, true]);
	expect.near(without.after[TONES[1].cycles], 0, 1e-12, 'the middle spike gone');
	expect.near(without.after[TONES[0].cycles], TONES[0].amplitude, 1e-9, 'the low one kept');
	const middle = (m) => TONES[1].amplitude * Math.sin((2 * Math.PI * TONES[1].cycles * m) / SAMPLES + 0.6);
	for (let m = 0; m < SAMPLES; m += 7) expect.near(without.rebuilt[m], all.chord[m] - middle(m), 1e-9, `sample ${m}`);
});
