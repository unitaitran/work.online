import { clamp } from './mathUtils';

/** Camera quay quanh nhân vật: yaw (quanh trục Y), pitch (ngẩng lên khỏi mặt sàn), khoảng cách. */
export interface OrbitState {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface CameraLimits {
  minPitch: number;
  maxPitch: number;
  minDistance: number;
  maxDistance: number;
  /** Radian cho mỗi pixel kéo. */
  dragSensitivity: number;
}

/** Giới hạn khi đi lại. */
export const CAMERA_LIMITS: Readonly<CameraLimits> = {
  minPitch: 0.3,
  maxPitch: 1.25,
  minDistance: 3.5,
  maxDistance: 11,
  dragSensitivity: 0.006,
};

/** Giới hạn khi ngồi: lại gần được hơn để nhìn màn hình, lùi xa được hơn để ngắm toàn tầng. */
export const SEATED_CAMERA_LIMITS: Readonly<CameraLimits> = {
  ...CAMERA_LIMITS,
  minPitch: 0.2,
  maxPitch: 1.35,
  minDistance: 1.6,
  maxDistance: 14,
};

export function clampOrbit(state: OrbitState, limits: CameraLimits = CAMERA_LIMITS): OrbitState {
  return {
    yaw: state.yaw,
    pitch: clamp(state.pitch, limits.minPitch, limits.maxPitch),
    distance: clamp(state.distance, limits.minDistance, limits.maxDistance),
  };
}

/** Kéo sang phải: camera vòng sang trái quanh nhân vật; kéo xuống: camera hạ thấp. */
export function applyDrag(
  state: OrbitState,
  dxPixels: number,
  dyPixels: number,
  limits: CameraLimits = CAMERA_LIMITS,
): OrbitState {
  return clampOrbit(
    {
      yaw: state.yaw - dxPixels * limits.dragSensitivity,
      pitch: state.pitch + dyPixels * limits.dragSensitivity,
      distance: state.distance,
    },
    limits,
  );
}

/** factor < 1 là phóng to (lại gần), > 1 là thu nhỏ. */
export function applyZoom(
  state: OrbitState,
  factor: number,
  limits: CameraLimits = CAMERA_LIMITS,
): OrbitState {
  if (!Number.isFinite(factor) || factor <= 0) return state;
  return clampOrbit({ ...state, distance: state.distance * factor }, limits);
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

export interface RoomBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Độ cao trần. */
  ceiling: number;
}

/** Camera luôn cách tường / trần / sàn ít nhất chừng này (mét). */
export const ROOM_MARGIN = 0.25;
const MIN_CAMERA_Y = 0.35;

/**
 * Giữ camera trong phòng kín: nếu vị trí `target + offset` ra ngoài tường, lên quá trần hay xuống
 * dưới sàn thì rút ngắn `offset` (kéo camera lại gần điểm nhìn dọc đúng hướng nhìn).
 * Trả về hệ số co 0..1 (1 = không cần co). `target` phải nằm trong phòng.
 */
export function confineToRoom(
  target: { x: number; y: number; z: number },
  offset: { x: number; y: number; z: number },
  room: RoomBox,
  margin = ROOM_MARGIN,
): number {
  let t = 1;
  const limit = (from: number, delta: number, lo: number, hi: number): void => {
    if (delta > 1e-9) t = Math.min(t, Math.max(0, (hi - from) / delta));
    else if (delta < -1e-9) t = Math.min(t, Math.max(0, (lo - from) / delta));
  };
  limit(target.x, offset.x, room.minX + margin, room.maxX - margin);
  limit(target.z, offset.z, room.minZ + margin, room.maxZ - margin);
  limit(target.y, offset.y, MIN_CAMERA_Y, room.ceiling - margin);
  return t;
}
