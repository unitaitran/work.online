// Công ty (Phase 6): mở công ty, điều hành (dự án, nhân viên NPC, sự kiện, nâng cấp, IPO),
// nhân sự (đơn xin việc, mã mời, thăng chức, giao việc, cho nghỉ), danh bạ và lời mời làm việc.
// Mọi số liệu do server tính; panel chỉ hiển thị và gửi yêu cầu.
import {
  COMPANY,
  COMPANY_COLORS,
  COMPANY_ICONS,
  INDUSTRIES,
  MISSION_TEMPLATES,
  seededRng,
  stageConfig,
  titleName,
  type CompanyDetail,
  type CompanyPublic,
  type MyCompanyResponse,
} from '@dilam/shared';
import { randomVietnameseName } from '../avatar/names';
import { STRINGS } from '../strings';
import { el } from './dom';

export type CallResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface CompanyApi {
  get<T>(path: string): Promise<T | null>;
  post<T>(path: string, body?: unknown): Promise<CallResult<T>>;
  /** Vào phòng công ty (WebSocket switch_room). */
  enterRoom(companyId: string): void;
  backToOffice(): void;
  /** Đang ở phòng công ty nào (null nếu ở văn phòng chung). */
  currentCompanyRoom(): string | null;
}

const s = STRINGS.company;

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

export function npcName(nameIndex: number): string {
  return randomVietnameseName(seededRng(nameIndex + 17));
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
            text: `${s.industries[c.industry] ?? ''} · ${s.stages[c.stage] ?? ''} · ${s.floorLabel(c.building, c.floor)} · ${s.members(c.members + 1)}`,
          }),
        ],
      }),
    ],
  });
}

export function mountCompanyPanel(body: HTMLElement, api: CompanyApi): { refresh(): void } {
  const message = el('p', { className: 'activity-message', attrs: { role: 'status' } });
  const content = el('div', { className: 'company-content' });
  let tab: 'overview' | 'projects' | 'people' | 'feed' = 'overview';
  let inviteCode: string | null = null;
  let leaveArmed = false;

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
    const parts: HTMLElement[] = [
      el('p', { className: 'activity-intro', text: employerText(my.employer) }),
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
        el('div', {
          className: 'company-offer',
          children: [
            el('strong', { text: s.offers }),
            el('p', { text: s.offerText(offer.companyName) }),
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
          ],
        }),
      );
    }
    if (my.employer !== null && !my.employer.startsWith('company:')) {
      parts.push(
        el('div', {
          className: 'activity-actions',
          children: [
            button(leaveArmed ? s.leaveConfirm : s.leave, () => {
              if (!leaveArmed) {
                leaveArmed = true;
                void load();
                return;
              }
              leaveArmed = false;
              void act('/api/company/leave').then(load);
            }),
          ],
        }),
      );
    } else if (my.employer === null) {
      parts.push(
        el('div', {
          className: 'activity-actions',
          children: [
            button(s.rejoin, () => {
              void act('/api/company/rejoin-default').then(load);
            }),
          ],
        }),
      );
    }

    // Mở công ty riêng.
    parts.push(el('h3', { text: s.found.title }));
    const needs = s.found.needs;
    parts.push(
      el('ul', {
        className: 'check-list',
        children: (['level', 'employed', 'capital', 'owner'] as const).map((id) =>
          el('li', {
            className: my.found.missing.includes(id) ? 'is-missing' : 'is-met',
            text: id === 'capital' ? needs.capital(my.found.capital) : needs[id],
          }),
        ),
      }),
    );
    if (my.found.ok) parts.push(renderFoundForm(my.found.capital));

    // Danh bạ và mã mời.
    parts.push(el('h3', { text: s.directory }));
    const list = el('ul', { className: 'company-list' });
    void api.get<{ companies: CompanyPublic[] }>('/api/company/directory').then((data) => {
      const companies = data?.companies ?? [];
      if (companies.length === 0) {
        list.replaceChildren(el('li', { className: 'activity-intro', text: s.directoryEmpty }));
        return;
      }
      list.replaceChildren(
        ...companies.map((c) =>
          el('li', {
            children: [
              companyBadge(c),
              c.hiring
                ? button(s.apply, () => {
                    void act<{ applicationId: number }>('/api/company/apply', {
                      companyId: c.id,
                    }).then((r) => {
                      if (r) say(s.applied, 'ok');
                    });
                  })
                : el('span', { className: 'fortune-note', text: '' }),
            ],
          }),
        ),
      );
    });
    parts.push(list);
    const codeInput = el('input', {
      className: 'save-code',
      attrs: {
        type: 'text',
        placeholder: s.joinCodePlaceholder,
        'aria-label': s.joinCode,
        autocomplete: 'off',
      },
    });
    parts.push(
      el('p', { className: 'activity-intro', text: s.joinCode }),
      codeInput,
      el('div', {
        className: 'activity-actions',
        children: [
          button(s.join, () => {
            void act('/api/company/join', { code: codeInput.value }).then(load);
          }),
        ],
      }),
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
          inRoom
            ? button(s.backOffice, () => {
                api.backToOffice();
              })
            : button(
                s.enterRoom,
                () => {
                  api.enterRoom(d.company.id);
                },
                true,
              ),
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
                  void act('/api/company/leave').then(load);
                }),
              ]),
        ],
      }),
    );
    const tabs: (typeof tab)[] = d.isOwner
      ? ['overview', 'projects', 'people', 'feed']
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
    if (tab === 'overview') parts.push(...renderOverview(d));
    if (tab === 'projects') parts.push(...renderProjects(d));
    if (tab === 'people') parts.push(...renderPeople(d));
    if (tab === 'feed') parts.push(renderFeed(d));
    return parts;
  };

  const row = (label: string, value: string): HTMLElement =>
    el('div', {
      className: 'profile-row',
      children: [el('dt', { text: label }), el('dd', { text: value })],
    });

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

  const projectName = (d: CompanyDetail, nameIndex: number): string => {
    const names = s.project.names[d.company.industry] ?? [];
    return names[nameIndex % Math.max(1, names.length)] ?? '';
  };

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
    parts.push(
      el('ul', {
        className: 'company-list',
        children: d.offers.map((o) =>
          el('li', {
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
              button(
                s.project.take,
                () => void act('/api/company/project', { offerId: o.id }).then(load),
                true,
                p !== null,
              ),
            ],
          }),
        ),
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
    const parts: HTMLElement[] = [el('h3', { text: p.members })];
    parts.push(
      el('ul', {
        className: 'company-list',
        children: d.members.map((m) => {
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
                      if (r) say(p.assign, 'ok');
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
          return el('li', {
            className: 'company-member',
            children: [
              el('span', {
                children: [
                  el('strong', { text: m.name }),
                  el('span', {
                    text: ` · ${m.owner ? p.owner : (s.ranks[m.role] ?? '')} · ${titleName(m.title, null)}`,
                  }),
                ],
              }),
              el('div', { className: 'company-actions', children: actions }),
            ],
          });
        }),
      }),
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
                    el('span', { text: `${a.name} · ${titleName(a.title, null)}` }),
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
    const code = el('code', {
      className: 'recovery-code',
      text: inviteCode ? p.inviteCode(inviteCode) : '',
    });
    code.hidden = inviteCode === null;
    parts.push(
      code,
      el('div', {
        className: 'activity-actions',
        children: [
          button(p.invite, () => {
            void act<{ code: string }>('/api/company/invite').then((r) => {
              if (r) inviteCode = r.code;
              void load();
            });
          }),
        ],
      }),
    );
    return parts;
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
