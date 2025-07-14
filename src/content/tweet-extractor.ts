/**
 * Tweet Data Extractor Module
 * 
 * Extracts tweet data from Twitter/X page DOM elements
 */

import { TweetData, TweetMedia, TweetStats } from '@/types';
import { log } from '@/utils';

/**
 * Extract tweet data from a tweet element
 */
export function extractTweetData(tweetElement: Element): TweetData {
  const data: TweetData = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userName: '',
    userHandle: '',
    userAvatar: '',
    text: '',
    tweetTime: '',
    tweetUrl: '',
    media: { images: [], videos: [] },
    stats: { replies: '0', retweets: '0', likes: '0' }
  };

  try {
    log('info', 'TweetExtractor', 'Starting tweet data extraction');

    // Extract user information
    extractUserInfo(tweetElement, data);
    
    // Extract tweet content
    extractTweetContent(tweetElement, data);
    
    // Extract media
    extractMediaData(tweetElement, data);
    
    // Extract stats
    extractTweetStats(tweetElement, data);
    
    // Extract tweet URL and time
    extractTweetMetadata(tweetElement, data);

    log('info', 'TweetExtractor', 'Tweet data extraction completed', {
      user: data.userName,
      hasText: !!data.text,
      mediaCount: data.media.images.length + data.media.videos.length,
      hasAvatar: !!data.userAvatar
    });

    return data;
  } catch (error) {
    log('error', 'TweetExtractor', 'Failed to extract tweet data', error);
    throw error;
  }
}

/**
 * Extract user information (name, handle, avatar)
 */
