// Bản đồ công ty: sơ đồ Việt Nam vẽ bằng SVG (chấm theo toạ độ gần đúng của 34 tỉnh, thành), số
// công ty ở mỗi nơi; chạm một tỉnh để lọc. Danh sách gọn có tìm, lọc, sắp xếp và chia trang.
import {
  COMPANY_COLORS,
  POSITION_NAMES,
  positionFor,
  PROVINCES,
  provinceOf,
  type CompanyPublic,
} from '@dilam/shared';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface CompanyMapApi {
  load(): Promise<CompanyPublic[] | null>;
  /** Nộp đơn; null là thành công, ngược lại là mã lỗi. */
  apply(companyId: string): Promise<string | null>;
  /** Cấp hiện tại của người chơi (lọc "Hợp cấp mình"). */
  level?(): number;
  /** Vào công ty bằng mã mời; null là thành công, ngược lại là mã lỗi. */
  join(code: string): Promise<string | null>;
  /** Vào được công ty (để màn ngoài cập nhật nơi làm). */
  onJoined?(): void;
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

export function mountCompanyMapPanel(body: HTMLElement, api: CompanyMapApi): void {
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const mapBox = el('div', { className: 'company-map-box' });
  const filterBar = el('div', { className: 'company-map-filter' });
  const list = el('div', { className: 'company-map-list' });
  // Có mã mời thì vào thẳng công ty, không cần nộp đơn.
  const c = STRINGS.company;
  const codeInput = el('input', {
    className: 'creator-input',
    attrs: {
      type: 'text',
      placeholder: c.joinCodePlaceholder,
      'aria-label': c.joinCode,
      autocomplete: 'off',
    },
  });
  const joinButton = el('button', {
    className: 'button button-primary',
    text: c.join,
    attrs: { type: 'button' },
  });
  joinButton.addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (!code) return;
    joinButton.disabled = true;
    void api.join(code).then((error) => {
      joinButton.disabled = false;
      message.textContent = error ? (c.errors[error] ?? STRINGS.net.actionFailed) : s.joined;
      message.dataset.tone = error ? 'error' : 'ok';
      if (!error) {
        codeInput.value = '';
        api.onJoined?.();
      }
    });
  });
  body.append(
    el('section', {
      className: 'company-card company-card-code',
      children: [
        el('span', { className: 'company-card-label', text: c.joinCode }),
        el('div', { className: 'creator-name-row', children: [codeInput, joinButton] }),
      ],
    }),
    el('p', { className: 'activity-intro', text: s.intro }),
    el('div', {
      className: 'company-map-layout',
      children: [mapBox, el('div', { className: 'map-side', children: [filterBar, list] })],
    }),
    message,
  );
  list.append(el('p', { className: 'fortune-note', text: s.loading }));

  let companies: CompanyPublic[] = [];
  let selected: string | null = null;
  const applied = new Set<string>();

  /** Vị trí mình vào được ở công ty này (theo cấp hiện tại), để người xem biết ngay. */
  const fitText = (c: CompanyPublic): string => {
    const level = api.level?.();
    if (level === undefined || !c.hiring) return '';
    const position = positionFor(c.hiringBands, level);
    return position ? s.fits(POSITION_NAMES[position]) : '';
  };

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
                  text: `${STRINGS.company.industries[c.industry] ?? ''} · ${provinceOf(c.province)?.name ?? ''} · ${STRINGS.company.members(c.members + 1)}${online ? ` · ${online}` : ''}`,
                }),
                ...(fitText(c) ? [el('p', { className: 'map-fit', text: fitText(c) })] : []),
              ],
            }),
          ],
        }),
        apply,
      ],
    });
  };

  // ---------- Tìm, lọc, sắp xếp, chia trang (chịu được rất nhiều công ty) ----------
  const search = el('input', {
    className: 'creator-input map-search',
    attrs: { type: 'search', placeholder: s.searchPlaceholder, 'aria-label': s.searchPlaceholder },
  });
  const chip = (text: string): HTMLButtonElement =>
    el('button', {
      className: 'auth-tab',
      text,
      attrs: { type: 'button', 'aria-pressed': 'false' },
    });
  const hiringOnly = chip(s.filterHiring);
  const fitsMe = chip(s.filterFits);
  const sort = el('select', { className: 'map-sort', attrs: { 'aria-label': s.sortLabel } });
  for (const [value, label] of [
    ['members', s.sortMembers],
    ['online', s.sortOnline],
    ['newest', s.sortStage],
    ['name', s.sortName],
  ] as const) {
    sort.append(el('option', { text: label, attrs: { value } }));
  }
  const provinceChip = el('button', { className: 'auth-tab is-active', attrs: { type: 'button' } });
  provinceChip.hidden = true;
  provinceChip.addEventListener('click', () => {
    selected = null;
    shown = PAGE;
    render();
  });
  const resultCount = el('p', { className: 'fortune-note map-count' });
  filterBar.append(
    search,
    el('div', { className: 'map-chips', children: [hiringOnly, fitsMe, provinceChip, sort] }),
    resultCount,
  );
  const toggle = (b: HTMLButtonElement): void => {
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-active', on);
      shown = PAGE;
      render();
    });
  };
  toggle(hiringOnly);
  toggle(fitsMe);
  let searchTimer: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      shown = PAGE;
      render();
    }, 150);
  });
  sort.addEventListener('change', () => {
    shown = PAGE;
    render();
  });
  list.before(filterBar);

  const PAGE = 20;
  let shown = PAGE;
  const fold = (text: string): string =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .toLowerCase();

  const visible = (): CompanyPublic[] => {
    const q = fold(search.value.trim());
    const level = api.level?.() ?? null;
    const rows = companies.filter((c) => {
      if (selected && c.province !== selected) return false;
      if (hiringOnly.getAttribute('aria-pressed') === 'true' && !c.hiring) return false;
      if (fitsMe.getAttribute('aria-pressed') === 'true') {
        if (level === null || !c.hiring || positionFor(c.hiringBands, level) === null) return false;
      }
      if (q && !fold(`${c.name} ${provinceOf(c.province)?.name ?? ''}`).includes(q)) return false;
      return true;
    });
    const by = sort.value;
    rows.sort((a, b) =>
      by === 'online'
        ? b.online - a.online
        : by === 'newest'
          ? b.stage - a.stage
          : by === 'name'
            ? a.name.localeCompare(b.name, 'vi')
            : b.members - a.members,
    );
    return rows;
  };

  const render = (): void => {
    const counts = countByProvince(companies);
    mapBox.replaceChildren(
      drawMap(counts, (id) => {
        selected = selected === id ? null : id;
        shown = PAGE;
        render();
      }),
    );
    provinceChip.hidden = selected === null;
    provinceChip.textContent = selected ? `${provinceOf(selected)?.name ?? ''} ✕` : '';
    const rows = visible();
    resultCount.textContent = s.results(rows.length, companies.length);
    if (rows.length === 0) {
      list.replaceChildren(el('p', { className: 'fortune-note', text: s.empty }));
      return;
    }
    const more = el('button', {
      className: 'button button-soft map-more',
      text: s.more(rows.length - shown),
      attrs: { type: 'button' },
    });
    more.addEventListener('click', () => {
      shown += PAGE;
      render();
    });
    list.replaceChildren(
      el('ul', { className: 'company-list map-rows', children: rows.slice(0, shown).map(card) }),
      ...(rows.length > shown ? [more] : []),
    );
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
