'use client';

import { useState, useEffect, useCallback } from 'react';
import { RawArticle, RewrittenArticle, GroqUsage } from '@/lib/types';

type ArticleState = {
  raw: RawArticle;
  rewritten?: RewrittenArticle;
  status: 'idle' | 'rewriting' | 'done' | 'published' | 'error' | 'skipped';
  error?: string;
  selected: boolean;
};

const SITES = [
  { key: 'racingnews365', label: 'RacingNews365',   tag: 'F1' },
  { key: 'autosport',     label: 'Autosport',        tag: 'F1' },
  { key: 'bbc',           label: 'BBC Sport F1',     tag: 'F1' },
  { key: 'skysports',     label: 'Sky Sports F1',    tag: 'F1' },
  { key: 'formula1',      label: 'Formula1.com',     tag: 'F1' },
  { key: 'motorsport',    label: 'Motorsport.com',   tag: 'F1' },
  { key: 'motogp',        label: 'MotoGP.com',       tag: 'MotoGP' },
  { key: 'crashnet_moto', label: 'Crash.net MotoGP', tag: 'MotoGP' },
  { key: 'gpone',         label: 'GPone.com',        tag: 'MotoGP' },
  { key: 'wrc',           label: 'WRC.com',          tag: 'WRC' },
  { key: 'dirtfish',      label: 'DirtFish',         tag: 'WRC' },
  { key: 'indycar',       label: 'IndyCar.com',      tag: 'IndyCar' },
  { key: 'racer',         label: 'Racer.com',        tag: 'IndyCar' },
  { key: 'nascar',        label: 'NASCAR.com',       tag: 'NASCAR' },
  { key: 'jayski',        label: 'Jayski',            tag: 'NASCAR' },
  { key: 'fiawec',        label: 'FIA WEC',          tag: 'WEC' },
  { key: 'radiolemans',   label: 'Radio Le Mans',    tag: 'WEC' },
  { key: 'worldsbk',      label: 'WorldSBK.com',     tag: 'Superbike' },
  { key: 'crashnet_sbk',  label: 'Crash.net SBK',   tag: 'Superbike' },
];

const ALL_TAGS = ['F1', 'MotoGP', 'WRC', 'IndyCar', 'NASCAR', 'WEC', 'Superbike'] as const;
type Tag = typeof ALL_TAGS[number];

