// lib/scrapers/extractor.ts
// Smart extractor v2 — multi-layer fallback, ดึง content ได้ทุกเว็บ

import * as cheerio from 'cheerio';

export interface ExtractedContent {
  title: string;
  excerpt: string;
  imageUrl: string;
  contentText: string;
  contentHtml: string;
  tooShort: boolean;
  method: string;
}

// ── Noise selectors ──
const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe',
  'nav', 'header', 'footer', 'aside',
  '.ad', '.ads', '.advertisement', '[class*="advert"]',
  '[class*="promo"]', '[class*="related"]', '[class*="recommended"]',
  '[class*="social"]', '[class*="share"]', '[class*="newsletter"]',
  '[class*="subscribe"]', '[class*="popup"]', '[class*="modal"]',
  '[class*="sidebar"]', '[class*="widget"]', '[class*="comment"]',
  '[class*="cookie"]', '[class*="banner"]', '[id*="advert"]',
  '[id*="sidebar"]', '[id*="comments"]', 'button', 'form',
  '[role="complementary"]', '[role="navigation"]', '[role="banner"]',
  '[class*="tags"]', '[class*="Topics"]', '[class*="author-bio"]',
  '[class*="AuthorBio"]', '[class*="read-more"]', '[class*="ReadMore"]',
  '[class*="trending"]', '[class*="Trending"]', '[class*="TopStories"]',
].join(', ');

// ── Known content selectors — เรียงจาก specific → generic ──
const CONTENT_SELECTORS = [
  // racingnews365
  '.article-body', '.article-content', '.article-text',
  '.article__body', '.article__content',
  '[class*="ArticleBody"]', '[class*="articleBody"]',
  // autosport / motorsport
  '.ms-article-content', '.ms-entry-content', '.ms-article__body',
  '[data-cy="article-body"]',
  // bbc
  '[data-component="text-block"]', '.article__body-content',
  '.story-body__inner', '[data-testid="article-body"]',
  // sky sports
  '.sdc-article-body', '.sdc-article-body__paragraphs',
  // formula1.com
  '.f1-article--content', '[class*="f1-article"]',
  // the guardian
  '.article-body-commercial-selector', '[data-gu-name="body"]',
  // generic patterns — ครอบคลุมเว็บส่วนใหญ่
  '[itemprop="articleBody"]',
  '.post-content', '.post-body', '.entry-content', '.entry-body',
  '[class*="article-body"]', '[class*="article-content"]',
  '[class*="post-content"]', '[class*="story-body"]',
  '[class*="body-text"]', '[class*="article__body"]',
  '[class*="ArticleContent"]', '[class*="StoryBody"]',
  '[class*="NewsBody"]', '[class*="RichText"]',
  'article .content', 'article .body', '.story .body',
  '.content-body', '.story-content', '.news-content',
  // สุดท้าย — broad
  'article', '[role="main"] .content', 'main .content',
];

// ── Extract entry point ──
export function extractContent(html: string, sourceUrl: string): ExtractedContent {
  const $ = cheerio.load(html);

  const title = extractTitle($);
  const imageUrl = extractImage($);
  const excerpt =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') || '';

  let contentText = '';
  let contentHtml = '';
  let method = '';

  // ── Method 1: Known selectors ──
  for (const sel of CONTENT_SELECTORS) {
    const el = $(sel).first();
    if (!el.length) continue;

    const clone = el.clone();
    clone.find(NOISE_SELECTORS).remove();

    const text = extractStructuredText($, clone);
    if (text.length > 300) {
      contentText = text;
      contentHtml = clone.html() || '';
      method = `selector:${sel}`;
      break;
    }
  }

  // ── Method 2: Heuristic — element ที่มี <p> มากสุด ──
  if (contentText.length < 300) {
    const candidate = findRichestElement($);
    if (candidate && candidate.text.length > contentText.length) {
      contentText = candidate.text;
      contentHtml = candidate.html;
      method = `heuristic:${candidate.selector}`;
    }
  }

  // ── Method 3: เก็บ <p> ทุกตัวที่ยาวพอ ──
  if (contentText.length < 300) {
    const parts: string[] = [];

    // เพิ่ม h2/h3 ที่อยู่ใน main/article ด้วย
    $('main h2, article h2, main h3, article h3').each((_, el) => {
      const tag = el.tagName?.toLowerCase() || 'h2';
      const text = $(el).text().trim();
      if (text.length > 5 && text.length < 200) {
        parts.push(`[${tag.toUpperCase()}] ${text}`);
      }
    });

    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 60 && !isNavigationText(text)) {
        parts.push(`[P] ${text}`);
      }
    });

    const joined = parts.join('\n');
    if (joined.length > contentText.length) {
      contentText = joined;
      method = 'fallback:all-p-tags';
    }
  }

  // ── Method 4: JSON-LD articleBody ──
  if (contentText.length < 200) {
    const jsonLd = extractJsonLd($);
    if (jsonLd?.articleBody && jsonLd.articleBody.length > contentText.length) {
      contentText = `[P] ${jsonLd.articleBody}`;
      method = 'json-ld';
    }
  }

  // ── Method 5: meta fallback ──
  if (contentText.length < 100) {
    contentText = [excerpt].filter(Boolean).map(t => `[P] ${t}`).join('\n');
    method = 'meta-only';
  }

  // cap ที่ 12000 chars — เพิ่มจาก 8000 เพื่อให้ Groq มีข้อมูลเพียงพอ
  const finalText = contentText.slice(0, 12000);

  return {
    title,
    excerpt: excerpt.slice(0, 400),
    imageUrl: imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl,
    contentText: finalText,
    contentHtml,
    tooShort: finalText.length < 400,
    method,
  };
}