function extractUserInfo(tweetElement: Element, data: TweetData): void {
  // Extract user name using multiple selectors
  const userNameSelectors = [
    '[data-testid="User-Names"] a span',
    '[data-testid="User-Names"] span',
    '[data-testid="User-Name"] span',
    'div[dir="ltr"] span',
    'article span[dir="ltr"]'
  ];
  
  let userNameElement: Element | null = null;
  for (const selector of userNameSelectors) {
    userNameElement = tweetElement.querySelector(selector);
    if (userNameElement && userNameElement.textContent?.trim()) {
      break;
    }
  }
  
  if (userNameElement) {
    data.userName = userNameElement.textContent?.trim() || '';
  }

  // Extract user avatar
  const avatarImg = tweetElement.querySelector('[data-testid="Tweet-User-Avatar"] img') as HTMLImageElement;
  if (avatarImg?.src) {
    data.userAvatar = avatarImg.src;
  }

  // Extract user handle
  const userHandleSelectors = [
    '[data-testid="User-Names"] a[href*="/"]',
    'a[href^="/"][role="link"]',
    'a[href*="twitter.com/"]',
    'a[href*="x.com/"]'
  ];
  
  let userHandleElement: Element | null = null;
  for (const selector of userHandleSelectors) {
    userHandleElement = tweetElement.querySelector(selector);
    if (userHandleElement && userHandleElement.getAttribute('href')) {
      break;
    }
  }
  
  if (userHandleElement) {
    const href = userHandleElement.getAttribute('href');
    if (href) {
      data.userHandle = href.replace(/^.*\//, '').replace('@', '');
    }
  }

  // Fallback: extract from URL if no user info found
  if (!data.userName && !data.userHandle) {
    const urlMatch = window.location.href.match(/(?:twitter\.com|x\.com)\/([^\/]+)/);
    if (urlMatch) {
      data.userHandle = urlMatch[1];
      data.userName = urlMatch[1];
    }
  }

  log('info', 'TweetExtractor', 'User info extracted', {
    userName: data.userName,
    userHandle: data.userHandle,
    hasAvatar: !!data.userAvatar
  });
}

/**
 * Extract tweet text content
 */
function extractTweetContent(tweetElement: Element, data: TweetData): void {
  const textSelectors = [
    '[data-testid="tweetText"]',
    'div[lang]',
    'div[dir="ltr"]',
    'span[lang]'
  ];
  
  let tweetTextElement: Element | null = null;
  for (const selector of textSelectors) {
    const elements = tweetElement.querySelectorAll(selector);
    for (const element of elements) {
      if (element.textContent && element.textContent.trim().length > 0) {
        // Check if this element is likely the main tweet text
        if (isMainTweetText(element)) {
          tweetTextElement = element;
          break;
        }
      }
    }
    if (tweetTextElement) break;
  }
  
  if (tweetTextElement) {
    data.text = tweetTextElement.textContent?.trim() || '';
  }

  log('info', 'TweetExtractor', 'Tweet content extracted', {
    hasText: !!data.text,
    textLength: data.text.length
  });
}

/**
 * Check if element is likely the main tweet text
 */
function isMainTweetText(element: Element): boolean {
  const text = element.textContent?.trim() || '';
  
  // Skip if text is too short (likely UI elements)
  if (text.length < 3) return false;
  
  // Skip if element contains only numbers (likely stats)
  if (/^\d+$/.test(text)) return false;
  
  // Skip if element looks like a timestamp
  if (/^\d{1,2}[hms]$/.test(text) || /^\d{1,2}:\d{2}$/.test(text)) return false;
  
  // Skip if element looks like a username
  if (/^@\w+$/.test(text)) return false;
  
  // Skip if element is inside a link (likely not main content)
  if (element.closest('a')) return false;
  
  return true;
}

/**
 * Extract media data (images and videos)
 */
function extractMediaData(tweetElement: Element, data: TweetData): void {
  const media: TweetMedia = { images: [], videos: [] };

  // Extract images with precise selectors to avoid avatars and UI icons
  const imageSelectors = [
    'img[src*="pbs.twimg.com/media"]',  // Twitter media images
    'img[src*="video_thumb"]',          // Video thumbnails
    'div[data-testid="tweetPhoto"] img', // Tweet photo container
    'div[data-testid="videoComponent"] img' // Video component images
  ];
  
  for (const selector of imageSelectors) {
    const images = tweetElement.querySelectorAll(selector) as NodeListOf<HTMLImageElement>;
    for (const img of images) {
      const src = img.src;
      // Filter out avatars, emojis, and interface icons
      if (src && 
          !src.includes('profile_images') && 
          !src.includes('emoji') && 
          !src.includes('icon') && 
          !src.includes('avatar')) {
        
        let finalUrl = src; // Default to original src

        try {
          if (src.includes('pbs.twimg.com/media')) {
            const imageUrl = new URL(src);
            const format = imageUrl.searchParams.get('format') || 'jpg';
            
            // Reconstruct URL to get original quality image
            const reconstructedUrl = new URL(imageUrl.pathname, imageUrl.origin);
            reconstructedUrl.searchParams.set('format', format);
            reconstructedUrl.searchParams.set('name', 'orig');
            finalUrl = reconstructedUrl.toString();
          }
        } catch (e) {
          log('warn', 'TweetExtractor', 'Could not convert image URL to original quality, using fallback', { src, error: e });
          // Fallback to the original src is already handled by default
        }

        if (!media.images.includes(finalUrl)) {
          media.images.push(finalUrl);
        }
      }
    }
  }
  
  // Extract videos
  const videos = tweetElement.querySelectorAll('video') as NodeListOf<HTMLVideoElement>;
  for (const video of videos) {
    if (video.src && !media.videos.includes(video.src)) {
      media.videos.push(video.src);
    }
  }

  data.media = media;

  log('info', 'TweetExtractor', 'Media data extracted', {
    images: media.images.length,
    videos: media.videos.length
  });
}

/**
 * Extract tweet statistics (replies, retweets, likes)
 */
function extractTweetStats(tweetElement: Element, data: TweetData): void {
  const stats: TweetStats = { replies: '0', retweets: '0', likes: '0' };

  // Extract reply count
  const replyElement = tweetElement.querySelector('[data-testid="reply"] span, [aria-label*="repl"] span');
  if (replyElement) {
    stats.replies = replyElement.textContent?.trim() || '0';
  }

  // Extract retweet count
  const retweetElement = tweetElement.querySelector('[data-testid="retweet"] span, [aria-label*="retweet"] span');
  if (retweetElement) {
    stats.retweets = retweetElement.textContent?.trim() || '0';
  }

  // Extract like count
  const likeElement = tweetElement.querySelector('[data-testid="like"] span, [aria-label*="like"] span');
  if (likeElement) {
    stats.likes = likeElement.textContent?.trim() || '0';
  }

  data.stats = stats;

  log('info', 'TweetExtractor', 'Tweet stats extracted', stats);
}

/**
 * Extract tweet URL and time from metadata
 */
function extractTweetMetadata(tweetElement: Element, data: TweetData): void {
  // Extract tweet time
  const timeElement = tweetElement.querySelector('time');
  if (timeElement) {
    data.tweetTime = timeElement.getAttribute('datetime') || '';
  }

  // Extract tweet URL
  const timeEl = tweetElement.querySelector('time[datetime]');
  if (timeEl) {
    const linkEl = timeEl.closest('a') as HTMLAnchorElement;
    if (linkEl?.href) {
      data.tweetUrl = linkEl.href;
    }
  }

  log('info', 'TweetExtractor', 'Tweet metadata extracted', {
    hasTweetTime: !!data.tweetTime,
    hasTweetUrl: !!data.tweetUrl
  });
}

export function findTweetElements(): Element[] {
  const tweetSelectors = [
    'article[data-testid="tweet"]',
    '[data-testid="tweet"]'
  ];

  const elements = new Set<Element>();

  for (const selector of tweetSelectors) {
    const found = document.querySelectorAll(selector);
    found.forEach(el => elements.add(el));
  }

  return Array.from(elements);
}

export default {
  extractTweetData,
  findTweetElements
}; 