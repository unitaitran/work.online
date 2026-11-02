import {
  SHOP_ITEMS,
  xpForLevel,
  type AccountCreatedResponse,
  type InventoryResponse,
} from '@dilam/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { testConfig } from '../config';

let app: FastifyInstance;
let token: string;
let userId: string;

const auth = () => ({ authorization: `Bearer ${token}` });

beforeEach(async () => {
  app = buildApp({ config: testConfig(), gateway: { manualTick: true } });
  const res = await app.inject({ method: 'POST', url: '/api/accounts', payload: {} });
  ({ token, userId } = res.json<AccountCreatedResponse>());
});

afterEach(async () => {
  await app.close();
});

/** Cộng xu qua đúng đường ghi sổ cái (như phần thưởng). */
function giveCoins(amount: number, xp = 0): void {
  const state = app.game.engine.state(userId);
  const coins = state.coins + amount;
  app.game.engine.save(userId, { ...state, coins, xp: state.xp + xp });
  if (amount) app.repos.ledger.add(userId, Date.now(), amount, 'test', coins);
}

const ledger = () => app.repos.ledger;

const buy = (itemId: string) =>
  app.inject({ method: 'POST', url: '/api/shop/buy', headers: auth(), payload: { itemId } });

describe('cửa hàng', () => {
  it('danh mục ≥ 40 món, đủ loại; món rẻ nhất mua được sau 1-2 ngày, món hiếm cần khoảng 3 tuần', () => {
    expect(SHOP_ITEMS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    const cheapest = Math.min(...SHOP_ITEMS.map((i) => i.price));
    const priciest = Math.max(...SHOP_ITEMS.map((i) => i.price));
    // Một ngày chơi đủ giới hạn: 190 XP → 95 xu, cộng 3 việc sếp giao × 20 xu.
    const perDay = 95 + 60;
    expect(cheapest).toBeLessThanOrEqual(perDay * 2);
    expect(priciest / perDay).toBeGreaterThan(14);
    expect(priciest / perDay).toBeLessThan(28);
    for (const cat of ['top', 'hat', 'accessory', 'desk', 'chair', 'pet']) {
      expect(SHOP_ITEMS.some((i) => i.category === cat)).toBe(true);
    }
  });

  it('thiếu xu thì không mua được', async () => {
    const res = await buy('hat-cap');
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'rejected', reason: 'not_enough_coins' });
  });

  it('mua được, trừ xu, ghi sổ cái; không mua hai lần cùng món', async () => {
    giveCoins(500);
    const res = await buy('hat-cap');
    expect(res.statusCode).toBe(200);
    const inv = res.json<InventoryResponse>();
    expect(inv.coins).toBe(380);
    expect(inv.owned).toEqual(['hat-cap']);
    expect((await buy('hat-cap')).json()).toEqual({ error: 'rejected', reason: 'owned' });
    expect(ledger().sum(userId)).toBe(380);
  });

  it('món khoá theo chức danh', async () => {
    giveCoins(5000);
    expect((await buy('top-gold')).json()).toEqual({ error: 'rejected', reason: 'locked' });
    giveCoins(0, xpForLevel(150));
    expect((await buy('top-gold')).statusCode).toBe(200);
  });

  it('mua đồng thời hai yêu cầu không làm xu âm; sổ cái khớp tổng xu', async () => {
    giveCoins(1200);
    const results = await Promise.all([buy('pet-cat'), buy('pet-dog'), buy('pet-fish')]);
    const ok = results.filter((r) => r.statusCode === 200);
    expect(ok).toHaveLength(1);
    const coins = app.game.engine.state(userId).coins;
    expect(coins).toBeGreaterThanOrEqual(0);
    expect(ledger().sum(userId)).toBe(coins);
  });

  it('trang bị: chỉ món đã có; mỗi ô một món; bàn tối đa 3 món', async () => {
    giveCoins(5000);
    const equip = (itemId: string, on = true) =>
      app.inject({
        method: 'POST',
        url: '/api/shop/equip',
        headers: auth(),
        payload: { itemId, equip: on },
      });
    expect((await equip('hat-cap')).json()).toEqual({ error: 'rejected', reason: 'not_owned' });
    for (const id of [
      'hat-cap',
      'hat-beanie',
      'desk-mug',
      'desk-lamp',
      'desk-cactus',
      'desk-duck',
    ]) {
      await buy(id);
      await equip(id);
    }
    const inv = (await equip('hat-cap')).json<InventoryResponse>();
    expect(inv.equipped).toContain('hat-cap');
    expect(inv.equipped).not.toContain('hat-beanie');
    expect(inv.equipped.filter((id) => id.startsWith('desk-'))).toEqual([
      'desk-lamp',
      'desk-cactus',
      'desk-duck',
    ]);
    const off = (await equip('hat-cap', false)).json<InventoryResponse>();
    expect(off.equipped).not.toContain('hat-cap');
  });
});