// ─────────────────────────────────────
export default function Dashboard() {
  const [articles,     setArticles]     = useState<ArticleState[]>([]);
  const [usage,        setUsage]        = useState<GroqUsage | null>(null);
  const [activeSites,  setActiveSites]  = useState(['racingnews365', 'autosport', 'bbc', 'motogp', 'wrc']);
  const [limitPerSite, setLimitPerSite] = useState(3);
  const [customUrl,    setCustomUrl]    = useState('');
  const [scraping,     setScraping]     = useState(false);
  const [busyBatch,    setBusyBatch]    = useState(false);
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [tab,          setTab]          = useState<'scrape' | 'preview'>('scrape');
  const [activeFilter, setActiveFilter] = useState<Tag | 'all'>('all');

  useEffect(() => { fetchUsage(); }, []);

  const fetchUsage = async () => {
    try {
      const r = await fetch('/api/rewrite');
      const d = await r.json();
      if (d.ok) setUsage(d.usage);
    } catch {}
  };

  const handleScrape = async () => {
    setScraping(true);
    setArticles([]);
    setActiveFilter('all');
    try {
      const body: any = { sites: activeSites, limitPerSite };
      if (customUrl.trim()) body.urls = customUrl.split('\n').map((u: string) => u.trim()).filter(Boolean);
      const r = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.ok) setArticles((d.articles as RawArticle[]).map(a => ({ raw: a, status: 'idle', selected: true })));
    } finally { setScraping(false); }
  };

  const handleRewrite = useCallback(async (idx: number) => {
    setArticles(prev => prev.map((a, i) => i === idx ? { ...a, status: 'rewriting' } : a));
    try {
      const article = articles[idx].raw;
      const r = await fetch('/api/rewrite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ article }) });
      const d = await r.json();
      if (d.ok) {
        setArticles(prev => prev.map((a, i) => i === idx ? { ...a, status: 'done', rewritten: d.rewritten } : a));
        if (d.usage) setUsage(d.usage);
      } else {
        setArticles(prev => prev.map((a, i) => i === idx ? { ...a, status: 'error', error: d.error } : a));
      }
    } catch (e: any) {
      setArticles(prev => prev.map((a, i) => i === idx ? { ...a, status: 'error', error: e.message } : a));
    }
  }, [articles]);

  const handleRewriteAll = async () => {
    const idxs = articles.map((a, i) => a.selected && a.status === 'idle' ? i : -1).filter(i => i >= 0);
    for (const idx of idxs) {
      await handleRewrite(idx);
      await new Promise(r => setTimeout(r, 800));
    }
  };

  const handlePublish = async (idx: number) => {
    const article = articles[idx].rewritten;
    if (!article) return;
    try {
      const r = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ article }) });
      const d = await r.json();
      if (d.ok) setArticles(prev => prev.map((a, i) => i === idx ? { ...a, status: 'published' } : a));
      else alert('Error: ' + d.error);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handlePublishAll = async () => {
    setBusyBatch(true);
    try {
      const done = articles.filter(a => a.status === 'done' && a.rewritten && a.selected);
      const r = await fetch('/api/publish', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articles: done.map(a => a.rewritten) }) });
      const d = await r.json();
      if (d.ok) setArticles(prev => prev.map(a => a.status === 'done' && a.selected ? { ...a, status: 'published' } : a));
    } finally { setBusyBatch(false); }
  };

  // resolve tag from article's sourceName
  const getArticleTag = (a: ArticleState): Tag | null => {
    const site = SITES.find(s => s.label === a.raw.sourceName || s.key === (a.raw as any).siteKey);
    return (site?.tag as Tag) ?? null;
  };

  // article list filtered by active tab
  const visibleArticles = activeFilter === 'all'
    ? articles
    : articles.filter(a => getArticleTag(a) === activeFilter);

  // which tags actually have articles
  const presentTags = ALL_TAGS.filter(tag => articles.some(a => getArticleTag(a) === tag));

  const stats = {
    total:     articles.length,
    done:      articles.filter(a => a.status === 'done').length,
    published: articles.filter(a => a.status === 'published').length,
    selected:  articles.filter(a => a.selected).length,
    tokenPct:  usage ? Math.round(((500000 - usage.remainingTokens) / 500000) * 100) : 0,
  };

  return (
    <div style={{ fontFamily: "'Barlow', sans-serif", background: '#0D0D10', minHeight: '100vh', color: '#f0f0f0' }}>
      <style>{CSS}</style>

      {/* TOP BAR */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo-mark" />
          <div>
            <div className="logo-title">Motorsport <span style={{ color: '#E10600' }}>News</span> Scraper</div>
            <div className="logo-sub">F1 · MotoGP · WRC · IndyCar · WEC · NASCAR · Superbike</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="token-widget">
            <div className="token-label">Groq tokens วันนี้</div>
            <div className="token-track"><div className="token-fill" style={{ width: `${stats.tokenPct}%` }} /></div>
            <div className="token-value">
              {usage
                ? <><span style={{ color: '#E10600' }}>{(500000 - usage.remainingTokens).toLocaleString()}</span> / 500,000</>
                : <span style={{ color: '#38383F' }}>—</span>}
            </div>
            <button className="token-refresh" onClick={fetchUsage}>↻</button>
          </div>
          <div className="stat-pills">
            <div className="stat-pill"><span>{stats.total}</span>ข่าว</div>
            <div className="stat-pill done"><span>{stats.done}</span>Rewrite แล้ว</div>
            <div className="stat-pill pub"><span>{stats.published}</span>Draft ใน DB</div>
          </div>
        </div>
      </header>

      <div className="shell">
        <div className="tabs">
          <button className={`tab ${tab === 'scrape' ? 'active' : ''}`} onClick={() => setTab('scrape')}>Scrape & Rewrite</button>
          <button className={`tab ${tab === 'preview' ? 'active' : ''}`} onClick={() => setTab('preview')} disabled={stats.done === 0}>
            Preview ({stats.done})
          </button>
        </div>

        {tab === 'scrape' && (
          <div className="main-grid">

            {/* ── SIDEBAR — just pick sites ── */}
            <div className="sidebar">
              <div className="panel">
                <div className="panel-head">เว็บที่จะดึง ({activeSites.length})</div>
                <div className="site-list">
                  {SITES.map(s => (
                    <label key={s.key} className="site-row">
                      <input
                        type="checkbox"
                        checked={activeSites.includes(s.key)}
                        onChange={e => setActiveSites(prev =>
                          e.target.checked ? [...prev, s.key] : prev.filter(k => k !== s.key)
                        )}
                      />
                      <span className="site-check-dot" style={{ background: activeSites.includes(s.key) ? '#E10600' : '#38383F' }} />
                      <span className="site-label">{s.label}</span>
                      <span className="site-tag">{s.tag}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">จำนวนต่อเว็บ</div>
                <div className="panel-body">
                  <div className="slider-row">
                    <input type="range" min={1} max={5} value={limitPerSite} onChange={e => setLimitPerSite(Number(e.target.value))} />
                    <span className="slider-val">{limitPerSite}</span>
                  </div>
                  <div className="hint">~{activeSites.length * limitPerSite} ข่าว / รอบ</div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">URL เพิ่มเอง</div>
                <div className="panel-body">
                  <textarea
                    className="url-ta"
                    placeholder={"https://motorsport.com/...\nhttps://crash.net/..."}
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    rows={3}
                  />
                  <div className="hint">วาง URL ทีละบรรทัด</div>
                </div>
              </div>

              <button className="btn-scrape" onClick={handleScrape} disabled={scraping || activeSites.length === 0}>
                {scraping ? <><span className="spin" />กำลัง Scrape...</> : '⚡ Scrape ข่าวล่าสุด'}
              </button>
            </div>

            {/* ── ARTICLE AREA ── */}
            <div className="article-area">
              {articles.length === 0 && !scraping && (
                <div className="empty-state">
                  <div className="empty-icon">⚑</div>
                  <div className="empty-title">ยังไม่มีข่าว</div>
                  <div className="empty-sub">เลือกเว็บที่ต้องการ แล้วกด Scrape</div>
                </div>
              )}

              {scraping && (
                <div className="loading-state">
                  <div className="loading-dots"><span /><span /><span /></div>
                  <div className="loading-txt">กำลังดึงข่าวล่าสุดจาก {activeSites.length} เว็บ...</div>
                </div>
              )}

              {articles.length > 0 && (
                <>
                  {/* ── FILTER PILLS (แสดงหลัง scrape) ── */}
                  <div className="filter-bar">
                    <button
                      className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setActiveFilter('all')}
                    >
                      ทั้งหมด <span className="pill-count">{articles.length}</span>
                    </button>
                    {presentTags.map(tag => (
                      <button
                        key={tag}
                        className={`filter-pill ${activeFilter === tag ? 'active' : ''}`}
                        onClick={() => setActiveFilter(tag)}
                      >
                        {tag} <span className="pill-count">{articles.filter(a => getArticleTag(a) === tag).length}</span>
                      </button>
                    ))}
                  </div>

                  {/* ── BATCH BAR ── */}
                  <div className="batch-bar">
                    <label className="check-all">
                      <input
                        type="checkbox"
                        checked={articles.every(a => a.selected)}
                        onChange={e => setArticles(prev => prev.map(a => ({ ...a, selected: e.target.checked })))}
                      />
                      เลือกทั้งหมด ({stats.selected}/{stats.total})
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-sm btn-rewrite"
                        onClick={handleRewriteAll}
                        disabled={articles.filter(a => a.selected && a.status === 'idle').length === 0}>
                        Rewrite ที่เลือก ({articles.filter(a => a.selected && a.status === 'idle').length})
                      </button>
                      <button className="btn-sm btn-pub" onClick={handlePublishAll} disabled={busyBatch || stats.done === 0}>
                        {busyBatch ? 'กำลัง Insert...' : `Insert Draft (${stats.done})`}
                      </button>
                    </div>
                  </div>

                  {/* ── ARTICLE ROWS ── */}
                  {visibleArticles.map(a => {
                    const idx = articles.indexOf(a);
                    return (
                      <ArticleRow
                        key={a.raw.sourceUrl}
                        articleState={a}
                        expanded={expandedId === a.raw.sourceUrl}
                        onToggle={() => setExpandedId(expandedId === a.raw.sourceUrl ? null : a.raw.sourceUrl)}
                        onSelect={checked => setArticles(prev => prev.map((x, i) => i === idx ? { ...x, selected: checked } : x))}
                        onRewrite={() => handleRewrite(idx)}
                        onPublish={() => handlePublish(idx)}
                        onSkip={() => setArticles(prev => prev.map((x, i) => i === idx ? { ...x, status: 'skipped' } : x))}
                        tag={getArticleTag(a)}
                      />
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'preview' && (
          <div className="preview-grid">
            {articles.filter(a => a.status === 'done' || a.status === 'published').map(a => (
              <PreviewCard key={a.raw.sourceUrl} articleState={a} tag={getArticleTag(a)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────
function ArticleRow({ articleState, expanded, onToggle, onSelect, onRewrite, onPublish, onSkip, tag }: {
  articleState: ArticleState; expanded: boolean; tag: Tag | null;
  onToggle: () => void; onSelect: (c: boolean) => void;
  onRewrite: () => void; onPublish: () => void; onSkip: () => void;
}) {
  const { raw, rewritten, status, selected, error } = articleState;
  const sc = {
    idle:      { label: 'รอ Rewrite',    color: '#38383F', bg: 'rgba(56,56,63,0.3)' },
    rewriting: { label: 'กำลัง Rewrite', color: '#f5a623', bg: 'rgba(245,166,35,0.1)' },
    done:      { label: 'Rewrite แล้ว',  color: '#22c864', bg: 'rgba(34,200,100,0.1)' },
    published: { label: 'Draft ใน DB',   color: '#4a9eff', bg: 'rgba(74,158,255,0.1)' },
    error:     { label: 'Error',          color: '#E10600', bg: 'rgba(225,6,0,0.1)' },
    skipped:   { label: 'ข้าม',           color: '#38383F', bg: 'transparent' },
  }[status];

  return (
    <div className={`article-row ${status === 'skipped' ? 'opacity-40' : ''}`}>
      <div className="article-row-top">
        <label className="row-check" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={e => onSelect(e.target.checked)} />
        </label>
        {raw.imageUrl && (
          <img src={raw.imageUrl} alt="" className="row-thumb" onError={e => (e.currentTarget.style.display = 'none')} />
        )}
        <div className="row-info" onClick={onToggle}>
          <div className="row-source">
            {tag && <span className="row-tag">{tag}</span>}
            {raw.sourceName}
            {raw.tooShort && <span className="short-warn">⚠ เนื้อหาน้อย</span>}
            {raw.fetchStrategy && (
              <span className="strategy-badge" style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                background: raw.fetchStrategy === 'jina' ? 'rgba(74,158,255,0.12)' : raw.fetchStrategy === 'cheerio' ? 'rgba(34,200,100,0.1)' : 'rgba(245,166,35,0.1)',
                color: raw.fetchStrategy === 'jina' ? '#4a9eff' : raw.fetchStrategy === 'cheerio' ? '#22c864' : '#f5a623',
              }}>{raw.fetchStrategy}</span>
            )}
            {raw.contentLength !== undefined && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{raw.contentLength.toLocaleString()} chars</span>
            )}
          </div>
          <div className="row-title">{rewritten?.title || raw.title}</div>
          {rewritten && <div className="row-excerpt">{rewritten.excerpt}</div>}
          {error && <div className="row-error">{error}</div>}
        </div>
        <div className="row-right">
          <span className="status-badge" style={{ color: sc.color, background: sc.bg }}>
            {status === 'rewriting' && <span className="spin-sm" />}
            {sc.label}
          </span>
          <div className="row-actions">
            {status === 'idle' && <><button className="btn-xs red" onClick={onRewrite}>Rewrite TH</button><button className="btn-xs ghost" onClick={onSkip}>ข้าม</button></>}
            {status === 'rewriting' && <button className="btn-xs ghost" disabled>กำลัง...</button>}
            {status === 'done' && <><button className="btn-xs blue" onClick={onPublish}>Insert Draft</button><button className="btn-xs ghost" onClick={onToggle}>{expanded ? 'ย่อ' : 'ดู'}</button></>}
            {status === 'published' && <button className="btn-xs ghost" onClick={onToggle}>{expanded ? 'ย่อ' : 'ดู'}</button>}
            {status === 'error' && <button className="btn-xs red" onClick={onRewrite}>ลองใหม่</button>}
          </div>
        </div>
      </div>

      {expanded && rewritten && (
        <div className="article-expand">
          <div className="expand-blocks">
            {rewritten.content.map((block: any, i: number) => (
              <div key={i} className={`block-preview block-${block.type}`}>
                {block.type === 'h2' && <div className="bp-h2">{block.content}</div>}
                {block.type === 'h3' && <div className="bp-h3">{block.content}</div>}
                {block.type === 'paragraph' && <div className="bp-p">{block.content}</div>}
                {block.type === 'quote' && <div className="bp-quote">{block.content}</div>}
                {block.type === 'bullet' && <ul className="bp-ul">{block.items?.map((it: string, j: number) => <li key={j}>{it}</li>)}</ul>}
                {block.type === 'divider' && <div className="bp-div" />}
                <span className="block-type-badge">{block.type}</span>
              </div>
            ))}
          </div>
          <div className="expand-meta">
            <div className="meta-row"><span>Slug</span><code>{rewritten.slug}</code></div>
            <div className="meta-row"><span>Source</span><a href={raw.sourceUrl} target="_blank" rel="noopener" style={{ color: '#4a9eff', fontSize: '0.72rem' }}>{raw.sourceName}</a></div>
            <div className="meta-row"><span>Blocks</span><span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{rewritten.content.length}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewCard({ articleState, tag }: { articleState: ArticleState; tag: Tag | null }) {
  const { rewritten, status, raw } = articleState;
  if (!rewritten) return null;
  return (
    <div className="prev-card">
      {rewritten.image_url && <img src={rewritten.image_url} alt="" className="prev-card-img" onError={e => (e.currentTarget.style.display = 'none')} />}
      <div className="prev-card-body">
        <div className="prev-card-src">
          {tag && <span className="row-tag" style={{ marginRight: 5 }}>{tag}</span>}
          {raw.sourceName}
        </div>
        <div className="prev-card-title">{rewritten.title}</div>
        <div className="prev-card-excerpt">{rewritten.excerpt}</div>
        <div className="prev-card-foot">
          <span className="prev-card-blocks">{rewritten.content.length} blocks</span>
          {status === 'published' && <span style={{ color: '#4a9eff', fontSize: 11 }}>✓ Draft ใน DB</span>}
        </div>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{background:#0D0D10;}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;background:#15151E;border-bottom:1px solid rgba(255,255,255,0.07);flex-wrap:wrap;gap:1rem;position:sticky;top:0;z-index:100;}
.topbar-left{display:flex;align-items:center;gap:0.9rem;}
.logo-mark{width:10px;height:10px;border-radius:50%;background:#E10600;box-shadow:0 0 12px rgba(225,6,0,0.6);}
.logo-title{font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:900;text-transform:uppercase;letter-spacing:0.05em;color:#fff;}
.logo-sub{font-size:0.7rem;color:rgba(255,255,255,0.3);letter-spacing:0.05em;}
.topbar-right{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;}

.token-widget{display:flex;align-items:center;gap:0.5rem;background:#0D0D10;border:1px solid rgba(255,255,255,0.08);padding:0.45rem 0.8rem;border-radius:4px;}
.token-label{font-size:11px;color:rgba(255,255,255,0.3);white-space:nowrap;}
.token-track{width:80px;height:4px;background:#38383F;border-radius:2px;overflow:hidden;}
.token-fill{height:100%;background:linear-gradient(90deg,#E10600,#ff4444);border-radius:2px;transition:width 0.5s;}
.token-value{font-size:11px;color:rgba(255,255,255,0.6);white-space:nowrap;}
.token-refresh{background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:13px;padding:0 2px;transition:color 0.2s;}
.token-refresh:hover{color:#fff;}

.stat-pills{display:flex;gap:0.4rem;}
.stat-pill{display:flex;align-items:center;gap:0.3rem;font-size:11px;color:rgba(255,255,255,0.4);background:#0D0D10;border:1px solid rgba(255,255,255,0.07);padding:0.3rem 0.65rem;border-radius:20px;}
.stat-pill span{font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:900;color:rgba(255,255,255,0.7);}
.stat-pill.done span{color:#22c864;}
.stat-pill.pub span{color:#4a9eff;}

.shell{max-width:1300px;margin:0 auto;padding:1.5rem;}

.tabs{display:flex;margin-bottom:1.5rem;border-bottom:1px solid rgba(255,255,255,0.07);}
.tab{font-family:'Barlow Condensed',sans-serif;font-size:0.8rem;font-weight:800;letter-spacing:0.15em;text-transform:uppercase;background:transparent;border:none;border-bottom:2px solid transparent;color:rgba(255,255,255,0.35);padding:0.7rem 1.2rem;cursor:pointer;transition:all 0.15s;margin-bottom:-1px;}
.tab.active{color:#fff;border-bottom-color:#E10600;}
.tab:disabled{opacity:0.3;cursor:not-allowed;}
.tab:not(.active):not(:disabled):hover{color:rgba(255,255,255,0.7);}

.main-grid{display:grid;grid-template-columns:230px 1fr;gap:1.25rem;align-items:start;}
@media(max-width:760px){.main-grid{grid-template-columns:1fr;}}

.sidebar{display:flex;flex-direction:column;gap:0.75rem;position:sticky;top:72px;}
.panel{background:#15151E;border:1px solid rgba(255,255,255,0.07);overflow:hidden;}
.panel-head{font-family:'Barlow Condensed',sans-serif;font-size:0.6rem;font-weight:800;letter-spacing:0.28em;text-transform:uppercase;color:rgba(255,255,255,0.3);padding:0.6rem 0.9rem;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.05);}
.panel-body{padding:0.8rem 0.9rem;display:flex;flex-direction:column;gap:0.4rem;}

.site-list{display:flex;flex-direction:column;padding:0.4rem 0;}
.site-row{display:flex;align-items:center;gap:0.45rem;padding:0.3rem 0.9rem;cursor:pointer;transition:background 0.12s;}
.site-row:hover{background:rgba(255,255,255,0.03);}
.site-row input{width:12px;height:12px;accent-color:#E10600;flex-shrink:0;}
.site-check-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;transition:background 0.2s;}
.site-label{flex:1;font-size:0.78rem;color:rgba(255,255,255,0.55);}
.site-tag{font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);padding:1px 5px;border-radius:2px;flex-shrink:0;}

.slider-row{display:flex;align-items:center;gap:0.6rem;}
.slider-row input[type=range]{flex:1;accent-color:#E10600;}
.slider-val{font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:900;color:#E10600;min-width:16px;}
.hint{font-size:0.7rem;color:rgba(255,255,255,0.25);}

.url-ta{width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);padding:0.5rem;font-size:0.75rem;font-family:monospace;resize:vertical;outline:none;border-radius:2px;}
.url-ta:focus{border-color:rgba(225,6,0,0.4);}
.url-ta::placeholder{color:rgba(255,255,255,0.18);}

.btn-scrape{width:100%;font-family:'Barlow Condensed',sans-serif;font-size:0.85rem;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;background:#E10600;color:#fff;border:none;padding:0.85rem;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:0.5rem;box-shadow:0 0 20px rgba(225,6,0,0.2);}
.btn-scrape:hover{background:#c00500;}
.btn-scrape:disabled{background:#2a2a2a;cursor:not-allowed;box-shadow:none;}

.article-area{display:flex;flex-direction:column;gap:0.5rem;}

/* ── FILTER BAR ── */
.filter-bar{display:flex;gap:0.35rem;flex-wrap:wrap;padding-bottom:0.25rem;}
.filter-pill{font-family:'Barlow Condensed',sans-serif;font-size:0.7rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;background:transparent;border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.35);padding:0.3rem 0.75rem;cursor:pointer;transition:all 0.15s;border-radius:2px;display:flex;align-items:center;gap:0.4rem;}
.filter-pill:hover{color:rgba(255,255,255,0.65);border-color:rgba(255,255,255,0.2);}
.filter-pill.active{color:#fff;background:rgba(225,6,0,0.15);border-color:rgba(225,6,0,0.5);}
.pill-count{font-size:0.65rem;color:inherit;opacity:0.6;}

.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5rem 2rem;border:1px dashed rgba(255,255,255,0.07);text-align:center;}
.empty-icon{font-size:2rem;margin-bottom:1rem;color:rgba(255,255,255,0.1);}
.empty-title{font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:900;text-transform:uppercase;color:rgba(255,255,255,0.2);letter-spacing:0.15em;}
.empty-sub{font-size:0.78rem;color:rgba(255,255,255,0.15);margin-top:0.3rem;}

.loading-state{display:flex;flex-direction:column;align-items:center;padding:4rem;gap:1rem;}
.loading-dots{display:flex;gap:6px;}
.loading-dots span{width:8px;height:8px;border-radius:50%;background:#E10600;animation:ldot 1.2s infinite ease-in-out;}
.loading-dots span:nth-child(2){animation-delay:0.2s;}
.loading-dots span:nth-child(3){animation-delay:0.4s;}
@keyframes ldot{0%,80%,100%{transform:scale(0.4);opacity:0.4}40%{transform:scale(1);opacity:1}}
.loading-txt{font-size:0.8rem;color:rgba(255,255,255,0.3);}

.batch-bar{display:flex;align-items:center;justify-content:space-between;padding:0.65rem 0.9rem;background:#15151E;border:1px solid rgba(255,255,255,0.07);flex-wrap:wrap;gap:0.5rem;}
.check-all{display:flex;align-items:center;gap:0.4rem;font-size:0.78rem;color:rgba(255,255,255,0.5);cursor:pointer;}
.check-all input{accent-color:#E10600;}

.btn-sm{font-family:'Barlow Condensed',sans-serif;font-size:0.7rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;padding:0.4rem 0.8rem;border:none;cursor:pointer;transition:all 0.15s;}
.btn-sm.btn-rewrite{background:rgba(225,6,0,0.15);color:#E10600;border:1px solid rgba(225,6,0,0.3);}
.btn-sm.btn-rewrite:hover{background:rgba(225,6,0,0.25);}
.btn-sm.btn-pub{background:rgba(74,158,255,0.1);color:#4a9eff;border:1px solid rgba(74,158,255,0.25);}
.btn-sm.btn-pub:hover{background:rgba(74,158,255,0.2);}
.btn-sm:disabled{opacity:0.4;cursor:not-allowed;}

.article-row{background:#15151E;border:1px solid rgba(255,255,255,0.06);overflow:hidden;transition:border-color 0.2s;}
.article-row:hover{border-color:rgba(255,255,255,0.12);}
.opacity-40{opacity:0.4;}
.article-row-top{display:flex;align-items:flex-start;gap:0.75rem;padding:0.85rem 0.9rem;}

.row-check{flex-shrink:0;padding-top:3px;cursor:pointer;}
.row-check input{width:13px;height:13px;accent-color:#E10600;}
.row-thumb{width:68px;height:48px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.07);}

.row-info{flex:1;min-width:0;cursor:pointer;}
.row-source{font-size:0.65rem;font-weight:500;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.2rem;display:flex;align-items:center;flex-wrap:wrap;gap:0.35rem;}
.row-tag{font-size:9px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:#E10600;background:rgba(225,6,0,0.12);border:1px solid rgba(225,6,0,0.25);padding:1px 6px;border-radius:2px;}
.row-title{font-family:'Barlow Condensed',sans-serif;font-size:0.98rem;font-weight:800;text-transform:uppercase;color:#fff;letter-spacing:0.02em;line-height:1.25;margin-bottom:0.2rem;}
.row-excerpt{font-size:0.75rem;color:rgba(255,255,255,0.4);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.row-error{font-size:0.72rem;color:#E10600;margin-top:0.2rem;}
.short-warn{font-size:10px;color:#f5a623;background:rgba(245,166,35,0.1);padding:1px 5px;border-radius:2px;}

.row-right{display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;flex-shrink:0;}
.status-badge{font-size:0.62rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:0.2rem 0.55rem;border-radius:2px;display:flex;align-items:center;gap:0.3rem;white-space:nowrap;}
.row-actions{display:flex;gap:0.3rem;}

.btn-xs{font-family:'Barlow Condensed',sans-serif;font-size:0.65rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;padding:0.28rem 0.6rem;border:1px solid;cursor:pointer;transition:all 0.15s;background:transparent;}
.btn-xs.red{color:#E10600;border-color:rgba(225,6,0,0.4);}
.btn-xs.red:hover{background:rgba(225,6,0,0.15);}
.btn-xs.blue{color:#4a9eff;border-color:rgba(74,158,255,0.3);}
.btn-xs.blue:hover{background:rgba(74,158,255,0.12);}
.btn-xs.ghost{color:rgba(255,255,255,0.4);border-color:rgba(255,255,255,0.12);}
.btn-xs.ghost:hover{color:#fff;border-color:rgba(255,255,255,0.3);}
.btn-xs:disabled{opacity:0.4;cursor:not-allowed;}

.article-expand{border-top:1px solid rgba(255,255,255,0.06);display:grid;grid-template-columns:1fr 220px;}
.expand-blocks{padding:1rem;display:flex;flex-direction:column;gap:0.4rem;}
.block-preview{position:relative;padding:0.45rem 0.6rem;background:rgba(255,255,255,0.02);border-left:2px solid rgba(255,255,255,0.06);}
.block-preview:hover{background:rgba(255,255,255,0.04);}
.bp-h2{font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:900;text-transform:uppercase;color:#fff;}
.bp-h3{font-family:'Barlow Condensed',sans-serif;font-size:0.88rem;font-weight:800;text-transform:uppercase;color:rgba(255,255,255,0.55);}
.bp-p{font-size:0.82rem;line-height:1.6;color:rgba(255,255,255,0.6);}
.bp-quote{font-size:0.82rem;font-style:italic;color:rgba(255,255,255,0.45);border-left:2px solid #E10600;padding-left:0.6rem;}
.bp-ul{font-size:0.8rem;color:rgba(255,255,255,0.6);padding-left:1rem;}
.bp-ul li{margin-bottom:0.15rem;}
.bp-div{height:1px;background:rgba(255,255,255,0.07);}
.block-type-badge{position:absolute;top:4px;right:6px;font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.15);font-family:'Barlow Condensed',sans-serif;}
.block-preview.block-h2{border-left-color:#E10600;}
.block-preview.block-h3{border-left-color:rgba(225,6,0,0.4);}
.block-preview.block-quote{border-left-color:#f5a623;}

.expand-meta{padding:1rem;background:rgba(0,0,0,0.2);border-left:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;gap:0.5rem;}
.meta-row{display:flex;flex-direction:column;gap:0.1rem;}
.meta-row>span:first-child{font-size:0.6rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.25);}
.meta-row code{font-family:monospace;font-size:0.72rem;color:rgba(255,255,255,0.5);word-break:break-all;}

.preview-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;}
.prev-card{background:#15151E;border:1px solid rgba(255,255,255,0.07);overflow:hidden;}
.prev-card-img{width:100%;height:140px;object-fit:cover;display:block;}
.prev-card-body{padding:0.9rem;}
.prev-card-src{font-size:0.62rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:0.3rem;display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;}
.prev-card-title{font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:900;text-transform:uppercase;color:#fff;line-height:1.2;margin-bottom:0.4rem;}
.prev-card-excerpt{font-size:0.75rem;color:rgba(255,255,255,0.45);line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:0.6rem;}
.prev-card-foot{display:flex;justify-content:space-between;align-items:center;}
.prev-card-blocks{font-size:0.65rem;color:rgba(255,255,255,0.25);}

.spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;}
.spin-sm{display:inline-block;width:8px;height:8px;border:1.5px solid rgba(255,255,255,0.2);border-top-color:currentColor;border-radius:50%;animation:spin 0.7s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
`;