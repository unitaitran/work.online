import { describe, expect, it } from 'vitest';
import { containsPoint, inflate } from '../collision';
import { nearestInteractable, SeatRegistry } from '../interaction';
import { findPath, PATH_MARGIN } from '../pathfinding';
import { insideCeoRoom } from '@dilam/shared';
import { OFFICE_FLOOR, officeInteractables, officeObstacles } from './layout';
import { DAY_PERIODS, isDayPeriod, periodOfDay } from './period';

const RADIUS = 0.28;
const obstacles = officeObstacles(OFFICE_FLOOR);
const items = officeInteractables(OFFICE_FLOOR);

describe('bố cục tầng văn phòng', () => {
  it('có đủ các khu và vật tương tác theo yêu cầu', () => {
    const kinds = new Set(items.map((item) => item.kind));
    for (const kind of [
      'desk',
      'meeting',
      'sofa',
      'coffee',
      'fridge',
      'printer',
      'plant',
      'window',
    ]) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
    expect(items.filter((item) => item.kind === 'desk').length).toBeGreaterThanOrEqual(8);
  });

  it('id vật tương tác không trùng', () => {
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it('mọi vật cản nằm trong phòng', () => {
    const { minX, maxX, minZ, maxZ } = OFFICE_FLOOR.bounds;
    for (const box of obstacles) {
      expect(box.minX).toBeGreaterThanOrEqual(minX - 0.06);
      expect(box.maxX).toBeLessThanOrEqual(maxX + 0.06);
      expect(box.minZ).toBeGreaterThanOrEqual(minZ - 0.06);
      expect(box.maxZ).toBeLessThanOrEqual(maxZ + 0.06);
    }
  });

  it('chỗ xuất hiện và chỗ đứng dùng vật không nằm trong vật cản', () => {
    const points = [
      OFFICE_FLOOR.spawn,
      ...items.map((item) => item.approach),
      ...OFFICE_FLOOR.strollSpots,
    ];
    for (const p of points) {
      const hit = obstacles.find((box) => containsPoint(inflate(box, RADIUS + PATH_MARGIN), p));
      expect(hit, JSON.stringify(p)).toBeUndefined();
    }
  });

  it('từ chỗ xuất hiện đi tới được mọi vật tương tác và điểm đi dạo (trừ bàn trong phòng CEO)', () => {
    // Đồ trong phòng CEO (bàn sếp, sofa họp) cần thẻ mới tới được.
    const outside = items.filter(
      (item) => item.kind !== 'ceodesk' && !item.id.startsWith('meeting-ceo-'),
    );
    for (const target of [...outside.map((item) => item.approach), ...OFFICE_FLOOR.strollSpots]) {
      const path = findPath(OFFICE_FLOOR.spawn, target, obstacles, RADIUS, OFFICE_FLOOR.bounds);
      expect(path, JSON.stringify(target)).not.toBeNull();
      const end = path?.at(-1);
      expect(end && Math.hypot(end.x - target.x, end.z - target.z)).toBeLessThan(1e-6);
    }
  });

  it('từ phòng họp đi ra bàn làm việc được (qua cửa kính)', () => {
    const meetingSeat = items.find((item) => item.kind === 'meeting');
    const desk = items.find((item) => item.kind === 'desk');
    expect(meetingSeat && desk).toBeTruthy();
    if (!meetingSeat || !desk) return;
    expect(
      findPath(meetingSeat.approach, desk.approach, obstacles, RADIUS, OFFICE_FLOOR.bounds),
    ).not.toBeNull();
  });

  it('phòng CEO: không có thẻ thì cửa chặn, có thẻ thì vào ngồi bàn CEO được', () => {
    const desk = items.find((item) => item.kind === 'ceodesk');
    expect(desk).toBeDefined();
    if (!desk) return;
    expect(insideCeoRoom(OFFICE_FLOOR, desk.approach)).toBe(true);
    expect(
      findPath(OFFICE_FLOOR.spawn, desk.approach, obstacles, RADIUS, OFFICE_FLOOR.bounds),
    ).toBeNull();
    const ceo = officeObstacles(OFFICE_FLOOR, { ceo: true });
    const path = findPath(OFFICE_FLOOR.spawn, desk.approach, ceo, RADIUS, OFFICE_FLOOR.bounds);
    expect(path).not.toBeNull();
    // Điểm đi dạo của NPC không nằm trong phòng CEO.
    for (const spot of OFFICE_FLOOR.strollSpots)
      expect(insideCeoRoom(OFFICE_FLOOR, spot)).toBe(false);
  });

  it('ghế có chỗ ngồi, vật đứng dùng thì không', () => {
    for (const item of items) {
      if (item.pose === 'stand') expect(item.seat).toBeUndefined();
      else expect(item.seat).toBeDefined();
    }
  });
});

describe('vật tương tác gần nhất', () => {
  it('chọn vật gần nhất trong tầm, ngoài tầm thì null', () => {
    const coffee = items.find((item) => item.id === 'coffee');
    expect(coffee).toBeDefined();
    if (!coffee) return;
    const near = { x: coffee.approach.x - 0.3, z: coffee.approach.z };
    expect(nearestInteractable(near, items)?.id).toBe('coffee');
    expect(nearestInteractable({ x: 7.1, z: -2 }, items)).toBeNull();
  });
});

describe('SeatRegistry', () => {
  it('một ghế một người', () => {
    const seats = new SeatRegistry();
    expect(seats.claim('desk-0', 'player')).toBe(true);
    expect(seats.claim('desk-0', 'npc-1')).toBe(false);
    expect(seats.claim('desk-0', 'player')).toBe(true);
    seats.release('desk-0', 'npc-1');
    expect(seats.occupant('desk-0')).toBe('player');
    seats.release('desk-0', 'player');
    expect(seats.occupant('desk-0')).toBeNull();
  });
});

describe('buổi trong ngày', () => {
  it.each([
    [4, 'night'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'night'],
    [23, 'night'],
  ] as const)('%i giờ là %s', (hour, period) => {
    expect(periodOfDay(new Date(2026, 10, 2, hour, 30))).toBe(period);
  });

  it('isDayPeriod', () => {
    expect(DAY_PERIODS.every(isDayPeriod)).toBe(true);
    expect(isDayPeriod('evening')).toBe(false);
  });
});
