/**
 * Content Script for GglKnow Extension
 * 
 * Main content script that manages tweet collection on Twitter/X pages
 */

import { 
  CollectTweetMessage, 
  MessageType, 
  ButtonState, 
  CollectTweetResponse 
} from '@/types';
import { 
  checkExtensionContext, 
  sendChromeMessage, 
  getErrorMessage, 
  log 
} from '@/utils';
import { extractTweetData, isTwitterPage } from './tweet-extractor';
import { 
  initializeStyles, 
  addCollectionButtons, 
  observeNewTweets, 
  updateButtonState, 
  showTemporaryMessage 
} from './ui-manager';

/**
 * Main Twitter Collector class
 */
class TwitterCollector {
  private observer: MutationObserver | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the collector
   */
  private initialize(): void {
    try {
      log('info', 'TwitterCollector', 'Initializing content script');

      // Check if we're on Twitter/X
      if (!isTwitterPage()) {
        log('info', 'TwitterCollector', 'Not on Twitter/X page, skipping initialization');
        return;
      }

      // Check extension context
      if (!checkExtensionContext()) {
        log('error', 'TwitterCollector', 'Extension context not available');
        return;
      }

      // Wait for page to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.startCollector());
      } else {
        this.startCollector();
      }
    } catch (error) {
      log('error', 'TwitterCollector', 'Failed to initialize', error);
    }
  }

  /**
   * Start the collector
   */
  private startCollector(): void {
    try {
      log('info', 'TwitterCollector', 'Starting Twitter collector');

      // Initialize UI styles
      initializeStyles();

      // Add collection buttons to existing tweets
      addCollectionButtons(document.body, this.handleCollectTweet.bind(this));

      // Start observing for new tweets
      this.observer = observeNewTweets(this.handleCollectTweet.bind(this));

      // Notify background that content script is loaded
      this.notifyBackgroundLoaded();

      this.isInitialized = true;
      log('info', 'TwitterCollector', 'Twitter collector started successfully');
    } catch (error) {
      log('error', 'TwitterCollector', 'Failed to start collector', error);
    }
  }

  /**
   * Handle tweet collection
   */
  private async handleCollectTweet(tweetElement: Element, buttonElement: Element): Promise<void> {
    try {
      log('info', 'TwitterCollector', 'Starting tweet collection');

      // Check extension context
      if (!checkExtensionContext()) {
        throw new Error('扩展上下文不可用，请刷新页面重试');
      }

      // Update button to loading state
      updateButtonState(buttonElement, ButtonState.LOADING);

      // Extract tweet data
      const tweetData = extractTweetData(tweetElement);
      log('info', 'TwitterCollector', 'Tweet data extracted', {
        user: tweetData.userName,
        hasText: !!tweetData.text,
        mediaCount: tweetData.media.images.length + tweetData.media.videos.length
      });

      // Validate extracted data
      if (!tweetData.userName && !tweetData.userHandle && !tweetData.text) {
        throw new Error('无法提取推文数据，请稍后重试');
      }

      // Send collection request to background
      const message: CollectTweetMessage = {
        type: MessageType.COLLECT_TWEET,
        tweetData: tweetData,
        timestamp: new Date().toISOString()
      };

      const response = await sendChromeMessage<CollectTweetResponse>(message);
      log('info', 'TwitterCollector', 'Background response received', response);

      if (response && response.success) {
        // Show success state
        showTemporaryMessage(
          buttonElement,
          ButtonState.SUCCESS,
          response.message || '已收藏',
          2000
        );
        
        log('info', 'TwitterCollector', 'Tweet collected successfully', {
          filename: response.filename,
          mediaCount: response.mediaCount
        });
      } else {
        // Show error state
        const errorMessage = response?.error || '未知错误';
        showTemporaryMessage(
          buttonElement,
          ButtonState.ERROR,
          this.getShortErrorMessage(errorMessage),
          3000
        );
        
        log('error', 'TwitterCollector', 'Tweet collection failed', errorMessage);
      }
    } catch (error) {
      log('error', 'TwitterCollector', 'Tweet collection error', error);
      
      // Show error state
      const errorMessage = getErrorMessage(error as Error);
      showTemporaryMessage(
        buttonElement,
        ButtonState.ERROR,
        this.getShortErrorMessage(errorMessage),
        3000
      );
    }
  }

  /**
   * Get short error message for UI display
   */
  private getShortErrorMessage(errorMessage: string): string {
    if (errorMessage.includes('扩展上下文')) {
      return '扩展失效';
    } else if (errorMessage.includes('设置')) {
      return '需要设置';
    } else if (errorMessage.includes('网络')) {
      return '网络错误';
    } else if (errorMessage.includes('下载')) {
      return '下载失败';
    } else if (errorMessage.includes('数据')) {
      return '提取失败';
    } else {
      return '收藏失败';
    }
  }

  /**
   * Notify background that content script loaded
   */
  private async notifyBackgroundLoaded(): Promise<void> {
    try {
      await sendChromeMessage({
        type: MessageType.CONTENT_LOADED,
        timestamp: new Date().toISOString()
      });
      log('info', 'TwitterCollector', 'Background notified of content script load');
    } catch (error) {
      log('warn', 'TwitterCollector', 'Failed to notify background', error);
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    this.isInitialized = false;
    log('info', 'TwitterCollector', 'Collector cleaned up');
  }

  /**
   * Check if collector is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}

// Initialize collector
const collector = new TwitterCollector();

// Handle page navigation (for SPAs like Twitter)
let currentUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    log('info', 'TwitterCollector', 'URL changed, reinitializing', { newUrl: currentUrl });
    
    // Cleanup and reinitialize
    collector.cleanup();
    setTimeout(() => {
      new TwitterCollector();
    }, 1000);
  }
});

urlObserver.observe(document, { subtree: true, childList: true });

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  collector.cleanup();
  urlObserver.disconnect();
});

// Export for testing
export { TwitterCollector }; 