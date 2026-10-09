import { test } from 'node:test';
import * as expect from '../expect.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import { check } from '../../../content/ocean/js/core/luau.js';

// The shortest last-ring reach the design's horizon DISTANCE allows, hard-coded: Horizon is an
// engine module that a spec cannot require. Since 2026-09-19 the whole horizon follows the
// reach -- the hole is `reach - 8` and the grid takes as many 2,048-stud quads a side as that
// hole needs (one at High and Medium, two at Low) -- so no preset can leave open water between
// the two whatever it reaches, and a longer reach only pushes the far edge out: there is no
// ceiling, and this is not a fit test. The floor is distance. The far edge lands
// `reach + 2,040` studs out, so the design's "covering to about 3,000 studs", which is what puts
// the far sea beyond the haze, is met from a reach of 960; `Horizon.new` asserts that same 3,000
// at start-up. 1,016 is kept as the floor here -- the 1,024 High and Medium reach less the
// tuck-under -- so a preset that reaches shorter than the shipped ones has to be a deliberate
// decision rather than a drift.
const MIN_REACH = 1016;

test('every preset builds a layout and they get cheaper down the order', () => {
	const counts = {};
	for (const name of Tier.ORDER) {
		const preset = Tier.presets[name];
		const layout = RingLayout.build({
			rings: preset.rings,
			patchCells: preset.patchCells,
			textureTile: preset.textureTile,
		});
		counts[name] = layout.vertexCount;
		WaveField.bands(preset.sizes, preset.n);
		for (const ring of preset.rings) {
			for (const cascade of ring.cascades) {
				expect.truthy(
					cascade >= 1 && cascade <= preset.sizes.length,
					`${name}: ring cascade ${cascade} exists`,
				);
			}
		}
	}
	expect.equal(
		counts.High,
		18144,
		'high vertices: 2-stud cells to 32, 4 to 64, 8 to 256, 16 to 512, 32 to 1,024, every ring a FULL square (16 + 16 + 64 + 64 + 64 patches of 81); the patches a finer ring covers are skirted, not left out',
	);
	expect.equal(
		counts.Low,
		3920,
		'low vertices: 8-stud cells to 96, 16 to 192, 32 to 384, 64 to 768, 128 to 1,536, five full 4 x 4 squares of 6-cell patches (80 patches of 49)',
	);
	expect.truthy(counts.High > counts.Medium && counts.Medium > counts.Low, 'ordered by cost');
	expect.truthy(Tier.presets.High.sizes.length === 3 && Tier.presets.Low.sizes.length === 1, 'cascade counts');
});

// The Horizon's 2,048-stud quads tuck under whatever square the last ring covers, so a short
// reach no longer shows open water -- it pulls the far sea in towards the viewer instead.
// Nesting is SurfaceSampler's rule, not a preference: a cascade this ring samples and the next
// one out does not is faded to zero at the boundary, so that both sides compute the same height
// there. A cascade that APPEARS on a coarser ring has no such fade on the fine side and the two
// sides disagree along the whole edge.
test('every preset reaches far enough for the horizon and nests its cascades outward', () => {
	for (const name of Tier.ORDER) {
		const rings = Tier.presets[name].rings;
		const reach = rings[rings.length - 1].halfExtent;
		expect.truthy(
			reach >= MIN_REACH,
			`${name}: the last ring reaches ${reach}, under the ${MIN_REACH} the horizon's distance assumes: the far sea would sit ${MIN_REACH - reach} studs closer than the design's`,
		);
		for (let index = 2; index <= rings.length; index++) {
			// Keyed by Luau cascade number.
			const finer = {};
			for (const cascade of rings[index - 2].cascades) {
				finer[cascade] = true;
			}
			for (const cascade of rings[index - 1].cascades) {
				expect.truthy(
					finer[cascade],
					`${name}: ring ${index} samples cascade ${cascade} and the finer ring ${index - 1} does not`,
				);
			}
		}
	}
});

