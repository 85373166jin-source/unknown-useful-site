import superHtml from '../../../public/super/index.html?raw';
import anbuHtml from '../../../public/anbu/index.html?raw';
import douyinHtml from '../../../public/douyin/index.html?raw';
import { describe, expect, it } from 'vitest';

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

describe('standalone course pages', () => {
  it('keeps the super page lightweight and lazy-loads its video', () => {
    expect(superHtml).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(countMatches(superHtml, /class="lesson"/g)).toBe(18);
    expect(countMatches(superHtml, /data-lesson="第 1 课"/g)).toBe(1);
    expect(superHtml).toContain('preload="none"');
    expect(superHtml).toContain('super-course-18.zip');
    expect(superHtml.length).toBeLessThan(30_000);
  });

  it('renders the paid Douyin tutorial as a two-lesson standalone page', () => {
    expect(countMatches(douyinHtml, /class="lesson"/g)).toBe(2);
    expect(douyinHtml).toContain('douyin-01.mp4');
    expect(douyinHtml).toContain('douyin-02.mp4');
    expect(douyinHtml).toContain('preload="none"');
  });

  it('keeps the anbu page lightweight and lazy-loads its video', () => {
    expect(anbuHtml).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(countMatches(anbuHtml, /class="lesson"/g)).toBe(31);
    expect(countMatches(anbuHtml, /data-lesson="第 1 课"/g)).toBe(1);
    expect(anbuHtml).toContain('preload="none"');
    expect(anbuHtml).toContain('anbu-course-31.zip');
    expect(anbuHtml.length).toBeLessThan(40_000);
  });
});