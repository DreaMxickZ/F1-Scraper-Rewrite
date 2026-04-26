// lib/types.ts

// ── Block types — ตรงกับ NewsForm เดิมทุก block ──
export type BlockType =
  | 'paragraph'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'bullet'
  | 'image'
  | 'divider'
  | 'table'
  | 'video';

export interface Block {
  id: string;
  type: BlockType;
  content?: string;            // paragraph, h2, h3, quote
  url?: string;                // image, video
  caption?: string;            // image, video
  items?: string[];            // bullet
  tableData?: {
    headers: string[];
    rows: string[][];
  };
}

// ── ข่าวดิบที่ scrape ได้ก่อน rewrite ──
export interface RawArticle {
  sourceUrl: string;
  sourceName: string;
  title: string;               // หัวข้อต้นฉบับ (EN)
  excerpt: string;             // บทสรุปต้นฉบับ
  content: string;             // เนื้อหาดิบทั้งหมด (plain text)
  imageUrl: string;
  publishedAt?: string;
  tooShort: boolean;           // true = เนื้อหาน้อย → Groq จะหาข้อมูลเพิ่ม
  contentLength?: number;      // debug: ความยาว content ที่ดึงได้
  fetchStrategy?: string;      // debug: cheerio / jina / browserless / scrapingbee
  extractMethod?: string;      // debug: selector ที่ใช้ดึง content
}

// ── ผลลัพธ์หลัง Groq rewrite ──
export interface RewrittenArticle {
  title: string;               // ภาษาไทย
  slug: string;                // EN slug auto-gen
  excerpt: string;             // ภาษาไทย
  content: Block[];            // blocks พร้อม insert
  image_url: string;
  published: boolean;          // false เสมอ (draft)
  sort_order: number;
  source_url: string;          // เก็บ URL ต้นทางไว้อ้างอิง
  source_name: string;
}

// ── Groq rate limit info (จาก response headers) ──
export interface GroqUsage {
  remainingRequests: number;
  remainingTokens: number;
  resetRequestsAt: string;
  resetTokensAt: string;
  usedTokensToday?: number;
}
