import { tr, initializeLanguage, uiLanguage } from '../ui-language';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';
import { generateObsidianMarkdown } from '../background/file-generator';
import { TweetData } from '../types';
type Meta = {
    tags: string[];
    collection: string;
    notes?: string;
    favorite?: boolean;
};
type Metadata = {
    tweets: Record<string, Meta>;
    collections: Record<string, {
        name: string;
        tweets?: string[];
    }>;
    tags: Record<string, unknown>;
};
type Entry = {
    id: string;
    title: string;
    tweets: TweetData[];
    base: string;
    format: string;
};
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const locale = () => uiLanguage() === 'zh' ? 'zh-CN' : 'en';
const plain = (html: string) => { const d = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true }); d.querySelectorAll('br').forEach(n => n.replaceWith('\n')); d.querySelectorAll('p,div,li,h1,h2,h3,blockquote').forEach(n => n.append('\n\n')); return (d.textContent || '').trim(); };
const safeUrl = (s: string) => { try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.href : '';
}
catch {
    return '';
} };
const markdown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
const defaults: Metadata = { tweets: {}, collections: { 'read-later': { name: '稍后阅读' }, important: { name: '重要' }, favorites: { name: '收藏' } }, tags: {} };
let metadata: Metadata = defaults;
let metadataWritable = true;
let entries: Entry[] = [], selected: Entry | undefined, filter = 'all', collection = '', limit = 100;
let files = new Map<string, File>();
const objectUrls = new Map<string, string>();
let notificationTimer: number;
let lastFailed = 0;
function updateImportStatus() {
    if (entries.length) $('importStatus').textContent = tr(`已读取 ${entries.length} 篇收藏${lastFailed ? `，跳过 ${lastFailed} 个无法识别的文件` : ''}。关闭页面后需重新选择文件夹。`, `Loaded ${entries.length} saved posts${lastFailed ? `; skipped ${lastFailed} unrecognized files` : ''}. Select the folder again after reopening this page.`);
}
function collectionName(key: string, name: string) {
    const builtins: Record<string, [string, string]> = { 'read-later': ['稍后阅读', 'Read later'], important: ['重要', 'Important'], favorites: ['收藏', 'Favorites'] };
    const pair = builtins[key];
    return pair && (name === pair[0] || name === pair[1]) ? tr(...pair) : name;
}
const notify = (message: string) => { const n = $('notification'); n.textContent = message; n.hidden = false; clearTimeout(notificationTimer); notificationTimer = window.setTimeout(() => n.hidden = true, 5000); };
const idFor = (t: TweetData) => t.tweetUrl?.match(/\/(?:status|article)\/(\d+)/)?.[1] || t.tweetUrl?.split('/').pop() || `${t.userHandle}:${t.timestamp}`;
const metaFor = (e: Entry): Meta => metadata.tweets[idFor(e.tweets[0])] || { tags: e.tweets[0].tags || [], collection: '' };
function validateMetadata(data: unknown): Metadata {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        throw Error(tr('备份格式无效', 'Invalid backup format'));
    const d = data as Metadata;
    for (const key of ['tweets', 'collections', 'tags'] as const)
        if (!d[key] || typeof d[key] !== 'object' || Array.isArray(d[key]))
            throw Error(tr('备份缺少标签或收藏夹数据', 'Backup is missing tags or collections'));
    for (const [key, v] of Object.entries(d.tweets)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key) || !v || !Array.isArray(v.tags) || v.tags.some(t => typeof t !== 'string') || (v.collection !== undefined && typeof v.collection !== 'string'))
            throw Error(tr('备份中的推文标签格式无效', 'Invalid post tags in backup'));
    }
    for (const [key, v] of Object.entries(d.collections))
        if (['__proto__', 'constructor', 'prototype'].includes(key) || !v || typeof v.name !== 'string')
            throw Error(tr('收藏夹格式无效', 'Invalid collection format'));
    return d;
}
try {
    const saved = localStorage.getItem('tweetMetadata');
    if (saved)
        metadata = validateMetadata(JSON.parse(saved));
}
catch {
    metadataWritable = false;
    notify(tr('旧标签数据无法读取，已保留原数据。请先导出备份再修复。', 'Existing metadata could not be read and has been preserved. Export a backup before repairing it.'));
}
function persist(next: Metadata) { if (!metadataWritable)
    throw Error(tr('旧标签数据尚未修复，请先导出原始备份，避免覆盖。', 'Export the original backup before repairing existing metadata.')); localStorage.setItem('tweetMetadata', JSON.stringify(next)); metadata = next; }
