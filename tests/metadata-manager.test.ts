import { describe, it, expect } from 'vitest';
import { loadGlobalScripts } from './helpers/load-global-script';

const { TweetMetadataManager } = loadGlobalScripts<{ TweetMetadataManager: any }>(
  ['ai-tag-engine.js', 'tweet-metadata-manager.js'],
  '{ TweetMetadataManager }'
);

/** Exercise the prototype directly — the constructor wires up DOM listeners */
const manager = Object.create(TweetMetadataManager.prototype);
const idOf = (tweet: unknown) => manager.generateTweetId(tweet);

describe('generateTweetId', () => {
  it('takes the status id from the URL', () => {
    expect(idOf({ tweetUrl: 'https://x.com/a/status/123' })).toBe('123');
  });

  it('ignores tracking params so the same tweet gets one key', () => {
    // Regression: split('/').pop() produced "123?s=20", a second record for
    // the same tweet, so tags saved from one entry point were invisible
    // from another.
    expect(idOf({ tweetUrl: 'https://x.com/a/status/123?s=20' })).toBe('123');
    expect(idOf({ tweetUrl: 'https://x.com/a/status/123#foo' })).toBe('123');
  });

  it('ignores a trailing slash instead of returning an empty key', () => {
    // Regression: this returned '', and every tweet with such a URL then
    // shared one metadata bucket — tags from one tweet showed up on another.
    expect(idOf({ tweetUrl: 'https://x.com/a/status/123/' })).toBe('123');
  });

  it('never throws on non-Latin1 display names', () => {
    // Regression: the fallback used btoa(), which throws InvalidCharacterError
    // on CJK or emoji input. With a mostly Chinese user base this aborted
    // tagging entirely whenever tweetUrl was missing.
    const chinese = { userName: '李雷', userHandle: 'lilei', timestamp: '2026-08-05' };
    const emoji = { userName: 'Fred🎉', userHandle: 'fred', timestamp: '2026-08-05' };

    expect(() => idOf(chinese)).not.toThrow();
    expect(() => idOf(emoji)).not.toThrow();
    expect(idOf(chinese)).toMatch(/^h[0-9a-z]+$/);
    expect(idOf(chinese)).not.toBe(idOf(emoji));
  });

  it('is deterministic and never empty', () => {
    const tweet = { userName: '李雷', userHandle: 'lilei', timestamp: '2026-08-05' };
    expect(idOf(tweet)).toBe(idOf(tweet));

    for (const input of [{}, { tweetUrl: '' }, { userName: '' }, null, undefined]) {
      expect(idOf(input)).toBeTruthy();
    }
  });
});

describe('migrateMetadata', () => {
  const migrate = (metadata: unknown) =>
    TweetMetadataManager.prototype.migrateMetadata.call(
      { mergeMetadataEntries: TweetMetadataManager.prototype.mergeMetadataEntries },
      metadata
    );

  it('folds query-string keys onto the plain status id and merges the records', () => {
    const result = migrate({
      tweets: {
        '123': { tags: ['a'], collection: 'favorites', notes: 'n1', favorite: false },
        '123?s=20': { tags: ['b'], collection: '', notes: 'n2', favorite: true },
        '456': { tags: ['c'] }
      }
    });

    expect(Object.keys(result.tweets).sort()).toEqual(['123', '456']);
    expect(result.tweets['123'].tags.sort()).toEqual(['a', 'b']);
    expect(result.tweets['123'].favorite).toBe(true);
    expect(result.tweets['123'].collection).toBe('favorites');
    expect(result.tweets['456'].tags).toEqual(['c']);
  });

  it('quarantines the empty-key bucket rather than deleting or mis-attributing it', () => {
    const result = migrate({ tweets: { '': { tags: ['orphan'] }, '789': { tags: ['x'] } } });

    expect(result.tweets['']).toBeUndefined();
    expect(result.orphanedTweets['']).toEqual({ tags: ['orphan'] });
  });

  it('runs once', () => {
    const first = migrate({ tweets: { '123?s=1': { tags: ['a'] } } });
    expect(first.schemaVersion).toBe(2);

    // A second pass must not disturb already-migrated data
    const second = migrate({ ...first, tweets: { ...first.tweets, '999?s=1': { tags: ['b'] } } });
    expect(Object.keys(second.tweets)).toContain('999?s=1');
  });

  it('leaves unrecognised keys alone', () => {
    const result = migrate({ tweets: { hq3x9f: { tags: ['a'] } } });
    expect(result.tweets['hq3x9f']).toEqual({ tags: ['a'] });
  });
});
