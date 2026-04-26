// lib/scrapers/generic.ts  (v2 — ใช้ smart extractor + playwright fallback)

import * as cheerio from 'cheerio';
import { scrapeArticle } from './playwright-scraper';
import { RawArticle } from '../types';

export interface SiteConfig {
  name: string;
  baseUrl: string;
  listUrls: string[];
  articleLinkPattern: RegExp;
  excludePatterns?: RegExp[];
  jsHeavy?: boolean;
}

export const SITE_CONFIGS: SiteConfig[] = [
  {
    name: 'autosport.com',
    baseUrl: 'https://www.autosport.com',
    listUrls: ['https://www.autosport.com/f1/'],
    articleLinkPattern: /autosport\.com\/f1\/news\/[a-z0-9-]+/,
    excludePatterns: [/\/tag\//, /\/video\//, /\/gallery\//],
    jsHeavy: true,
  },
  {
    name: 'motorsport.com',
    baseUrl: 'https://www.motorsport.com',
    listUrls: ['https://www.motorsport.com/f1/news/'],
    articleLinkPattern: /motorsport\.com\/f1\/news\/[a-z0-9-]+/,
    excludePatterns: [/\/video\//, /\/photo\//],
    jsHeavy: true,
  },
  {
    name: 'bbc.com/sport/formula1',
    baseUrl: 'https://www.bbc.com',
    listUrls: ['https://www.bbc.com/sport/formula1'],
    articleLinkPattern: /bbc\.com\/sport\/formula1\/[0-9]+/,
    excludePatterns: [/\/live\//, /\/video\//],
    jsHeavy: false,
  },
  {
    name: 'skysports.com/f1',
    baseUrl: 'https://www.skysports.com',
    listUrls: ['https://www.skysports.com/f1/news'],
    articleLinkPattern: /skysports\.com\/f1\/news\/[0-9]+-[a-z0-9-]+/,
    excludePatterns: [/\/video\//, /\/gallery\//],
    jsHeavy: false,
  },
  {
    name: 'formula1.com',
    baseUrl: 'https://www.formula1.com',
    listUrls: ['https://www.formula1.com/en/latest/all.html'],
    articleLinkPattern: /formula1\.com\/en\/latest\/.+\.html/,
    excludePatterns: [/\/video\//, /\/listing\//],
    jsHeavy: true,
  },
  {
    name: 'theguardian.com/f1',
    baseUrl: 'https://www.theguardian.com',
    listUrls: ['https://www.theguardian.com/sport/formulaone'],
    articleLinkPattern: /theguardian\.com\/sport\/[0-9]{4}\/[a-z]{3}\/[0-9]+\/[a-z0-9-]+/,
    excludePatterns: [/\/video\//, /\/gallery\//],
    jsHeavy: false,
  },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

export async function fetchArticleUrls(config: SiteConfig, limit = 5): Promise<string[]> {
  const found: string[] = [];

  for (const listUrl of config.listUrls) {
    try {
      const res = await fetch(listUrl, {
        headers: HEADERS,
        signal: AbortSignal.timeout(12000),
        redirect: 'follow',
      });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      $('a[href]').each((_, el) => {
        if (found.length >= limit + 5) return false;
        const href = $(el).attr('href') || '';
        const full = href.startsWith('http') ? href : `${config.baseUrl}${href}`;
        const clean = full.split('?')[0].split('#')[0];

        const excluded = config.excludePatterns?.some(p => p.test(clean)) ?? false;
        if (config.articleLinkPattern.test(clean) && !excluded && !found.includes(clean)) {
          found.push(clean);
        }
      });

      if (found.length >= limit) break;
    } catch (e) {
      console.error(`[generic] list error: ${listUrl}`, e);
    }
  }

  return found.slice(0, limit);
}

export async function fetchArticleContent(url: string, config: SiteConfig): Promise<RawArticle | null> {
  return scrapeArticle(url, config.name);
}
