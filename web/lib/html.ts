/**
 * Type-safe HTML rendering engine with automatic XSS escaping.
 *
 * Provides a zero-dependency tagged template literal (`html`) that automatically escapes
 * dynamic values unless explicitly wrapped in `raw()`.
 */

export class SafeHtml {
  constructor(public readonly value: string) {}

  public toString(): string {
    return this.value;
  }
}

/**
 * Marks an already-escaped or trusted HTML string so that it will not be re-escaped.
 *
 * @param value Safe HTML string content.
 * @returns SafeHtml wrapper.
 */
export function raw(value: string | number | null | undefined): SafeHtml {
  if (value === null || value === undefined) {
    return new SafeHtml('');
  }
  return new SafeHtml(String(value));
}

/**
 * Strictly escapes characters with special meaning in HTML to prevent XSS attacks.
 *
 * @param value Untrusted user or database value.
 * @returns Sanitized string suitable for HTML body or attribute insertion.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Composable tagged template literal for type-safe, auto-escaping HTML construction.
 *
 * @example
 * const greeting = html`<p>Hello, ${userName}!</p>`;
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof SafeHtml) {
        result += val.value;
      } else if (Array.isArray(val)) {
        for (const item of val) {
          if (item instanceof SafeHtml) {
            result += item.value;
          } else {
            result += escapeHtml(item);
          }
        }
      } else {
        result += escapeHtml(val);
      }
    }
  }

  return new SafeHtml(result);
}

/**
 * Join an array of safe HTML or raw items with a separator.
 *
 * @param items Items to join.
 * @param separator Separator string.
 * @returns Combined SafeHtml.
 */
export function joinHtml(items: (SafeHtml | string)[], separator: string = ''): SafeHtml {
  const parts: string[] = [];
  for (const item of items) {
    if (item instanceof SafeHtml) {
      parts.push(item.value);
    } else {
      parts.push(escapeHtml(item));
    }
  }
  return new SafeHtml(parts.join(separator));
}
