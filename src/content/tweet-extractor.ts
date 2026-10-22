import { tr } from '../ui-language';
import TurndownService from 'turndown';
import { TweetData } from '@/types';
const ARTICLE = '[data-testid="twitterArticleRichTextView"], [data-testid="longformRichTextComponent"], [data-testid="article-content"], [data-testid="article-wrapper"]';
const OMIT = 'script,style,button,[role="button"],svg,[aria-hidden="true"],.twitter-collector-btn,.twitter-collector-thread-btn';
const htmlEscape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function originalImageUrl(src: string): string | null {
    try {
        const url = new URL(src, location.href);
        if (url.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com' || !url.pathname.startsWith('/media/'))
            return null;
        if (url.searchParams.has('format'))
            url.searchParams.set('name', 'orig');
        return url.href;
    }
    catch {
        return null;
    }
}
/** Walk content once, in document order. Never operate controls or request X APIs. */
function serialize(node: Node, images: Set<string>, pre = false): string {
    if (node.nodeType === Node.TEXT_NODE)
        return htmlEscape(node.textContent || '').replace(/\r\n?/g, '\n').replace(/\n/g, pre ? '\n' : '<br>');
    if (!(node instanceof Element) || node.matches(OMIT))
        return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'img') {
        const src = (node as HTMLImageElement).src;
        if (src.includes('/emoji/') || src.includes('/emojis/'))
            return htmlEscape(node.getAttribute('alt') || '');
        const image = originalImageUrl(src);
        if (!image)
            return '';
        images.add(image);
        return `<img src="${htmlEscape(image)}" alt="${htmlEscape(node.getAttribute('alt') || '')}">`;
    }
    if (tag === 'br')
        return '<br>';
    const inner = Array.from(node.childNodes).map(child => serialize(child, images, pre || tag === 'pre')).join('');
    if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        try {
            const url = new URL(href, 'https://x.com');
            if (url.protocol === 'https:' || url.protocol === 'http:')
                return `<a href="${htmlEscape(url.href)}">${inner}</a>`;
        }
        catch { /* Preserve link text without an unsafe destination. */ }
        return inner;
    }
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'b', 'em', 'i', 's', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'figure', 'figcaption'].includes(tag))
        return `<${tag}>${inner}</${tag}>`;
    if (tag === 'div' && node.getAttribute('data-block') === 'true')
        return `<div>${inner || '<br>'}</div>`;
    if (tag === 'div' && !node.closest('[data-block="true"]') && node.children.length && Array.from(node.children).every(el => ['SPAN', 'A', 'BR', 'IMG'].includes(el.tagName)))
        return `<p>${inner}</p>`;
    if (node instanceof HTMLElement && /bold|[6-9]00/.test(node.style.fontWeight))
        return `<strong>${inner}</strong>`;
    return inner;
}
const markdown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
markdown.addRule('tables', {
    filter: 'table',
    replacement: (_content, node) => {
        const rows = Array.from((node as HTMLTableElement).rows).map(row => Array.from(row.cells).map(cell => (cell.textContent || '').trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')));
        if (!rows.length)
            return '';
        const width = Math.max(...rows.map(row => row.length));
        const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => row[i] || '').join(' | ')} |`;
        return '\n\n' + [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n') + '\n\n';
    }
});
export function extractTweetData(tweetElement: Element): TweetData {
    if (tweetElement.querySelector('[data-testid="tweet-text-show-more-link"]'))
        throw new Error(tr('请先手动展开正文再收藏', 'Expand the post before saving.'));
    const article = tweetElement.querySelector(ARTICLE);
    const articleView = tweetElement.querySelector('[data-testid="twitterArticleReadView"]');
    const textRoot = article || tweetElement.querySelector('[data-testid="tweetText"]');
    if (!article && tweetElement.querySelector('a[href*="/article/"], [data-testid="twitterArticleReadView"]'))
        throw new Error(tr('请先打开文章正文再收藏', 'Open the full article first.'));
    const user = tweetElement.querySelector('[data-testid="User-Name"], [data-testid="User-Names"]');
    const userLink = Array.from(user?.querySelectorAll('a') || []).find(a => /^\/[\w]+\/?$/.test(new URL(a.href, 'https://x.com').pathname));
    const userHandle = userLink ? new URL(userLink.href, 'https://x.com').pathname.split('/')[1] : '';
    const time = tweetElement.querySelector('time[datetime]');
    const permalink = time?.closest('a')?.getAttribute('href');
    const images = new Set<string>();
    let contentHtml = textRoot ? serialize(textRoot, images) : '';
    // Article cover is before its body, not mixed with reply controls.
    if (articleView && article) {
        const covers = Array.from(articleView.querySelectorAll('[data-testid="tweetPhoto"] img')).filter(img => !article.contains(img) && !!(img.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING));
        contentHtml = covers.map(img => serialize(img, images)).join('') + contentHtml;
    }
    if (!article) {
        for (const photo of tweetElement.querySelectorAll('[data-testid="tweetPhoto"] img')) {
            if (!textRoot?.contains(photo) && !photo.closest('[data-testid="quoteTweet"]'))
                contentHtml += serialize(photo, images);
        }
    }
    if (images.size > 50)
        throw new Error(tr('单次最多保存 50 张图片，请缩小收藏范围。', 'Save up to 50 images at a time. Choose less content.'));
    const template = document.createElement('template');
    template.innerHTML = contentHtml;
    const plain = template.content;
    plain.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    plain.querySelectorAll('p,div,h1,h2,h3,h4,li,pre,tr,blockquote,figure').forEach(el => el.append('\n\n'));
    const text = (plain.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    if (!text && !images.size)
        throw new Error(tr('当前页面没有可保存的正文，请等待加载后重试。', 'No loaded content to save. Wait for the post to load, then try again.'));
    const title = articleView?.querySelector('[data-testid="twitter-article-title"]')?.textContent?.trim();
    return {
        timestamp: new Date().toISOString(), url: location.href,
        userName: user?.querySelector('span')?.textContent?.trim() || userHandle,
        userHandle, userAvatar: tweetElement.querySelector<HTMLImageElement>('[data-testid="Tweet-User-Avatar"] img')?.src || '',
        text, contentHtml, contentMarkdown: markdown.turndown(contentHtml), title,
        contentKind: article ? 'article' : 'tweet', captureScope: 'loaded-page',
        tweetTime: time?.getAttribute('datetime') || '',
        tweetUrl: permalink ? new URL(permalink, 'https://x.com').href : location.href,
        media: { images: [...images], videos: [] }, mediaPosition: 'bottom',
        stats: { replies: tweetElement.querySelector('[data-testid="reply"]')?.textContent?.trim() || '0', retweets: tweetElement.querySelector('[data-testid="retweet"]')?.textContent?.trim() || '0', likes: tweetElement.querySelector('[data-testid="like"]')?.textContent?.trim() || '0' }
    };
}
export function findTweetElements(): Element[] { return [...document.querySelectorAll('[data-testid="tweet"]')]; }
export default { extractTweetData, findTweetElements };
