import test from 'node:test';
import assert from 'node:assert/strict';
import { rubyToHtml, stripRuby, paginate, tokenize, tokensToHtml } from '../src/core/ruby.ts';

test('rubyToHtml: {漢字|よみ} を <ruby> にする', () => {
  assert.equal(
    rubyToHtml('{勇者|ゆうしゃ}よ'),
    '<ruby>勇者<rt>ゆうしゃ</rt></ruby>よ',
  );
});

test('rubyToHtml: HTMLをエスケープする', () => {
  assert.equal(rubyToHtml('<b>&'), '&lt;b&gt;&amp;');
});

test('stripRuby: ふりがなを除く', () => {
  assert.equal(stripRuby('{魔王|まおう}が {空|そら}を'), '魔王が 空を');
});

test('tokensToHtml: 途中まで表示できる', () => {
  const t = tokenize('{勇者|ゆうしゃ}よ');
  assert.equal(t.length, 2);
  assert.equal(tokensToHtml(t, 1), '<ruby>勇者<rt>ゆうしゃ</rt></ruby>');
});

test('paginate: 1行20文字・3行で分割、ふりがな語は割らない', () => {
  const long = 'あ'.repeat(25) + '{勇者|ゆうしゃ}';
  const pages = paginate(long, 20, 3);
  assert.equal(pages.length, 1);
  const lines = pages[0].split('\n');
  assert.equal(lines.length, 2);
  assert.equal(stripRuby(lines[0]).length, 20);
  assert.ok(lines[1].includes('{勇者|ゆうしゃ}'));
});

test('paginate: 4行以上は次のページへ', () => {
  const pages = paginate('あ'.repeat(70), 20, 3);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].split('\n').length, 3);
});
