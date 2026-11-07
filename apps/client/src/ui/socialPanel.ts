// Đồng nghiệp: danh sách đồng nghiệp trong phòng với các chức năng tương tác 1-1
// (chat riêng, rủ trà sữa riêng, ẩn/hiện), và nút rủ cả phòng (kèm cooldown 5 phút).
import { MILK_TEA } from '@dilam/shared';
import type { RemoteListEntry } from '../scenes/remotePlayers';
import type { KeyValueStore } from '../storage';
import { STRINGS } from '../strings';
import { el } from './dom';

export const HIDDEN_KEY = 'dilam.hidden.v1';

export function loadHidden(store: KeyValueStore | null): Set<string> {
  try {
    const raw = store?.getItem(HIDDEN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(
      Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

export function saveHidden(store: KeyValueStore | null, codes: ReadonlySet<string>): void {
  try {
    store?.setItem(HIDDEN_KEY, JSON.stringify([...codes].slice(0, 500)));
  } catch {
    // bỏ qua
  }
}

export interface SocialPanelOptions {
  players(): RemoteListEntry[];
  /** Rủ cả phòng uống trà sữa. */
  onTeaInvite(): void;
  /** Rủ 1 người cụ thể uống trà sữa. */
  onDirectTeaInvite?(targetSid: number, targetName: string): void;
  /** Gửi tin nhắn chat riêng. */
  onDirectChat?(targetSid: number, targetName: string, text: string): void;
  onToggleHidden(code: string, hidden: boolean): void;
  /** Kiểm tra cooldown rủ trà sữa cả phòng. */
  teaCooldownRemainingSec?(): number;
}

export function mountSocialPanel(body: HTMLElement, o: SocialPanelOptions): void {
  const s = STRINGS.social;
  const list = el('ul', { className: 'social-players member-rows' });
  const search = el('input', {
    className: 'creator-input',
    attrs: { type: 'search', placeholder: s.search, 'aria-label': s.search },
  });
  const hiddenOnly = el('button', {
    className: 'auth-tab',
    text: s.hiddenOnly,
    attrs: { type: 'button', 'aria-pressed': 'false' },
  });
  const countText = el('p', { className: 'fortune-note map-count' });

  const fold = (t: string): string =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .toLowerCase();

  // Dialog nhập chat riêng inline
  let activeDirectChatSid: number | null = null;
  const directChatBox = el('div', { className: 'direct-chat-popup' });
  directChatBox.hidden = true;
  const directChatInput = el('input', {
    className: 'creator-input',
    attrs: {
      type: 'text',
      placeholder: 'Nhập tin nhắn riêng... (tối đa 100 ký tự)',
      maxlength: '100',
    },
  });
  const directChatSend = el('button', {
    className: 'button button-primary',
    text: 'Gửi',
    attrs: { type: 'button' },
  });
  const directChatCancel = el('button', {
    className: 'button button-soft',
    text: 'Huỷ',
    attrs: { type: 'button' },
  });

  const closeDirectChat = (): void => {
    activeDirectChatSid = null;
    directChatBox.hidden = true;
    directChatInput.value = '';
  };

  directChatCancel.addEventListener('click', closeDirectChat);
  directChatSend.addEventListener('click', () => {
    const text = directChatInput.value.trim();
    if (text && activeDirectChatSid !== null) {
      const p = o.players().find((x) => x.sid === activeDirectChatSid);
      if (p && o.onDirectChat) {
        o.onDirectChat(p.sid, p.name, text);
      }
      closeDirectChat();
    }
  });

  directChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      directChatSend.click();
    } else if (e.key === 'Escape') {
      closeDirectChat();
    }
  });

  directChatBox.append(
    el('div', { className: 'direct-chat-header', text: 'Gửi tin nhắn riêng' }),
    directChatInput,
    el('div', { className: 'activity-actions', children: [directChatCancel, directChatSend] }),
  );

  const renderPlayers = (): void => {
    const all = o.players();
    if (all.length === 0) {
      countText.textContent = '';
      list.replaceChildren(el('li', { className: 'activity-intro', text: s.noPlayers }));
      return;
    }
    const q = fold(search.value.trim());
    const onlyHidden = hiddenOnly.getAttribute('aria-pressed') === 'true';
    const players = all.filter(
      (p) => (!onlyHidden || p.hidden) && (!q || fold(`${p.name} ${p.title}`).includes(q)),
    );
    countText.textContent = s.count(players.length, all.length);
    if (players.length === 0) {
      list.replaceChildren(el('li', { className: 'activity-intro', text: s.noMatch }));
      return;
    }

    list.replaceChildren(
      ...players.map((p) => {
        // Nút Chat riêng
        const chatBtn = el('button', {
          className: 'button button-soft button-compact',
          text: s.directChat,
          attrs: { type: 'button', title: `Nhắn tin riêng cho ${p.name}` },
        });
        chatBtn.addEventListener('click', () => {
          activeDirectChatSid = p.sid;
          directChatBox.hidden = false;
          directChatInput.placeholder = `Nhắn riêng cho ${p.name}...`;
          directChatInput.focus();
        });

        // Nút Rủ trà sữa riêng
        const teaBtn = el('button', {
          className: 'button button-soft button-compact',
          text: s.directTea,
          attrs: {
            type: 'button',
            title: `Rủ riêng ${p.name} uống trà sữa (${String(MILK_TEA.price)} xu)`,
          },
        });
        teaBtn.addEventListener('click', () => {
          if (o.onDirectTeaInvite) {
            o.onDirectTeaInvite(p.sid, p.name);
          }
        });

        // Nút Ẩn / Hiện
        const toggle = el('button', {
          className: 'button button-soft button-compact social-hide',
          text: p.hidden ? s.unhide : s.hide,
          attrs: { type: 'button', 'aria-pressed': String(p.hidden) },
        });
        toggle.addEventListener('click', () => {
          o.onToggleHidden(p.code, !p.hidden);
          renderPlayers();
        });

        const actions = el('div', {
          className: 'member-actions',
          children: [chatBtn, teaBtn, toggle],
        });

        return el('li', {
          className: 'colleague-row',
          children: [
            el('div', {
              className: 'social-player-info',
              children: [
                el('strong', { className: 'colleague-name', text: p.name }),
                el('span', { className: 'colleague-title', text: ` · ${p.title}` }),
              ],
            }),
            actions,
          ],
        });
      }),
    );
  };

  let searchTimer: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(renderPlayers, 150);
  });

  hiddenOnly.addEventListener('click', () => {
    const on = hiddenOnly.getAttribute('aria-pressed') !== 'true';
    hiddenOnly.setAttribute('aria-pressed', String(on));
    hiddenOnly.classList.toggle('is-active', on);
    renderPlayers();
  });

  renderPlayers();

  // Rủ cả phòng uống trà sữa kèm bộ đếm cooldown 5 phút
  const teaTitle = el('strong', { text: STRINGS.tea.invite });
  const teaNote = el('small', { text: STRINGS.tea.inviteNote(MILK_TEA.price) });
  const tea = el('button', {
    className: 'tea-invite-button',
    attrs: { type: 'button' },
    children: [teaTitle, teaNote],
  });

  const updateTeaButtonState = (): void => {
    const remaining = o.teaCooldownRemainingSec ? o.teaCooldownRemainingSec() : 0;
    if (remaining > 0) {
      tea.disabled = true;
      tea.classList.add('is-cooldown');
      teaNote.textContent = s.cooldownNote(remaining);
    } else {
      tea.disabled = false;
      tea.classList.remove('is-cooldown');
      teaNote.textContent = STRINGS.tea.inviteNote(MILK_TEA.price);
    }
  };

  updateTeaButtonState();
  window.setInterval(updateTeaButtonState, 1000);

  tea.addEventListener('click', () => {
    o.onTeaInvite();
    updateTeaButtonState();
  });

  body.append(
    tea,
    directChatBox,
    el('h3', { text: s.players }),
    el('div', {
      className: 'company-map-filter',
      children: [search, el('div', { className: 'map-chips', children: [hiddenOnly] }), countText],
    }),
    list,
    el('p', { className: 'fortune-note', text: s.hiddenNote }),
  );
}
