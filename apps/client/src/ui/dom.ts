export interface ElementOptions {
  className?: string;
  /** Luôn đặt bằng textContent: không bao giờ chèn HTML. */
  text?: string;
  attrs?: Readonly<Record<string, string>>;
  children?: readonly Node[];
}

/** Tạo phần tử DOM gọn. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {}))
    element.setAttribute(name, value);
  if (options.children) element.append(...options.children);
  return element;
}
