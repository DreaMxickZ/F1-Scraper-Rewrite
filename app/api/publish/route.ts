// app/api/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { RewrittenArticle } from '@/lib/types';

export const maxDuration = 30;

const TABLE = process.env.SUPABASE_TABLE || 'news_v2';

// POST — insert draft เดียว
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const article = body.article as RewrittenArticle;

    if (!article?.title || !article?.slug) {
      return NextResponse.json({ ok: false, error: 'title and slug required' }, { status: 400 });
    }

    // ตรวจว่า slug ซ้ำไหม
    const { data: existing } = await supabaseAdmin
      .from(TABLE)
      .select('id, slug')
      .eq('slug', article.slug)
      .maybeSingle();

    let finalSlug = article.slug;
    if (existing) {
      // เพิ่ม timestamp ต่อท้ายถ้า slug ซ้ำ
      finalSlug = `${article.slug}-${Date.now().toString(36)}`;
    }

    const payload = {
      title: article.title,
      slug: finalSlug,
      excerpt: article.excerpt || '',
      content: article.content,   // jsonb — blocks[]
      image_url: article.image_url || '',
      published: false,            // เสมอ draft
      sort_order: article.sort_order || 0,
      // ถ้า column นี้มีใน schema เก็บ source ไว้ด้วย
      // source_url: article.source_url,
      // source_name: article.source_name,
    };

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert([payload])
      .select('id, slug, title')
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, id: data.id, slug: data.slug });
  } catch (e: any) {
    console.error('[publish]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// POST /api/publish/batch — insert หลายข่าวพร้อมกัน
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const articles = body.articles as RewrittenArticle[];

    if (!Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ ok: false, error: 'articles[] required' }, { status: 400 });
    }

    const results = [];
    const errors = [];

    for (const article of articles) {
      try {
        const { data: existing } = await supabaseAdmin
          .from(TABLE)
          .select('id')
          .eq('slug', article.slug)
          .maybeSingle();

        const slug = existing ? `${article.slug}-${Date.now().toString(36)}` : article.slug;

        const { data, error } = await supabaseAdmin
          .from(TABLE)
          .insert([{
            title: article.title,
            slug,
            excerpt: article.excerpt || '',
            content: article.content,
            image_url: article.image_url || '',
            published: false,
            sort_order: 0,
          }])
          .select('id, slug')
          .single();

        if (error) throw error;
        results.push({ id: data.id, slug: data.slug, title: article.title });
      } catch (e: any) {
        errors.push({ title: article.title, error: e.message });
      }
    }

    return NextResponse.json({ ok: true, inserted: results.length, results, errors });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
