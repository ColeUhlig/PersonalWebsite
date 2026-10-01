// The always-on math box (piece C2; lane A owns this file; spec 10.3). Task 0's version is the
// interface: it leaves the slot hidden.
export function mountMathBox({ root, watchReading, reducedMotion = false }) {
	return Object.freeze({ hooks: Object.freeze({ shown: () => null }) });
}
