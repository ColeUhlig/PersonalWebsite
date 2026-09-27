import * as THREE from 'three';
import { COLORS, matte, outlinedBox, outlineOf } from './style.js';

// A procedural robot built from the shared robot config. Every part the chapters point at is a
// named object in `parts`, so a future CAD model only has to provide the same names.

const WHEEL_SEGMENTS = 24;

function wheel(diameter, width, color = COLORS.wheel) {
  const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, width, WHEEL_SEGMENTS);
  geometry.rotateZ(Math.PI / 2); // axle along x
  const mesh = new THREE.Mesh(geometry, matte(color));
  mesh.add(outlineOf(mesh));
  return mesh;
}

// robot frame [x (right), y (forward)] at height `up` → local scene position
const local = (x, y, up) => new THREE.Vector3(x, up, -y);

export function buildRobot(cfg) {
  const root = new THREE.Group();
  root.name = 'robot';
  const { chassis, driveWheel, trackWidth, tracking } = cfg;
  const wheelRadius = driveWheel.diameter / 2;

  const body = outlinedBox([chassis.width, chassis.height, chassis.length], COLORS.chassis, [0, wheelRadius + 0.5, 0]);
  body.material.transparent = true;
  body.name = 'chassis';
  root.add(body);

  const driveWheels = [];
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const w = wheel(driveWheel.diameter, driveWheel.width);
      w.position.copy(local(side * trackWidth / 2, end * driveWheel.wheelbase / 2, wheelRadius));
      w.name = `driveWheel_${side < 0 ? 'left' : 'right'}_${end < 0 ? 'rear' : 'front'}`;
      driveWheels.push(w);
      root.add(w);
    }
  }

  const trackingRadius = tracking.diameter / 2;
  const left = wheel(tracking.diameter, 0.5, 0x304a7a);
  left.position.copy(local(-tracking.sL, 0, trackingRadius));
  const right = wheel(tracking.diameter, 0.5, 0x304a7a);
  right.position.copy(local(tracking.sR, 0, trackingRadius));
  const strafe = wheel(tracking.diameter, 0.5, 0x304a7a);
  strafe.rotateY(Math.PI / 2); // rolls sideways
  strafe.position.copy(local(0, -tracking.sS, trackingRadius));
  for (const [name, w] of Object.entries({ left, right, strafe })) {
    w.name = `trackingWheel_${name}`;
    root.add(w);
  }

  const imu = outlinedBox([1.2, 0.5, 1.2], COLORS.target, [cfg.imu.x, wheelRadius + chassis.height + 0.8, -cfg.imu.y]);
  imu.name = 'imu';
  root.add(imu);

  const sensors = {};
  for (const [name, mount] of Object.entries(cfg.distanceSensors)) {
    const s = outlinedBox([1.5, 1, 0.6], COLORS.estimate, [mount.x, wheelRadius + 1.5, -mount.y]);
    s.rotation.y = -mount.heading;
    s.name = `distanceSensor_${name}`;
    sensors[name] = s;
    root.add(s);
  }

  const heading = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), local(0, 0, wheelRadius + chassis.height + 1.2), chassis.length / 2, COLORS.estimate, 3, 2);
  heading.name = 'headingArrow';
  root.add(heading);

  return {
    root,
    parts: {
      chassis: body,
      driveWheels,
      trackingWheels: { left, right, strafe },
      imu,
      distanceSensors: sensors,
      headingArrow: heading,
    },
  };
}

/** Moves the model to a field pose { x, y, theta } (compass heading, clockwise +). */
export function placeRobot(root, pose) {
  root.position.set(pose.x, 0, -pose.y);
  root.rotation.y = -pose.theta;
}

/** Spins wheels by the distance each travelled this tick (inches). */
export function spinWheels(parts, cfg, motion, readings) {
  const driveTurn = (d) => d / (cfg.driveWheel.diameter / 2);
  const trackTurn = (d) => d / (cfg.tracking.diameter / 2);
  parts.driveWheels[0].rotation.x -= driveTurn(motion.motorL); // left rear
  parts.driveWheels[1].rotation.x -= driveTurn(motion.motorL); // left front
  parts.driveWheels[2].rotation.x -= driveTurn(motion.motorR);
  parts.driveWheels[3].rotation.x -= driveTurn(motion.motorR);
  parts.trackingWheels.left.rotation.x -= trackTurn(readings.dL);
  parts.trackingWheels.right.rotation.x -= trackTurn(readings.dR);
  parts.trackingWheels.strafe.rotation.z -= trackTurn(readings.dS);
}

/** 0 = solid, 1 = fully see-through (outlines stay). */
export function setXray(parts, amount) {
  parts.chassis.material.opacity = 1 - amount * 0.85;
}

/** Fades the shaded surfaces of everything under `root`, leaving outlines, for the flatten beat. */
export function setShading(root, amount) {
  root.traverse((obj) => {
    if (obj.isMesh && obj.name !== 'outline') {
      obj.material.transparent = true;
      obj.material.opacity = amount * (obj.userData.baseOpacity ?? 1);
      obj.visible = amount > 0.02;
    }
  });
}
