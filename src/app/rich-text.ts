/** Shared helpers for Quill / PrimeNG Editor HTML used in radiology templates. */

export function isRichHtml(value: string | null | undefined): boolean {
  return !!value && /<\/?[a-z][\s\S]*>/i.test(value);
}

export function stripHtml(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function plainToEditorHtml(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  if (isRichHtml(value)) {
    return value;
  }
  return value
    .split(/\n/)
    .map((line) => `<p>${escapeAttr(line) || '<br>'}</p>`)
    .join('');
}

/** Allowlist for print / preview — strips scripts and unknown tags. */
export function sanitizeReportHtml(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  if (!isRichHtml(value)) {
    return escapeAttr(value).replace(/\n/g, '<br>');
  }

  let html = value
    .replace(/<(script|style|iframe|object|embed|link|meta)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');

  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'span', 'div']);
    if (!allowed.has(name)) {
      return '';
    }
    if (name === 'br') {
      return '<br>';
    }
    const closing = full.startsWith('</');
    if (closing) {
      return `</${name}>`;
    }
    // Drop attributes except class on span (Quill sometimes adds ql-*)
    if (name === 'span' && /class\s*=/i.test(attrs)) {
      const cls = attrs.match(/class\s*=\s*("([^"]*)"|'([^']*)')/i);
      const safe = (cls?.[2] ?? cls?.[3] ?? '').replace(/[^a-z0-9\s\-_]/gi, '');
      return safe ? `<span class="${safe}">` : '<span>';
    }
    return `<${name}>`;
  });

  return html;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const radiologyEditorModules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ header: [2, 3, false] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['clean'],
  ],
};
