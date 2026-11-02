// Bản đồ công ty: sơ đồ Việt Nam vẽ bằng SVG (chấm theo toạ độ gần đúng của 34 tỉnh, thành), số
// công ty ở mỗi nơi; chạm một tỉnh để lọc danh sách. Danh sách nhóm theo miền, tỉnh/thành.
import {
  COMPANY_COLORS,
  POSITION_NAMES,
  POSITIONS,
  PROVINCES,
  provinceOf,
  REGION_NAMES,
  type CompanyPublic,
  type Province,
  type Region,
} from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface CompanyMapApi {
  load(): Promise<CompanyPublic[] | null>;
  /** Nộp đơn; null là thành công, ngược lại là mã lỗi. */
  apply(companyId: string): Promise<string | null>;
}

const s = STRINGS.companyMap;
const SVG = 'http://www.w3.org/2000/svg';
const W = 300;
const H = 420;
const LON0 = 102;
const LON1 = 115;
const LAT0 = 8.4;
const LAT1 = 23.6;

/** Chiếu kinh độ / vĩ độ lên khung SVG (phép chiếu phẳng, đủ cho sơ đồ). */
export function project(lat: number, lon: number): { x: number; y: number } {
  return {
    x: Math.round(((lon - LON0) / (LON1 - LON0)) * W * 10) / 10,
    y: Math.round(((LAT1 - lat) / (LAT1 - LAT0)) * H * 10) / 10,
  };
}

/** Đếm công ty theo tỉnh. */
export function countByProvince(companies: readonly CompanyPublic[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of companies) counts.set(c.province, (counts.get(c.province) ?? 0) + 1);
  return counts;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

const pointOf = (id: string): string => {
  const p = provinceOf(id);
  if (!p) return '';
  const { x, y } = project(p.lat, p.lon);
  return `${String(x)},${String(y)}`;
};

/** Dải đất hình chữ S: vài đường nối các tỉnh, nét dày bo tròn. */
const LAND_NORTH = [
  'dien-bien',
  'lai-chau',
  'lao-cai',
  'cao-bang',
  'lang-son',
  'quang-ninh',
  'hai-phong',
  'ninh-binh',
  'thanh-hoa',
  'son-la',
];
const LAND_SPINE = [
  'ha-noi',
  'thanh-hoa',
  'nghe-an',
  'ha-tinh',
  'quang-tri',
  'hue',
  'da-nang',
  'quang-ngai',
  'gia-lai',
  'khanh-hoa',
  'lam-dong',
  'dong-nai',
  'ho-chi-minh',
  'can-tho',
  'ca-mau',
];
const LAND_WEST = ['gia-lai', 'dak-lak', 'lam-dong', 'tay-ninh', 'an-giang', 'ca-mau'];

function drawMap(counts: Map<string, number>, onPick: (id: string) => void): SVGSVGElement {
  const root = svg('svg', {
    viewBox: `0 0 ${String(W)} ${String(H)}`,
    class: 'company-map',
    role: 'img',
    'aria-label': s.title,
  });
  root.append(
    svg('polygon', { points: LAND_NORTH.map(pointOf).join(' '), class: 'map-land' }),
    svg('polyline', { points: LAND_SPINE.map(pointOf).join(' '), class: 'map-land map-strip' }),
    svg('polyline', { points: LAND_WEST.map(pointOf).join(' '), class: 'map-land map-strip-thin' }),
  );
  // Hai quần đảo (chỉ là chấm trang trí, không đặt công ty).
  const islands: [number, number, string][] = [
    [16.5, 112.1, 'Hoàng Sa'],
    [10.0, 113.9, 'Trường Sa'],
  ];
  for (const [lat, lon, label] of islands) {
    const { x, y } = project(lat, lon);
    for (const [dx, dy] of [
      [0, 0],
      [6, 4],
      [-5, 6],
      [3, -6],
    ] as const) {
      root.append(svg('circle', { cx: x + dx, cy: y + dy, r: 1.8, class: 'map-island' }));
    }
    const text = svg('text', { x, y: y + 18, class: 'map-label', 'text-anchor': 'middle' });
    text.textContent = label;
    root.append(text);
  }
  for (const province of PROVINCES) {
    const { x, y } = project(province.lat, province.lon);
    const n = counts.get(province.id) ?? 0;
    const group = svg('g', {
      class: `map-dot${n > 0 ? ' has-company' : ''}${province.city ? ' is-city' : ''}`,
      tabindex: 0,
      role: 'button',
      'aria-label': `${province.name}: ${s.count(n)}`,
    });
    const title = svg('title', {});
    title.textContent = `${province.name} · ${s.count(n)}`;
    group.append(title, svg('circle', { cx: x, cy: y, r: n > 0 ? 5 + Math.min(6, n) : 2.6 }));
    if (n > 0) {
      const label = svg('text', { x, y: y + 3.2, 'text-anchor': 'middle', class: 'map-count' });
      label.textContent = String(n);
      group.append(label);
    }
    const pick = (): void => {
      onPick(province.id);
    };
    group.addEventListener('click', pick);
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        pick();
      }
    });
    root.append(group);
  }
  return root;
}

