import { describe, it, expect } from 'vitest';
import { loadGlobalScripts } from './helpers/load-global-script';

const { TweetBrowser, escapeHtml } = loadGlobalScripts<{ TweetBrowser: any; escapeHtml: (t: unknown) => string }>(
  ['ai-tag-engine.js', 'tweet-metadata-manager.js', 'tweet-browser.js'],
  '{ TweetBrowser, escapeHtml }'
);

/** Exercise the prototype directly — the constructor binds to DOM that only the real page has */
const browser = Object.create(TweetBrowser.prototype);
browser.getI18nMessage = () => null;

const parseJSON = (data: unknown, filePath = 'Twitter/tweet_abc/tweet_abc.json') =>
  browser.parseJSONFile(JSON.stringify(data), filePath);

describe('parseJSONFile', () => {
  it('parses a single tweet saved as JSON', () => {
    // Regression: JSON files were filtered out of the load path entirely, so
    // parseFile was unreachable and anyone saving only JSON saw an empty
    // browser — while the empty state promised JSON support.
    const result = parseJSON({
      userName: '李雷',
      userHandle: 'lilei',
      text: '第一行\n\n第二行🎉',
      tweetTime: '2026-08-05T06:47:56.000Z',
      timestamp: '2026-08-05T09:00:00.000Z',
      userAvatar: 'https://pbs.twimg.com/profile_images/x_x96.jpg',
      media: { images: ['https://pbs.twimg.com/media/AAA.jpg?format=jpg&name=orig'], videos: [] },
      stats: { replies: '1', retweets: '2', likes: '3' },
      tweetUrl: 'https://x.com/lilei/status/999'
    });

    expect(result.userName).toBe('李雷');
    expect(result.text).toBe('第一行\n\n第二行🎉');
    expect(result.tweetUrl).toBe('https://x.com/lilei/status/999');
    expect(result.stats.likes).toBe('3');
  });

  it('prefers the publish time over the save time', () => {
    const result = parseJSON({
      text: 'x',
      tweetTime: '2026-08-05T06:47:56.000Z',
      timestamp: '2026-08-05T09:00:00.000Z'
    });
    expect(result.timestamp).toBe('2026-08-05T06:47:56.000Z');
  });

  it('rewrites remote media URLs to the local paths beside the file', () => {
    const result = parseJSON({
      text: 'x',
      userAvatar: 'https://pbs.twimg.com/profile_images/a.jpg',
      media: { images: ['https://pbs.twimg.com/media/A.jpg', 'https://pbs.twimg.com/media/B.jpg'], videos: [] }
    });

    expect(result.userAvatarUrl).toBe('Twitter/tweet_abc/media/avatar');
    expect(result.media.images).toEqual([
      'Twitter/tweet_abc/media/image_1',
      'Twitter/tweet_abc/media/image_2'
    ]);
  });

  it('numbers thread media globally and de-duplicates, matching the downloader', () => {
    const shared = 'https://pbs.twimg.com/media/SHARED.jpg';
    const result = parseJSON({
      tweets: [
        { userName: 'A', userHandle: 'a', text: 't1', tweetUrl: 'https://x.com/a/status/1', media: { images: [shared] } },
        { userName: 'A', userHandle: 'a', text: 't2', media: { images: ['https://pbs.twimg.com/media/SECOND.jpg'] } },
        { userName: 'A', userHandle: 'a', text: 't3', media: { images: [shared, 'https://pbs.twimg.com/media/THIRD.jpg'] } }
      ]
    }, 'Twitter/t_thread/t_thread.json');

    expect(result.isThread).toBe(true);
    expect(result.threadTweets).toHaveLength(3);
    // Four references, three distinct files
    expect(result.media.images).toEqual([
      'Twitter/t_thread/media/image_1',
      'Twitter/t_thread/media/image_2',
      'Twitter/t_thread/media/image_3'
    ]);
  });

  it('returns null on unusable input rather than throwing', () => {
    expect(browser.parseJSONFile('not json at all', 'a/b.json')).toBeNull();
    expect(browser.parseJSONFile('null', 'a/b.json')).toBeNull();
    expect(browser.parseJSONFile('"a string"', 'a/b.json')).toBeNull();
  });
});

describe('readTweetText', () => {
  const parse = (html: string) =>
    new DOMParser().parseFromString(html, 'text/html').querySelector('.tweet-text');

  it('keeps the line breaks a saved page stores as real newlines', () => {
    const el = parse('<div class="tweet-text">line one\n\nline two\n\nline three</div>');
    const text = browser.readTweetText(el);

    expect(text).toBe('line one\n\nline two\n\nline three');
  });

  it('keeps emoji', () => {
    const el = parse('<div class="tweet-text">3000 Followers🎉🎉🎉</div>');
    expect(browser.readTweetText(el)).toContain('🎉🎉🎉');
  });

  it('yields plain text, never markup', () => {
    // Regression: this used innerHTML, which made tweet.text mean an HTML
    // fragment for HTML files but plain text for JSON — so the render path
    // could neither escape consistently nor pass through safely.
    const el = parse('<div class="tweet-text">a &lt;b&gt; c &amp; d</div>');
    expect(browser.readTweetText(el)).toBe('a <b> c & d');
  });

  it('collapses horizontal whitespace but not newlines', () => {
    const el = parse('<div class="tweet-text">a    b\n\n\n\nc</div>');
    expect(browser.readTweetText(el)).toBe('a b\n\nc');
  });

  it('handles a missing element', () => {
    expect(browser.readTweetText(null)).toBe('');
  });
});

describe('escapeHtml', () => {
  it('neutralises markup in tweet text', () => {
    const nasty = 'if (a < b && c > d) "<script>alert(1)</scr' + 'ipt>"';
    const probe = document.createElement('div');
    probe.innerHTML = `<p>${escapeHtml(nasty)}</p>`;

    expect(probe.querySelectorAll('script')).toHaveLength(0);
    expect(probe.textContent).toBe(nasty);
  });

  it('escapes quotes so attribute interpolation cannot break out', () => {
    expect(escapeHtml('a"b')).not.toContain('"');
  });

  it('handles null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
