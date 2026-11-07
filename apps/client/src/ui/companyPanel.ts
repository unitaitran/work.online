// Công ty (Phase 6): mở công ty, điều hành (dự án, nhân viên NPC, sự kiện, nâng cấp, IPO),
// nhân sự (đơn xin việc, mã mời, thăng chức, giao việc, cho nghỉ), danh bạ và lời mời làm việc.
// Mọi số liệu do server tính; panel chỉ hiển thị và gửi yêu cầu.
import {
  COMPANY,
  COMPANY_COLORS,
  COMPANY_PERKS,
  COMPANY_SHOP,
  COMPANY_ICONS,
  INDUSTRIES,
  MISSION_TEMPLATES,
  PROVINCES,
  provinceOf,
  REGION_NAMES,
  validateLadder,
  HIRING_MAX_LEVEL,
  DEFAULT_PROVINCE,
  GLOBAL_UNLOCK,
  LADDER_NAME_MAX,
  MAX_LADDER_STEPS,
  type CompanyLadder,
  type LadderStep,
  stageConfig,
  offerDone,
  type CompanyDetail,
  type CompanyPublic,
  type MyCompanyResponse,
} from '@dilam/shared';
import { projectNameOf } from './projectName';
import { staffName } from '../npc/roster';
import { STRINGS } from '../strings';
import { el } from './dom';

export type CallResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface CompanyApi {
  get<T>(path: string): Promise<T | null>;
  post<T>(path: string, body?: unknown): Promise<CallResult<T>>;
  /** Vào phòng công ty (WebSocket switch_room). */
  enterRoom(companyId: string): void;
  /** Đang ở phòng công ty nào (null nếu ở văn phòng chung). */
  currentCompanyRoom(): string | null;
  /** Vừa nghỉ việc: ra hẳn khỏi văn phòng (về sảnh) để mở công ty hoặc tìm việc khác. */
  onLeft?(): void;
  /** Vừa mua đồ / đổi tên / mặc hoặc thay đồng phục: cảnh tải lại phòng và áo của mình. */
  onChanged?(): void;
}

const s = STRINGS.company;

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

function positionText(position: string | null): string {
  return position ? s.people.position(position) : s.people.noPosition;
}

export function npcName(nameIndex: number): string {
  return staffName(nameIndex);
}

function employerText(employer: string | null): string {
  if (employer === null) return s.employer.none ?? '';
  if (employer.startsWith('npc:')) return s.npcEmployer(employer.slice(4));
  return s.employer[employer] ?? employer;
}

function companyBadge(c: CompanyPublic): HTMLElement {
  const icon = el('span', {
    className: 'company-icon company-icon-large',
    text: s.iconGlyph[c.icon] ?? '★',
    attrs: { 'aria-hidden': 'true' },
  });
  const colorHex = hex(COMPANY_COLORS[c.color] ?? 0xff8a65);
  icon.style.background = colorHex;
  icon.style.boxShadow = `0 4px 16px ${colorHex}55`;

  const tags = el('div', {
    className: 'company-tag-row',
    children: [
      el('span', {
        className: 'badge-pill badge-industry',
        text: `🏷️ ${s.industries[c.industry] ?? c.industry}`,
      }),
      el('span', { className: 'badge-pill badge-stage', text: `🏢 ${s.stages[c.stage] ?? ''}` }),
      el('span', {
        className: 'badge-pill badge-location',
        text: `📍 ${provinceOf(c.province)?.name ?? ''} (${s.floorLabel(c.building, c.floor)})`,
      }),
      el('span', { className: 'badge-pill badge-members', text: `👥 ${s.members(c.members + 1)}` }),
    ],
  });

  return el('div', {
    className: 'company-head company-head-hero',
    children: [
      icon,
      el('div', {
        className: 'company-head-details',
        children: [el('h3', { className: 'company-name-hero', text: c.name }), tags],
      }),
    ],
  });
}

