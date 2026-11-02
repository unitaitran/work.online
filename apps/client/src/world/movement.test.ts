import { describe, expect, it } from 'vitest';
import { orbitOffset } from '../engine/cameraMath';
import { combineInputs, headingOf, inputToWorld, stepToward } from './movement';

describe('inputToWorld', () => {
  it('camera nhìn về -Z (yaw 0): tiến = -Z, phải = +X', () => {
    const forward = inputToWorld({ x: 0, y: 1 }, 0);
    expect(forward.x).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(-1);
    const right = inputToWorld({ x: 1, y: 0 }, 0);
    expect(right.x).toBeCloseTo(1);
    expect(right.z).toBeCloseTo(0);
  });

  it('"tiến" luôn là hướng từ camera tới nhân vật, dù camera xoay góc nào', () => {
    for (const yaw of [0.3, 1.7, -2.4]) {
      const forward = inputToWorld({ x: 0, y: 1 }, yaw);
      const offset = orbitOffset({ yaw, pitch: 0.5, distance: 5 });
      const len = Math.hypot(offset.x, offset.z);
      expect(forward.x).toBeCloseTo(-offset.x / len);
      expect(forward.z).toBeCloseTo(-offset.z / len);
    }
  });
});

describe('combineInputs', () => {
  it('giới hạn độ dài 1 khi cộng bàn phím và joystick', () => {
    const v = combineInputs({ x: 1, y: 0 }, { x: 1, y: 0 });
    expect(v).toEqual({ x: 1, y: 0 });
  });

  it('giữ nguyên đầu vào yếu (đẩy nhẹ joystick = đi chậm)', () => {
    expect(combineInputs({ x: 0, y: 0.3 })).toEqual({ x: 0, y: 0.3 });
  });
});

describe('stepToward', () => {
  it('bước đúng độ dài', () => {
    const step = stepToward({ x: 0, z: 0 }, { x: 3, z: 4 }, 1);
    expect(step.arrived).toBe(false);
    expect(step.pos.x).toBeCloseTo(0.6);
    expect(step.pos.z).toBeCloseTo(0.8);
  });

  it('tới nơi thì đứng đúng đích', () => {
    expect(stepToward({ x: 0, z: 0 }, { x: 0.5, z: 0 }, 1)).toEqual({
      pos: { x: 0.5, z: 0 },
      arrived: true,
    });
  });
});

describe('headingOf', () => {
  it('đi về +Z là góc 0, về +X là π/2', () => {
    expect(headingOf({ x: 0, z: 1 })).toBeCloseTo(0);
    expect(headingOf({ x: 1, z: 0 })).toBeCloseTo(Math.PI / 2);
  });
});