function updateMeta(patch: Partial<Meta>) { if (!selected)
    return; try {
    persist({ ...metadata, tweets: { ...metadata.tweets, [idFor(selected.tweets[0])]: { ...metaFor(selected), ...patch } } });
    renderFilters();
    renderList();
    renderReader();
}
catch {
    notify(tr('标签未保存：本地存储不可用或空间不足。', 'Tags were not saved: local storage is unavailable or full.'));
} }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; }
function dateLabel(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? tr('日期未知', 'Unknown date') : d.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' }); }
function normalizeTweet(value: unknown): TweetData {
    if (!value || typeof value !== 'object')
        throw Error(tr('无效推文', 'Invalid post'));
    const t = value as TweetData;
    if (typeof t.text !== 'string' && typeof t.contentHtml !== 'string')
        throw Error(tr('缺少正文', 'Missing post content'));
    const html = typeof t.contentHtml === 'string' ? t.contentHtml : /<\/?(?:p|br|div|span|a|img|h[1-6])\b/i.test(t.text) ? t.text : undefined;
    return { ...t, text: html ? plain(html) : t.text || '', contentHtml: html ? DOMPurify.sanitize(html) : undefined, contentMarkdown: typeof t.contentMarkdown === 'string' ? t.contentMarkdown : html ? markdown.turndown(DOMPurify.sanitize(html)) : undefined, title: typeof t.title === 'string' ? t.title : undefined, userName: String(t.userName || t.userHandle || tr('未知作者', 'Unknown author')), userHandle: String(t.userHandle || ''), tweetUrl: safeUrl(String(t.tweetUrl || t.url || '')), timestamp: typeof t.timestamp === 'string' ? t.timestamp : '', tweetTime: typeof t.tweetTime === 'string' ? t.tweetTime : '', media: { images: Array.isArray(t.media?.images) ? t.media.images.filter(u => typeof u === 'string') : [], videos: [] }, tags: Array.isArray(t.tags) ? t.tags.filter(t => typeof t === 'string') : [] };
}
function parseFile(text: string, format: string): TweetData[] {
    if (format === 'json') {
        const data = JSON.parse(text);
        return (Array.isArray(data.tweets) ? data.tweets : [data]).map(normalizeTweet);
    }
    const template = document.createElement('template');
    template.innerHTML = text;
    const doc = template.content;
    const embedded = doc.getElementById('gglknow-data');
    if (embedded?.textContent)
        return parseFile(embedded.textContent, 'json');
    const cards = doc.querySelectorAll('.tweet-card');
    if (!cards.length)
        throw Error(tr('不是可识别的推文 HTML', 'Unrecognized post HTML'));
    return [...cards].map(card => {
        const body = card.querySelector('.tweet-text');
        const html = body?.innerHTML || '';
        const photos = [...card.querySelectorAll<HTMLImageElement>('.tweet-media img, .tweet-text img')].map(img => img.getAttribute('src') || '');
        const contentHtml = [...card.querySelectorAll('.tweet-text,.tweet-media')].filter(n => !n.parentElement?.closest('.tweet-text,.tweet-media')).map(n => n.innerHTML).join('');
        return normalizeTweet({ text: plain(html), contentHtml, userName: card.querySelector('.user-details h2,.user-name')?.textContent, userHandle: card.querySelector('.user-details p,.user-handle')?.textContent?.replace(/^@/, ''), tweetUrl: card.querySelector('.view-original-btn')?.getAttribute('href'), tweetTime: card.querySelector('time')?.getAttribute('datetime') || card.querySelector('.tweet-meta span')?.textContent, timestamp: '', media: { images: photos, videos: [] } });
    });
}
async function importFolder(list: FileList | null) {
    if (!list?.length)
        return;
    const incoming = [...list];
    const nextFiles = new Map(incoming.map(file => [file.webkitRelativePath || file.name, file]));
    const candidate = new Map<string, Entry>();
    let failed = 0;
    $('importStatus').textContent = tr('正在读取本地文件…', 'Reading local files\u2026');
    for (const file of incoming) {
        const format = file.name.split('.').pop()?.toLowerCase();
        if (format !== 'html' && format !== 'json')
            continue;
        try {
            const tweets = parseFile(await file.text(), format);
            if (!tweets.length)
                continue;
            const path = file.webkitRelativePath || file.name;
            const id = (tweets[0].tweetUrl ? idFor(tweets[0]) : path.replace(/\.(html|json)$/i, '')) + (tweets.length > 1 ? ':thread' : '');
            const entry = { id, tweets, base: path.slice(0, path.lastIndexOf('/') + 1), format, title: tweets[0].title || tweets[0].text.split('\n').find(Boolean)?.slice(0, 120) || `@${tweets[0].userHandle}` };
            if (!candidate.has(id) || format === 'json')
                candidate.set(id, entry);
        }
        catch {
            failed++;
        }
    }
    if (!candidate.size) {
        $('importStatus').textContent = tr('没有找到可读取的收藏，当前资料库未改变。', 'No readable saved posts found. Your current library has not changed.');
        return;
    }
    objectUrls.forEach(URL.revokeObjectURL);
    objectUrls.clear();
    files = nextFiles;
    entries = [...candidate.values()].sort((a, b) => (Date.parse(b.tweets[0].tweetTime || b.tweets[0].timestamp) || 0) - (Date.parse(a.tweets[0].tweetTime || a.tweets[0].timestamp) || 0));
    selected = entries[0];
    limit = 100;
    renderFilters();
    renderList();
    renderReader();
    lastFailed = failed;
    updateImportStatus();
}
function renderFilters() {
    const authors = $<HTMLSelectElement>('author');
    const previous = authors.value;
    authors.replaceChildren(new Option(tr('所有作者', 'All authors'), ''));
    [...new Set(entries.map(e => e.tweets[0].userName))].sort().forEach(a => authors.add(new Option(a, a)));
    authors.value = previous;
    const tags = $<HTMLSelectElement>('tagFilter');
    const tag = tags.value;
    tags.replaceChildren(new Option(tr('所有标签', 'All tags'), ''));
    [...new Set(entries.flatMap(e => metaFor(e).tags))].sort().forEach(t => tags.add(new Option(t, t)));
    tags.value = tag;
    const nav = $('collections');
    nav.replaceChildren();
    for (const [key, c] of Object.entries(metadata.collections)) {
        const b = el('button', 'nav-item' + (collection === key ? ' active' : ''), collectionName(key, c.name).replace(/^[⭐🔥📖]\s*/u, ''));
        b.onclick = () => { collection = key; filter = 'all'; limit = 100; renderFilters(); renderList(); };
        nav.append(b);
    }
    document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b => b.classList.toggle('active', !collection && b.dataset.filter === filter));
}
function renderList() {
    const query = $<HTMLInputElement>('search').value.toLowerCase();
    const author = $<HTMLSelectElement>('author').value;
    const tag = $<HTMLSelectElement>('tagFilter').value;
    const filtered = entries.filter(e => (!query || `${e.title} ${e.tweets[0].userName} ${e.tweets[0].userHandle} ${e.tweets.map(t => t.text).join(' ')} ${metaFor(e).tags.join(' ')}`.toLowerCase().includes(query)) && (!author || e.tweets[0].userName === author) && (!tag || metaFor(e).tags.includes(tag)) && (!collection || metaFor(e).collection === collection) && (filter !== 'images' || e.tweets.some(t => t.media.images.length)) && (filter !== 'threads' || e.tweets.length > 1));
    $('count').textContent = tr(`${filtered.length} 篇`, `${filtered.length} saved`);
    $('listTitle').textContent = collection ? collectionName(collection, metadata.collections[collection]?.name || tr('收藏夹', 'Collection')) : filter === 'images' ? tr('有图片', 'With images') : filter === 'threads' ? tr('推文串', 'Threads') : tr('全部收藏', 'All saved');
    const list = $('entries');
    list.replaceChildren();
    for (const e of filtered.slice(0, limit)) {
        const b = el('button', 'entry' + (selected?.id === e.id ? ' active' : ''));
        b.setAttribute('aria-pressed', String(selected?.id === e.id));
        const meta = el('div', 'entry-meta');
        meta.append(el('strong', '', e.tweets[0].userName), el('span', '', dateLabel(e.tweets[0].tweetTime || e.tweets[0].timestamp)));
        b.append(meta, el('div', 'entry-title', e.title), el('div', 'entry-excerpt', e.tweets[0].text.slice(0, 220)), el('div', 'entry-kind', e.tweets.length > 1 ? tr(`${e.tweets.length} 条 · 本页推文串`, `${e.tweets.length} posts · loaded thread`) : e.tweets[0].contentKind === 'article' ? tr('文章', 'Article') : e.tweets[0].media.images.length ? tr('含图片', 'With images') : tr('推文', 'Post')));
        b.onclick = () => { selected = e; renderList(); renderReader(); $('readerPane').scrollTop = 0; };
        list.append(b);
    }
    if (!filtered.length)
        list.append(el('p', 'import-status', entries.length ? tr('没有匹配的收藏', 'No matching posts') : tr('从左侧导入文件夹开始', 'Import a folder to get started')));
    $('loadMore').hidden = filtered.length <= limit;
}
function localImage(src: string, entry: Entry, tweet: TweetData): string | null {
    let path = src.replace(/^\.\//, '');
    if (/^https?:/i.test(src)) {
        const all = [...new Set(entry.tweets.flatMap(t => t.media.images))];
        const index = all.indexOf(src);
        if (index < 0)
            return null;
        let ext = '.jpg';
        try {
            const u = new URL(src);
            ext = '.' + (u.searchParams.get('format') || u.pathname.split('.').pop()?.match(/^(png|jpe?g|webp|gif)$/i)?.[0] || 'jpg');
        }
        catch { /* missing media */ }
        path = `media/image_${index + 1}${ext}`;
    }
    const full = entry.base + path;
    const file = files.get(full);
    if (!file || !file.type.startsWith('image/'))
        return null;
    if (!objectUrls.has(full))
        objectUrls.set(full, URL.createObjectURL(file));
    void tweet;
    return objectUrls.get(full)!;
}
function renderReader() {
    if (!selected)
        return;
    const e = selected;
    const root = $('reading');
    root.replaceChildren();
    $('readerToolbar').hidden = false;
    $('metadataForm').hidden = false;
    const original = $<HTMLAnchorElement>('original');
    original.href = e.tweets[0].tweetUrl;
    original.hidden = !e.tweets[0].tweetUrl;
    const header = el('header', 'reading-header');
    header.append(el('div', 'reading-meta', `${e.tweets[0].userName} · ${dateLabel(e.tweets[0].tweetTime || e.tweets[0].timestamp)}`), el('h1', '', e.title), el('div', 'reading-kind', e.tweets.length > 1 ? tr('本页已加载的推文串', 'Thread \u00b7 loaded posts only') : e.tweets[0].contentKind === 'article' ? tr('文章', 'Article') : tr('推文', 'Post')));
    const tags = el('div', 'tag-list');
    for (const tag of metaFor(e).tags) {
        const b = el('button', 'tag-pill', tag + ' ×');
        b.setAttribute('aria-label', tr(`移除标签 ${tag}`, `Remove tag ${tag}`));
        b.onclick = () => updateMeta({ tags: metaFor(e).tags.filter(t => t !== tag) });
        tags.append(b);
    }
    header.append(tags);
    root.append(header);
    for (const [i, tweet] of e.tweets.entries()) {
        if (e.tweets.length > 1)
            root.append(el('h2', '', `${i + 1}. @${tweet.userHandle}`));
        const body = el('div', 'article-body');
        const content = document.createDocumentFragment();
        if (tweet.contentHtml)
            content.append(DOMPurify.sanitize(tweet.contentHtml, { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'video', 'audio'], FORBID_ATTR: ['style', 'srcset', 'id', 'name', 'class'] }));
        else {
            const p = el('p', '', tweet.text);
            p.style.whiteSpace = 'pre-wrap';
            content.append(p);
            for (const src of tweet.media.images) {
                const img = el('img');
                img.setAttribute('data-original-src', src);
                content.append(img);
            }
        }
        content.querySelectorAll<HTMLImageElement>('img').forEach(img => { const source = img.getAttribute('data-original-src') || img.getAttribute('src') || ''; img.removeAttribute('src'); const local = localImage(source, e, tweet); if (local) {
            img.src = local;
            img.loading = 'lazy';
        }
        else
            img.replaceWith(el('div', 'missing-image', tr('图片未导入 · 请选择包含 media 子文件夹的完整收藏目录', 'Image missing \u00b7 choose the complete saved folder, including media'))); });
        content.querySelectorAll<HTMLAnchorElement>('a').forEach(a => { const href = safeUrl(a.getAttribute('href') || ''); if (!href)
            a.removeAttribute('href');
        else
            a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; });
        body.append(content);
        root.append(body);
    }
    const select = $<HTMLSelectElement>('collectionSelect');
    select.replaceChildren(new Option(tr('未分类', 'Unsorted'), ''));
    for (const [key, c] of Object.entries(metadata.collections))
        select.add(new Option(collectionName(key, c.name), key));
    select.value = metaFor(e).collection;
}
function download(name: string, text: string, type: string) { const url = URL.createObjectURL(new Blob([text], { type })); const a = el('a'); a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 10000); }
$('folderInput').addEventListener('change', e => { importFolder((e.target as HTMLInputElement).files).catch(() => notify(tr('文件读取失败，原文件不会被修改。', 'Could not read the files. Your original files have not changed.'))); });
for (const id of ['search', 'author', 'tagFilter'])
    $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { limit = 100; renderList(); });
