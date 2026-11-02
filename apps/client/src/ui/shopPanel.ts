// Cửa hàng: danh mục theo loại, mua bằng xu (server kiểm tra và ghi sổ cái), mặc/tháo,
// và khung xem thử 3D nhân vật mặc món đang xem. Khung xem thử dùng một renderer nhỏ riêng,
// đóng cửa hàng thì giải phóng toàn bộ (renderer, hình học, vật liệu).
import {
  equipmentFromIds,
  equippedIds,
  ITEM_CATEGORIES,
  SHOP_ITEMS,
  titleFor,
  titleName,
  type Appearance,
  type InventoryResponse,
  type ItemCategory,
  type ShopItem,
} from '@dilam/shared';
import {
  AmbientLight,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { AvatarModel } from '../avatar/avatarModel';
import { Companions } from '../avatar/companions';
import { gearFromEquipped } from '../avatar/gear';
import { createVertexColorMaterial } from '../engine/meshBuilder';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface ShopPanelOptions {
  appearance: Appearance;
  xp: number;
  load(): Promise<InventoryResponse | null>;
  buy(
    itemId: string,
  ): Promise<{ ok: true; inventory: InventoryResponse } | { ok: false; error: string }>;
  equip(
    itemId: string,
    equip: boolean,
  ): Promise<{ ok: true; inventory: InventoryResponse } | { ok: false; error: string }>;
  onInventory(inventory: InventoryResponse): void;
}

/** Renderer nhỏ riêng cho khung xem thử; máy không có WebGL thì bỏ khung xem thử. */
function createPreviewRenderer(canvas: HTMLCanvasElement): WebGLRenderer | null {
  try {
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(220, 260, false);
    return renderer;
  } catch {
    return null;
  }
}

/** Khung xem thử 3D: nhân vật mặc đồ hiện tại + món đang xem, xoay bằng kéo. */
class Preview {
  readonly canvas = el('canvas', { className: 'shop-preview-canvas' });
  private readonly renderer: WebGLRenderer | null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.1, 20);
  private readonly material = createVertexColorMaterial();
  private readonly turntable = new Group();
  private avatar: AvatarModel | null = null;
  private companions: Companions | null = null;
  private yaw = 0.5;
  private dragging = false;
  private lastX = 0;
  private frame = 0;
  private last = performance.now();
  private pose: 'stand' | 'type' = 'stand';

  constructor() {
    this.renderer = createPreviewRenderer(this.canvas);
    this.camera.aspect = 220 / 260;
    this.camera.position.set(0, 0.9, 3.2);
    this.camera.lookAt(0, 0.55, 0);
    this.camera.updateProjectionMatrix();
    this.scene.add(new AmbientLight(0xffffff, 1.6), this.turntable);
    const sun = new DirectionalLight(0xffffff, 1.8);
    sun.position.set(2, 3, 2);
    this.scene.add(sun);
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * 0.012;
      this.lastX = e.clientX;
    });
    const stop = (): void => {
      this.dragging = false;
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.dragging) this.yaw += dt * 0.5;
      this.turntable.rotation.y = this.yaw;
      this.avatar?.update(dt);
      this.companions?.update(dt, { x: 0, z: 0, facing: 0, pose: this.pose });
      this.renderer?.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  show(appearance: Appearance, equipped: string[], pose: 'stand' | 'type'): void {
    this.avatar?.dispose();
    this.companions?.dispose();
    this.pose = pose;
    this.avatar = new AvatarModel(appearance, this.material, gearFromEquipped(equipped));
    this.avatar.setPose(pose);
    this.turntable.add(this.avatar.root);
    this.companions = new Companions(equipped, this.material);
    this.turntable.add(this.companions.group);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.avatar?.dispose();
    this.companions?.dispose();
    this.material.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }
}

