import { OFFICE_FLOOR, officeInteractables } from '@dilam/shared';
import { describe, expect, it } from 'vitest';
import { PositionValidator } from './positionValidator';

describe('phòng sếp (CEO)', () => {
  const validator = new PositionValidator(OFFICE_FLOOR);
  const { door, bounds } = OFFICE_FLOOR.ceoRoom;
  // Cửa nằm trên vách tây: ngoài là phía -X, trong là phía +X.
  const doorZ = (door.minZ + door.maxZ) / 2;
  const outside = { x: door.minX - 0.4, z: doorZ };
  const inside = { x: door.maxX + 0.4, z: doorZ };

  it('không có thẻ: đi qua cửa bị kéo lại; có thẻ: đi qua được', () => {
    expect(validator.check(outside, 0, inside, 'walk', 600).ok).toBe(false);
    expect(validator.check(outside, 0, inside, 'walk', 600, true).ok).toBe(true);
  });

  it('không có thẻ: không "nhảy" qua vách kính vào chỗ ngồi của sếp', () => {
    const desk = officeInteractables(OFFICE_FLOOR).find((item) => item.kind === 'ceodesk');
    if (!desk?.seat) throw new Error('missing ceo desk');
    // Đứng sát vách kính bắc, ngay phía ngoài.
    const north = { x: desk.approach.x, z: bounds.minZ - 0.35 };
    expect(validator.check(north, 0, desk.approach, 'stand', 100).ok).toBe(false);
    expect(validator.check(north, 0, desk.seat, 'type', 100).ok).toBe(false);
  });
});
