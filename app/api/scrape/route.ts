// app/api/scrape/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchRacingNews365List, fetchRacingNews365Article } from '@/lib/scrapers/racingnews365';
import { fetchArticleUrls, fetchArticleContent, SITE_CONFIGS } from '@/lib/scrapers/generic';
import { RawArticle } from '@/lib/types';

export const maxDuration = 60; // Vercel timeout

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      sites = ['racingnews365', 'autosport', 'bbc', 'skysports'],
      limitPerSite = 3,
      urls = [],        // custom URLs เพิ่มเองได้
    } = body;

    const results: RawArticle[] = [];
    const errors: string[] = [];

    // ── Custom URLs (วาง URL เองจาก Dashboard) ──
    if (urls.length > 0) {
      for (const url of urls as string[]) {
        const config = SITE_CONFIGS.find(c => url.includes(c.baseUrl.replace('https://www.', '').replace('https://', '')));
        if (config) {
          const article = await fetchArticleContent(url, config);
          if (article) results.push(article);
        } else {
          // racingnews365 หรือ unknown
          const article = await fetchRacingNews365Article(url);
          if (article) results.push(article);
        }
      }
    }

    // ── racingnews365.com ──
    if (sites.includes('racingnews365')) {
      try {
        const listUrls = await fetchRacingNews365List(limitPerSite + 2);
        const scraped = await Promise.allSettled(
          listUrls.slice(0, limitPerSite).map(u => fetchRacingNews365Article(u))
        );
        for (const r of scraped) {
          if (r.status === 'fulfilled' && r.value) results.push(r.value);
        }
      } catch (e: any) {
        errors.push(`racingnews365: ${e.message}`);
      }
    }

    // ── Generic sites ──
    const siteMap: Record<string, string> = {
      autosport: 'autosport.com',
      motorsport: 'motorsport.com',
      bbc: 'bbc.com/sport/formula1',
      skysports: 'skysports.com/f1',
      formula1: 'formula1.com',
    };

    for (const siteKey of sites) {
      if (siteKey === 'racingnews365') continue;
      const siteName = siteMap[siteKey];
      if (!siteName) continue;

      const config = SITE_CONFIGS.find(c => c.name === siteName);
      if (!config) continue;

      try {
        const articleUrls = await fetchArticleUrls(config, limitPerSite + 2);
        const scraped = await Promise.allSettled(
          articleUrls.slice(0, limitPerSite).map(u => fetchArticleContent(u, config))
        );
        for (const r of scraped) {
          if (r.status === 'fulfilled' && r.value) results.push(r.value);
        }
      } catch (e: any) {
        errors.push(`${siteName}: ${e.message}`);
      }
    }

    // ── Deduplicate by title similarity (ข่าวเดียวกัน อาจอยู่หลายเว็บ) ──
    const deduped = deduplicateArticles(results);

    return NextResponse.json({
      ok: true,
      count: deduped.length,
      articles: deduped,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// GET — ดึงจากเว็บเดียวด้วย URL
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ ok: false, error: 'url required' }, { status: 400 });

  const config = SITE_CONFIGS.find(c =>
    url.includes(c.baseUrl.replace('https://www.', '').replace('https://', ''))
  );

  const article = config
    ? await fetchArticleContent(url, config)
    : await fetchRacingNews365Article(url);

  if (!article) return NextResponse.json({ ok: false, error: 'scrape failed' }, { status: 422 });

  return NextResponse.json({ ok: true, article });
}

// ── Simple deduplicate — เทียบ title ──
function deduplicateArticles(articles: RawArticle[]): RawArticle[] {
  const seen = new Set<string>();
  return articles.filter(a => {
    const key = normalizeTitle(a.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
}
