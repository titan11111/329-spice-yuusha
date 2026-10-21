/**
 * ふりがな記法 {漢字|よみ} の変換と、メッセージのページ分割。
 * 仕様: docs/02_UI.md 3章（1行20文字・1ウィンドウ3行・ふりがなは<ruby>）
 */

const RUBY_RE = /\{([^|{}]+)\|([^|{}]+)\}/g;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** {勇者|ゆうしゃ} → <ruby>勇者<rt>ゆうしゃ</rt></ruby> */
export function rubyToHtml(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(RUBY_RE)) {
    out += escapeHtml(text.slice(last, m.index));
    out += `<ruby>${escapeHtml(m[1])}<rt>${escapeHtml(m[2])}</rt></ruby>`;
    last = (m.index ?? 0) + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out.replace(/\n/g, '<br>');
}

/** ふりがなを取り除いた表示用の文字列（文字数の計算にも使う） */
export function stripRuby(text: string): string {
  return text.replace(RUBY_RE, '$1');
}

/** 1文字ずつ見せるためのトークン（ふりがな付きの語は1トークン＝まとめて出す） */
export interface RubyToken {
  base: string;
  rt?: string;
}

export function tokenize(text: string): RubyToken[] {
  const tokens: RubyToken[] = [];
  let last = 0;
  const pushPlain = (s: string) => {
    for (const ch of s) tokens.push({ base: ch });
  };
  for (const m of text.matchAll(RUBY_RE)) {
    pushPlain(text.slice(last, m.index));
    tokens.push({ base: m[1], rt: m[2] });
    last = (m.index ?? 0) + m[0].length;
  }
  pushPlain(text.slice(last));
  return tokens;
}

/** トークン列のうち、先頭から n トークンぶんを HTML にする（タイプライター表示用） */
export function tokensToHtml(tokens: RubyToken[], n: number): string {
  let html = '';
  for (const t of tokens.slice(0, n)) {
    if (t.base === '\n') html += '<br>';
    else if (t.rt) html += `<ruby>${escapeHtml(t.base)}<rt>${escapeHtml(t.rt)}</rt></ruby>`;
    else html += escapeHtml(t.base);
  }
  return html;
}

const tokenWidth = (t: RubyToken): number => [...t.base].length;

/**
 * 1行 maxChars 文字・1ページ maxLines 行でページ分割する。
 * 文の区切り（半角/全角スペース）では行の途中でも折り返さない努力はせず、素直に文字数で折る。
 * ふりがな付きの語は途中で割らない。
 */
export function paginate(text: string, maxChars = 20, maxLines = 3): string[] {
  const pages: string[] = [];
  const paragraphs = text.split('\n');
  let lines: string[] = [];
  const flushPage = () => {
    if (lines.length) pages.push(lines.join('\n'));
    lines = [];
  };
  for (const para of paragraphs) {
    const tokens = tokenize(para);
    let line = '';
    let width = 0;
    const pushLine = () => {
      lines.push(line);
      line = '';
      width = 0;
      if (lines.length >= maxLines) flushPage();
    };
    for (const t of tokens) {
      const w = tokenWidth(t);
      if (width + w > maxChars && width > 0) pushLine();
      line += t.rt ? `{${t.base}|${t.rt}}` : t.base;
      width += w;
    }
    if (line.length) pushLine();
  }
  flushPage();
  return pages.length ? pages : [''];
}
