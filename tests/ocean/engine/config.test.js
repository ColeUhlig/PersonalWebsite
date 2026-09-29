import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Config from '../../../content/ocean/js/engine/config.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';

test('the defaults are Look.luau with the place attributes applied', () => {
	const c = Config.readConfig('');
	expect.equal(c.params.windSpeed, Spectrum.NORMAL.windSpeed, 'wind');
	expect.equal(c.params.fetch, Spectrum.NORMAL.fetch, 'fetch');
	expect.equal(c.params.scale, 8, 'scale from Look.SEA');
	expect.equal(c.params.tailBoost, -0.3, 'tailBoost');
	expect.equal(c.params.isotropy, 0.4, 'isotropy from the place (OceanIsotropy 0.4)');
	expect.equal(c.chop, 0.8, 'chop');
	expect.equal(c.peak, 10.3, 'peak');
	expect.equal(c.tint, 0.35, 'tint');
	expect.equal(c.scatter.strength, 30, 'scatter strength');
	expect.equal(c.scatter.viewPower, 3, 'viewPower');
	expect.equal(c.scatter.facePower, 1, 'facePower');
	expect.equal(c.maskGamma, 0.8, 'gamma');
	expect.equal(c.maskDecay, 0.98, 'mask decay');
	expect.equal(c.roughness.join(','), '0.15,0.2,0.3,0.45,0.6', 'roughness');
	expect.equal(c.foam.enabled, true, 'foam on');
	expect.equal(c.foam.whitecap, 0.35, 'whitecap');
	expect.equal(c.foam.opacity, 0.7, 'opacity');
	expect.equal(c.deep.join(','), '8,46,72', 'deep');
	expect.equal(c.subsurface.join(','), '28,168,156', 'subsurface');
	expect.equal(c.foam.colour.join(','), '232,228,210', 'foam colour');
	expect.equal(c.tier, null, 'tier chosen at start-up');
	expect.equal(c.useWorkers, true, 'workers on');
	expect.equal(c.freeze, null, 'clock running');
	expect.equal(c.camera, 'orbit', 'free camera');
	expect.equal(c.calibrate, null, 'no calibration');
	expect.equal(c.warnings.length, 0, 'no warnings');
	expect.truthy(Object.isFrozen(c), 'frozen');
});

test('URL parameters override the defaults', () => {
	const c = Config.readConfig('?scale=4&whitecap=0.55&isotropy=1&tier=Low&workers=0&freeze=12&cam=high&focus=origin&hud=0&stats=1&deep=1,2,3&foam=0');
	expect.equal(c.params.scale, 4, 'scale');
	expect.equal(c.foam.whitecap, 0.55, 'whitecap');
	expect.equal(c.params.isotropy, 1, 'isotropy');
	expect.equal(c.tier, 'Low', 'tier');
	expect.equal(c.useWorkers, false, 'workers off');
	expect.equal(c.freeze, 12, 'frozen clock');
	expect.equal(c.camera, 'high', 'camera');
	expect.equal(c.focusOrigin, true, 'focus pinned to the origin');
	expect.equal(c.hud, false, 'hud off');
	expect.equal(c.stats, true, 'stats on');
	expect.equal(c.deep.join(','), '1,2,3', 'deep colour');
	expect.equal(c.foam.enabled, false, 'foam off');
});

test('bad values fall back with a warning instead of reaching the maths', () => {
	const c = Config.readConfig('?wind=0&scale=abc&tint=2&opacity=-1&roughness=0.1,x,0.3&tier=Ultra&cam=sideways&deep=300,1');
	expect.equal(c.params.windSpeed, Spectrum.NORMAL.windSpeed, 'wind 0 rejected by validateParams');
	expect.equal(c.params.scale, 8, 'non-number scale ignored');
	expect.equal(c.tint, 1, 'tint clamped to 1');
	expect.equal(c.foam.opacity, 0, 'opacity clamped to 0');
	expect.equal(c.roughness.join(','), '0.1,0.3', 'unparseable roughness entry dropped');
	expect.equal(c.tier, null, 'unknown tier ignored');
	expect.equal(c.camera, 'orbit', 'unknown camera ignored');
	expect.equal(c.deep.join(','), '8,46,72', 'malformed colour ignored');
	for (const name of ['wind', 'scale', 'tint', 'opacity', 'roughness', 'tier', 'cam', 'deep']) {
		expect.truthy(c.warnings.some((w) => w.includes(name)), `a warning names ${name}`);
	}
});

test('calibration modes paint grey, drop foam and glow, and set the vertex normals', () => {
	const map = Config.readConfig('?calibrate=map');
	expect.equal(map.calibrate, 'map', 'map mode');
	expect.equal(map.flatNormals, true, 'map mode lights only through the normal map');
	expect.equal(map.deep.join(','), '128,128,128', 'grey deep');
	expect.equal(map.subsurface.join(','), '128,128,128', 'grey subsurface');
	expect.equal(map.foam.enabled, false, 'no foam');
	expect.equal(map.scatter.strength, 0, 'no glow');
	const vertex = Config.readConfig('?calibrate=vertex');
	expect.equal(vertex.flatNormals, false, 'vertex mode lights through the vertex normals');
	expect.equal(Config.readConfig('?calibrate=sideways').calibrate, null, 'unknown mode ignored');
});
