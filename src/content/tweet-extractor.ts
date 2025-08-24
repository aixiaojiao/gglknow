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
      mediaCount: data.media.images.length,
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
    const urlMatch = window.location.href.match(/(?:twitter\.com|x\.com)\/([^/]+)/);
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
  // First try to extract article content if this is a Twitter Article
  const articleContent = extractArticleContent(tweetElement);
  if (articleContent) {
    data.text = articleContent;
    log('info', 'TweetExtractor', 'Article content extracted', {
      hasText: !!data.text,
      textLength: data.text.length
    });
    return;
  }

  // Fall back to regular tweet content extraction
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
  
  // Note: Video extraction has been intentionally disabled to keep the extension lightweight
  // The extension focuses on text and image collection for optimal performance and simplicity

  data.media = media;

  log('info', 'TweetExtractor', 'Media data extracted', {
    images: media.images.length,
    imageUrls: media.images
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

/**
 * Extract article content for Twitter Articles
 */
function extractArticleContent(tweetElement: Element): string | null {
  try {
    log('info', 'TweetExtractor', 'Attempting to extract article content');

    // Try to find and click "Show more" or "显示更多" button to expand article content
    const expandButtons: HTMLElement[] = [];
    
    // Look for elements with expand-related attributes
    const ariaExpandButtons = tweetElement.querySelectorAll('[aria-label*="Show more"], [aria-label*="显示更多"]');
    ariaExpandButtons.forEach(btn => btn instanceof HTMLElement && expandButtons.push(btn));
    
    // Look for elements with expand-related test ids
    const testIdButtons = tweetElement.querySelectorAll('[data-testid*="expand"]');
    testIdButtons.forEach(btn => btn instanceof HTMLElement && expandButtons.push(btn));
    
    // Look for buttons/spans with expand-related text content
    const allButtons = tweetElement.querySelectorAll('div[role="button"], span[role="button"], button');
    allButtons.forEach(el => {
      if (el instanceof HTMLElement) {
        const text = el.textContent?.toLowerCase() || '';
        if (text.includes('show') || text.includes('more') || text.includes('expand') ||
            text.includes('显示') || text.includes('更多') || text.includes('展开') ||
            text.includes('read more') || text.includes('阅读更多')) {
          expandButtons.push(el);
        }
      }
    });

    // Try to click expand button if found
    for (const button of expandButtons) {
      if (button && button instanceof HTMLElement) {
        log('info', 'TweetExtractor', 'Found expand button, attempting to click');
        try {
          button.click();
          break;
        } catch (error) {
          log('warn', 'TweetExtractor', 'Failed to click expand button', error);
        }
      }
    }

    // Article-specific content selectors - ordered by priority
    const articleSelectors = [
      // Twitter Article specific selectors
      '[data-testid="article-wrapper"]',
      '[data-testid="article-content"]',
      '[data-testid="longform-tweet"]',
      '[data-testid="tweetText"] div[dir]',
      
      // Look for containers with long text content
      'div[lang][dir="auto"]',
      'div[dir="ltr"][lang]',
      'div[dir="auto"][lang]',
      
      // Generic text containers that might contain article content
      'div[role="article"]',
      'div[data-testid="tweetText"]',
      
      // More comprehensive selectors
      'div[data-testid="tweetText"] *',
      '[data-testid="tweetText"] span',
      'article div[lang]',
      'article span[lang]',
      
      // Fallback: any div or span with meaningful text
      'div',
      'span'
    ];

    let articleContent = '';
    let bestElement: Element | null = null;
    let maxLength = 0;
    const candidateElements: Array<{element: Element, text: string, selector: string}> = [];

    // Try each selector and find the one with the most content
    for (const selector of articleSelectors) {
      const elements = tweetElement.querySelectorAll(selector);
      
      for (const element of elements) {
        const text = element.textContent?.trim() || '';
        if (text.length > 10) {
          candidateElements.push({element, text, selector});
          
          if (text.length > maxLength && isLikelyArticleContent(element, text)) {
            maxLength = text.length;
            bestElement = element;
            articleContent = text;
          }
        }
      }
    }

    // Try to get nested content if we found a good element
    if (bestElement) {
      // Look for paragraphs or text blocks within the article element
      const textBlocks = bestElement.querySelectorAll('div, p, span');
      const textParts: string[] = [];
      const seenTexts = new Set<string>();
      
      for (const block of textBlocks) {
        const blockText = block.textContent?.trim() || '';
        if (blockText && 
            blockText.length > 20 && 
            !isUIElement(blockText) &&
            !seenTexts.has(blockText) &&
            !isPartOfLargerText(blockText, textParts)) {
          textParts.push(blockText);
          seenTexts.add(blockText);
        }
      }
      
      if (textParts.length > 0) {
        // Clean and format the article content
        articleContent = cleanAndFormatArticleContent(textParts);
      }
    }

    // Validate if we got meaningful article content
    if (articleContent && articleContent.length > 50) {
      log('info', 'TweetExtractor', 'Article content extracted successfully', {
        contentLength: articleContent.length,
        hasMultipleParagraphs: articleContent.includes('\n')
      });
      return articleContent;
    }

    log('info', 'TweetExtractor', 'No article content found or content too short');
    return null;

  } catch (error) {
    log('error', 'TweetExtractor', 'Failed to extract article content', error);
    return null;
  }
}

/**
 * Check if element likely contains article content
 */
function isLikelyArticleContent(element: Element, text: string): boolean {
  // Must have some content
  if (text.length < 20) return false;

  // Skip if it's clearly UI elements
  if (isUIElement(text)) return false;

  // Skip if it's inside a link (not main content) - but allow some flexibility
  if (element.closest('a') && text.length < 50) return false;

  // Skip if it's a time element
  if (element.closest('time')) return false;

  // Skip if it's user info
  if (element.closest('[data-testid="User-Names"]') || 
      element.closest('[data-testid="User-Avatar"]')) return false;

  // Prefer elements with language attributes (actual content)
  if (element.hasAttribute('lang') || element.hasAttribute('dir')) {
    return true;
  }

  // Check if parent has content indicators
  const parent = element.parentElement;
  if (parent && (parent.hasAttribute('lang') || parent.hasAttribute('dir'))) {
    return true;
  }

  // Accept any text longer than 50 characters
  return text.length > 50;
}

/**
 * Check if text is likely a UI element rather than content
 */
function isUIElement(text: string): boolean {
  const cleanText = text.trim();
  
  const uiPatterns = [
    /^\d+$/, // Just numbers
    /^@\w+$/, // Username
    /^\d+[hms]$/, // Time like "2h", "30m"
    /^\d{1,2}:\d{2}$/, // Time like "14:30"
    /^(回复|转发|点赞|关注|已关注|收藏|收藏中|收藏串)/, // Chinese UI elements (allow partial matches)
    /^(Reply|Retweet|Like|Follow|Following|Save|Saving)$/i, // English UI elements
    /^已置顶$/, // "Pinned" in Chinese
    /^Pinned$/i, // "Pinned" in English
    /^(想发布自己的文章|升级为|Premium)/, // Premium prompts
    /^(下午|上午|AM|PM)\d/, // Time stamps
    /^\d+\.?\d*万?\s*(查看|回复|转推|点赞)/, // Engagement numbers (improved)
    /^\d{4}年\d{1,2}月\d{1,2}日/, // Chinese date format
    /^Theclues@follow_clues$/, // User handle repetition
    /^\d{10,}$/, // Very long numbers (like timestamps or IDs)
    /^[\s\n\r]*$/, // Empty or whitespace-only
    /^[·\s]*$/, // Just dots and spaces
  ];

  // Check if it's too short to be meaningful content
  if (cleanText.length < 10) return true;
  
  // Check if it matches UI patterns
  if (uiPatterns.some(pattern => pattern.test(cleanText))) return true;
  
  // Check if it's mostly punctuation or numbers
  if (/^[\d\s.,:+%-]+$/.test(cleanText)) return true;
  
  return false;
}

/**
 * Check if a text is part of a larger text already in the collection
 */
function isPartOfLargerText(text: string, existingTexts: string[]): boolean {
  return existingTexts.some(existing => 
    existing.includes(text) || text.includes(existing)
  );
}

/**
 * Clean and format article content
 */
function cleanAndFormatArticleContent(textParts: string[]): string {
  // Sort by length descending to prioritize longer, more complete texts
  const sortedParts = textParts.sort((a, b) => b.length - a.length);
  
  // Take the longest text as the main content
  let mainContent = sortedParts[0] || '';
  
  // Remove UI elements and clean up
  mainContent = mainContent
    // Remove user handles that appear at the beginning
    .replace(/^(已置顶)?(Theclues@follow_clues)+/g, '')
    // Remove trailing UI elements (more comprehensive)
    .replace(/(想发布自己的文章？升级为\s*Premium\+.*?)$/gs, '')
    .replace(/(下午|上午)\d{1,2}:\d{2}\s*·\s*\d{4}年\d{1,2}月\d{1,2}日.*?$/gs, '')
    // Remove engagement numbers and view counts (more patterns)
    .replace(/\d+\.?\d*万?\s*(查看|回复|转推|点赞)\s*\d*$/gm, '')
    .replace(/\d{10,}\s*$/gm, '') // Remove long number sequences
    .replace(/收藏中\.{3}/g, '') // Remove "收藏中..."
    .replace(/收藏串/g, '') // Remove "收藏串"
    .replace(/升级为\s*Premium\+/g, '') // Remove Premium prompts
    // Remove HTML-like content and whitespace
    .replace(/\s*<[^>]*>\s*/g, ' ') // Remove any HTML tags
    .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up multiple newlines
    // Remove trailing whitespace and empty lines
    .replace(/\s+$/gm, '') // Remove trailing spaces from each line
    .trim();

  // Add proper paragraph breaks for better readability
  mainContent = mainContent
    // Add breaks before numbered sections
    .replace(/(\d+\.\s*)/g, '\n\n$1')
    // Add breaks before key sections
    .replace(/(初始状态：|行动：|计算.*?后的情况|为什么)/g, '\n\n$1')
    // Add breaks before explanations
    .replace(/(表面上看|但这里隐藏|并非真实增值|溢价压缩是预警|数学本质)/g, '\n\n$1')
    // Clean up multiple breaks again
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return mainContent;
}

export default {
  extractTweetData,
  findTweetElements
}; 