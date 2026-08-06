import { describe, it, expect } from 'vitest';
import { generateFile, generateFileForThread } from '@/background/file-generator';
import { TweetData, ThreadData } from '@/types';

const tweet = (over: Partial<TweetData> = {}): TweetData => ({
  userName: 'Fred-New',
  userHandle: 'Fred834567',
  userAvatar: 'https://pbs.twimg.com/profile_images/abc.jpg',
  text: '',
  timestamp: '2026-08-05T09:05:24.233Z',
  tweetTime: '2026-08-05T06:47:56.000Z',
  url: 'https://x.com/home',
  tweetUrl: 'https://x.com/Fred834567/status/2084894153507484074',
  media: { images: [], videos: [] },
  stats: { replies: '0', retweets: '0', likes: '0' },
  ...over
});

describe('HTML output', () => {
  it('preserves line breaks and emoji in the saved page', async () => {
    // Regression: cleanTextContent collapsed \n via \s+, so every multi-line
    // tweet was saved as one run-on line and pre-wrap had nothing to render.
    const text = '3000 Followers🎉\n\n说实话。\n\n后来有人开始看了。';
    const { content } = await generateFile(tweet({ text }), 'html');

    expect(content).toContain('white-space: pre-wrap');
    expect(content).toContain('3000 Followers🎉\n\n说实话。');
  });

  it('escapes markup in the tweet body', async () => {
    // Regression: the body was interpolated raw, so a tweet containing < or &
    // corrupted the page — and the saved file executed scripts when opened.
    const text = 'if (a < b && c > d) "<script>alert(1)</scr' + 'ipt>"';
    const { content } = await generateFile(tweet({ text }), 'html');

    expect(content).toContain('&lt;script&gt;');
    expect(content).not.toContain('<script>alert(1)');
  });

  it('escapes the display name everywhere it appears', async () => {
    const { content } = await generateFile(tweet({ userName: 'Ann & "Bob" <dev>' }), 'html');

    expect(content).toContain('Ann &amp; &quot;Bob&quot; &lt;dev&gt;');
    expect(content).not.toContain('<dev>');
  });

  it('carries the attribution line exactly once', async () => {
    const { content } = await generateFile(tweet({ text: 'hi' }), 'html');
    expect(content.match(/class="saved-by"/g) ?? []).toHaveLength(1);
  });
});

describe('Markdown output', () => {
  it('prefixes every line so multi-line tweets stay inside the quote', async () => {
    // Regression: `> ${text}` quoted only the first line; the rest escaped
    // the blockquote entirely.
    const { content } = await generateFile(tweet({ text: 'line one\n\nline two' }), 'markdown');

    expect(content).toContain('> line one');
    expect(content).toContain('> line two');
  });

  it('emits valid YAML front matter with quotes escaped', async () => {
    const { content } = await generateFile(tweet({ userName: 'Ann "Bob" \\ Cee', text: 'x' }), 'markdown');

    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain('author: "Ann \\"Bob\\" \\\\ Cee"');
    expect(content).toContain('date: 2026-08-05');
    expect(content).toContain('source: "https://x.com/Fred834567/status/2084894153507484074"');
  });

  it('does not carry the attribution — signature is HTML only', async () => {
    const { content } = await generateFile(tweet({ text: 'hi' }), 'markdown');
    expect(content).not.toContain('saved-by');
    expect(content).not.toContain('xiaojiaoai');
  });
});

describe('thread media numbering', () => {
  const shared = 'https://pbs.twimg.com/media/SHARED.jpg';
  const thread = (): ThreadData => {
    const tweets = [
      tweet({ text: 'part one', media: { images: [shared], videos: [] } }),
      tweet({ text: 'part two', media: { images: ['https://pbs.twimg.com/media/SECOND.jpg'], videos: [] } }),
      tweet({ text: 'part three', media: { images: [shared, 'https://pbs.twimg.com/media/THIRD.jpg'], videos: [] } })
    ];
    return { tweets, mainTweet: tweets[0] };
  };

  it('numbers globally and de-duplicates, so HTML and Markdown agree', async () => {
    // Regression: Markdown numbered per tweet while the downloader numbered
    // across the whole thread, so every image after the first tweet was a
    // broken link.
    const html = (await generateFileForThread(thread(), 'html')).content;
    const markdown = (await generateFileForThread(thread(), 'markdown')).content;

    const paths = (text: string) => text.match(/media\/image_\d+\.jpg/g) ?? [];
    const expected = ['media/image_1.jpg', 'media/image_2.jpg', 'media/image_1.jpg', 'media/image_3.jpg'];

    expect(paths(html)).toEqual(expected);
    expect(paths(markdown)).toEqual(expected);
  });

  it('does not append a trailing rule after the final tweet', async () => {
    const { content } = await generateFileForThread(thread(), 'markdown');
    expect(content.trimEnd().endsWith('---')).toBe(false);
  });
});

describe('JSON output', () => {
  it('round-trips the tweet with its line breaks intact', async () => {
    const text = 'line one\n\nline two🎉';
    const { content } = await generateFile(tweet({ text }), 'json');

    expect(JSON.parse(content).text).toBe(text);
  });
});
