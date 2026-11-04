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
    className: 'company-icon',
    text: s.iconGlyph[c.icon] ?? '★',
    attrs: { 'aria-hidden': 'true' },
  });
  icon.style.background = hex(COMPANY_COLORS[c.color] ?? 0xff8a65);
  return el('div', {
    className: 'company-head',
    children: [
      icon,
      el('div', {
        children: [
          el('strong', { className: 'company-name', text: c.name }),
          el('p', {
            className: 'fortune-note',
            text: `${s.industries[c.industry] ?? ''} · ${s.stages[c.stage] ?? ''} · ${provinceOf(c.province)?.name ?? ''} · ${s.floorLabel(c.building, c.floor)} · ${s.members(c.members + 1)}`,
          }),
        ],
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

  const row = (label: string, value: string): HTMLElement =>
    el('div', {
      className: 'profile-row',
      children: [el('dt', { text: label }), el('dd', { text: value })],
    });

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
      el('h3', { text: s.uniform.title }),
      el('p', {
        className: 'fortune-note',
        text: d.wearingUniform ? s.uniform.wearing : s.uniform.notWearing,
      }),
      button(
        d.wearingUniform ? s.uniform.takeOff : s.uniform.wear,
        () => {
          change('/api/company/uniform', { wear: !d.wearingUniform });
        },
        !d.wearingUniform,
      ),
    ];
  };

  // Cửa hàng công ty (CEO): tiêu quỹ cho đồ phòng nghỉ, decor bàn, đồng phục, đổi tên.
  const renderShop = (d: CompanyDetail): HTMLElement[] => {
    const treasury = d.economy.treasury;
    const owned = d.company.perks;
    const parts: HTMLElement[] = [
      el('p', { className: 'activity-intro', text: s.shop.intro }),
      el('p', { className: 'fortune-note', text: s.shop.treasury(Math.floor(treasury)) }),
    ];
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
    parts.push(
      el('ul', {
        className: 'company-list',
        children: COMPANY_PERKS.map((perk) => {
          const info = s.shop.perks[perk];
          const cost = COMPANY_SHOP.perks[perk];
          const has = owned.includes(perk);
          const extra: HTMLElement[] = [];
          if (perk === 'uniform') {
            extra.push(el('p', { className: 'fortune-note', text: s.shop.uniformColor }));
            extra.push(swatches(() => undefined));
          }
          return el('li', {
            className: has ? 'is-done' : '',
            children: [
              el('div', {
                children: [
                  el('strong', { text: info?.name ?? perk }),
                  el('p', { className: 'fortune-note', text: info?.desc ?? '' }),
                  ...extra,
                ],
              }),
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
                  : el('span', { className: 'project-status', text: s.shop.owned })
                : button(
                    s.shop.buy(cost),
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
          });
        }),
      }),
    );
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
      el('h3', { text: s.shop.rename }),
      input,
      button(
        s.shop.renameButton(COMPANY_SHOP.rename),
        () => {
          change('/api/company/shop/rename', { name: input.value });
        },
        false,
        treasury < COMPANY_SHOP.rename,
      ),
    );
    return parts;
  };

  const renderOverview = (d: CompanyDetail): HTMLElement[] => {
    const e = d.economy;
    const cfg = stageConfig(e.stage);
    const parts: HTMLElement[] = [
      el('dl', {
        className: 'profile-grid',
        children: [
          row(s.stage, s.stages[e.stage] ?? ''),
          row(s.treasury, STRINGS.progress.coins(e.treasury)),
          row(s.reputation, String(e.reputation)),
          row(s.projectsDone, String(e.projectsDone)),
          row(s.staffCount, `${String(e.staff.length)}/${String(cfg.maxStaff)}`),
        ],
      }),
    ];
    if (d.event && d.isOwner) {
      const ev = s.event[d.event];
      if (ev && typeof ev !== 'string') {
        parts.push(
          el('div', {
            className: 'company-offer',
            children: [
              el('strong', { text: typeof s.event.title === 'string' ? s.event.title : '' }),
              el('p', { text: ev.text }),
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
      parts.push(
        el('h3', { text: d.stage.ipo ? s.ipoTitle : s.nextStage }),
        el('ul', {
          className: 'check-list',
          children: (['projects', 'reputation', 'staff', 'reserve'] as const).map((id) =>
            el('li', {
              className: d.stage.missing.includes(id) ? 'is-missing' : 'is-met',
              text: s.needs[id](needs[id]),
            }),
          ),
        }),
      );
      if (d.stage.ipo) {
        const industry = el('select', {
          className: 'board-select',
          attrs: { 'aria-label': s.found.industry },
        });
        for (const id of INDUSTRIES)
          industry.append(el('option', { text: s.industries[id] ?? id, attrs: { value: id } }));
        parts.push(
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
        parts.push(
          el('div', {
            className: 'activity-actions',
            children: [
              button(
                s.upgrade,
                () => void act('/api/company/upgrade').then(load),
                true,
                !d.stage.ready,
              ),
            ],
          }),
        );
      }
    }
    return parts;
  };

  const projectName = (d: CompanyDetail, nameIndex: number): string =>
    projectNameOf(d.company.industry, nameIndex);

  const renderProjects = (d: CompanyDetail): HTMLElement[] => {
    const p = d.economy.project;
    const parts: HTMLElement[] = [el('h3', { text: s.project.active })];
    if (p) {
      const fill = el('span', { className: 'xp-bar-fill' });
      fill.style.width = `${String(Math.round((p.progress / p.work) * 100))}%`;
      parts.push(
        el('p', {
          className: 'shop-item-name',
          text: `${projectName(d, p.nameIndex)} ${s.project.difficulty(p.difficulty)}`,
        }),
        el('div', {
          className: 'xp-bar xp-bar-large',
          children: [
            fill,
            el('span', { className: 'xp-bar-text', text: s.project.work(p.progress, p.work) }),
          ],
        }),
        el('p', { className: 'fortune-note', text: s.project.reward(p.reward, p.reputation) }),
      );
    } else {
      parts.push(el('p', { className: 'activity-intro', text: s.project.none }));
    }
    parts.push(
      el('p', { className: 'fortune-note', text: s.project.hint }),
      el('h3', { text: s.project.offers }),
    );
    const doneCount = d.offers.filter((o) => offerDone(d.economy, o.id)).length;
    parts.push(
      el('p', {
        className: 'fortune-note',
        text:
          doneCount >= d.offers.length && d.offers.length > 0
            ? s.project.allDone
            : s.project.doneCount(doneCount, d.offers.length),
      }),
    );
    parts.push(
      el('ul', {
        className: 'company-list',
        children: d.offers.map((o) => {
          const done = offerDone(d.economy, o.id);
          const active = p?.id === o.id;
          return el('li', {
            className: done ? 'is-done' : active ? 'is-current' : '',
            children: [
              el('div', {
                children: [
                  el('strong', {
                    text: `${projectName(d, o.nameIndex)} ${s.project.difficulty(o.difficulty)}`,
                  }),
                  el('p', {
                    className: 'fortune-note',
                    text: `${s.project.work(0, o.work)} · ${s.project.reward(o.reward, o.reputation)}`,
                  }),
                ],
              }),
              done || active
                ? el('span', {
                    className: 'project-status',
                    text: done ? s.project.statusDone : s.project.statusActive,
                  })
                : button(
                    s.project.take,
                    () => void act('/api/company/project', { offerId: o.id }).then(load),
                    true,
                    p !== null,
                  ),
            ],
          });
        }),
      }),
    );
    // Nhân viên NPC.
    const e = d.economy;
    const cfg = stageConfig(e.stage);
    parts.push(el('h3', { text: s.staff.title }));
    parts.push(
      el('ul', {
        className: 'company-list',
        children:
          e.staff.length === 0
            ? [el('li', { className: 'activity-intro', text: s.staff.none })]
            : e.staff.map((st) =>
                el('li', {
                  children: [
                    el('span', {
                      text: `${npcName(st.nameIndex)} · ${s.ranks[st.rank] ?? ''}${st.awayUntil > Date.now() ? ` (${s.staff.away})` : ''}`,
                    }),
                    st.rank < 2
                      ? button(s.staff.promote(COMPANY.promoteCost[st.rank + 1] ?? 0), () => {
                          void act('/api/company/staff/promote', { staffId: st.id }).then(load);
                        })
                      : el('span'),
                  ],
                }),
              ),
      }),
      el('div', {
        className: 'activity-actions',
        children: [
          button(
            s.staff.hire(COMPANY.hireCost[0] ?? 0),
            () => void act('/api/company/hire').then(load),
            true,
            e.staff.length >= cfg.maxStaff,
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