export function mountShopPanel(body: HTMLElement, o: ShopPanelOptions): { dispose(): void } {
  const s = STRINGS.shop;
  let category: ItemCategory = 'top';
  let inventory: InventoryResponse = { coins: 0, owned: [], equipped: [] };
  let selected: ShopItem | null = null;
  const myTitle = titleFor(o.xp);

  const preview = new Preview();
  const coins = el('p', { className: 'shop-coins' });
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const tabs = el('div', { className: 'profile-tabs', attrs: { role: 'tablist' } });
  const grid = el('div', { className: 'shop-grid' });
  const detail = el('div', { className: 'shop-detail' });

  /** Đồ đang mặc + món đang xem (để xem thử). */
  const tryOn = (item: ShopItem | null): string[] => {
    const e = equipmentFromIds(inventory.equipped);
    if (item) {
      if (item.category === 'desk')
        e.desk = [...e.desk.filter((id) => id !== item.id), item.id].slice(-3);
      else e[item.category] = item.id;
    }
    return equippedIds(e);
  };

  const say = (text: string, tone: 'ok' | 'error'): void => {
    message.textContent = text;
    message.dataset.tone = tone;
  };

  const renderDetail = (): void => {
    const item = selected;
    if (!item) {
      detail.replaceChildren();
      return;
    }
    const owned = inventory.owned.includes(item.id);
    const equipped = inventory.equipped.includes(item.id);
    const locked = item.minTitle !== undefined && myTitle < item.minTitle;
    const actions: HTMLElement[] = [];
    if (!owned) {
      const buy = el('button', {
        className: 'button button-primary',
        text: `${s.buy} · ${s.price(item.price)}`,
        attrs: { type: 'button' },
      });
      buy.disabled = locked || inventory.coins < item.price;
      buy.addEventListener('click', () => {
        buy.disabled = true;
        void o.buy(item.id).then((result) => {
          if (result.ok) {
            inventory = result.inventory;
            o.onInventory(inventory);
            say(s.bought(item.name), 'ok');
          } else say(s.errors[result.error] ?? STRINGS.net.actionFailed, 'error');
          render();
        });
      });
      actions.push(buy);
    } else {
      const toggle = el('button', {
        className: equipped ? 'button button-soft' : 'button button-primary',
        text: equipped ? s.unequip : s.equip,
        attrs: { type: 'button' },
      });
      toggle.addEventListener('click', () => {
        toggle.disabled = true;
        void o.equip(item.id, !equipped).then((result) => {
          if (result.ok) {
            inventory = result.inventory;
            o.onInventory(inventory);
          } else say(s.errors[result.error] ?? STRINGS.net.actionFailed, 'error');
          render();
        });
      });
      actions.push(toggle);
    }
    detail.replaceChildren(
      el('p', { className: 'shop-item-name', text: item.name }),
      el('p', {
        className: `shop-rarity rarity-${item.rarity}`,
        text: `${s.rarity[item.rarity] ?? ''}${owned ? ` · ${equipped ? s.equipped : s.owned}` : ''}`,
      }),
      el('p', { className: 'activity-intro', text: item.description }),
      ...(locked && item.minTitle !== undefined
        ? [el('p', { className: 'fortune-note', text: s.locked(titleName(item.minTitle, null)) })]
        : []),
      el('div', { className: 'activity-actions', children: actions }),
    );
  };

  const render = (): void => {
    coins.textContent = s.coins(inventory.coins);
    tabs.replaceChildren(
      ...ITEM_CATEGORIES.map((cat) => {
        const b = el('button', {
          className: 'profile-tab',
          text: s.categories[cat] ?? cat,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(cat === category) },
        });
        b.addEventListener('click', () => {
          category = cat;
          selected = null;
          render();
        });
        return b;
      }),
    );
    grid.replaceChildren(
      ...SHOP_ITEMS.filter((item) => item.category === category).map((item) => {
        const owned = inventory.owned.includes(item.id);
        const card = el('button', {
          className: `shop-card rarity-${item.rarity}${selected?.id === item.id ? ' is-selected' : ''}`,
          attrs: { type: 'button', 'aria-pressed': String(selected?.id === item.id) },
          children: [
            el('span', { className: 'shop-swatch', attrs: { 'aria-hidden': 'true' } }),
            el('strong', { text: item.name }),
            el('span', {
              text: owned
                ? inventory.equipped.includes(item.id)
                  ? s.equipped
                  : s.owned
                : s.price(item.price),
            }),
          ],
        });
        const swatch = card.querySelector<HTMLElement>('.shop-swatch');
        if (swatch) swatch.style.background = `#${item.color.toString(16).padStart(6, '0')}`;
        card.addEventListener('click', () => {
          selected = item;
          render();
        });
        return card;
      }),
    );
    const pose =
      selected && (selected.category === 'desk' || selected.category === 'chair')
        ? 'type'
        : 'stand';
    preview.show(o.appearance, tryOn(selected), pose);
    renderDetail();
  };

  body.append(
    coins,
    el('div', {
      className: 'shop-layout',
      children: [
        el('div', {
          className: 'shop-preview',
          children: [preview.canvas, el('p', { className: 'fortune-note', text: s.previewHint })],
        }),
        el('div', { className: 'shop-side', children: [tabs, grid] }),
      ],
    }),
    detail,
    message,
    el('p', { className: 'fortune-note', text: s.note }),
  );
  render();
  void o.load().then((inv) => {
    if (inv) {
      inventory = inv;
      render();
    }
  });
  return {
    dispose() {
      preview.dispose();
    },
  };
}
