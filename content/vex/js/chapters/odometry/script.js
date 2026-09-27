// The S-curve the robot drives in chapter 1: { duration (s), left, right } motor commands.
export const S_CURVE = Object.freeze([
  { duration: 1.2, left: 0.9, right: 0.9 },
  { duration: 1.6, left: 0.95, right: 0.55 },
  { duration: 1.0, left: 0.85, right: 0.85 },
  { duration: 1.8, left: 0.5, right: 0.95 },
  { duration: 1.2, left: 0.8, right: 0.8 },
]);

export const START_POSE = Object.freeze({ x: -48, y: -48, theta: 0 });
