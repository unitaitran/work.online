// Giao lưu: biểu cảm, câu nhanh có sẵn (KHÔNG có chat tự do), danh sách đồng nghiệp trong phòng
// với nút ẩn/chặn cho riêng mình.
import { EMOTES, QUICK_CHATS, type Emote } from '@dilam/shared';
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
  onEmote(emote: Emote): void;
  onQuickChat(index: number): void;
  onToggleHidden(code: string, hidden: boolean): void;
}

export function mountSocialPanel(body: HTMLElement, o: SocialPanelOptions): void {
  const s = STRINGS.social;
  const emotes = el('div', {
    className: 'social-grid',
    children: EMOTES.map((emote) => {
      const b = el('button', {
        className: 'social-chip',
        text: s.emoteNames[emote] ?? emote,
        attrs: { type: 'button' },
      });
      b.addEventListener('click', () => {
        o.onEmote(emote);
      });
      return b;
    }),
  });
  const chats = el('div', {
    className: 'social-grid',
    children: QUICK_CHATS.map((text, index) => {
      const b = el('button', { className: 'social-chip', text, attrs: { type: 'button' } });
      b.addEventListener('click', () => {
        o.onQuickChat(index);
      });
      return b;
    }),
  });
  const list = el('ul', { className: 'social-players' });
  const renderPlayers = (): void => {
    const players = o.players();
    if (players.length === 0) {
      list.replaceChildren(el('li', { className: 'activity-intro', text: s.noPlayers }));
      return;
    }
    list.replaceChildren(
      ...players.map((p) => {
        const toggle = el('button', {
          className: 'button button-soft social-hide',
          text: p.hidden ? s.unhide : s.hide,
          attrs: { type: 'button', 'aria-pressed': String(p.hidden) },
        });
        toggle.addEventListener('click', () => {
          o.onToggleHidden(p.code, !p.hidden);
          renderPlayers();
        });
        return el('li', {
          children: [
            el('span', {
              className: 'social-player',
              children: [el('strong', { text: p.name }), el('span', { text: ` · ${p.title}` })],
            }),
            toggle,
          ],
        });
      }),
    );
  };
  renderPlayers();
  body.append(
    el('h3', { text: s.emotes }),
    emotes,
    el('h3', { text: s.quickChats }),
    chats,
    el('h3', { text: s.players }),
    list,
    el('p', { className: 'fortune-note', text: s.hiddenNote }),
  );
}
