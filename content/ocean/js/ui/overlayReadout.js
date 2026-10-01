// The live readout under step 9's arrows (piece C2; lane C owns this file; spec 10.7). Task 0's
// version is the interface: the readout stays empty.
export function mountOverlayReadout({ handle, watchReading }) {
	return Object.freeze({ hooks: Object.freeze({ text: () => '' }) });
}
