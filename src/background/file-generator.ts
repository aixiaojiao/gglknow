import { tr } from '../ui-language';
import { generateTweetFilename, getFileExtension } from '@/utils';
import { TweetData, FileGenerationResult, ThreadData } from '@/types';
export const escapeHtml = (text: string) => String(text || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const safeUrl = (value: string) => { try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) ? u.href : '';
}
catch {
    return '';
} };
/** One ordered, deduplicated plan shared by HTML, Markdown and downloads. */
export function imagePaths(tweets: TweetData[], local = true): Map<string, string> {
    const urls = [...new Set(tweets.flatMap(t => t.media?.images || []))];
    return new Map(urls.map((url, index) => [url, local ? (/^https?:/i.test(url) ? `media/image_${index + 1}${getFileExtension(url) || '.jpg'}` : url) : safeUrl(url)]));
}
function richBody(tweet: TweetData, paths: Map<string, string>): string {
    if (tweet.contentHtml) {
        let html = tweet.contentHtml;
        for (const [src, path] of paths)
            html = html.split(`src="${escapeHtml(src)}"`).join(`src="${escapeHtml(path)}"`);
        return html;
    }
    const text = `<p>${escapeHtml(tweet.text).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')}</p>`;
    const images = (tweet.media?.images || []).map(src => `<img src="${escapeHtml(paths.get(src) || '')}" alt="">`).join('');
    return tweet.mediaPosition === 'top' ? images + text : text + images;
}
function markdownBody(tweet: TweetData, paths: Map<string, string>): string {
    if (tweet.contentMarkdown) {
        let md = tweet.contentMarkdown;
        for (const [src, path] of paths)
            md = md.split(src).join(path);
        return md;
    }
    const images = (tweet.media?.images || []).map(src => `![](${paths.get(src) || ''})`).join('\n\n');
    const text = tweet.text.replace(/\r\n?/g, '\n').replace(/([\\`*_[\]<>])/g, '\\$1').replace(/([^\n])\n(?=[^\n])/g, '$1  \n');
    return [text, images].filter(Boolean).join('\n\n');
}
function date(value: string): string {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
function frontmatter(tweet: TweetData, thread: boolean): string {
    const title = tweet.title || tweet.text.split('\n').find(Boolean)?.slice(0, 100) || `@${tweet.userHandle}`;
    const fields: Record<string, string | string[]> = {
        title, type: thread ? 'x-thread' : tweet.contentKind === 'article' ? 'x-article' : 'x-post',
        source: 'X', author: tweet.userName, author_handle: tweet.userHandle,
        url: safeUrl(tweet.tweetUrl || tweet.url), created: date(tweet.timestamp),
        captured: date(tweet.timestamp).slice(0, 10), published: date(tweet.tweetTime),
        tags: [...new Set(['x', ...(tweet.tags || [])])], capture_scope: 'loaded-page'
    };
    return '---\n' + Object.entries(fields).map(([key, value]) => Array.isArray(value) ? `${key}:\n${value.map(t => `  - ${JSON.stringify(t)}`).join('\n')}` : `${key}: ${JSON.stringify(value)}`).join('\n') + '\n---\n\n';
}
export function generateObsidianMarkdown(tweets: TweetData[], local = true, thread = false): string {
    const main = tweets[0];
    if (!main)
        throw new Error(tr('没有可导出的内容', 'No content to export'));
    const paths = imagePaths(tweets, local);
    const title = main.title || (thread ? `Thread by @${main.userHandle}` : main.text.split('\n')[0]?.slice(0, 100) || `@${main.userHandle}`);
    return frontmatter(main, thread) + `# ${title.replace(/\r?\n/g, ' ')}\n\n` +
        (thread ? '> '+tr('仅包含本次页面已加载的推文，不保证是完整推文串。', 'Only posts loaded on this page are included. This may not be the complete thread.')+'\n\n' : '') +
        tweets.map((tweet, i) => `${thread ? `## ${i + 1}. @${tweet.userHandle}\n\n` : ''}${markdownBody(tweet, paths)}\n\n[${tr('查看原文', 'View original')}](${safeUrl(tweet.tweetUrl || tweet.url)})`).join('\n\n---\n\n') + '\n';
}
function htmlDocument(tweets: TweetData[], local: boolean, thread: boolean): string {
    const paths = imagePaths(tweets, local);
    const title = tweets[0].title || `${thread ? tr('推文串','Thread') : tr('推文收藏','Saved post')} · ${tweets[0].userName}`;
    const data = thread ? { tweets, mainTweet: tweets[0] } : tweets[0];
    return `<!doctype html><html lang="${tr('zh-CN','en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
body{margin:0;padding:40px 20px;background:#f6f7f9;color:#192433;font:17px/1.8 system-ui,sans-serif}.container{max-width:760px;margin:auto}.tweet-card{background:white;padding:36px;margin-bottom:24px;border-radius:12px}.user-info{color:#687386;font-size:14px}.tweet-text{overflow-wrap:anywhere}.tweet-text p,.tweet-text>div{margin:1em 0}.tweet-text img{display:block;max-width:100%;height:auto;margin:24px auto;border-radius:6px}.tweet-text pre{overflow:auto;white-space:pre-wrap;background:#f2f4f7;padding:16px}.tweet-text table{border-collapse:collapse;width:100%;font-size:14px}.tweet-text td,.tweet-text th{border:1px solid #dce1e8;padding:8px}.tweet-meta{font-size:13px;color:#687386;border-top:1px solid #e9ecf0;padding-top:16px}a{color:#5264e7}h1{line-height:1.35}blockquote{border-left:3px solid #aab6cc;padding-left:18px}
</style></head><body><main class="container">${thread ? '<p>'+tr('仅保存本页已加载内容，不保证是完整推文串。','Only loaded posts are saved. This may not be the complete thread.')+'</p>' : ''}${tweets.map(tweet => `<article class="tweet-card"><div class="user-info"><span class="user-name">${escapeHtml(tweet.userName)}</span> <span class="user-handle">@${escapeHtml(tweet.userHandle)}</span></div>${tweet.title ? `<h1>${escapeHtml(tweet.title)}</h1>` : ''}<div class="tweet-text">${richBody(tweet, paths)}</div><div class="tweet-meta"><time datetime="${escapeHtml(tweet.tweetTime)}">${escapeHtml(tweet.tweetTime || tweet.timestamp)}</time> · <a href="${escapeHtml(safeUrl(tweet.tweetUrl || tweet.url))}" class="view-original-btn" target="_blank" rel="noopener noreferrer">${tr('查看原文', 'View original')}</a></div></article>`).join('')}<script type="application/json" id="gglknow-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script></main></body></html>`;
}
export async function generateFile(tweet: TweetData, format: 'html' | 'markdown' | 'json', local = true): Promise<FileGenerationResult> {
    return generate([tweet], format, local, false);
}
export async function generateFileForThread(thread: ThreadData, format: 'html' | 'markdown' | 'json', local = true): Promise<FileGenerationResult> {
    return generate(thread.tweets, format, local, true);
}
function generate(tweets: TweetData[], format: 'html' | 'markdown' | 'json', local: boolean, thread: boolean): FileGenerationResult {
    if (!tweets.length)
        throw new Error(tr('没有可导出的内容', 'No content to export'));
    const filename = generateTweetFilename(tweets[0]) + (thread ? '_thread' : '');
    if (format === 'html')
        return { filename, extension: '.html', content: htmlDocument(tweets, local, thread) };
    if (format === 'markdown')
        return { filename, extension: '.md', content: generateObsidianMarkdown(tweets, local, thread) };
    return { filename, extension: '.json', content: JSON.stringify(thread ? { tweets, mainTweet: tweets[0] } : tweets[0], null, 2) };
}
