import { describe, expect, it } from 'vitest';
import { classifyLoginRisk } from '../src/services/risk';

const signal = (ip: string, country = 'CN', city = 'Shanghai') => ({ ipHash: ip, country, city, at: 1 });

describe('login risk classification', () => {
  it('returns warn at three distinct IP hashes', () => {
    expect(classifyLoginRisk([1, 2, 3].map((n) => ({ ipHash: String(n), country: 'CN', city: 'Shanghai', at: 1 })))).toBe('warn');
  });

  it('returns strong_warn at five distinct IP hashes', () => {
    expect(classifyLoginRisk([1, 2, 3, 4, 5].map((n) => ({ ipHash: String(n), country: 'CN', city: 'Shanghai', at: 1 })))).toBe('strong_warn');
  });

  it('returns none below three IP hashes and strong_warn across countries', () => {
    expect(classifyLoginRisk([])).toBe('none');
    expect(classifyLoginRisk([signal('1'), signal('2')])).toBe('none');
    expect(classifyLoginRisk([signal('1', 'CN'), signal('2', 'US')])).toBe('strong_warn');
  });
});
