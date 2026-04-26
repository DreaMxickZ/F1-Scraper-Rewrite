// lib/groq.ts v2 — prompt ที่ scale blocks ตาม content จริง

import Groq from 'groq-sdk';
import { RawArticle, RewrittenArticle, Block, GroqUsage } from './types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// ── คำนวณ block target จากความยาว content จริง ──
function calcBlockTarget(contentLength: number, tooShort: boolean): {
  minBlocks: number;
  maxBlocks: number;
  minWords: number;
  maxWords: number;
} {
  if (tooShort || contentLength < 400) {
    // เนื้อหาน้อย → Groq ขยายให้
    return { minBlocks: 8,  maxBlocks: 14, minWords: 400, maxWords: 700 };
  }
  if (contentLength < 1500) {
    // สั้น-กลาง
    return { minBlocks: 10, maxBlocks: 16, minWords: 500, maxWords: 800 };
  }
  if (contentLength < 4000) {
    // กลาง
    return { minBlocks: 14, maxBlocks: 22, minWords: 700, maxWords: 1100 };
  }
  // ยาว — เนื้อหาเยอะ → blocks เยอะตาม
  return { minBlocks: 18, maxBlocks: 30, minWords: 900, maxWords: 1500 };
}

// ── Build prompt ──
function buildPrompt(article: RawArticle): string {
  const contentLen = article.content?.length || 0;
  const { minBlocks, maxBlocks, minWords, maxWords } = calcBlockTarget(contentLen, article.tooShort);

  // ตัด content ไม่เกิน 8000 chars ส่ง Groq (เพิ่มจากเดิม 4000)
  const contentSnippet = article.content?.slice(0, 8000) || '';

  const expansionNote = article.tooShort
    ? `⚠️ เนื้อหาต้นฉบับสั้นมาก (${contentLen} ตัวอักษร)
ให้ขยายเนื้อหาโดยใช้ความรู้พื้นฐานเกี่ยวกับ F1:
- บริบทของเหตุการณ์ (ฤดูกาล, แชมเปี้ยนชิพ, สนาม)
- ข้อมูลนักแข่งหรือทีมที่เกี่ยวข้อง
- ความสำคัญของเหตุการณ์นี้ต่อ season
เขียนให้ครบถ้วนและน่าเชื่อถือ ห้ามแต่งข้อมูลเท็จ`
    : `✅ เนื้อหาต้นฉบับมี ${contentLen} ตัวอักษร — แปลและเรียบเรียงให้ครบถ้วน อย่าตัดทอน`;

  return `คุณคือบรรณาธิการข่าว F1 ภาษาไทย ผู้เชี่ยวชาญด้านมอเตอร์สปอร์ต

ข้อมูลบทความต้นฉบับ:
- URL: ${article.sourceUrl}
- แหล่งข่าว: ${article.sourceName}
- หัวข้อ (EN): ${article.title}
- บทสรุป (EN): ${article.excerpt}
- เนื้อหา (EN):
${contentSnippet}

${expansionNote}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
งานของคุณ: เขียนบทความข่าว F1 ใหม่เป็นภาษาไทยที่:
1. แปลและเรียบเรียงใหม่อย่างเป็นธรรมชาติ ไม่ใช่แปลตรงๆ
2. ใช้ภาษาไทยสละสลวย อ่านง่าย เหมาะกับแฟน F1 ไทย
3. คงข้อมูลสำคัญทุกอย่าง: ชื่อนักแข่ง ทีม สนาม เวลา คะแนน
4. จำนวน blocks: ${minBlocks}–${maxBlocks} blocks
5. ความยาวรวม: ${minWords}–${maxWords} คำ
6. แต่ละ paragraph ควรยาว 3-5 ประโยค มีเนื้อหาครบถ้วน ห้ามสั้นมาก
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ตอบเป็น JSON เท่านั้น ห้ามมี markdown backticks หรือข้อความอื่นนอก JSON:

{
  "title": "หัวข้อภาษาไทย — กระชับ น่าสนใจ ไม่เกิน 100 ตัวอักษร",
  "slug": "english-slug-kebab-case-ไม่เกิน-80-chars",
  "excerpt": "บทสรุปภาษาไทย 2-3 ประโยค สำหรับแสดงใน card — ไม่เกิน 200 ตัวอักษร",
  "blocks": [
    { "type": "paragraph", "content": "ย่อหน้าเปิดเรื่อง — เล่าเหตุการณ์หลักให้ผู้อ่านเข้าใจทันที ยาว 3-5 ประโยค..." },
    { "type": "h2", "content": "หัวข้อหลักที่ 1" },
    { "type": "paragraph", "content": "รายละเอียด..." },
    { "type": "quote", "content": "คำพูดหรือข้อเท็จจริงสำคัญที่ควรเน้น..." },
    { "type": "h2", "content": "หัวข้อหลักที่ 2" },
    { "type": "paragraph", "content": "รายละเอียด..." },
    { "type": "h3", "content": "หัวข้อย่อย" },
    { "type": "paragraph", "content": "รายละเอียดย่อย..." },
    { "type": "bullet", "items": ["ประเด็นที่ 1 — อธิบายชัดเจน", "ประเด็นที่ 2", "ประเด็นที่ 3"] },
    { "type": "paragraph", "content": "ย่อหน้าสรุปหรือมองไปข้างหน้า..." }
  ]
}

กฎ block types:
- "paragraph": ข้อความธรรมดา แต่ละ paragraph ต้องยาว 3-5 ประโยค ห้ามสั้น
- "h2": หัวข้อหลัก ใช้ทุก 3-4 paragraphs เพื่อแบ่งเนื้อหา
- "h3": หัวข้อย่อย ใช้เมื่อมีหัวข้อย่อยในส่วนเดียวกัน
- "quote": ข้อความเน้น เช่น คำพูดนักแข่ง หัวหน้าทีม หรือสถิติเด่น — ใช้ 1-3 ครั้ง
- "bullet": รายการ เช่น ผลการแข่ง, สถิติ, ประเด็นสำคัญ — items ควรมี 3-6 รายการ แต่ละรายการอธิบายชัดเจน
- ห้ามใช้ "image", "video", "divider", "table" — จะเพิ่มทีหลัง
- ห้ามใส่ "id" ใน blocks

⚠️ สำคัญมาก: ต้องเขียนครบ ${minBlocks}–${maxBlocks} blocks เนื้อหาอย่างน้อย ${minWords} คำ`;
}

