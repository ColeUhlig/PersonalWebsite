import * as THREE from 'three';
import { COLORS, matte, outlineOf } from './style.js';

// A generic V5 field: 6×6 foam tiles of 24", a 12" wall around the edge. Built from simple shapes.
// Scene axes: field x → scene x, field y → scene −z (so +y is "away from the driver"), up is scene y.

export const FIELD_SIZE = 144; // inches
export const TILE = 24;
export const WALL_HEIGHT = 12;
const WALL_THICKNESS = 1;

/** Converts a field-frame point [x, y] (inches) to a scene Vector3 at height `up`. */
export const toScene = ([x, y], up = 0) => new THREE.Vector3(x, up, -y);

export function buildField() {
  const root = new THREE.Group();
  root.name = 'field';
  const half = FIELD_SIZE / 2;

  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(TILE, 0.5, TILE),
        matte((row + col) % 2 === 0 ? COLORS.tile : COLORS.tileAlt),
      );
      tile.position.set(-half + TILE / 2 + col * TILE, -0.25, -half + TILE / 2 + row * TILE);
      root.add(tile);
    }
  }

  const grid = new THREE.GridHelper(FIELD_SIZE, 6, COLORS.outline, COLORS.outline);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = 0.01;
  root.add(grid);

  const wallSpecs = [
    [[FIELD_SIZE + 2, WALL_HEIGHT, WALL_THICKNESS], [0, WALL_HEIGHT / 2, -half - 0.5]],
    [[FIELD_SIZE + 2, WALL_HEIGHT, WALL_THICKNESS], [0, WALL_HEIGHT / 2, half + 0.5]],
    [[WALL_THICKNESS, WALL_HEIGHT, FIELD_SIZE], [-half - 0.5, WALL_HEIGHT / 2, 0]],
    [[WALL_THICKNESS, WALL_HEIGHT, FIELD_SIZE], [half + 0.5, WALL_HEIGHT / 2, 0]],
  ];
  for (const [size, position] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), matte(COLORS.wall, { transparent: true, opacity: 0.85 }));
    wall.position.set(...position);
    wall.add(outlineOf(wall));
    root.add(wall);
  }

  return { root, parts: { walls: root.children.slice(-4) } };
}
