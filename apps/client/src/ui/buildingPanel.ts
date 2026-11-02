// Bản đồ toà nhà: các tầng (phòng), số người đang ở; chạm một lần để chuyển tầng.
// Bên dưới: danh sách công ty người chơi đặt trong toà (theo tầng).
import { COMPANY_COLORS, provinceOf, type BuildingResponse, type RoomInfo } from '@dilam/shared';
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
  const companies = el('div', { className: 'building-companies' });
  body.append(list, companies);
  void api.load().then((data) => {
    if (!data) return;
    const mine = new Set(data.rooms.map((room) => room.id));
    companies.replaceChildren(
      el('h3', { text: s.companiesTitle(data.building) }),
      data.companies.length === 0
        ? el('p', { className: 'fortune-note', text: s.noCompanies })
        : el('ul', {
            className: 'company-list',
            children: [...data.companies]
              .sort((a, b) => b.floor - a.floor)
              .map((c) => {
                const icon = el('span', {
                  className: 'company-icon',
                  text: STRINGS.company.iconGlyph[c.icon] ?? '★',
                  attrs: { 'aria-hidden': 'true' },
                });
                icon.style.background = `#${(COMPANY_COLORS[c.color] ?? 0xff8a65).toString(16).padStart(6, '0')}`;
                const roomId = `company:${c.id}`;
                const isMine = mine.has(roomId);
                const actions: HTMLElement[] = [];
                if (isMine && data.current !== roomId) {
                  const enter = el('button', {
                    className: 'button button-primary',
                    text: s.enter,
                    attrs: { type: 'button' },
                  });
                  enter.addEventListener('click', () => {
                    api.go(roomId);
                  });
                  actions.push(enter);
                }
                return el('li', {
                  className: isMine ? 'is-here' : '',
                  children: [
                    el('div', {
                      className: 'company-head',
                      children: [
                        icon,
                        el('div', {
                          children: [
                            el('strong', {
                              className: 'company-name',
                              text: `${s.floor(c.floor)} · ${c.name}`,
                            }),
                            el('p', {
                              className: 'fortune-note',
                              text: `${STRINGS.company.industries[c.industry] ?? ''} · ${provinceOf(c.province)?.name ?? ''} · ${STRINGS.company.members(c.members + 1)} · ${s.people(c.online, c.members + 1)}${isMine ? ` · ${s.mine}` : ''}`,
                            }),
                          ],
                        }),
                      ],
                    }),
                    ...actions,
                  ],
                });
              }),
          }),
    );
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
