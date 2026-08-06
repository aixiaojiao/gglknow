import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadGlobalScripts } from './helpers/load-global-script';

const { AITagEngine } = loadGlobalScripts<{ AITagEngine: any }>(
  ['ai-tag-engine.js'],
  '{ AITagEngine }'
);

/** A tweet shaped exactly like TweetData in src/types/index.ts */
const tweet = (over: Record<string, unknown> = {}) => ({
  userName: 'Someone',
  userHandle: 'someone',
  text: '',
  timestamp: '2026-08-05T00:00:00Z',
  tweetUrl: 'https://x.com/someone/status/1',
  media: { images: [], videos: [] },
  stats: { replies: '0', retweets: '0', likes: '0' },
  ...over
});

let engine: any;

beforeEach(() => {
  localStorage.clear();
  engine = new AITagEngine();
});

describe('reading the tweet', () => {
  it('reads the text field the extension actually produces', () => {
    // Regression: this read tweetData.tweetText, a name nothing in the project
    // ever writes, so the engine analysed '' for every tweet and could never
    // return a single suggestion.
    const t = tweet({ text: 'Hello World' });
    expect(engine.extractAnalyzableText(t)).toBe('hello world');
  });

  it('detects nested media', () => {
    // Regression: read tweetData.images, but media is nested under `media`.
    expect(engine.hasMedia(tweet({ media: { images: ['a.jpg'], videos: [] } }))).toBe(true);
    expect(engine.hasMedia(tweet({ media: { images: [], videos: ['v.mp4'] } }))).toBe(true);
    expect(engine.hasMedia(tweet())).toBe(false);
  });

  it('detects links and replies from the text field', () => {
    expect(engine.hasLinks(tweet({ text: 'see https://x.com' }))).toBe(true);
    expect(engine.hasLinks(tweet({ text: 'no link here' }))).toBe(false);
    expect(engine.isReply(tweet({ text: '@someone thanks' }))).toBe(true);
    expect(engine.isReply(tweet({ text: 'not a reply' }))).toBe(false);
  });

  it('tolerates missing fields', () => {
    expect(() => engine.extractAnalyzableText({})).not.toThrow();
    expect(() => engine.hasMedia({})).not.toThrow();
    expect(engine.extractAnalyzableText({})).toBe('');
  });
});

describe('rule scoring', () => {
  it('does not penalise a rule for having a large keyword list', () => {
    // Regression: confidence was matches / vocabularySize, so 'tech' (14
    // keywords) scored 0.26 on three hits against a 0.6 threshold and could
    // never fire, while short-vocabulary rules fired easily.
    const text = 'using javascript and python to write code';
    const results = engine.applyRules(text, tweet({ text }));
    const tags = results.map((r: any) => r.tag);

    expect(tags).toContain('tech');
  });

  it('scores a rule with many keywords the same as one with few, at equal hits', () => {
    const tech = engine.applyRules('javascript python code', tweet());
    const crypto = engine.applyRules('bitcoin ethereum blockchain', tweet());

    const techScore = tech.find((r: any) => r.tag === 'tech').confidence;
    const cryptoScore = crypto.find((r: any) => r.tag === 'crypto').confidence;

    // Both saw three hits; the only difference should come from the rule's own
    // declared confidence (0.8 vs 0.9), not from vocabulary size (14 vs 11).
    expect(techScore).toBeCloseTo(0.8, 5);
    expect(cryptoScore).toBeCloseTo(0.9, 5);
  });

  it('never exceeds 1.0', () => {
    const stuffed = Array(40).fill('javascript python react code api').join(' ');
    for (const result of engine.applyRules(stuffed, tweet())) {
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('stays quiet on unrelated text', () => {
    const results = engine.applyRules('had lunch by the river today', tweet());
    expect(results.map((r: any) => r.tag)).not.toContain('tech');
  });
});

describe('analyzeTweet end to end', () => {
  it('produces suggestions for a content-rich tweet', async () => {
    // The whole feature returned zero suggestions for every input before the
    // field-name and scoring fixes. This is the guard against that regression.
    const t = tweet({
      text: 'Building an AI agent with python and typescript. The machine learning model '
          + 'uses a neural network. A tutorial: how to get started, step by step for any '
          + 'developer. https://github.com/foo/bar 🧵 1/',
      media: { images: ['https://pbs.twimg.com/media/A.jpg'], videos: [] }
    });

    const result = await engine.analyzeTweet(t);
    const tags = result.suggestions.map((s: any) => s.tag);

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(tags).toContain('ai');
    expect(tags).toContain('tech');
    expect(result.analysis.hasMedia).toBe(true);
    expect(result.analysis.hasLinks).toBe(true);
    expect(result.analysis.textLength).toBeGreaterThan(0);
  });

  it('picks up domain rules from links in the text', async () => {
    const result = await engine.analyzeTweet(tweet({ text: 'repo at https://github.com/foo/bar' }));
    expect(result.suggestions.map((s: any) => s.tag)).toContain('open-source');
  });

  it('returns nothing when disabled', async () => {
    engine.updateSettings({ enabled: false });
    const result = await engine.analyzeTweet(tweet({ text: 'javascript python code' }));
    expect(result.suggestions).toEqual([]);
  });
});

describe('persistence', () => {
  it('reports failure instead of throwing when storage rejects the write', () => {
    // Regression: neither save path had a try/catch, so a quota error escaped
    // straight out of updateSettings()/learnFromUserAction().
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    try {
      expect(() => engine.saveSettings()).not.toThrow();
      expect(engine.saveSettings()).toBe(false);
      expect(engine.saveUserPatterns()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
