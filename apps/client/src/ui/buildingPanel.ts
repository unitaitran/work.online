// Bản đồ toà nhà: các tầng (phòng), số người đang ở; chạm một lần để chuyển tầng.
import type { BuildingResponse, RoomInfo } from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface BuildingApi {
  load(): Promise<BuildingResponse | null>;
  go(roomId: string): void;
  /** Tên hiển thị của phòng (công ty dùng tên riêng). */
  label(room: RoomInfo): string;
}

export function mountBuildingPanel(body: HTMLElement, api: BuildingApi): void {
  const s = STRINGS.building;
  const list = el('ul', { className: 'building-list' });
  body.append(list);
  void api.load().then((data) => {
    if (!data) return;
    // Tầng cao ở trên như toà nhà thật.
    const rooms = [...data.rooms].sort((a, b) => b.floor - a.floor);
    list.replaceChildren(
      ...rooms.map((room) => {
        const here = room.id === data.current;
        const fill = el('span', { className: 'building-fill' });
        fill.style.width = `${String(Math.round((room.online / Math.max(1, room.capacity)) * 100))}%`;
        const go = el('button', {
          className: here ? 'button button-soft' : 'button button-primary',
          text: here ? s.here : s.go,
          attrs: { type: 'button' },
        });
        go.disabled = here || room.online >= room.capacity;
        go.addEventListener('click', () => {
          api.go(room.id);
        });
        return el('li', {
          className: here ? 'is-here' : '',
          children: [
            el('div', {
              className: 'building-info',
              children: [
                el('strong', { text: room.floor > 0 ? s.floor(room.floor) : api.label(room) }),
                el('span', { text: api.label(room) }),
                el('span', { className: 'building-bar', children: [fill] }),
                el('span', { text: s.people(room.online, room.capacity) }),
              ],
            }),
            go,
          ],
        });
      }),
    );
  });
}
