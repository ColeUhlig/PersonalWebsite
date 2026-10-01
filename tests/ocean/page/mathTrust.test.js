import { test } from 'node:test';
import * as expect from '../expect.js';
import { KATEX_CSS, KATEX_OPTIONS, stackEquations, trustHtmlClass } from '../../../content/ocean/js/page/mathTrust.js';

test('KaTeX may run \\htmlClass (the term colours) and nothing else it would need trust for', () => {
	expect.equal(trustHtmlClass({ command: '\\htmlClass', class: 't-amp' }), true, 'htmlClass');
	for (const command of ['\\href', '\\url', '\\includegraphics', '\\htmlId', '\\htmlStyle', '\\htmlData']) {
		expect.equal(trustHtmlClass({ command }), false, command);
	}
	expect.equal(KATEX_OPTIONS.trust, trustHtmlClass, 'the options use it');
	expect.equal(KATEX_OPTIONS.throwOnError, false, 'a bad formula renders in red instead of throwing');
	expect.truthy(Object.isFrozen(KATEX_OPTIONS), 'frozen');
	expect.equal(KATEX_CSS, 'https://cdn.jsdelivr.net/npm/katex@0.18.10/dist/katex.min.css', 'the pinned stylesheet');
});

test('a list of equations is stacked one per line at its top-level ", \\quad" separators, and may break at a lone \\quad', () => {
	expect.equal(stackEquations('a = 1, \\qquad b = 2'), 'a = 1, \\\\ b = 2', 'qquad');
	expect.equal(stackEquations('a = 1,\\quad b = 2, \\quad c = 3'), 'a = 1, \\\\ b = 2, \\\\ c = 3', 'quad, twice');
	expect.equal(stackEquations('y = A\\,\\sin(kx)'), 'y = A\\,\\sin(kx)', 'a thin space is not a separator');
	expect.equal(stackEquations('f(\\xi_r,\\ \\xi_i)'), 'f(\\xi_r,\\ \\xi_i)', 'nor is a comma and a space');
	expect.equal(stackEquations('y = x \\quad\\text{when every}\\quad k'), 'y = x \\quad\\allowbreak\\text{when every}\\quad\\allowbreak k', 'a quad without a comma only lets the line break there');
	expect.equal(stackEquations('\\frac{a, \\quad b \\quad c}{c}, \\quad d'), '\\frac{a, \\quad b \\quad c}{c}, \\\\ d', 'not inside braces');
	expect.equal(stackEquations('\\left(a, \\quad b\\right), \\quad d'), '\\left(a, \\quad b\\right), \\\\ d', 'not inside \\left...\\right');
	expect.equal(stackEquations('\\begin{aligned} a, \\quad b \\end{aligned}, \\qquad d'), '\\begin{aligned} a, \\quad b \\end{aligned}, \\\\ d', 'not inside an environment');
	expect.equal(stackEquations('a, \\quadrant'), 'a, \\quadrant', 'only the whole command');
	expect.equal(stackEquations('a \\quad b'), 'a \\quad\\allowbreak b', 'no doubled space');
	expect.equal(stackEquations('a = \\{1, 2\\}, \\quad b'), 'a = \\{1, 2\\}, \\\\ b', 'escaped braces are not groups');
});
