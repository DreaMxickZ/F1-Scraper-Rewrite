// app/api/rewrite/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { rewriteArticle, getGroqUsage } from '@/lib/groq';
import { RawArticle } from '@/lib/types';

export const maxDuration = 60;

// POST — rewrite บทความเดียว
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const article = body.article as RawArticle;

    if (!article?.title || !article?.sourceUrl) {
      return NextResponse.json({ ok: false, error: 'article required' }, { status: 400 });
    }

    const res = await rewriteArticle(article);
    if (!res) {
      return NextResponse.json({ ok: false, error: 'groq rewrite failed' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      rewritten: res.result,
      usage: res.usage,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// GET — ดู remaining tokens
export async function GET() {
  const usage = await getGroqUsage();
  if (!usage) {
    return NextResponse.json({ ok: false, error: 'groq unreachable' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, usage });
}
