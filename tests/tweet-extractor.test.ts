import { describe, it, expect, vi } from 'vitest';
import { extractTweetData } from '@/content/tweet-extractor';

/**
 * Build a tweet article the way X renders one, so the extractor is exercised
 * against real markup rather than a hand-made data object.
 */
function buildTweet(options: { text: string; name?: string; handle?: string; showMore?: boolean }): Element {
  const { text, name = 'SpaceX', handle = 'SpaceX', showMore = false } = options;

  document.body.innerHTML = `
    <article data-testid="tweet">
      <div data-testid="User-Name">
        <span>${name}</span><span>${name}</span><span>@${handle}</span><span>·</span>
      </div>
      <div data-testid="tweetText">${text}</div>
      ${showMore ? '<button data-testid="tweet-text-show-more-link" role="button">显示更多</button>' : ''}
      <a href="/${handle}/status/123"><time datetime="2026-08-05T06:47:56.000Z">1h</time></a>
      <div role="group"></div>
    </article>`;

  return document.querySelector('article[data-testid="tweet"]')!;
}

describe('text extraction', () => {
  it('keeps line breaks X stores as real newlines', () => {
    // Regression: cleanTextContent normalised with \s+, which swallows \n, so
    // every multi-line tweet arrived as a single unreadable line.
    const data = extractTweetData(buildTweet({ text: 'line one\n\nline two\n\nline three' }));
    expect(data.text).toBe('line one\n\nline two\n\nline three');
  });

  it('converts <br> to a line break', () => {
    const data = extractTweetData(buildTweet({ text: 'first<br>second' }));
    expect(data.text).toBe('first\nsecond');
  });

  it('recovers emoji that X renders as images', () => {
    // Regression: textContent silently drops <img alt="🎉">, so emoji vanished
    // from every saved tweet.
    const data = extractTweetData(buildTweet({ text: 'nice <img alt="🎉"> day <img alt="🚀">' }));
    expect(data.text).toContain('🎉');
    expect(data.text).toContain('🚀');
  });

  it('collapses runs of spaces without touching newlines', () => {
    const data = extractTweetData(buildTweet({ text: 'a     b\n\n\n\nc' }));
    expect(data.text).toBe('a b\n\nc');
  });
});

describe('user info', () => {
  it('reads the name and handle from the container X actually renders', () => {
    // Regression: the code looked for [data-testid="User-Names"] (plural),
    // which matches nothing on current X, and fell through to a very loose
    // span selector.
    const data = extractTweetData(buildTweet({ text: 'hi', name: 'CBS News', handle: 'CBSNews' }));

    expect(data.userName).toBe('CBS News');
    expect(data.userHandle).toBe('CBSNews');
  });

  it('never mistakes a status id for a handle', () => {
    // Regression: the fallback did href.replace(/^.*\//, ''), which turns
    // /user/status/123 into "123".
    const data = extractTweetData(buildTweet({ text: 'hi', handle: 'someone' }));
    expect(data.userHandle).toBe('someone');
    expect(data.userHandle).not.toMatch(/^\d+$/);
  });
});

describe('expanding long posts', () => {
  it('clicks only X\'s own show-more control', () => {
    // Regression: this matched any button whose text contained show/more/更多,
    // which also hits "Show more replies" and the post's overflow menu. The
    // selector and label below were verified against live X.
    const element = buildTweet({ text: 'a'.repeat(300), showMore: true });
    const control = element.querySelector('[data-testid="tweet-text-show-more-link"]') as HTMLElement;
    const clicked = vi.spyOn(control, 'click');

    extractTweetData(element);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('leaves unrelated controls alone', () => {
    const element = buildTweet({ text: 'a'.repeat(300) });
    const decoy = document.createElement('button');
    decoy.setAttribute('role', 'button');
    decoy.textContent = 'Show more replies';
    element.appendChild(decoy);

    const clicked = vi.spyOn(decoy, 'click');
    extractTweetData(element);
    expect(clicked).not.toHaveBeenCalled();
  });

  it('ignores the control when its label is unexpected', () => {
    const element = buildTweet({ text: 'hi', showMore: true });
    const control = element.querySelector('[data-testid="tweet-text-show-more-link"]') as HTMLElement;
    control.textContent = 'Translate post';

    const clicked = vi.spyOn(control, 'click');
    extractTweetData(element);
    expect(clicked).not.toHaveBeenCalled();
  });
});

describe('metadata', () => {
  it('picks up the publish time and permalink', () => {
    const data = extractTweetData(buildTweet({ text: 'hi', handle: 'someone' }));

    expect(data.tweetTime).toBe('2026-08-05T06:47:56.000Z');
    expect(data.tweetUrl).toContain('/someone/status/123');
  });
});
