import { add, localToGlobal } from './geometry.js';

// Field positions of the robot's parts, used for drawing.

const toField = (pose, local) => add([pose.x, pose.y], localToGlobal(local, pose.theta));

export function chassisCorners(pose, cfg) {
  const w = cfg.chassis.width / 2;
  const l = cfg.chassis.length / 2;
  return [
    [-w, l],
    [w, l],
    [w, -l],
    [-w, -l],
  ].map((corner) => toField(pose, corner));
}

// `rightForward` slides the right tracking wheel along the robot (used by the "only the sideways
// offset matters" beat).
export function trackingWheelPoints(pose, cfg, rightForward = 0) {
  const { sL, sR, sS } = cfg.tracking;
  return {
    center: [pose.x, pose.y],
    left: toField(pose, [-sL, 0]),
    right: toField(pose, [sR, rightForward]),
    strafe: toField(pose, [0, -sS]),
  };
}