// ── Extract title ──
function extractTitle($: cheerio.CheerioAPI): string {
  const selectors = [
    'h1[class*="title"]', 'h1[class*="heading"]', 'h1[class*="headline"]',
    'h1[class*="Title"]', 'h1[class*="Heading"]',
    'article h1', 'main h1', '.article h1',
    'h1',
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    'title',
  ];
  for (const sel of selectors) {
    const el = $(sel).first();
    const text = (el.attr('content') || el.text()).trim();
    const cleaned = text.split(/\s*[|\-–]\s+/)[0].trim();
    if (cleaned.length > 10 && cleaned.length < 250) return cleaned;
  }
  return '';
}

// ── Extract image ──
function extractImage($: cheerio.CheerioAPI): string {
  return (
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    $('meta[property="og:image:secure_url"]').attr('content') ||
    $('article img[src]').filter((_, el) => {
      const w = Number($$(el).attr('width') || 999);
      const h = Number($$(el).attr('height') || 999);
      return w > 100 && h > 100;
    }).first().attr('src') ||
    $('main img[src]').first().attr('src') ||
    ''
  );

  function $$(el: any) { return $(el); }
}

// ── Extract structured text พร้อม [TAG] prefix ──
function extractStructuredText($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string {
  const parts: string[] = [];
  el.find('p, h2, h3, h4, blockquote, li').each((_, node) => {
    const tag = node.tagName?.toLowerCase() || 'p';
    const text = $(node).text().trim();
    if (text.length > 20 && !isNavigationText(text)) {
      const label =
        tag === 'blockquote' ? 'QUOTE' :
        tag === 'li' ? 'LI' :
        tag.toUpperCase();
      parts.push(`[${label}] ${text}`);
    }
  });
  return parts.join('\n');
}

// ── หา element "รวย" ที่สุด — score = p_count × avg_p_length ──
function findRichestElement($: cheerio.CheerioAPI): { text: string; html: string; selector: string } | null {
  let best = { score: 0, el: null as any, selector: '' };

  const candidates = [
    'article', 'main', '[role="main"]',
    '#content', '#main-content', '#article-body',
    '.content', '.main', '.wrapper',
    '[class*="content"]', '[class*="body"]', '[class*="text"]',
    'section',
  ];

  for (const sel of candidates) {
    $(sel).each((_, node) => {
      const el = $(node);
      const pTags = el.find('p');
      let totalLen = 0;
      let validCount = 0;
      pTags.each((_, p) => {
        const len = $(p).text().trim().length;
        if (len > 60) { totalLen += len; validCount++; }
      });
      if (validCount === 0) return;
      const score = validCount * (totalLen / validCount);
      if (score > best.score) {
        best = { score, el, selector: sel };
      }
    });
  }

  if (!best.el || best.score < 1000) return null;

  const clone = best.el.clone();
  clone.find(NOISE_SELECTORS).remove();
  return {
    text: extractStructuredText($, clone),
    html: clone.html() || '',
    selector: best.selector,
  };
}

// ── Extract JSON-LD ──
function extractJsonLd($: cheerio.CheerioAPI): Record<string, any> | null {
  try {
    let result: any = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (result) return;
      const raw = $(el).html() || '';
      const data = JSON.parse(raw.trim());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'NewsArticle' || item['@type'] === 'Article' || item.articleBody) {
          result = item;
          return false as any;
        }
      }
    });
    return result;
  } catch {
    return null;
  }
}

function isNavigationText(text: string): boolean {
  if (text.length > 200) return false;
  const navPatterns = [
    /^(home|news|sport|f1|formula|about|contact|privacy|terms|cookie|subscribe|sign in|log in|register|menu|search|back to top)/i,
    /^[\d\s\W]{1,20}$/,
    /copyright|all rights reserved|©/i,
    /^(advertisement|sponsored|promoted)/i,
  ];
  return navPatterns.some(p => p.test(text.trim()));
}
