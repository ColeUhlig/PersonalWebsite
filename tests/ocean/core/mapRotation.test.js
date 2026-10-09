import { test } from 'node:test';
import * as expect from '../expect.js';
import * as MapRotation from '../../../content/ocean/js/core/mapRotation.js';

test('the three maps are numbered colour, mask, normal', () => {
	expect.equal(MapRotation.COLOUR, 1, 'colour');
	expect.equal(MapRotation.MASK, 2, 'mask');
	expect.equal(MapRotation.NORMAL, 3, 'normal');
});

test('the maps rotation alternates mask and normal', () => {
	expect.equal(MapRotation.MAPS.length, 2, 'two maps share the second worker');
	const seen = [];
	for (let frame = 1; frame <= 4; frame++) {
		seen.push(MapRotation.mapsSlot(frame));
	}
	expect.equal(
		seen.join(','),
		`${MapRotation.MASK},${MapRotation.NORMAL},${MapRotation.MASK},${MapRotation.NORMAL}`,
		'cycle',
	);
	expect.equal(MapRotation.mapsSlot(301), MapRotation.MASK, 'frame 301');
});

test('bands cycle one to four', () => {
	expect.equal(MapRotation.BANDS, 4, 'four bands');
	const seen = [];
	for (let frame = 1; frame <= 5; frame++) {
		seen.push(MapRotation.band(frame, 4));
	}
	expect.equal(seen.join(','), '1,2,3,4,1', 'cycle');
	expect.equal(MapRotation.band(300, 4), 4, 'frame 300');
	// Any band count, so a tuning change does not need a second helper.
	expect.equal(MapRotation.band(3, 2), 1, 'frame 3 of two bands');
});
