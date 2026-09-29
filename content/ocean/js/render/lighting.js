// The Studio place's lighting, read from "SOT jonswap ocean" on 2026-09-28: Lighting Brightness 2.6,
// ClockTime 16.9, GeographicLatitude 30, Ambient (0.27, 0.33, 0.40), OutdoorAmbient (0.45, 0.52,
// 0.60), ExposureCompensation 0.1, sun direction (-0.953, 0.282, 0.113); Atmosphere Density 0.22,
// Offset 0.1, Color (0.74, 0.84, 0.90), Decay (0.55, 0.68, 0.78), Glare 0.35, Haze 0.6;
// ColorCorrection Contrast 0.08, Saturation 0.12; Bloom 0.55 / size 30 / threshold 2.2; SunRays 0.06;
// camera FieldOfView 70 (vertical, as Three.js). Three.js lights are not Roblox's: every intensity
// below is a starting point, tuned against Studio captures in the look-match task, which records
// the final values and why here.
export const SUN_DIRECTION = Object.freeze([-0.9526530504226685, 0.2821884751319885, 0.11323313415050507]);
export const SUN_COLOUR = Object.freeze([1, 0.96, 0.9]);
export const SUN_INTENSITY = 2.6;
export const SKY_AMBIENT = Object.freeze([0.45, 0.52, 0.6]);
export const GROUND_AMBIENT = Object.freeze([0.27, 0.33, 0.4]);
export const AMBIENT_INTENSITY = 1;
export const EXPOSURE = 2 ** 0.1;
export const FOG_COLOUR = Object.freeze([0.74, 0.84, 0.9]);
export const FOG_DENSITY = 0.00035;
export const FIELD_OF_VIEW = 70;
export const CSS_FILTER = 'contrast(1.08) saturate(1.12)';
// Roblox EmissiveStrength reaches about 30 on the brightest patch; Three.js emissive intensity is
// on another scale. Tuned in the look match.
export const EMISSIVE_SCALE = 0.05;
// The ripple normal map's green channel carries +z; whether Three.js reads it as +v or -v was decided
// by the calibration test in Task 7 (tests/ocean/e2e/materials.spec.js): the luminance of the high
// shot with cascade 1 in the vertex normals against the same shot with cascade 1 in the normal map.
// Measured under SwiftShader on 2026-09-29, 48 x 27 grid: r = 0.876 with 1, above the 0.5 the stop
// rule asks for, so the sign stays 1. The test does not separate the signs by much: -1 measured 0.773
// and the stand-in material with no normal map at all 0.552, because the sky rows are identical in
// both shots and the displaced geometry shades alike. With the rows' local means taken out (each
// texel minus its 3 x 3 neighbourhood, 192 x 108 grid) 1 still leads: 0.549 against 0.317.
export const NORMAL_SCALE_Y = 1;
export const SKY = Object.freeze({ turbidity: 4, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.8 });
export const MAX_PIXEL_RATIO = 2;