// ── Main rewrite ──
export async function rewriteArticle(
  article: RawArticle
): Promise<{ result: RewrittenArticle; usage: GroqUsage } | null> {
  const contentLen = article.content?.length || 0;
  const { maxBlocks } = calcBlockTarget(contentLen, article.tooShort);

  // max_tokens scale ตาม target blocks — 120 tokens/block โดยประมาณ
  const maxTokens = Math.min(4000, Math.max(2000, maxBlocks * 150));

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.65,
      messages: [
        {
          role: 'system',
          content: 'คุณเป็นบรรณาธิการข่าว F1 ภาษาไทยมืออาชีพ ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น',
        },
        {
          role: 'user',
          content: buildPrompt(article),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '';

    // ── Parse JSON — robust ──
    let parsed: any;
    try {
      // ลบ backticks และ whitespace รอบนอก
      const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // ลอง extract JSON object จาก string
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('[groq] JSON parse failed. Raw:', raw.slice(0, 300));
        return null;
      }
      try {
        parsed = JSON.parse(match[0]);
      } catch (e2) {
        // JSON อาจถูกตัดกลางคัน (max_tokens) — ลอง repair
        const repaired = repairTruncatedJson(match[0]);
        if (!repaired) {
          console.error('[groq] JSON repair failed');
          return null;
        }
        parsed = repaired;
      }
    }

    // ── แปลง blocks และเพิ่ม id ──
    const blocks: Block[] = (parsed.blocks || []).map((b: any) => ({
      id: crypto.randomUUID(),
      type: b.type || 'paragraph',
      content: b.content || '',
      items: b.items || (b.type === 'bullet' ? [] : undefined),
      url: b.url || '',
      caption: b.caption || '',
      tableData: b.type === 'table' ? b.tableData : undefined,
    }));

    // ── Groq usage ──
    const usage: GroqUsage = extractUsage(completion);

    console.log(`[groq] blocks: ${blocks.length} | tokens: ${completion.usage?.total_tokens} | content_in: ${contentLen}`);

    const result: RewrittenArticle = {
      title: parsed.title || article.title,
      slug: parsed.slug || generateSlug(article.title),
      excerpt: parsed.excerpt || article.excerpt,
      content: blocks,
      image_url: article.imageUrl,
      published: false,
      sort_order: 0,
      source_url: article.sourceUrl,
      source_name: article.sourceName,
    };

    return { result, usage };
  } catch (e: any) {
    console.error('[groq] rewrite error:', e?.message);
    return null;
  }
}

// ── Repair truncated JSON (เมื่อ max_tokens ตัดกลางคัน) ──
function repairTruncatedJson(raw: string): any | null {
  try {
    // นับ brackets เพื่อ close ให้ถูก
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;

    for (const char of raw) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\' && inString) { escaped = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
    }

    let repaired = raw.trimEnd();
    // ลบ comma ท้ายที่อาจค้างอยู่
    repaired = repaired.replace(/,\s*$/, '');
    // ปิด brackets/braces ที่ยังเปิดอยู่
    while (openBrackets > 0) { repaired += ']'; openBrackets--; }
    while (openBraces > 0) { repaired += '}'; openBraces--; }

    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

// ── Extract Groq usage from response ──
function extractUsage(completion: any): GroqUsage {
  // groq-sdk v0.3+ expose headers ผ่าน completion._request_id
  // แต่ headers จริงๆ อยู่ใน response object ระดับบน
  return {
    remainingRequests: Number(completion.headers?.['x-ratelimit-remaining-requests'] ?? 5999),
    remainingTokens: Number(completion.headers?.['x-ratelimit-remaining-tokens'] ?? 499000),
    resetRequestsAt: completion.headers?.['x-ratelimit-reset-requests'] ?? '',
    resetTokensAt: completion.headers?.['x-ratelimit-reset-tokens'] ?? '',
    usedTokensToday: completion.usage?.total_tokens ?? 0,
  };
}

// ── Groq remaining tokens ──
export async function getGroqUsage(): Promise<GroqUsage | null> {
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return extractUsage(completion);
  } catch {
    return null;
  }
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 80);
}