function bandsText(c: CompanyPublic): string {
  if (!c.hiring) return s.notHiring;
  return POSITIONS.flatMap((position) => {
    const band = c.hiringBands[position];
    return band ? [`${POSITION_NAMES[position]} ${s.hiringBand(band.min, band.max)}`] : [];
  }).join(' · ');
}

export function mountCompanyMapPanel(body: HTMLElement, api: CompanyMapApi): void {
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const mapBox = el('div', { className: 'company-map-box' });
  const filterBar = el('div', { className: 'company-map-filter' });
  const list = el('div', { className: 'company-map-list' });
  body.append(
    el('p', { className: 'activity-intro', text: s.intro }),
    el('div', { className: 'company-map-layout', children: [mapBox, list] }),
    message,
  );
  list.append(el('p', { className: 'fortune-note', text: s.loading }));

  let companies: CompanyPublic[] = [];
  let selected: string | null = null;
  const applied = new Set<string>();

  const card = (c: CompanyPublic): HTMLElement => {
    const icon = el('span', {
      className: 'company-icon',
      text: STRINGS.company.iconGlyph[c.icon] ?? '★',
      attrs: { 'aria-hidden': 'true' },
    });
    icon.style.background = `#${(COMPANY_COLORS[c.color] ?? 0xff8a65).toString(16).padStart(6, '0')}`;
    const apply = el('button', {
      className: 'button button-soft',
      text: applied.has(c.id) ? STRINGS.company.applied : s.apply,
      attrs: { type: 'button' },
    });
    apply.disabled = !c.hiring || applied.has(c.id);
    apply.addEventListener('click', () => {
      apply.disabled = true;
      void api.apply(c.id).then((error) => {
        if (error) {
          apply.disabled = false;
          message.textContent = STRINGS.company.errors[error] ?? STRINGS.net.actionFailed;
          message.dataset.tone = 'error';
          return;
        }
        applied.add(c.id);
        apply.textContent = STRINGS.company.applied;
        message.textContent = s.applied;
        message.dataset.tone = 'ok';
      });
    });
    const online = s.online(c.online);
    return el('li', {
      className: 'company-map-item',
      children: [
        el('div', {
          className: 'company-head',
          children: [
            icon,
            el('div', {
              children: [
                el('strong', { className: 'company-name', text: c.name }),
                el('p', {
                  className: 'fortune-note',
                  text: `${STRINGS.company.industries[c.industry] ?? ''} · ${STRINGS.company.stages[c.stage] ?? ''} · ${STRINGS.company.floorLabel(c.building, c.floor)} · ${STRINGS.company.members(c.members + 1)}${online ? ` · ${online}` : ''}`,
                }),
                el('p', { className: 'fortune-note', text: bandsText(c) }),
              ],
            }),
          ],
        }),
        apply,
      ],
    });
  };

  const render = (): void => {
    const counts = countByProvince(companies);
    mapBox.replaceChildren(
      drawMap(counts, (id) => {
        selected = selected === id ? null : id;
        render();
      }),
    );
    const all = el('button', {
      className: `auth-tab${selected === null ? ' is-active' : ''}`,
      text: `${s.all} (${String(companies.length)})`,
      attrs: { type: 'button' },
    });
    all.addEventListener('click', () => {
      selected = null;
      render();
    });
    filterBar.replaceChildren(all);
    if (selected) {
      filterBar.append(
        el('span', { className: 'auth-tab is-active', text: provinceOf(selected)?.name ?? '' }),
      );
    }
    const groups: HTMLElement[] = [filterBar];
    for (const region of ['north', 'central', 'south'] as Region[]) {
      const provinces = PROVINCES.filter(
        (p: Province) => p.region === region && (selected === null || p.id === selected),
      );
      const sections = provinces.flatMap((p) => {
        const here = companies.filter((c) => c.province === p.id);
        if (here.length === 0 && selected === null) return [];
        return [
          el('section', {
            className: 'company-map-province',
            children: [
              el('h4', { text: `${p.name} · ${s.count(here.length)}` }),
              here.length === 0
                ? el('p', { className: 'fortune-note', text: s.empty })
                : el('ul', { className: 'company-list', children: here.map(card) }),
            ],
          }),
        ];
      });
      if (sections.length > 0) groups.push(el('h3', { text: REGION_NAMES[region] }), ...sections);
    }
    if (groups.length === 1) groups.push(el('p', { className: 'fortune-note', text: s.empty }));
    list.replaceChildren(...groups);
  };

  void api.load().then((data) => {
    if (!data) {
      list.replaceChildren(el('p', { className: 'activity-message', text: s.failed }));
      return;
    }
    companies = data;
    render();
  });
}
