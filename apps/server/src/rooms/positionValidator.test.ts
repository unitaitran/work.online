import { OFFICE_FLOOR, officeInteractables } from '@dilam/shared';
import { describe, expect, it } from 'vitest';
import { PositionValidator } from './positionValidator';

describe('phòng CEO', () => {
  const validator = new PositionValidator(OFFICE_FLOOR);
  const { doorMinX, doorMaxX, bounds } = OFFICE_FLOOR.ceoRoom;
  const doorX = (doorMinX + doorMaxX) / 2;
  const outside = { x: doorX, z: bounds.maxZ + 0.4 };
  const inside = { x: doorX, z: bounds.maxZ - 0.4 };

  it('không có thẻ: đi qua cửa bị kéo lại; có thẻ: đi qua được', () => {
    expect(validator.check(outside, 0, inside, 'walk', 600).ok).toBe(false);
    expect(validator.check(outside, 0, inside, 'walk', 600, true).ok).toBe(true);
  });

  it('không có thẻ: không "nhảy" thẳng vào ghế CEO', () => {
    const desk = officeInteractables(OFFICE_FLOOR).find((item) => item.kind === 'ceodesk');
    if (!desk?.seat) throw new Error('missing ceo desk');
    const near = { x: desk.seat.x, z: bounds.maxZ + 0.35 };
    // Ghế cách vách hơn tầm nhảy: dù có thẻ cũng phải đi bộ qua cửa.
    expect(validator.check(near, 0, desk.seat, 'type', 100).ok).toBe(false);
    const east = { x: bounds.maxX + 0.35, z: desk.seat.z };
    expect(validator.check(east, 0, desk.approach, 'stand', 100).ok).toBe(false);
  });
});
