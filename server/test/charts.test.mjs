import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTick, niceTicks, parseNumber, parseTableSeries, seriesShape } from '../charts.mjs';
import { generateArtifact } from '../artifacts.mjs';

test('a cell is a number only when the digits are the point of it', () => {
  assert.deepEqual(parseNumber('4200'), { value: 4200, unit: '' });
  assert.deepEqual(parseNumber('1,250.5'), { value: 1250.5, unit: '' });
  assert.deepEqual(parseNumber('٤٢٠٠'), { value: 4200, unit: '' }, 'Arabic-Indic digits are numbers too');
  assert.deepEqual(parseNumber('15 ر.ع'), { value: 15, unit: 'ر.ع' });
  assert.deepEqual(parseNumber('92%'), { value: 92, unit: '%' });
  assert.equal(parseNumber('ذكاء اصطناعي'), null);
  assert.equal(parseNumber('أقيمت 3 ورش خلال الربع الحالي بحضور كبير'), null, 'a sentence containing a number is not a value');
  assert.equal(parseNumber(''), null);
});

const revenue = [
  ['الشهر', 'الإيراد'],
  ['يناير', '4200'], ['فبراير', '5100'], ['مارس', '4800'], ['أبريل', '6300'],
  ['مايو', '7100'], ['يونيو', '6900'], ['يوليو', '8200'],
];

test('a table yields the one series it is really about', () => {
  const series = parseTableSeries(revenue);
  assert.equal(series.title, 'الإيراد');
  assert.equal(series.labels[0], 'يناير');
  assert.deepEqual(series.values.slice(0, 3), [4200, 5100, 4800]);
  assert.equal(series.max, 8200);
  assert.equal(series.shape, 'time');
});

test('the value column is the last numeric one, not the first number seen', () => {
  const series = parseTableSeries([
    ['الورشة', 'السنة', 'المشاركون'],
    ['أ', '2026', '24'], ['ب', '2026', '18'], ['ج', '2026', '12'],
  ]);
  assert.deepEqual(series.values, [24, 18, 12]);
  assert.equal(series.title, 'المشاركون');
});

test('a unit shared by every row is carried, a mixed one is dropped', () => {
  assert.equal(parseTableSeries([['البند', 'المبلغ'], ['أ', '10 ر.ع'], ['ب', '20 ر.ع'], ['ج', '30 ر.ع']]).unit, 'ر.ع');
  assert.equal(parseTableSeries([['البند', 'المبلغ'], ['أ', '10 ر.ع'], ['ب', '20%'], ['ج', '30 ر.ع']]).unit, '');
});

test('a table that is not a series produces no chart', () => {
  assert.equal(parseTableSeries([['أ', 'ب'], ['ج', 'د'], ['هـ', 'و'], ['ز', 'ح']]), null, 'no numeric column');
  assert.equal(parseTableSeries([['الشهر', 'الإيراد'], ['يناير', '100'], ['فبراير', '200']]), null, 'two bars are a sentence, not a chart');
  assert.equal(parseTableSeries([['الشهر'], ['يناير']]), null, 'one column is not a series');
  assert.equal(parseTableSeries(Array.from({ length: 20 }, (_, i) => ['ص', String(i + 1)])), null, 'too many rows belong in the table');
  assert.equal(parseTableSeries([['البند', 'الفرق'], ['أ', '-5'], ['ب', '10'], ['ج', '20']]), null, 'a bar chart of mixed signs is refused');
  assert.equal(parseTableSeries([['البند', 'العدد'], ['أ', '0'], ['ب', '0'], ['ج', '0']]), null, 'an all-zero series says nothing');
  assert.equal(parseTableSeries(null), null);
});

test('ordered months read as time, a handful of names read as categories', () => {
  assert.equal(seriesShape(['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو']), 'time');
  assert.equal(seriesShape(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']), 'time');
  assert.equal(seriesShape(['ذكاء اصطناعي', 'أتمتة', 'تحليل بيانات']), 'category');
  assert.equal(seriesShape(['يناير', 'فبراير', 'مارس']), 'category', 'three points are not a trend');
});

test('the scale always covers the largest value and always starts at zero', () => {
  // The bug this guards: a top tick below the maximum drew the biggest bar
  // straight off the page.
  for (const max of [1, 3, 7, 9, 24, 99, 101, 8200, 12345, 0.4, 2.5, 999999]) {
    const ticks = niceTicks(max);
    assert.equal(ticks[0], 0, `scale for ${max} must start at zero`);
    assert.ok(ticks[ticks.length - 1] >= max, `scale for ${max} stopped at ${ticks[ticks.length - 1]}`);
    assert.ok(ticks.length >= 2 && ticks.length <= 8, `scale for ${max} has ${ticks.length} ticks`);
  }
  assert.deepEqual(niceTicks(0), [0]);
  assert.deepEqual(niceTicks(-5), [0]);
});

test('tick labels are readable numbers', () => {
  assert.equal(formatTick(10000), '10,000');
  assert.equal(formatTick(7.5), '7.5');
  assert.equal(formatTick(0), '0');
});

test('a report with a series draws it, and one without does not', async () => {
  const table = ['| الشهر | الإيراد |', '| --- | --- |', '| يناير | 4200 |', '| فبراير | 5100 |', '| مارس | 4800 |', '| أبريل | 6300 |'].join('\n');
  const plain = ['| الشهر | الحالة |', '| --- | --- |', '| يناير | مكتمل |', '| فبراير | مكتمل |', '| مارس | متأخر |', '| أبريل | مكتمل |'].join('\n');
  const charted = await generateArtifact('pdf', table, 'تقرير');
  const bare = await generateArtifact('pdf', plain, 'تقرير');
  assert.ok(charted.buffer.length > bare.buffer.length + 300, 'the charted report must carry extra drawing');
  assert.equal(charted.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
});

test('charting never breaks pagination or the document', async () => {
  const rows = Array.from({ length: 6 }, (_, index) => `| بند ${index + 1} | ${(index + 1) * 1100} |`).join('\n');
  const body = Array.from({ length: 4 }, () => `## قسم\n| البند | القيمة |\n| --- | --- |\n${rows}`).join('\n');
  const result = await generateArtifact('pdf', body, 'تقرير متعدد الرسوم');
  const pages = (result.buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pages >= 2 && pages <= 8, `unexpected page count ${pages}`);
});
