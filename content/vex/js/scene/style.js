import * as THREE from 'three';

// The page's look: matte surfaces with crisp edge outlines, like a clean CAD render.
// Colors mirror the CSS tokens in style.css so 3D and 2D layers match.

export const COLORS = Object.freeze({
  bg: 0x0b1020,
  tile: 0x1b2540,
  tileAlt: 0x202c4c,
  wall: 0x2c3a5e,
  chassis: 0x3a4a6e,
  wheel: 0x1a2136,
  outline: 0x9fb4d8,
  estimate: 0x3be3ff,
  target: 0xffb347,
  construct: 0xff4fd8,
});

export const matte = (color, extra = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });

/** Returns a mesh's outline as thin line segments (edges sharper than 30°). */
export function outlineOf(mesh, color = COLORS.outline) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 30);
  const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true }));
  lines.name = 'outline';
  return lines;
}

/** A box mesh with its outline attached, positioned by its center. */
export function outlinedBox(size, color, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), matte(color));
  mesh.position.set(...position);
  mesh.add(outlineOf(mesh));
  return mesh;
}

export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b1020, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(60, 140, 90);
  scene.add(key);
}
