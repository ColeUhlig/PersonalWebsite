// One description of the robot, shared by the math (core/) and the 3D model (scene/robot.js),
// so the picture and the numbers always agree. Inches, radians, seconds.
// Tracking wheel offsets use the Purdue SIGBots wiki's names: s_L, s_R, s_S are the distances from
// the tracking center to the left, right and back (strafe) tracking wheels.

export const ROBOT = Object.freeze({
  chassis: Object.freeze({ width: 15, length: 15, height: 2.5 }),
  trackWidth: 12, // left-to-right distance between drive wheels
  driveWheel: Object.freeze({ diameter: 3.25, width: 1.2, wheelbase: 10 }),
  maxSpeed: 60, // in/s at full power
  motorTimeConstant: 0.12, // s, how quickly wheel speed follows the command
  tracking: Object.freeze({ sL: 4.5, sR: 4.5, sS: 3.5, diameter: 2 }),
  imu: Object.freeze({ x: 2.5, y: 2.5 }),
  distanceSensors: Object.freeze({
    rear: Object.freeze({ x: 0, y: -7.5, heading: Math.PI }),
    left: Object.freeze({ x: -7.5, y: 0, heading: -Math.PI / 2 }),
  }),
});
