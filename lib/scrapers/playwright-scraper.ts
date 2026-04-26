// lib/scrapers/playwright-scraper.ts
// ใช้กับเว็บที่ JS-render content เช่น autosport, motorsport
// Vercel ไม่ support Playwright → ใช้ external service แทน

import { extractContent } from './extractor';
import { RawArticle } from '../types';

// ── Option 1: Browserless.io (มี free tier 6hr/month) ──
// ตั้งค่า BROWSERLESS_TOKEN ใน .env.local
async function fetchWithBrowserless(url: string): Promise<string | null> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`https://chrome.browserless.io/content?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        waitFor: 2000,  // รอ JS render 2 วิ
        gotoOptions: { waitUntil: 'networkidle2' },
      }),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

// ── Option 2: ScrapingBee (มี free 1000 credits) ──
// ตั้งค่า SCRAPINGBEE_KEY ใน .env.local
async function fetchWithScrapingBee(url: string): Promise<string | null> {
  const key = process.env.SCRAPINGBEE_KEY;
  if (!key) return null;

  try {
    const params = new URLSearchParams({
      api_key: key,
      url,
      render_js: 'true',
      wait: '2000',
    });
    const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

// ── Option 3: Jina AI Reader (ฟรี ไม่ต้อง key แต่ช้า) ──
// แปลง URL → https://r.jina.ai/{url} จะได้ markdown สะอาด
async function fetchWithJina(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const md = await res.text();
    // Jina ส่งมาเป็น markdown ต้องแปลงให้เป็น format เดิม
    return convertJinaMarkdown(md);
  } catch {
    return null;
  }
}

// แปลง Jina markdown → structured text format ของเรา
function convertJinaMarkdown(md: string): string {
  const lines = md.split('\n');
  const parts: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 20) continue;
    if (trimmed.startsWith('# '))  { parts.push(`[H1] ${trimmed.slice(2)}`); continue; }
    if (trimmed.startsWith('## ')) { parts.push(`[H2] ${trimmed.slice(3)}`); continue; }
    if (trimmed.startsWith('### ')){ parts.push(`[H3] ${trimmed.slice(4)}`); continue; }
    if (trimmed.startsWith('> '))  { parts.push(`[QUOTE] ${trimmed.slice(2)}`); continue; }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      parts.push(`[LI] ${trimmed.slice(2)}`); continue;
    }
    if (trimmed.length > 50) parts.push(`[P] ${trimmed}`);
  }
  return parts.join('\n');
}

// ── Option 4: URLbox / Apify (paid แต่ reliable) ──
// ไว้เป็น fallback สุดท้าย

// ── Main: fetch HTML ด้วย strategy ที่เหมาะสม ──
export type FetchStrategy = 'cheerio' | 'jina' | 'browserless' | 'scrapingbee';

const JS_HEAVY_SITES = [
  'autosport.com',
  'motorsport.com',
  'formula1.com',
  'pitpass.com',
];

export function needsJsRender(url: string): boolean {
  return JS_HEAVY_SITES.some(s => url.includes(s));
}

export async function smartFetch(url: string): Promise<{
  html: string;
  strategy: FetchStrategy;
} | null> {
  const isJsHeavy = needsJsRender(url);

  // ── Static sites → Cheerio ก่อน ──
  if (!isJsHeavy) {
    const html = await fetchWithCheerio(url);
    if (html) return { html, strategy: 'cheerio' };
  }

  // ── JS-heavy หรือ Cheerio ล้มเหลว → ลอง Jina ก่อน (ฟรี) ──
  if (process.env.JINA_ENABLED !== 'false') {
    const jinaContent = await fetchWithJina(url);
    if (jinaContent && jinaContent.length > 300) {
      // Jina ส่งมาเป็น structured text แล้ว ไม่ต้อง parse HTML
      return { html: `<article>${jinaContent}</article>`, strategy: 'jina' };
    }
  }

  // ── ลอง Browserless ──
  const blHtml = await fetchWithBrowserless(url);
  if (blHtml) return { html: blHtml, strategy: 'browserless' };

  // ── ลอง ScrapingBee ──
  const sbHtml = await fetchWithScrapingBee(url);
  if (sbHtml) return { html: sbHtml, strategy: 'scrapingbee' };

  // ── Fallback: Cheerio แม้จะ JS-heavy (ได้บางส่วน) ──
  const fallbackHtml = await fetchWithCheerio(url);
  if (fallbackHtml) return { html: fallbackHtml, strategy: 'cheerio' };

  return null;
}

async function fetchWithCheerio(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

// ── Scrape article ด้วย smart strategy ──
export async function scrapeArticle(url: string, sourceName: string): Promise<RawArticle | null> {
  const fetched = await smartFetch(url);
  if (!fetched) return null;

  const extracted = extractContent(fetched.html, url);
  if (!extracted.title) return null;

  console.log(`[scrape] ${sourceName} | method: ${fetched.strategy}+${extracted.method} | len: ${extracted.contentText.length} | ${url}`);

  return {
    sourceUrl: url,
    sourceName,
    title: extracted.title,
    excerpt: extracted.excerpt,
    content: extracted.contentText,
    imageUrl: extracted.imageUrl,
    tooShort: extracted.tooShort,
    contentLength: extracted.contentText.length,
    fetchStrategy: fetched.strategy,
    extractMethod: extracted.method,
  };
}