export function mountCompanyPanel(body: HTMLElement, api: CompanyApi): { refresh(): void } {
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const content = el('div', { className: 'company-content' });
  let tab: 'overview' | 'projects' | 'people' | 'ladder' | 'feed' | 'shop' = 'overview';
  let inviteCode: string | null = null;
  let leaveArmed = false;
  /** Tìm / lọc danh sách nhân viên (giữ qua các lần tải lại). */
  let memberQuery = '';
  let memberFilter = 'all';

  const say = (text: string, tone: 'ok' | 'error' = 'error'): void => {
    message.textContent = text;
    message.dataset.tone = tone;
  };

  const act = async <T>(path: string, payload?: unknown): Promise<T | null> => {
    const r = await api.post<T>(path, payload);
    if (!r.ok) {
      say(s.errors[r.reason] ?? STRINGS.net.actionFailed);
      return null;
    }
    message.textContent = '';
    return r.value;
  };

  const button = (
    text: string,
    onClick: () => void,
    primary = false,
    disabled = false,
  ): HTMLButtonElement => {
    const b = el('button', {
      className: primary ? 'button button-primary' : 'button button-soft',
      text,
      attrs: { type: 'button' },
    });
    b.disabled = disabled;
    b.addEventListener('click', () => {
      b.disabled = true;
      onClick();
    });
    return b;
  };

  // ---------- Không thuộc công ty người chơi nào ----------

  const renderOutside = (my: MyCompanyResponse): HTMLElement[] => {
    const card = (className: string, children: HTMLElement[]): HTMLElement =>
      el('section', { className: `company-card ${className}`, children });

    // Nơi đang làm (+ nút rời / quay lại Công Sở).
    const action =
      my.employer === null
        ? button(s.rejoin, () => {
            void act('/api/company/rejoin-default').then(load);
          })
        : my.employer.startsWith('company:')
          ? null
          : button(leaveArmed ? s.leaveConfirm : s.leave, () => {
              if (!leaveArmed) {
                leaveArmed = true;
                void load();
                return;
              }
              leaveArmed = false;
              void act('/api/company/leave').then((done) => {
                if (done && api.onLeft) api.onLeft();
                else void load();
              });
            });
    if (action) action.classList.add('company-card-action');
    const parts: HTMLElement[] = [
      card('company-card-job', [
        el('span', {
          className: 'company-card-icon',
          text: '🏢',
          attrs: { 'aria-hidden': 'true' },
        }),
        el('div', {
          className: 'company-card-text',
          children: [
            el('small', { text: s.currentJob }),
            el('strong', { text: employerText(my.employer) }),
          ],
        }),
        ...(action ? [action] : []),
      ]),
    ];
    if (my.badges.length > 0) {
      parts.push(
        el('p', {
          className: 'company-badges',
          text: `${s.badges}: ${my.badges.map((b) => s.badgeIpo(b.replace('ipo-', ''))).join(' · ')}`,
        }),
      );
    }
    // Lời mời làm việc từ công ty NPC.
    for (const offer of my.offers) {
      parts.push(
        card('company-offer', [
          el('div', {
            className: 'company-card-text',
            children: [
              el('strong', { text: s.offers }),
              el('p', { text: s.offerText(offer.companyName) }),
            ],
          }),
          el('div', {
            className: 'activity-actions',
            children: [
              button(s.decline, () => {
                void act('/api/company/offer', { offerId: offer.id, accept: false }).then(load);
              }),
              button(
                s.accept,
                () => {
                  void act('/api/company/offer', { offerId: offer.id, accept: true }).then(load);
                },
                true,
              ),
            ],
          }),
        ]),
      );
    }

    // Mở công ty riêng: điều kiện dạng ô ✓ / ○ và số đã đạt.
    const needs = s.found.needs;
    const ids = ['level', 'employed', 'capital', 'owner'] as const;
    const met = ids.filter((id) => !my.found.missing.includes(id)).length;
    parts.push(
      card('company-card-found', [
        el('div', {
          className: 'company-card-title',
          children: [
            el('span', { text: `🚀 ${s.found.title}` }),
            el('span', {
              className: 'company-card-count',
              text: s.found.progress(met, ids.length),
            }),
          ],
        }),
        el('ul', {
          className: 'need-grid',
          children: ids.map((id) => {
            const ok = !my.found.missing.includes(id);
            return el('li', {
              className: ok ? 'need is-met' : 'need',
              children: [
                el('span', {
                  className: 'need-mark',
                  text: ok ? '✓' : '○',
                  attrs: { 'aria-hidden': 'true' },
                }),
                el('span', {
                  text: id === 'capital' ? needs.capital(my.found.capital) : needs[id],
                }),
              ],
            });
          }),
        }),
        ...(my.found.ok ? [renderFoundForm(my.found.capital)] : []),
      ]),
    );

    return parts;
  };

  const renderFoundForm = (capital: number): HTMLElement => {
    const name = el('input', {
      className: 'save-code',
      attrs: {
        type: 'text',
        placeholder: s.found.namePlaceholder,
        'aria-label': s.found.name,
        maxlength: '40',
      },
    });
    const industry = el('select', {
      className: 'board-select',
      attrs: { 'aria-label': s.found.industry },
    });
    for (const id of INDUSTRIES)
      industry.append(el('option', { text: s.industries[id] ?? id, attrs: { value: id } }));
    let color = 0;
    let icon: (typeof COMPANY_ICONS)[number] = 'star';
    const colors = el('div', {
      className: 'company-swatches',
      attrs: { role: 'radiogroup', 'aria-label': s.found.color },
    });
    COMPANY_COLORS.forEach((c, i) => {
      const sw = el('button', {
        className: 'company-swatch',
        attrs: {
          type: 'button',
          role: 'radio',
          'aria-checked': String(i === color),
          'aria-label': `${s.found.color} ${String(i + 1)}`,
        },
      });
      sw.style.background = hex(c);
      sw.addEventListener('click', () => {
        color = i;
        for (const other of colors.children) other.setAttribute('aria-checked', 'false');
        sw.setAttribute('aria-checked', 'true');
      });
      colors.append(sw);
    });
    const icons = el('select', {
      className: 'board-select',
      attrs: { 'aria-label': s.found.icon },
    });
    for (const id of COMPANY_ICONS)
      icons.append(el('option', { text: s.icons[id] ?? id, attrs: { value: id } }));
    // Tỉnh/thành đặt trụ sở, nhóm theo miền.
    const province = el('select', {
      className: 'board-select',
      attrs: { 'aria-label': s.found.province },
    });
    for (const region of ['north', 'central', 'south'] as const) {
      const group = el('optgroup', { attrs: { label: REGION_NAMES[region] } });
      for (const p of PROVINCES.filter((item) => item.region === region)) {
        const option = el('option', { text: p.name, attrs: { value: p.id } });
        option.selected = p.id === DEFAULT_PROVINCE;
        group.append(option);
      }
      province.append(group);
    }
    icons.addEventListener('change', () => {
      icon = icons.value as typeof icon;
    });
    return el('div', {
      className: 'company-form',
      children: [
        el('label', { text: s.found.name }),
        name,
        el('label', { text: s.found.industry }),
        industry,
        el('label', { text: s.found.color }),
        colors,
        el('label', { text: s.found.icon }),
        icons,
        el('label', { text: s.found.province }),
        province,
        el('p', { className: 'fortune-note', text: s.found.noUpload }),
        el('div', {
          className: 'activity-actions',
          children: [
            button(
              s.found.submit(capital),
              () => {
                void act('/api/company/found', {
                  name: name.value,
                  industry: industry.value,
                  color,
                  icon,
                  province: province.value,
                }).then(load);
              },
              true,
            ),
          ],
        }),
      ],
    });
  };

  // ---------- Thuộc một công ty ----------

  const renderInside = (d: CompanyDetail): HTMLElement[] => {
    const parts: HTMLElement[] = [companyBadge(d.company)];
    const inRoom = api.currentCompanyRoom() === `company:${d.company.id}`;
    parts.push(
      el('div', {
        className: 'activity-actions',
        children: [
          // Đang làm ở công ty này thì chỉ ở phòng công ty, không quay về văn phòng chung.
          ...(inRoom
            ? []
            : [
                button(
                  s.enterRoom,
                  () => {
                    api.enterRoom(d.company.id);
                  },
                  true,
                ),
              ]),
          ...(d.isOwner
            ? []
            : [
                button(leaveArmed ? s.leaveConfirm : s.leave, () => {
                  if (!leaveArmed) {
                    leaveArmed = true;
                    void load();
                    return;
                  }
                  leaveArmed = false;
                  void act('/api/company/leave').then((done) => {
                    if (done && api.onLeft) api.onLeft();
                    else void load();
                  });
                }),
              ]),
        ],
      }),
    );
    const tabs: (typeof tab)[] = d.isOwner
      ? ['overview', 'projects', 'people', 'ladder', 'shop', 'feed']
      : ['overview', 'feed'];
    if (!tabs.includes(tab)) tab = 'overview';
    parts.push(
      el('div', {
        className: 'profile-tabs',
        attrs: { role: 'tablist' },
        children: tabs.map((id) => {
          const b = el('button', {
            className: 'profile-tab',
            text: s.tabs[id],
            attrs: { type: 'button', role: 'tab', 'aria-selected': String(id === tab) },
          });
          b.addEventListener('click', () => {
            tab = id;
            void load();
          });
          return b;
        }),
      }),
    );
    if (tab === 'overview') parts.push(...renderOverview(d), ...renderUniform(d));
    if (tab === 'shop') parts.push(...renderShop(d));
    if (tab === 'projects') parts.push(...renderProjects(d));
    if (tab === 'people') parts.push(...renderPeople(d));
    if (tab === 'ladder') parts.push(renderBands(d.company.hiringBands, d.company.hiring));
    if (tab === 'feed') parts.push(renderFeed(d));
    return parts;
  };

  /** Gọi API rồi tải lại bảng và báo cảnh đổi đồ / áo. */
  const change = (path: string, payload?: unknown): void => {
    void act(path, payload).then((r) => {
      if (r) api.onChanged?.();
      void load();
    });
  };

  // Đồng phục: ai trong công ty cũng tự chọn mặc hay không (khi công ty đã mua).
  const renderUniform = (d: CompanyDetail): HTMLElement[] => {
    if (!d.company.perks.includes('uniform')) return [];
    return [
      el('div', {
        className: 'company-card uniform-card',
        children: [
          el('div', {
            className: 'company-card-title',
            children: [
              el('span', { text: `👔 ${s.uniform.title}` }),
              el('span', {
                className: `badge-pill ${d.wearingUniform ? 'badge-working' : 'badge-rank'}`,
                text: d.wearingUniform ? 'Đang mặc' : 'Đồ riêng',
              }),
            ],
          }),
          el('p', {
            className: 'fortune-note',
            text: d.wearingUniform ? s.uniform.wearing : s.uniform.notWearing,
          }),
          el('div', {
            className: 'activity-actions',
            children: [
              button(
                d.wearingUniform ? s.uniform.takeOff : s.uniform.wear,
                () => {
                  change('/api/company/uniform', { wear: !d.wearingUniform });
                },
                !d.wearingUniform,
              ),
            ],
          }),
        ],
      }),
    ];
  };

  // Cửa hàng công ty (CEO): tiêu quỹ cho đồ phòng nghỉ, decor bàn, đồng phục, đổi tên.
  const renderShop = (d: CompanyDetail): HTMLElement[] => {
    const treasury = d.economy.treasury;
    const owned = d.company.perks;
    const parts: HTMLElement[] = [
      el('div', {
        className: 'company-treasury-banner',
        children: [
          el('span', { className: 'banner-icon', text: '🪙' }),
          el('div', {
            children: [
              el('span', { className: 'banner-label', text: 'Quỹ công ty khả dụng' }),
              el('strong', {
                className: 'banner-value',
                text: `${Math.floor(treasury).toLocaleString('vi-VN')} xu`,
              }),
            ],
          }),
        ],
      }),
    ];

    const perkIcons: Record<string, string> = {
      massage: '🛋️',
      console: '🎮',
      deskDecor: '🪴',
      uniform: '👔',
    };

    let uniformPick = d.economy.uniformColor ?? d.company.color;
    const swatches = (onPick: (i: number) => void): HTMLElement =>
      el('div', {
        className: 'uniform-swatches',
        children: COMPANY_COLORS.map((color, i) => {
          const b = el('button', {
            className: `uniform-swatch${i === uniformPick ? ' is-active' : ''}`,
            attrs: { type: 'button', 'aria-label': `${s.shop.uniformColor} ${String(i + 1)}` },
          });
          b.style.background = hex(color);
          b.addEventListener('click', () => {
            uniformPick = i;
            b.parentElement
              ?.querySelectorAll('.uniform-swatch')
              .forEach((x) => x.classList.toggle('is-active', x === b));
            onPick(i);
          });
          return b;
        }),
      });

    const perksGrid = el('div', {
      className: 'perks-cards-grid',
      children: COMPANY_PERKS.map((perk) => {
        const info = s.shop.perks[perk];
        const cost = COMPANY_SHOP.perks[perk];
        const has = owned.includes(perk);
        const iconGlyph = perkIcons[perk] ?? '✨';

        return el('div', {
          className: `perk-card ${has ? 'is-owned' : ''}`,
          children: [
            el('div', {
              className: 'perk-card-head',
              children: [
                el('span', { className: 'perk-icon', text: iconGlyph }),
                el('div', {
                  className: 'perk-title-block',
                  children: [
                    el('strong', { className: 'perk-name', text: info?.name ?? perk }),
                    el('p', { className: 'perk-desc', text: info?.desc ?? '' }),
                  ],
                }),
              ],
            }),
            ...(perk === 'uniform' && has
              ? [
                  el('div', {
                    className: 'uniform-recolor-block',
                    children: [
                      el('span', { className: 'fortune-note', text: s.shop.uniformColor }),
                      swatches(() => undefined),
                    ],
                  }),
                ]
              : []),
            el('div', {
              className: 'perk-action-row',
              children: [
                has
                  ? perk === 'uniform'
                    ? button(
                        s.shop.recolor(COMPANY_SHOP.uniformRecolor),
                        () => {
                          change('/api/company/shop/uniform-color', { color: uniformPick });
                        },
                        false,
                        treasury < COMPANY_SHOP.uniformRecolor,
                      )
                    : el('span', { className: 'badge-pill badge-done', text: s.shop.owned })
                  : button(
                      `Mua (${cost.toLocaleString('vi-VN')} xu)`,
                      () => {
                        change(
                          '/api/company/shop/buy',
                          perk === 'uniform' ? { perk, color: uniformPick } : { perk },
                        );
                      },
                      true,
                      treasury < cost,
                    ),
              ],
            }),
          ],
        });
      }),
    });

    parts.push(perksGrid);

    // Đổi tên.
    const input = el('input', {
      className: 'creator-input',
      attrs: {
        type: 'text',
        maxlength: String(COMPANY.nameMax),
        placeholder: s.shop.renamePlaceholder,
        'aria-label': s.shop.rename,
      },
    });
    input.value = d.company.name;
    parts.push(
      el('div', {
        className: 'company-card company-rename-card',
        children: [
          el('h4', { className: 'section-title', text: `🏷️ ${s.shop.rename}` }),
          el('div', {
            className: 'creator-name-row',
            children: [
              input,
              button(
                s.shop.renameButton(COMPANY_SHOP.rename),
                () => {
                  change('/api/company/shop/rename', { name: input.value });
                },
                false,
                treasury < COMPANY_SHOP.rename,
              ),
            ],
          }),
        ],
      }),
    );
    return parts;
  };

  const renderOverview = (d: CompanyDetail): HTMLElement[] => {
    const e = d.economy;
    const cfg = stageConfig(e.stage);
    const parts: HTMLElement[] = [
      el('div', {
        className: 'company-kpi-grid',
        children: [
          el('div', {
            className: 'kpi-card kpi-treasury',
            children: [
              el('div', {
                className: 'kpi-header',
                children: [
                  el('span', { className: 'kpi-icon', text: '🪙' }),
                  el('span', { className: 'kpi-label', text: s.treasury }),
                ],
              }),
              el('div', {
                className: 'kpi-value',
                text: `${Math.floor(e.treasury).toLocaleString('vi-VN')} xu`,
              }),
              el('div', { className: 'kpi-sub', text: 'Quỹ dự trữ khả dụng' }),
            ],
          }),
          el('div', {
            className: 'kpi-card kpi-reputation',
            children: [
              el('div', {
                className: 'kpi-header',
                children: [
                  el('span', { className: 'kpi-icon', text: '⭐' }),
                  el('span', { className: 'kpi-label', text: s.reputation }),
                ],
              }),
              el('div', { className: 'kpi-value', text: e.reputation.toLocaleString('vi-VN') }),
              el('div', { className: 'kpi-sub', text: 'Độ tín nhiệm đối tác' }),
            ],
          }),
          el('div', {
            className: 'kpi-card kpi-projects',
            children: [
              el('div', {
                className: 'kpi-header',
                children: [
                  el('span', { className: 'kpi-icon', text: '📋' }),
                  el('span', { className: 'kpi-label', text: s.projectsDone }),
                ],
              }),
              el('div', { className: 'kpi-value', text: String(e.projectsDone) }),
              el('div', { className: 'kpi-sub', text: 'Hợp đồng hoàn thành' }),
            ],
          }),
          el('div', {
            className: 'kpi-card kpi-staff',
            children: [
              el('div', {
                className: 'kpi-header',
                children: [
                  el('span', { className: 'kpi-icon', text: '👥' }),
                  el('span', { className: 'kpi-label', text: s.staffCount }),
                ],
              }),
              el('div', { className: 'kpi-value', text: `${e.staff.length}/${cfg.maxStaff}` }),
              el('div', {
                className: 'kpi-progress',
                children: [
                  el('div', {
                    className: 'kpi-progress-bar',
                    attrs: {
                      style: `width: ${Math.min(100, Math.round((e.staff.length / cfg.maxStaff) * 100))}%`,
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ];

    if (d.event && d.isOwner) {
      const ev = s.event[d.event];
      if (ev && typeof ev !== 'string') {
        parts.push(
          el('div', {
            className: 'company-card company-event-card',
            children: [
              el('div', {
                className: 'company-card-title',
                children: [
                  el('span', {
                    text: `⚡ ${typeof s.event.title === 'string' ? s.event.title : 'Sự kiện công ty'}`,
                  }),
                ],
              }),
              el('p', { className: 'event-desc', text: ev.text }),
              el('div', {
                className: 'choice-cards',
                children: ev.choices.map((label, i) =>
                  button(label, () => {
                    void act('/api/company/event', { choice: i }).then(load);
                  }),
                ),
              }),
            ],
          }),
        );
      }
    }

    if (d.isOwner) {
      const needs = cfg.next;
      const conditions: {
        id: 'projects' | 'reputation' | 'staff' | 'reserve';
        current: number;
        target: number;
        unit: string;
        name: string;
      }[] = [
        {
          id: 'projects',
          current: e.projectsDone,
          target: needs.projects,
          unit: 'dự án',
          name: 'Dự án',
        },
        {
          id: 'reputation',
          current: e.reputation,
          target: needs.reputation,
          unit: 'điểm',
          name: 'Uy tín',
        },
        {
          id: 'staff',
          current: e.staff.length,
          target: needs.staff,
          unit: 'nhân sự',
          name: 'Nhân viên NPC',
        },
        {
          id: 'reserve',
          current: Math.floor(e.treasury),
          target: needs.reserve,
          unit: 'xu',
          name: 'Quỹ dự trữ',
        },
      ];
      const metCount = conditions.filter((c) => !d.stage.missing.includes(c.id)).length;

      const milestoneCard = el('div', {
        className: 'company-card milestone-card',
        children: [
          el('div', {
            className: 'milestone-header',
            children: [
              el('div', {
                children: [
                  el('span', { className: 'milestone-eyebrow', text: 'MỤC TIÊU PHÁT TRIỂN' }),
                  el('h4', {
                    className: 'milestone-title',
                    text: d.stage.ipo
                      ? s.ipoTitle
                      : `${s.stages[e.stage] ?? ''} ➔ ${s.stages[e.stage + 1] ?? s.nextStage}`,
                  }),
                ],
              }),
              el('span', {
                className: d.stage.ready ? 'milestone-badge is-ready' : 'milestone-badge',
                text: d.stage.ready ? '✓ ĐỦ ĐIỀU KIỆN' : `${metCount}/4 điều kiện`,
              }),
            ],
          }),
          el('div', {
            className: 'milestone-grid',
            children: conditions.map((cond) => {
              const ok = !d.stage.missing.includes(cond.id);
              return el('div', {
                className: `milestone-item ${ok ? 'is-met' : 'is-pending'}`,
                children: [
                  el('div', {
                    className: 'milestone-item-head',
                    children: [
                      el('span', { className: 'milestone-item-name', text: cond.name }),
                      el('span', { className: 'milestone-mark', text: ok ? '✓' : '○' }),
                    ],
                  }),
                  el('div', {
                    className: 'milestone-item-val',
                    text: `${cond.current.toLocaleString('vi-VN')} / ${cond.target.toLocaleString('vi-VN')} ${cond.unit}`,
                  }),
                ],
              });
            }),
          }),
        ],
      });

      if (d.stage.ipo) {
        const industry = el('select', {
          className: 'board-select',
          attrs: { 'aria-label': s.found.industry },
        });
        for (const id of INDUSTRIES)
          industry.append(el('option', { text: s.industries[id] ?? id, attrs: { value: id } }));
        milestoneCard.append(
          el('p', { className: 'fortune-note', text: s.ipoHint }),
          industry,
          el('div', {
            className: 'activity-actions',
            children: [
              button(
                s.ipo,
                () => void act('/api/company/ipo', { industry: industry.value }).then(load),
                true,
                !d.stage.ready,
              ),
            ],
          }),
        );
      } else {
        milestoneCard.append(
          el('div', {
            className: 'activity-actions',
            children: [
              button(
                `🚀 ${s.upgrade}`,
                () => void act('/api/company/upgrade').then(load),
                true,
                !d.stage.ready,
              ),
            ],
          }),
        );
      }
      parts.push(milestoneCard);
    }
    return parts;
  };

  const projectName = (d: CompanyDetail, nameIndex: number): string =>
    projectNameOf(d.company.industry, nameIndex);

  const renderProjects = (d: CompanyDetail): HTMLElement[] => {
    const p = d.economy.project;
    const parts: HTMLElement[] = [];

    // Active project card
    if (p) {
      const fill = el('span', { className: 'xp-bar-fill' });
      const pct = Math.min(100, Math.round((p.progress / p.work) * 100));
      fill.style.width = `${pct}%`;
      parts.push(
        el('div', {
          className: 'active-project-card',
          children: [
            el('div', {
              className: 'project-card-header',
              children: [
                el('span', {
                  className: 'project-status-badge is-active',
                  text: '⚡ DỰ ÁN ĐANG THỰC HIỆN',
                }),
                el('span', {
                  className: 'project-stars',
                  text: s.project.difficulty(p.difficulty),
                }),
              ],
            }),
            el('h4', { className: 'project-card-title', text: projectName(d, p.nameIndex) }),
            el('div', {
              className: 'xp-bar xp-bar-large',
              children: [
                fill,
                el('span', {
                  className: 'xp-bar-text',
                  text: `${Math.floor(p.progress)} / ${p.work} điểm công việc (${pct}%)`,
                }),
              ],
            }),
            el('div', {
              className: 'project-rewards-row',
              children: [
                el('span', {
                  className: 'reward-chip reward-coins',
                  text: `🪙 +${p.reward.toLocaleString('vi-VN')} xu`,
                }),
                el('span', {
                  className: 'reward-chip reward-rep',
                  text: `⭐ +${p.reputation} Uy tín`,
                }),
              ],
            }),
          ],
        }),
      );
    } else {
      parts.push(
        el('div', {
          className: 'empty-project-card',
          children: [
            el('span', { className: 'empty-project-icon', text: '📁' }),
            el('div', {
              children: [
                el('strong', { text: 'Chưa có dự án đang chạy' }),
                el('p', {
                  className: 'fortune-note',
                  text: 'Hãy nhận một dự án khả dụng bên dưới để bắt đầu nhận thưởng!',
                }),
              ],
            }),
          ],
        }),
      );
    }

    // Projects offers list (2 dòng: dòng 1 có 3 dự án, dòng 2 có 2 dự án)
    const doneCount = d.offers.filter((o) => offerDone(d.economy, o.id)).length;
    parts.push(
      el('div', {
        className: 'section-header-row',
        children: [
          el('h4', { className: 'section-title', text: '📋 Dự án khả dụng hôm nay' }),
          el('span', {
            className: 'section-counter',
            text: `${doneCount}/${d.offers.length} đã xong`,
          }),
        ],
      }),
    );

    const offersList = el('div', {
      className: 'project-offers-grid',
      children: d.offers.map((o) => {
        const done = offerDone(d.economy, o.id);
        const active = p?.id === o.id;
        return el('div', {
          className: `project-offer-card ${done ? 'is-done' : active ? 'is-active' : ''}`,
          children: [
            el('div', {
              className: 'offer-top',
              children: [
                el('span', {
                  className: 'project-stars',
                  text: s.project.difficulty(o.difficulty),
                }),
                el('span', { className: 'offer-work', text: `⏱️ ${o.work} việc` }),
              ],
            }),
            el('strong', { className: 'offer-title', text: projectName(d, o.nameIndex) }),
            el('div', {
              className: 'offer-rewards',
              children: [
                el('span', {
                  className: 'reward-chip reward-coins',
                  text: `+${o.reward.toLocaleString('vi-VN')} xu`,
                }),
                el('span', {
                  className: 'reward-chip reward-rep',
                  text: `+${o.reputation} ⭐`,
                }),
              ],
            }),
            el('div', {
              className: 'offer-action',
              children: [
                done
                  ? el('span', {
                      className: 'badge-pill badge-done offer-btn-pill',
                      text: '✓ Đã xong',
                    })
                  : active
                    ? el('span', {
                        className: 'badge-pill badge-running offer-btn-pill',
                        text: '⚡ Đang chạy',
                      })
                    : button(
                        s.project.take,
                        () => void act('/api/company/project', { offerId: o.id }).then(load),
                        true,
                        p !== null,
                      ),
              ],
            }),
          ],
        });
      }),
    });

    parts.push(offersList);

    // NPC Staff roster
    const e = d.economy;
    const cfg = stageConfig(e.stage);
    parts.push(
      el('div', {
        className: 'section-header-row',
        children: [
          el('h4', { className: 'section-title', text: '👥 Đội ngũ nhân viên NPC' }),
          el('span', {
            className: 'section-counter',
            text: `${e.staff.length}/${cfg.maxStaff}`,
          }),
        ],
      }),
    );

    const staffList = el('div', {
      className: 'staff-cards-grid',
      children:
        e.staff.length === 0
          ? [el('p', { className: 'fortune-note', text: s.staff.none })]
          : e.staff.map((st) => {
              const isAway = st.awayUntil > Date.now();
              return el('div', {
                className: `staff-card ${isAway ? 'is-away' : ''}`,
                children: [
                  el('div', {
                    className: 'staff-info',
                    children: [
                      el('span', { className: 'staff-avatar', text: '👤' }),
                      el('div', {
                        children: [
                          el('strong', { className: 'staff-name', text: npcName(st.nameIndex) }),
                          el('div', {
                            className: 'staff-badges',
                            children: [
                              el('span', {
                                className: 'badge-pill badge-rank',
                                text: s.ranks[st.rank] ?? '',
                              }),
                              el('span', {
                                className: `badge-pill ${isAway ? 'badge-away' : 'badge-working'}`,
                                text: isAway ? '🟡 Nghỉ phép' : '🟢 Làm việc',
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                  ...(st.rank < 2
                    ? [
                        button(
                          `Thăng chức (${String(COMPANY.promoteCost[st.rank + 1] ?? 0)} xu)`,
                          () =>
                            void act('/api/company/staff/promote', { staffId: st.id }).then(load),
                          false,
                          e.treasury < (COMPANY.promoteCost[st.rank + 1] ?? 0),
                        ),
                      ]
                    : []),
                ],
              });
            }),
    });

    parts.push(
      staffList,
      el('div', {
        className: 'activity-actions',
        children: [
          button(
            `➕ Tuyển nhân viên NPC (${COMPANY.hireCost[0] ?? 0} xu)`,
            () => void act('/api/company/hire').then(load),
            true,
            e.staff.length >= cfg.maxStaff || e.treasury < (COMPANY.hireCost[0] ?? 0),
          ),
        ],
      }),
    );
    return parts;
  };

  const renderPeople = (d: CompanyDetail): HTMLElement[] => {
    const p = s.people;
    const parts: HTMLElement[] = [el('h3', { text: `${p.members} (${String(d.members.length)})` })];
    // Tìm theo tên / mã, lọc theo vị trí (giữ nguyên khi danh sách tải lại).
    const searchBox = el('input', {
      className: 'creator-input',
      attrs: { type: 'search', placeholder: p.search, 'aria-label': p.search },
    });
    searchBox.value = memberQuery;
    const filters = el('div', { className: 'map-chips' });
    const listBox = el('ul', { className: 'company-list member-rows' });
    const countText = el('p', { className: 'fortune-note map-count' });
    const fold = (t: string): string =>
      t
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .toLowerCase();
    const renderFilters = (): void => {
      filters.replaceChildren(
        ...['all', ...d.company.hiringBands.steps.map((step) => step.name)].map((key) => {
          const b = el('button', {
            className: `auth-tab${memberFilter === key ? ' is-active' : ''}`,
            text: key === 'all' ? p.filterAll : key,
            attrs: { type: 'button' },
          });
          b.addEventListener('click', () => {
            memberFilter = key;
            renderFilters();
            renderMembers();
          });
          return b;
        }),
      );
    };
    const renderMembers = (): void => {
      const q = fold(memberQuery.trim());
      const rows = d.members.filter(
        (m) =>
          (memberFilter === 'all' || m.owner || m.position === memberFilter) &&
          (!q || fold(`${m.name} ${m.code}`).includes(q)),
      );
      countText.textContent = p.count(rows.length, d.members.length);
      listBox.replaceChildren(
        ...(rows.length === 0 ? [el('li', { className: 'activity-intro', text: p.noMatch })] : []),
        ...rows.map((m) => {
          const actions: HTMLElement[] = [];
          if (!m.owner) {
            const task = el('select', {
              className: 'board-select',
              attrs: { 'aria-label': p.assign },
            });
            for (const t of MISSION_TEMPLATES)
              task.append(el('option', { text: t.goalText, attrs: { value: t.id } }));
            actions.push(
              button(
                p.promote,
                () => void act('/api/company/promote', { code: m.code }).then(load),
                false,
                m.role >= 2,
              ),
              task,
              button(
                p.assign,
                () =>
                  void act('/api/company/assign', { code: m.code, templateId: task.value }).then(
                    (r) => {
                      if (r) say(p.assigned(m.name), 'ok');
                    },
                  ),
              ),
              button(p.kick, () => void act('/api/company/kick', { code: m.code }).then(load)),
              button(
                p.ban,
                () => void act('/api/company/kick', { code: m.code, ban: true }).then(load),
              ),
            );
          }
          // Dòng gọn: tên, vị trí, cấp; các nút quản lý gom vào "Quản lý" (mở khi cần).
          const info = el('span', {
            className: 'member-info',
            children: [
              el('strong', { text: m.name }),
              el('span', {
                text: ` · ${m.owner ? p.owner : positionText(m.position)} · ${p.level(m.level)}`,
              }),
            ],
          });
          return el('li', {
            className: 'company-member member-row',
            children:
              actions.length === 0
                ? [info]
                : [
                    el('details', {
                      className: 'member-manage',
                      children: [
                        el('summary', {
                          children: [
                            info,
                            el('span', { className: 'member-more', text: p.manage }),
                          ],
                        }),
                        el('div', { className: 'company-actions', children: actions }),
                      ],
                    }),
                  ],
          });
        }),
      );
    };
    let searchTimer: number | undefined;
    searchBox.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        memberQuery = searchBox.value;
        renderMembers();
      }, 150);
    });
    renderFilters();
    renderMembers();
    parts.push(
      el('div', { className: 'company-map-filter', children: [searchBox, filters, countText] }),
      listBox,
    );
    parts.push(el('h3', { text: p.applications }));
    parts.push(
      el('ul', {
        className: 'company-list',
        children:
          d.applications.length === 0
            ? [el('li', { className: 'activity-intro', text: p.noApplications })]
            : d.applications.map((a) =>
                el('li', {
                  children: [
                    el('span', {
                      text: `${a.name} · ${p.level(a.level)} · ${positionText(a.position)}`,
                    }),
                    el('div', {
                      className: 'company-actions',
                      children: [
                        button(
                          p.reject,
                          () =>
                            void act('/api/company/applications', {
                              applicationId: a.id,
                              approve: false,
                            }).then(load),
                        ),
                        button(
                          p.approve,
                          () =>
                            void act('/api/company/applications', {
                              applicationId: a.id,
                              approve: true,
                            }).then(load),
                          true,
                        ),
                      ],
                    }),
                  ],
                }),
              ),
      }),
    );
    const invite = button(
      inviteCode ? p.inviteAgain : p.invite,
      () => {
        void act<{ code: string }>('/api/company/invite').then((r) => {
          if (r) inviteCode = r.code;
          void load();
        });
      },
      inviteCode === null,
    );
    const codeRow: HTMLElement[] = [];
    if (inviteCode) {
      const value = inviteCode;
      const copy = el('button', {
        className: 'button button-soft',
        text: p.copy,
        attrs: { type: 'button' },
      });
      copy.addEventListener('click', () => {
        void Promise.resolve()
          .then(() => navigator.clipboard.writeText(value))
          .then(() => {
            copy.textContent = p.copied;
          })
          .catch(() => undefined);
      });
      codeRow.push(
        el('div', {
          className: 'invite-code-row',
          children: [el('code', { className: 'invite-code', text: value }), copy],
        }),
      );
    }
    parts.push(
      el('section', {
        className: 'company-card invite-card',
        children: [
          el('div', {
            className: 'company-card-title',
            children: [el('span', { text: `✉️ ${p.inviteTitle}` })],
          }),
          el('p', { className: 'band-hint', text: p.inviteHint }),
          ...codeRow,
          el('div', { className: 'activity-actions', children: [invite] }),
        ],
      }),
    );
    return parts;
  };

  /**
   * CEO đặt lộ trình công ty: tối đa 10 bậc (tên, cấp bắt đầu, đang tuyển), từ bậc nào được chọn
   * phòng ban / nhánh (không sớm hơn mức chung), và bật/tắt nhận đơn.
   */
  const renderBands = (ladder: CompanyLadder, hiring: boolean): HTMLElement => {
    const p = s.people;
    const steps: LadderStep[] = ladder.steps.map((step) => ({ ...step }));
    let departmentStep = ladder.departmentStep;
    let branchStep = ladder.branchStep;
    const list = el('div', { className: 'band-list' });
    const unlocks = el('div', { className: 'ladder-unlocks' });
    const addButton = el('button', {
      className: 'button button-soft',
      text: p.ladderAdd,
      attrs: { type: 'button' },
    });
    const stepSelect = (label: string, value: number, set: (i: number) => void): HTMLElement => {
      const select = el('select', { className: 'ladder-select', attrs: { 'aria-label': label } });
      steps.forEach((step, i) => {
        select.append(
          el('option', {
            text: `${String(i + 1)}. ${step.name || p.ladderUnnamed} (${p.level(step.minLevel)})`,
            attrs: { value: String(i) },
          }),
        );
      });
      select.value = String(Math.min(value, steps.length - 1));
      select.addEventListener('change', () => {
        set(Number(select.value));
      });
      return el('label', {
        className: 'ladder-unlock',
        children: [el('span', { text: label }), select],
      });
    };
    const renderUnlocks = (): void => {
      unlocks.replaceChildren(
        stepSelect(p.ladderDepartment(GLOBAL_UNLOCK.department), departmentStep, (i) => {
          departmentStep = i;
        }),
        stepSelect(p.ladderBranch(GLOBAL_UNLOCK.branch), branchStep, (i) => {
          branchStep = i;
        }),
      );
    };
    const renderSteps = (): void => {
      list.replaceChildren(
        ...steps.map((step, i) => {
          const name = el('input', {
            className: 'creator-input ladder-name',
            attrs: {
              type: 'text',
              maxlength: String(LADDER_NAME_MAX),
              placeholder: p.ladderNamePlaceholder,
              'aria-label': p.ladderName(i + 1),
            },
          });
          name.value = step.name;
          name.addEventListener('input', () => {
            step.name = name.value;
          });
          name.addEventListener('change', renderUnlocks);
          const level = el('input', {
            className: 'band-input',
            attrs: {
              type: 'number',
              min: '1',
              max: String(HIRING_MAX_LEVEL),
              step: '1',
              inputmode: 'numeric',
              'aria-label': `${p.ladderName(i + 1)} ${p.bandFrom}`,
            },
          });
          level.value = String(step.minLevel);
          level.addEventListener('input', () => {
            step.minLevel = Math.round(Number(level.value));
          });
          level.addEventListener('change', renderUnlocks);
          const open = el('input', {
            className: 'switch',
            attrs: {
              type: 'checkbox',
              role: 'switch',
              'aria-label': `${p.bandOpen} ${p.ladderName(i + 1)}`,
            },
          });
          open.checked = step.hiring;
          const row = el('div', {
            className: `band-row ladder-row${step.hiring ? '' : ' is-off'}`,
          });
          open.addEventListener('change', () => {
            step.hiring = open.checked;
            row.classList.toggle('is-off', !open.checked);
          });
          const remove = el('button', {
            className: 'ladder-remove',
            text: '✕',
            attrs: { type: 'button', title: p.ladderRemove, 'aria-label': p.ladderRemove },
          });
          remove.disabled = steps.length <= 1;
          remove.addEventListener('click', () => {
            steps.splice(i, 1);
            const fix = (n: number): number => (n > i ? n - 1 : Math.min(n, steps.length - 1));
            departmentStep = fix(departmentStep);
            branchStep = fix(branchStep);
            renderAll();
          });
          row.append(
            el('span', { className: 'ladder-index', text: String(i + 1) }),
            name,
            el('span', {
              className: 'band-range',
              children: [el('span', { text: p.bandFrom }), level],
            }),
            open,
            remove,
          );
          return row;
        }),
      );
    };
    function renderAll(): void {
      renderSteps();
      renderUnlocks();
      addButton.disabled = steps.length >= MAX_LADDER_STEPS;
    }
    addButton.addEventListener('click', () => {
      if (steps.length >= MAX_LADDER_STEPS) return;
      const last = steps[steps.length - 1]?.minLevel ?? 0;
      steps.push({ name: '', minLevel: Math.min(HIRING_MAX_LEVEL, last + 10), hiring: true });
      renderAll();
      list.querySelector<HTMLInputElement>('.ladder-row:last-child .ladder-name')?.focus();
    });
    renderAll();
    const hiringBox = el('input', {
      className: 'switch',
      attrs: { type: 'checkbox', role: 'switch', 'aria-label': p.hiringOpen },
    });
    hiringBox.checked = hiring;
    return el('section', {
      className: 'company-card company-bands',
      children: [
        el('div', {
          className: 'company-card-title',
          children: [
            el('span', { text: `📋 ${p.bandsTitle}` }),
            el('label', {
              className: 'band-hiring',
              children: [el('span', { text: p.hiringOpen }), hiringBox],
            }),
          ],
        }),
        el('p', { className: 'band-hint', text: p.bandsIntro }),
        list,
        el('div', { className: 'activity-actions', children: [addButton] }),
        unlocks,
        el('div', {
          className: 'activity-actions',
          children: [
            button(
              p.saveBands,
              () => {
                const next: CompanyLadder = {
                  steps: steps.map((step) => ({ ...step, name: step.name.trim() })),
                  departmentStep,
                  branchStep,
                };
                const invalid = next.steps.some(
                  (step) =>
                    !step.name ||
                    !Number.isFinite(step.minLevel) ||
                    step.minLevel < 1 ||
                    step.minLevel > HIRING_MAX_LEVEL,
                )
                  ? 'step'
                  : validateLadder(next);
                if (invalid) {
                  say(p.bandErrors[invalid] ?? STRINGS.net.actionFailed);
                  return;
                }
                void act('/api/company/hiring', { ladder: next, hiring: hiringBox.checked }).then(
                  (r) => {
                    if (!r) return;
                    void load().then(() => {
                      say(p.bandsSaved, 'ok');
                    });
                  },
                );
              },
              true,
            ),
          ],
        }),
      ],
    });
  };

  const renderFeed = (d: CompanyDetail): HTMLElement => {
    const fmt = new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
    return el('ol', {
      className: 'xp-log',
      children: d.feed.map((f) =>
        el('li', {
          children: [
            el('span', { className: 'xp-log-time', text: fmt.format(f.at) }),
            el('span', { className: 'xp-log-source', text: s.feed[f.kind]?.(f.data) ?? '' }),
            el('span'),
          ],
        }),
      ),
    });
  };

  const load = async (): Promise<void> => {
    const my = await api.get<MyCompanyResponse>('/api/company/me');
    if (!my) {
      say(STRINGS.net.actionFailed);
      return;
    }
    content.replaceChildren(...(my.detail ? renderInside(my.detail) : renderOutside(my)));
  };

  body.append(content, message);
  void load();
  return {
    refresh() {
      void load();
    },
  };
}