// Pinned, because which cascades a ring samples is a look decision and not something to drift
// into. The rule these lists apply: a ring samples a cascade only while its cells are NARROWER
// than that cascade's longest wave. At High, cascade 2 runs from 2.67 to 10.67 studs, so the 2,
// 4 and 8-stud rings carry it (ring 3 on 8 < 10.67, kept deliberately although its cells give
// the band's longest wave only 1.3 samples, a look decision) and the 16 and 32-stud rings, wider
// than anything in it, drop it. The test is necessary and not sufficient: cascade 3 is
// everything under 2.67 studs, which not even the 2-stud ring resolves, so it is sampled nowhere
// at all; and Medium's cascade 2 (the 64-stud patch, open above, so 10.67 studs down to its
// grid's Nyquist at 2) clears the test on the 4-stud ring but would be resolved over only the 8
// to 10.67-stud top of its band, so it too is dropped everywhere. What a ring cannot resolve it
// can only alias, and under flat lighting (the shipped M2 look, where the ramp alone draws the
// shape) an alias is all it would contribute. Low keeps its one cascade whatever it aliases:
// there is no other. The cascades still RUN: M3's normal map is where the short waves belong.
test('rings sample only the cascades their cells can resolve', () => {
	const expected = {
		High: ['1,2', '1,2', '1,2', '1', '1'],
		Medium: ['1', '1', '1', '1', '1'],
		Low: ['1', '1', '1', '1', '1'],
	};
	for (const name of Tier.ORDER) {
		const rings = Tier.presets[name].rings;
		const lists = expected[name];
		expect.equal(rings.length, lists.length, `${name}: ring count`);
		lists.forEach((want, i) => {
			const index = i + 1;
			expect.equal(rings[index - 1].cascades.join(','), want, `${name}: ring ${index} cascades`);
		});
	}
});

// M3 splits what a ring SAMPLES from what tilts its vertices. Every ring keeps the coarse
// cascade in its vertex normals and hands the rest to the normal map, which carries them at the
// texel resolution of the 256-stud tile rather than at the ring's vertex spacing: at High the
// 64-stud cascade runs 2.67 to 10.67-stud waves and the coarsest ring that samples it has 8-stud
// cells, so as vertex normals that band could only alias. The list must be a SUBSET of the
// ring's own cascades -- a ring has no slopes for a cascade it never reads -- and must not be
// nil, which means "all of them" and is the M2 behaviour this replaces.
test('vertex normals come from cascade 1 only', () => {
	for (const name of Tier.ORDER) {
		Tier.presets[name].rings.forEach((ring, i) => {
			const index = i + 1;
			const normalCascades = ring.normalCascades;
			check(normalCascades, `${name}: ring ${index} names no normal cascades`);
			const sampled = {};
			for (const cascade of ring.cascades) {
				sampled[cascade] = true;
			}
			for (const cascade of normalCascades) {
				expect.truthy(
					sampled[cascade],
					`${name}: ring ${index} takes its normals from cascade ${cascade}, which it does not sample`,
				);
			}
			if (name === 'High') {
				expect.equal(normalCascades.length, 1, `High: ring ${index} normal cascade count`);
				expect.equal(normalCascades[0], 1, `High: ring ${index} normal cascade`);
			}
		});
	}
});

test('the high preset reaches 1,024 studs at 2-stud spacing near the camera', () => {
	const rings = Tier.presets.High.rings;
	expect.equal(rings[0].spacing, 2, 'near spacing');
	expect.equal(rings[rings.length - 1].halfExtent, 1024, 'reach');
});

// The argument is the start-up CPU probe (one cascade evolved and synthesised, median of three),
// not a frame time: an empty scene's frame time is the 60 fps cap on every machine and said
// nothing. Cole's Mac measures about 4.8 ms non-native.
test('choose picks by the start-up cascade probe', () => {
	expect.equal(Tier.choose(4.8), 'High', 'the Mac, non-native');
	expect.equal(Tier.choose(7.99), 'High', 'just inside the High threshold');
	expect.equal(Tier.choose(8), 'Medium', 'at the High threshold');
	expect.equal(Tier.choose(15.9), 'Medium', 'just inside the Medium threshold');
	expect.equal(Tier.choose(16), 'Low', 'at the Medium threshold');
	expect.equal(Tier.choose(40), 'Low', 'a slow machine');
});
