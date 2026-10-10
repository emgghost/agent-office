import test from 'node:test';
import assert from 'node:assert/strict';
import { rtlRuns } from '../src/client/ui/rtl.js';

const runs = (text: string) => rtlRuns(text).map(([a, b]) => text.slice(a, b));

test('a right-to-left sentence is one run, from its first letter to its last', () => {
  assert.deepEqual(runs('Persian: سلام، این یک تست است'), ['سلام، این یک تست است']);
  // The zero-width non-joiner in تست‌ها and می‌خورند, where xterm used to split the row.
  assert.deepEqual(runs('> چرا تست‌ها شکست می‌خورند؟  '), ['چرا تست‌ها شکست می‌خورند؟']);
  assert.deepEqual(runs('שלום עולם'), ['שלום עולם']);
  assert.deepEqual(runs('مرحبا بالعالم!'), ['مرحبا بالعالم']);
});

test('Latin text breaks a run, and what is left of it is a run of its own', () => {
  assert.deepEqual(runs('لطفا فایل config.ts را باز کن'), ['لطفا فایل', 'را باز کن']);
  assert.deepEqual(runs('fix the bug in فایل اصلی now'), ['فایل اصلی']);
});

test('digits and punctuation inside a run stay in it, and marks stay on their letter', () => {
  assert.deepEqual(runs('تست ۳ بار و 2 بار (حداقل)'), ['تست ۳ بار و 2 بار (حداقل)']);
  assert.deepEqual(runs('خطا: فایل پیدا نشد (۳ بار امتحان شد) ok'), ['خطا: فایل پیدا نشد (۳ بار امتحان شد)']);
  assert.deepEqual(runs('گفت «سلام» و رفت'), ['گفت «سلام» و رفت']);
  // A bracket that closes after Latin text isn't the run's to take.
  assert.deepEqual(runs('(فایل config)'), ['فایل']);
  assert.deepEqual(runs('مُحَمَّد'), ['مُحَمَّد']);
  assert.deepEqual(runs('کتاب‌'), ['کتاب‌']);
});

test('a line with no right-to-left text, or one lone letter, joins nothing', () => {
  assert.deepEqual(rtlRuns('npm test && git push'), []);
  assert.deepEqual(rtlRuns(''), []);
  assert.deepEqual(rtlRuns('a ب c'), []);
});