document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter!; collection = ''; limit = 100; renderFilters(); renderList(); });
$('loadMore').onclick = () => { limit += 100; renderList(); };
$('metadataForm').addEventListener('submit', e => { e.preventDefault(); const input = $<HTMLInputElement>('tagInput'); const tag = input.value.trim(); if (tag && selected) {
    updateMeta({ tags: [...new Set([...metaFor(selected).tags, tag])] });
    input.value = '';
} });
$('collectionSelect').addEventListener('change', e => updateMeta({ collection: (e.target as HTMLSelectElement).value }));
$('newCollection').onclick = () => { $<HTMLDialogElement>('collectionDialog').showModal(); };
$('collectionDialog').addEventListener('close', () => { const d = $<HTMLDialogElement>('collectionDialog'); const input = $<HTMLInputElement>('collectionName'); if (d.returnValue === 'create' && input.value.trim()) {
    try {
        persist({ ...metadata, collections: { ...metadata.collections, [crypto.randomUUID()]: { name: input.value.trim() } } });
        renderFilters();
        renderReader();
        input.value = '';
    }
    catch {
        notify(tr('收藏夹未保存。', 'Collection could not be saved.'));
    }
} });
$('exportBackup').onclick = () => { const raw = localStorage.getItem('tweetMetadata'); if (!metadataWritable) {
    download('gglknow-metadata-original.txt', raw || '', 'text/plain');
    return;
} download(`gglknow-metadata-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: '1.0', exported: new Date().toISOString(), data: raw ? JSON.parse(raw) : metadata }, null, 2), 'application/json'); };
$('importBackup').onclick = () => { $<HTMLInputElement>('backupInput').value = ''; $('backupInput').click(); };
$('backupInput').addEventListener('change', async (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (!file)
    return; try {
    const wrapper = JSON.parse(await file.text());
    const incoming = validateMetadata(wrapper.data || wrapper.metadata);
    persist({ tweets: { ...metadata.tweets, ...incoming.tweets }, collections: { ...metadata.collections, ...incoming.collections }, tags: { ...metadata.tags, ...incoming.tags } });
    renderFilters();
    renderList();
    renderReader();
    notify(tr('备份已导入，现有其他标签和收藏夹已保留。', 'Backup imported. Other existing tags and collections have been kept.'));
}
catch (error) {
    notify(error instanceof Error ? error.message : tr('导入失败，原数据未改变。', 'Import failed. Existing data has not changed.'));
} });
$('exportMarkdown').onclick = () => { if (!selected)
    return; const tweets = selected.tweets.map(t => ({ ...t, tags: metadata.tweets[idFor(t)]?.tags || t.tags || [] })); download(`${selected.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100)}.md`, generateObsidianMarkdown(tweets, true, tweets.length > 1), 'text/markdown'); notify(tr('Markdown 使用 media 相对路径，请与原收藏目录的 media 文件夹一起放入 Obsidian。', 'Markdown uses relative media paths. Move it into Obsidian together with the original media folder.')); };
initializeLanguage(() => {
    renderFilters(); renderList(); renderReader(); updateImportStatus();
    $('notification').hidden = true;
});
renderFilters();
renderList();
window.addEventListener('pagehide', () => objectUrls.forEach(URL.revokeObjectURL));
