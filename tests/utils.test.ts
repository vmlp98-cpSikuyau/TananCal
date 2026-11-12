import { describe, expect, it } from 'vitest';
import { assigneePatch, initial, isValidEmail, personKey, splitPersonKey } from '../src/lib/utils';
import { toCsv } from '../src/lib/export';
import { fromLocalInput, toLocalInput, overlapsDay } from '../src/lib/dates';

describe('utils', () => {
  it('builds a monogram from the first letter', () => {
    expect(initial('anthony')).toBe('A');
    expect(initial('  zed')).toBe('Z');
    expect(initial('')).toBe('?');
  });

  it('round-trips person keys and never sets both assignees', () => {
    expect(personKey('abc', null)).toBe('u:abc');
    expect(personKey(null, 'xyz')).toBe('m:xyz');
    expect(splitPersonKey('u:abc')).toEqual({ user: 'abc', manual: null });
    expect(assigneePatch('m:xyz')).toEqual({ assignee_user_id: null, assignee_manual_id: 'xyz' });
    expect(assigneePatch('')).toEqual({ assignee_user_id: null, assignee_manual_id: null });
  });

  it('validates emails', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });
});

describe('csv', () => {
  it('quotes cells and neutralises formulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', '=1+1']])).toBe("a,b\r\n\"x,y\",'=1+1");
    expect(toCsv(['a'], [['say "hi"']])).toBe('a\r\n"say ""hi"""');
  });
});

describe('dates', () => {
  it('round-trips datetime-local values', () => {
    const v = '2026-11-11T09:30';
    expect(toLocalInput(fromLocalInput(v))).toBe(v);
  });

  it('detects multi-day overlap', () => {
    const s = new Date(2026, 10, 10, 20).toISOString();
    const e = new Date(2026, 10, 12, 8).toISOString();
    expect(overlapsDay(s, e, new Date(2026, 10, 11))).toBe(true);
    expect(overlapsDay(s, e, new Date(2026, 10, 13))).toBe(false);
  });
});
