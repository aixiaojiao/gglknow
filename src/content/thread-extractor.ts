import { tr } from '../ui-language';
/**
 * Thread Extractor Module
 * 
 * This module will be responsible for detecting and extracting
 * complete Twitter threads from a page.
 * 
 * Initially, it contains placeholder functions that will be
 * implemented in subsequent steps.
 */

import { ThreadData, TweetData } from '@/types';
import { log } from '@/utils';
import { extractTweetData } from './tweet-extractor';

/**
 * Checks if the current page is a Twitter thread page.
 * (This is a placeholder and will be implemented later)
 */
export function isThreadPage(): boolean {
  const url = window.location.href;
  
  // Thread URL pattern: https://twitter.com/username/status/tweetId
  // or https://x.com/username/status/tweetId
  const threadPattern = /(?:twitter\.com|x\.com)\/[^/]+\/status\/\d+/;
  
  return threadPattern.test(url);
}

/**
 * Extracts only the contiguous, already loaded posts by this author.
 */
export async function extractThreadData(mainTweetElement: Element): Promise<ThreadData | null> {
  try {
    log('info', 'ThreadExtractor', 'Starting thread extraction');

    // Find the main conversation container to scope the search
    const conversationContainer = mainTweetElement.closest('main[role="main"], div[data-testid="primaryColumn"]');
    if (!conversationContainer) {
        log('error', 'ThreadExtractor', 'Could not find conversation container.');
        return null;
    }

    const mainTweetData = extractTweetData(mainTweetElement);
    const authorHandle = mainTweetData.userHandle;

    if (!authorHandle) {
      log('error', 'ThreadExtractor', 'Could not determine author handle from main tweet.');
      return null;
    }

    log('info', 'ThreadExtractor', `Main author handle: @${authorHandle}`);
    
    const threadTweets: TweetData[] = [];
    const allTweetsInContainer = Array.from(conversationContainer.querySelectorAll('article[data-testid="tweet"]'));
    
    let threadStarted = false;
    for (const tweetElement of allTweetsInContainer) {
      // Find the main tweet to start the thread
      if (!threadStarted && tweetElement.isEqualNode(mainTweetElement)) {
        threadStarted = true;
      }

      if (threadStarted) {
        const authorLink = tweetElement.querySelector<HTMLAnchorElement>('[data-testid="User-Name"] a[href], [data-testid="User-Names"] a[href]');
        if (authorLink && new URL(authorLink.href).pathname.split('/')[1] !== authorHandle) break;
        const currentTweetData = extractTweetData(tweetElement);
        // Once thread starts, check if the author is the same
        if (currentTweetData.userHandle === authorHandle) {
          if (threadTweets.length >= 25) throw new Error(tr('单次最多保存 25 条已加载推文，请缩小范围。', 'Save up to 25 loaded posts at a time. Choose a smaller thread.'));
          threadTweets.push(currentTweetData);
          log('info', 'ThreadExtractor', `Found tweet by @${authorHandle} in thread.`);
        } else {
          // If a tweet from a different author is encountered, the thread is considered finished.
          log('info', 'ThreadExtractor', 'Different author encountered, thread ended.');
          break; 
        }
      }
    }

    if (threadTweets.length === 0) {
        // This case might happen if the main tweet wasn't found in the container scan
        log('warn', 'ThreadExtractor', 'No tweets found for thread, adding main tweet as fallback.');
        threadTweets.push(mainTweetData);
    }
    
    const threadData: ThreadData = {
      tweets: threadTweets,
      mainTweet: threadTweets[0] || null
    };

    log('info', 'ThreadExtractor', 'Thread extraction completed.', {
      tweetCount: threadTweets.length,
      author: authorHandle
    });

    return threadData;
  } catch (error) {
    log('error', 'ThreadExtractor', 'Failed to extract thread data', error);
    throw error;
  }
} 