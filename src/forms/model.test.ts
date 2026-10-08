import { describe, expect, it } from 'vitest';
import {
  answerCell, answerError, convertQuestion, deviceKey, exportTable, fileProblem, formRating, isOpen, moveQuestion, newQuestion, paginate,
  parseOptions, questionsLine, ratingLine, relativeTime, responsesLine, scaleRows, summarize, templates,
  type FormResponse, type Question,
} from './model';

const response = (answers: FormResponse['answers'], created_at = '2026-09-29T08:00:00Z'): FormResponse => ({ id: Math.random().toString(36), form_id: 'f', answers, created_at });

describe('questions', () => {
  it('gives each type sensible defaults', () => {
    expect(newQuestion('choice').options).toHaveLength(2);
    expect(newQuestion('rating').max).toBe(5);
    expect(newQuestion('scale')).toMatchObject({ min: 1, max: 5 });
    expect(newQuestion('file').accept).toEqual(['pdf', 'image']);
    expect(newQuestion('section')).not.toHaveProperty('required');
  });

  it('keeps what it can when the type changes', () => {
    const choice: Question = { ...newQuestion('choice'), title: 'الجلسة', required: true, other: true };
    const dropdown = convertQuestion(choice, 'dropdown');
    expect(dropdown).toMatchObject({ id: choice.id, title: 'الجلسة', required: true, type: 'dropdown' });
    expect(dropdown.options?.map(option => option.label)).toEqual(choice.options?.map(option => option.label));
    expect(dropdown).not.toHaveProperty('other');
    expect(convertQuestion({ ...newQuestion('scale'), max: 10 }, 'rating').max).toBe(10);
    expect(convertQuestion({ ...newQuestion('scale'), max: 2 }, 'rating').max).toBe(3);
    expect(convertQuestion(choice, 'short').options).toBeUndefined();
  });

  it('turns a pasted list into options, dropping bullets and numbering', () => {
    expect(parseOptions('- صباحية\n2) مسائية\n\n• ليلية ')).toEqual(['صباحية', 'مسائية', 'ليلية']);
  });

  it('moves a question within bounds', () => {
    const [a, b, c] = ['a', 'b', 'c'].map(id => ({ ...newQuestion('short'), id }));
    expect(moveQuestion([a, b, c], 0, 1).map(item => item.id)).toEqual(['b', 'a', 'c']);
    expect(moveQuestion([a, b, c], 0, -1).map(item => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('builds every template with unique question ids and at least one question', () => {
    for (const template of templates) {
      const built = template.build('ar');
      expect(built.questions.length).toBeGreaterThan(0);
      expect(new Set(built.questions.map(item => item.id)).size).toBe(built.questions.length);
    }
  });
});

describe('pages and status', () => {
  const q = (id: string, type: Question['type'] = 'short'): Question => ({ ...newQuestion(type), id });

  it('starts a new page at every section', () => {
    const pages = paginate([q('a'), q('s1', 'section'), q('b'), q('c'), q('s2', 'section'), q('d')]);
    expect(pages.map(page => [page.section?.id ?? null, page.questions.map(item => item.id)])).toEqual([
      [null, ['a']], ['s1', ['b', 'c']], ['s2', ['d']],
    ]);
  });

  it('does not show an empty first page when the form opens with a section', () => {
    expect(paginate([q('s1', 'section'), q('a')]).map(page => page.section?.id)).toEqual(['s1']);
    expect(paginate([])).toHaveLength(1);
  });

  it('closes on the flag or the date, whichever comes first', () => {
    const now = Date.parse('2026-09-29T08:00:00Z');
    expect(isOpen({ accepting: true, close_at: null }, now)).toBe(true);
    expect(isOpen({ accepting: false, close_at: null }, now)).toBe(false);
    expect(isOpen({ accepting: true, close_at: '2026-09-29T07:59:00Z' }, now)).toBe(false);
  });
});

describe('validation mirrors the server', () => {
  const required = (type: Question['type']): Question => ({ ...newQuestion(type), required: true });

  it('requires an answer only where asked', () => {
    expect(answerError(required('short'), '   ')).toBe('required');
    expect(answerError(required('checkbox'), [])).toBe('required');
    expect(answerError(newQuestion('short'), undefined)).toBeNull();
  });

  it('checks email, phone and number formats', () => {
    expect(answerError(newQuestion('email'), 'name@example')).toBe('email');
    expect(answerError(newQuestion('email'), 'name@example.com')).toBeNull();
    expect(answerError(newQuestion('phone'), '12ab')).toBe('phone');
    expect(answerError(newQuestion('phone'), '+968 9123 4567')).toBeNull();
    expect(answerError(newQuestion('number'), 'ten')).toBe('number');
    expect(answerError(newQuestion('number'), 10)).toBeNull();
  });

  it('checks a file against the allowed kinds and the size limit', () => {
    expect(fileProblem({ name: 'cv.pdf', type: 'application/pdf', size: 1000 }, ['pdf'])).toBeNull();
    expect(fileProblem({ name: 'photo.JPG', type: '', size: 1000 }, ['image'])).toBeNull();
    expect(fileProblem({ name: 'run.exe', type: 'application/x-msdownload', size: 1000 }, ['pdf'])).toBe('file_type');
    expect(fileProblem({ name: 'big.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 }, ['pdf'])).toBe('file_size');
  });
});

describe('ratings and scales', () => {
  it('says the rating in words, with "من" rather than a slash', () => {
    expect(ratingLine(4, 5, 'ar')).toBe('4 من 5 — جيد جدًا');
    expect(ratingLine(1, 5, 'ar')).toBe('1 من 5 — سيئ');
    expect(ratingLine(10, 10, 'en')).toBe('10 of 10 — Excellent');
  });

  it('splits a long scale into two balanced rows for phones', () => {
    expect(scaleRows(1, 5)).toEqual([[1, 2, 3, 4, 5]]);
    expect(scaleRows(0, 10)).toEqual([[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]);
    expect(scaleRows(1, 10)).toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]);
  });
});

describe('summaries', () => {
  const choice: Question = { ...newQuestion('checkbox'), id: 'c', options: [{ id: '1', label: 'أ' }, { id: '2', label: 'ب' }], other: true };
  const stars: Question = { ...newQuestion('rating'), id: 'r', max: 5 };
  const scale: Question = { ...newQuestion('scale'), id: 's', min: 0, max: 3 };
  const text: Question = { ...newQuestion('paragraph'), id: 't' };
  const responses = [
    response({ c: ['أ', 'ب'], r: 5, s: 3, t: 'ممتاز' }),
    response({ c: ['أ', 'شيء آخر'], r: 4, s: 0 }),
    response({ r: 3 }),
  ];

  it('counts options and gathers typed-in answers as "other"', () => {
    const result = summarize(choice, responses, 'ar');
    expect(result).toMatchObject({ kind: 'choice', total: 2 });
    if (result.kind !== 'choice') throw new Error('kind');
    expect(result.rows.map(row => [row.label, row.count, row.share])).toEqual([['أ', 2, 100], ['ب', 1, 50], ['أخرى', 1, 50]]);
  });

  it('averages stars and shows how they spread', () => {
    const result = summarize(stars, responses, 'ar');
    if (result.kind !== 'rating') throw new Error('kind');
    expect(result.average).toBe(4);
    expect(result.rows.map(row => row.count)).toEqual([0, 0, 1, 1, 1]);
  });

  it('covers every point of a scale that starts at zero', () => {
    const result = summarize(scale, responses, 'ar');
    if (result.kind !== 'scale') throw new Error('kind');
    expect(result.rows.map(row => row.value)).toEqual([0, 1, 2, 3]);
    expect(result.average).toBe(1.5);
  });

  it('lists text answers and ignores blanks', () => {
    expect(summarize(text, responses, 'ar')).toEqual({ kind: 'text', total: 1, items: ['ممتاز'] });
  });

  it('scales every star question to five for the form rating', () => {
    const ten: Question = { ...newQuestion('rating'), id: 'x', max: 10 };
    expect(formRating([stars, ten], [response({ r: 5, x: 5 })])).toBe(3.75);
    expect(formRating([text], responses)).toBeNull();
  });
});

describe('export', () => {
  it('keeps numbers as numbers and joins lists', () => {
    const stars: Question = { ...newQuestion('rating'), id: 'r', title: 'التقييم' };
    const pick: Question = { ...newQuestion('checkbox'), id: 'c', title: 'الجلسات' };
    const table = exportTable({ questions: [stars, { ...newQuestion('section'), id: 's' }, pick] }, [response({ r: 4, c: ['أ', 'ب'] })], 'ar');
    expect(table[0].slice(1)).toEqual(['التقييم', 'الجلسات']);
    expect(table[1].slice(1)).toEqual([4, 'أ، ب']);
    expect(answerCell(pick, undefined)).toBe('');
  });
});

describe('words', () => {
  it('agrees Arabic counts with their numbers', () => {
    expect(responsesLine(0, 'ar')).toBe('لا ردود');
    expect(responsesLine(1, 'ar')).toBe('رد واحد');
    expect(responsesLine(2, 'ar')).toBe('ردّان');
    expect(responsesLine(7, 'ar')).toBe('7 ردود');
    expect(responsesLine(15, 'ar')).toBe('15 ردًا');
    expect(questionsLine(3, 'ar')).toBe('3 أسئلة');
    expect(responsesLine(1, 'en')).toBe('1 response');
  });

  it('says how long ago in words', () => {
    const now = Date.parse('2026-09-29T08:00:00Z');
    expect(relativeTime('2026-09-29T07:59:40Z', now, 'ar')).toBe('الآن');
    expect(relativeTime('2026-09-29T07:58:00Z', now, 'ar')).toBe('قبل دقيقتين');
    expect(relativeTime('2026-09-29T05:00:00Z', now, 'ar')).toBe('قبل 3 ساعات');
    expect(relativeTime('2026-09-28T08:00:00Z', now, 'ar')).toBe('قبل يوم');
  });
});

describe('device key', () => {
  it('is created once and reused', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    const first = deviceKey(storage);
    expect(first).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(deviceKey(storage)).toBe(first);
    expect(deviceKey(null)).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });
});
