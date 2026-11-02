import {
  HAIR_COLORS,
  HAIR_STYLES,
  NAME_MAX_LENGTH,
  normalizeName,
  OUTFITS,
  SKIN_TONES,
  type Appearance,
  type Profile,
} from '../avatar/appearance';
import { randomVietnameseName } from '../avatar/names';
import { POSES, type PoseName } from '../avatar/pose';
import type { ViewInset } from '../scenes/creatorScene';
import { STRINGS } from '../strings';
import { el } from './dom';

export interface CreatorPanelOptions {
  profile: Profile;
  /** Thông báo hiện trên đầu bảng (ví dụ: trình duyệt chặn lưu). */
  notice: string | null;
  onAppearanceChange(appearance: Appearance): void;
  onPoseChange(pose: PoseName): void;
  onEnter(profile: Profile): void;
}

export interface CreatorPanel {
  readonly element: HTMLElement;
  /** Phần màn hình bảng đang che, để màn 3D dời nhân vật sang chỗ trống. */
  getInset(): ViewInset;
  dispose(): void;
}

const WIDE_LAYOUT = '(min-width: 760px)';

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

interface ChoiceOption<T> {
  value: T;
  label: string;
  swatch?: number;
}

/** Một nhóm nút chọn một (dùng role="radiogroup" cho trình đọc màn hình). */
function choiceGroup<T>(
  title: string,
  options: readonly ChoiceOption<T>[],
  initial: T,
  onSelect: (value: T) => void,
): HTMLElement {
  const label = el('p', { className: 'creator-label', text: title });
  const group = el('div', { className: 'choice-group', attrs: { role: 'radiogroup' } });
  group.setAttribute('aria-label', title);
  const buttons: HTMLButtonElement[] = [];

  const select = (index: number): void => {
    buttons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
    });
  };

  options.forEach((option, index) => {
    const button = el('button', {
      className: option.swatch === undefined ? 'choice' : 'choice choice-swatch',
      attrs: { type: 'button', role: 'radio', 'aria-label': option.label, title: option.label },
    });
    if (option.swatch === undefined) button.textContent = option.label;
    else button.style.setProperty('--swatch', hex(option.swatch));
    button.addEventListener('click', () => {
      select(index);
      onSelect(option.value);
    });
    button.addEventListener('keydown', (event) => {
      const step =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = (index + step + options.length) % options.length;
      buttons[next]?.focus();
      buttons[next]?.click();
    });
    buttons.push(button);
    group.append(button);
  });
  select(
    Math.max(
      0,
      options.findIndex((option) => option.value === initial),
    ),
  );

  return el('div', { className: 'creator-field', children: [label, group] });
}

export function mountCreatorPanel(root: HTMLElement, options: CreatorPanelOptions): CreatorPanel {
  let appearance: Appearance = { ...options.profile.appearance };
  const s = STRINGS.creator;

  const update = (patch: Partial<Appearance>): void => {
    appearance = { ...appearance, ...patch };
    options.onAppearanceChange(appearance);
  };

  const nameInput = el('input', {
    className: 'creator-input',
    attrs: {
      id: 'creator-name',
      type: 'text',
      maxlength: String(NAME_MAX_LENGTH),
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: s.namePlaceholder,
    },
  });
  nameInput.value = options.profile.name;

  const randomButton = el('button', {
    className: 'button button-soft',
    text: s.randomName,
    attrs: { type: 'button', title: s.randomNameHint },
  });
  randomButton.addEventListener('click', () => {
    nameInput.value = randomVietnameseName(Math.random, nameInput.value);
  });

  const enterButton = el('button', {
    className: 'button button-primary creator-enter',
    text: s.enter,
    attrs: { type: 'submit' },
  });

  const form = el('form', {
    className: 'creator-panel',
    attrs: { 'aria-labelledby': 'creator-title' },
    children: [
      el('h1', { className: 'creator-title', text: s.title, attrs: { id: 'creator-title' } }),
      el('p', { className: 'creator-subtitle', text: s.subtitle }),
      ...(options.notice
        ? [el('p', { className: 'notice', text: options.notice, attrs: { role: 'status' } })]
        : []),
      el('div', {
        className: 'creator-field',
        children: [
          el('label', {
            className: 'creator-label',
            text: s.nameLabel,
            attrs: { for: 'creator-name' },
          }),
          el('div', { className: 'creator-name-row', children: [nameInput, randomButton] }),
        ],
      }),
      choiceGroup(
        s.skin,
        SKIN_TONES.map((color, index) => ({
          value: index,
          label: STRINGS.skinTones[index] ?? '',
          swatch: color,
        })),
        appearance.skin,
        (skin) => {
          update({ skin });
        },
      ),
      choiceGroup(
        s.hairStyle,
        HAIR_STYLES.map((style) => ({ value: style, label: STRINGS.hairStyles[style] })),
        appearance.hairStyle,
        (hairStyle) => {
          update({ hairStyle });
        },
      ),
      choiceGroup(
        s.hairColor,
        HAIR_COLORS.map((color, index) => ({
          value: index,
          label: STRINGS.hairColors[index] ?? '',
          swatch: color,
        })),
        appearance.hairColor,
        (hairColor) => {
          update({ hairColor });
        },
      ),
      choiceGroup(
        s.outfit,
        OUTFITS.map((outfit) => ({ value: outfit, label: STRINGS.outfits[outfit] })),
        appearance.outfit,
        (outfit) => {
          update({ outfit });
        },
      ),
      choiceGroup(
        s.pose,
        POSES.map((pose) => ({ value: pose, label: STRINGS.poses[pose] })),
        'stand',
        (pose) => {
          options.onPoseChange(pose);
        },
      ),
      el('p', { className: 'creator-hint', text: s.rotateHint }),
      enterButton,
    ],
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let name = normalizeName(nameInput.value);
    if (name === '') {
      name = randomVietnameseName();
      nameInput.value = name;
    }
    options.onEnter({ name, appearance });
  });

  root.append(form);
  const wide = window.matchMedia(WIDE_LAYOUT);

  return {
    element: form,
    getInset() {
      const rect = form.getBoundingClientRect();
      return wide.matches
        ? { right: Math.round(window.innerWidth - rect.left), bottom: 0 }
        : { right: 0, bottom: Math.round(window.innerHeight - rect.top) };
    },
    dispose() {
      form.remove();
    },
  };
}
