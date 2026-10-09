import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Jacobian from '../../../content/ocean/js/core/jacobian.js';

test('flat water has determinant one and no folding', () => {
	expect.near(Jacobian.determinant(0, 0, 0, 1), 1, 1e-12, 'determinant');
	const value = Jacobian.minimum(0, 0, 0, 1)[0];
	expect.near(value, 1, 1e-12, 'minimum eigenvalue');
});

test('lambda scales the displacement derivatives', () => {
	// J = (1 + 0.5 * -0.4) * (1 + 0.5 * 0.2) - (0.5 * 0.1)^2
	expect.near(Jacobian.determinant(-0.4, 0.2, 0.1, 0.5), 0.8 * 1.1 - 0.0025, 1e-12, 'determinant');
	expect.near(Jacobian.determinant(-0.4, 0.2, 0.1, 0), 1, 1e-12, 'lambda 0 is flat');
});

test('the smallest eigenvalue and its direction match a known matrix', () => {
	// Matrix [[1 + jxx, jxz], [jxz, 1 + jzz]] with lambda 1: [[0.5, 0.3], [0.3, 1.5]].
	// Eigenvalues: 1 -/+ sqrt(0.25 + 0.09) = 0.4169048..., 1.5830952...
	const [value, ex, ez] = Jacobian.minimum(-0.5, 0.5, 0.3, 1);
	expect.near(value, 1 - Math.sqrt(0.34), 1e-9, 'minimum');
	expect.near(ex * ex + ez * ez, 1, 1e-9, 'unit direction');
	// Eigenvector check: M e = value e.
	expect.near(0.5 * ex + 0.3 * ez, value * ex, 1e-9, 'row 1');
	expect.near(0.3 * ex + 1.5 * ez, value * ez, 1e-9, 'row 2');
});

test('a pinch along x folds along x', () => {
	const [value, ex, ez] = Jacobian.minimum(-1.5, 0, 0, 1);
	expect.near(value, -0.5, 1e-12, 'folded');
	expect.near(Math.abs(ex), 1, 1e-9, 'along x');
	expect.near(ez, 0, 1e-9, 'not along z');
});
