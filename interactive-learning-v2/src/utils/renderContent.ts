/**
 * Escape HTML to prevent XSS.
 */
export function escapeHtml(str: unknown): string {
  if (typeof str !== 'string') return String(str == null ? '' : str);
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/**
 * Render simple markdown-like content to safe HTML.
 * Supports: ### headings, > blockquotes, **bold**, *italic*, `code`, [link](url), newlines.
 */
export function renderMarkdown(text: string): string {
  if (typeof text !== 'string') return '';
  let html = escapeHtml(text);

  // ### Headings
  html = html.replace(
    /(?:^|\r?\n)###\s*(.+?)(?=\r?\n|$)/g,
    '<h3 class="section-heading">$1</h3>'
  );
  // > Blockquotes
  html = html.replace(
    /(?:^|\r?\n)>\s*(.+?)(?=\r?\n|$)/g,
    '<blockquote class="section-blockquote">$1</blockquote>'
  );
  // **Bold**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // *Italic*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // `Code`
  html = html.replace(
    /`(.+?)`/g,
    '<code class="section-code">$1</code>'
  );
  // [Link](url)
  html = html.replace(
    /\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="section-link">$1</a>'
  );
  // Newlines → <br>
  html = html.replace(/\r?\n/g, '<br>');
  return html;
}

/**
 * Returns the percentage of correct answers, rounded to the nearest integer.
 * Returns 0 when total is 0.
 */
export function scorePercent(correct: number, total: number): number {
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

/**
 * Returns true when focus is inside a text-input element.
 */
export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}
