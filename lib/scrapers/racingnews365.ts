// lib/scrapers/racingnews365.ts  (v2 — ใช้ smart extractor)

import * as cheerio from 'cheerio';
import { scrapeArticle } from './playwright-scraper';
import { RawArticle } from '../types';

const BASE = 'https://racingnews365.com';
const SOURCE_NAME = 'racingnews365.com';

// ── ดึงลิสต์ URLs ──
export async function fetchRacingNews365List(limit = 10): Promise<string[]> {
  const found: string[] = [];

  const pages = [
    `${BASE}/formula-1`,
    `${BASE}/formula-1/news`,
    `${BASE}/news`,
    BASE,
  ];

  for (const pageUrl of pages) {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      $('a[href]').each((_, el) => {
        if (found.length >= limit + 5) return false;
        const href = $(el).attr('href') || '';
        const full = href.startsWith('http') ? href : `${BASE}${href}`;

        if (
          full.includes('racingnews365.com') &&
          !full.endsWith('racingnews365.com/') &&
          !full.endsWith('racingnews365.com') &&
          !full.includes('/tag/') &&
          !full.includes('/category/') &&
          !full.includes('/author/') &&
          !full.includes('/page/') &&
          !full.includes('/search') &&
          !full.includes('#') &&
          !full.includes('?') &&
          (full.match(/racingnews365\.com\/[a-z0-9-]{15,}/) ||
           full.includes('/formula-1/')) &&
          !found.includes(full)
        ) {
          found.push(full);
        }
      });

      if (found.length >= limit) break;
    } catch (e) {
      console.error(`[rn365] list error: ${pageUrl}`, e);
    }
  }

  return [...new Set(found)].slice(0, limit);
}

// ── ดึง article เดียว ──
export async function fetchRacingNews365Article(url: string): Promise<RawArticle | null> {
  return scrapeArticle(url, SOURCE_NAME);
}
