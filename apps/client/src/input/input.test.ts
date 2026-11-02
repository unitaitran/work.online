import { describe, expect, it } from 'vitest';
import { joystickVector } from './joystick';
import { isMovementKey, keysToVector } from './keyboard';
import { isTap, wheelZoomFactor } from './pointerControls';

describe('keysToVector', () => {
  it('WASD và phím mũi tên', () => {
    expect(keysToVector(new Set(['KeyW']))).toEqual({ x: 0, y: 1 });
    expect(keysToVector(new Set(['ArrowLeft']))).toEqual({ x: -1, y: 0 });
  });

  it('đi chéo có độ dài 1', () => {
    const v = keysToVector(new Set(['KeyW', 'KeyD']));
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(Math.SQRT1_2);
  });

  it('hai phím ngược nhau triệt tiêu; giữ W và ↑ không đi nhanh gấp đôi', () => {
    expect(keysToVector(new Set(['KeyA', 'KeyD']))).toEqual({ x: 0, y: 0 });
    expect(keysToVector(new Set(['KeyW', 'ArrowUp']))).toEqual({ x: 0, y: 1 });
  });

  it('bỏ qua phím khác', () => {
    expect(isMovementKey('KeyQ')).toBe(false);
    expect(keysToVector(new Set(['KeyQ', 'Space']))).toEqual({ x: 0, y: 0 });
  });
});

describe('joystickVector', () => {
  it('trong vùng chết thì đứng yên', () => {
    expect(joystickVector(5, 5, 50)).toEqual({ x: 0, y: 0 });
  });

  it('đẩy lên (dy âm trên màn hình) là tiến', () => {
    const v = joystickVector(0, -50, 50);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });

  it('kéo quá mép vẫn chỉ tối đa 1', () => {
    const v = joystickVector(300, 0, 50);
    expect(v.x).toBeCloseTo(1);
  });

  it('đẩy nửa chừng thì đi chậm hơn', () => {
    const v = joystickVector(30, 0, 50);
    expect(v.x).toBeGreaterThan(0.3);
    expect(v.x).toBeLessThan(0.7);
  });

  it('bán kính 0 không chia cho 0', () => {
    expect(joystickVector(10, 10, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('pointer', () => {
  it('phân biệt chạm và kéo', () => {
    expect(isTap(3, 120)).toBe(true);
    expect(isTap(30, 120)).toBe(false);
    expect(isTap(2, 2000)).toBe(false);
  });

  it('cuộn xuống là lùi xa (> 1), cuộn lên là lại gần (< 1)', () => {
    expect(wheelZoomFactor(100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-100, 0)).toBeLessThan(1);
    // Chuột cuộn theo dòng (deltaMode 1) quy đổi ra pixel.
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48, 0));
  });
});
