// Dropdown đẹp thay cho <select> mặc định của trình duyệt (danh sách xám khó đổi màu):
// nút bo tròn có mũi tên, danh sách trượt mở/đóng mượt, mục đang chọn tô cam nhạt có dấu ✓.
// <select> gốc vẫn giữ giá trị và phát sự kiện "change" như cũ, nên code cũ không phải sửa.
// Dùng được bằng bàn phím (mũi tên, Enter, Esc) và đọc màn hình (role listbox/option).

const ENHANCED = 'pselectDone';
const CLOSE_MS = 170;
let openList: (() => void) | null = null;
let nextId = 1;

function enhance(select: HTMLSelectElement): void {
  if (select.dataset[ENHANCED] || select.multiple) return;
  select.dataset[ENHANCED] = '1';
  const listId = `pselect-${String(nextId++)}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `pselect-button ${select.className}`;
  button.setAttribute('role', 'combobox');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', listId);
  const label = select.getAttribute('aria-label');
  if (label) button.setAttribute('aria-label', label);
  const text = document.createElement('span');
  text.className = 'pselect-text';
  const arrow = document.createElement('span');
  arrow.className = 'pselect-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  button.append(text, arrow);

  const list = document.createElement('ul');
  list.className = 'pselect-list';
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  select.classList.add('pselect-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(button);

  let active = select.selectedIndex;
  let closeTimer: number | undefined;

  const render = (): void => {
    text.textContent = select.selectedOptions[0]?.textContent ?? '';
    button.disabled = select.disabled;
  };

  const paintActive = (): void => {
    [...list.children].forEach((li, i) => {
      li.classList.toggle('is-active', i === active);
      if (i === active) li.scrollIntoView({ block: 'nearest' });
    });
  };

  const choose = (index: number): void => {
    if (index < 0 || index >= select.options.length) return;
    if (select.selectedIndex !== index) {
      select.selectedIndex = index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    render();
    close();
    button.focus();
  };

  const place = (): void => {
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const height = Math.min(list.scrollHeight, 280);
    list.style.minWidth = `${String(Math.round(rect.width))}px`;
    list.style.left = `${String(Math.round(Math.min(rect.left, window.innerWidth - list.offsetWidth - 8)))}px`;
    if (below < height && rect.top > below) {
      list.style.top = '';
      list.style.bottom = `${String(Math.round(window.innerHeight - rect.top + 6))}px`;
      list.dataset.side = 'up';
    } else {
      list.style.bottom = '';
      list.style.top = `${String(Math.round(rect.bottom + 6))}px`;
      list.dataset.side = 'down';
    }
  };

  const open = (): void => {
    if (button.disabled) return;
    openList?.();
    window.clearTimeout(closeTimer);
    list.replaceChildren(
      ...[...select.options].map((option, i) => {
        const li = document.createElement('li');
        li.className = 'pselect-option';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === select.selectedIndex));
        li.textContent = option.textContent;
        if (option.disabled) li.setAttribute('aria-disabled', 'true');
        li.addEventListener('click', () => {
          if (!option.disabled) choose(i);
        });
        li.addEventListener('pointerenter', () => {
          active = i;
          paintActive();
        });
        return li;
      }),
    );
    active = Math.max(0, select.selectedIndex);
    document.body.append(list);
    list.hidden = false;
    place();
    paintActive();
    button.setAttribute('aria-expanded', 'true');
    button.classList.add('is-open');
    // Khung hình sau mới thêm lớp mở để hiệu ứng trượt chạy.
    window.requestAnimationFrame(() => {
      list.classList.add('is-open');
    });
    openList = close;
  };

  function close(): void {
    if (openList === close) openList = null;
    button.setAttribute('aria-expanded', 'false');
    button.classList.remove('is-open');
    list.classList.remove('is-open');
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      list.hidden = true;
      list.remove();
    }, CLOSE_MS);
  }

  button.addEventListener('click', () => {
    if (openList === close) close();
    else open();
  });
  button.addEventListener('keydown', (event) => {
    const isOpen = openList === close;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          open();
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        active = Math.min(select.options.length - 1, Math.max(0, active + step));
        paintActive();
        break;
      }
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen) choose(active);
        else open();
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
      case 'Tab':
        if (isOpen) close();
        break;
    }
  });

  // Code đổi giá trị / danh sách của <select> gốc: cập nhật lại nút.
  select.addEventListener('change', render);
  new MutationObserver(render).observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  render();
}

/** Tự đổi mọi <select> (có sẵn và thêm sau) trong `root` sang dropdown đẹp. */
export function enhanceSelects(root: HTMLElement): void {
  for (const select of root.querySelectorAll('select')) enhance(select);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLSelectElement) enhance(node);
        else if (node instanceof HTMLElement) {
          for (const select of node.querySelectorAll('select')) enhance(select);
        }
      }
    }
  }).observe(root, { childList: true, subtree: true });
  // Bấm ra ngoài, cuộn hay đổi cỡ cửa sổ thì đóng danh sách đang mở.
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.pselect-list') || target.closest('.pselect-button')) return;
      openList?.();
    },
    true,
  );
  window.addEventListener('resize', () => openList?.());
  document.addEventListener(
    'scroll',
    (event) => {
      if (event.target instanceof Element && event.target.closest('.pselect-list')) return;
      openList?.();
    },
    true,
  );
}
