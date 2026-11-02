import { clamp } from './mathUtils';

/** Camera quay quanh nhân vật: yaw (quanh trục Y), pitch (ngẩng lên khỏi mặt sàn), khoảng cách. */
export interface OrbitState {
  yaw: number;
  pitch: number;
  distance: number;
}

export const CAMERA_LIMITS = {
  minPitch: 0.3,
  maxPitch: 1.25,
  minDistance: 3.5,
  maxDistance: 11,
  /** Radian cho mỗi pixel kéo. */
  dragSensitivity: 0.006,
} as const;

export function clampOrbit(state: OrbitState): OrbitState {
  return {
    yaw: state.yaw,
    pitch: clamp(state.pitch, CAMERA_LIMITS.minPitch, CAMERA_LIMITS.maxPitch),
    distance: clamp(state.distance, CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance),
  };
}

/** Kéo sang phải: camera vòng sang trái quanh nhân vật; kéo xuống: camera hạ thấp. */
export function applyDrag(state: OrbitState, dxPixels: number, dyPixels: number): OrbitState {
  return clampOrbit({
    yaw: state.yaw - dxPixels * CAMERA_LIMITS.dragSensitivity,
    pitch: state.pitch + dyPixels * CAMERA_LIMITS.dragSensitivity,
    distance: state.distance,
  });
}

/** factor < 1 là phóng to (lại gần), > 1 là thu nhỏ. */
export function applyZoom(state: OrbitState, factor: number): OrbitState {
  if (!Number.isFinite(factor) || factor <= 0) return state;
  return clampOrbit({ ...state, distance: state.distance * factor });
}

/** Vị trí camera so với điểm nhìn. */
export function orbitOffset(state: OrbitState): { x: number; y: number; z: number } {
  const horizontal = Math.cos(state.pitch) * state.distance;
  return {
    x: Math.sin(state.yaw) * horizontal,
    y: Math.sin(state.pitch) * state.distance,
    z: Math.cos(state.yaw) * horizontal,
  };
}
