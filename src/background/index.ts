/**
 * Background Service Worker for GglKnow Extension
 * 
 * Main service worker that handles tweet collection, file generation, and media downloads
 */

import { 
  ExtensionMessage, 
  CollectTweetMessage, 
  CollectTweetResponse,
  SaveSettingsMessage,
  MessageType,
  TweetData,
  MediaToDownload,
  isLegacyMessage,
  isExtensionMessage
} from '@/types';
import { 
  validateTweetData, 
  generateTweetFilename, 
  createError, 
  getErrorMessage,
  log 
} from '@/utils';
import { getSettings, saveSettings } from './settings';
import { generateFile } from './file-generator';
import { downloadMediaFiles, downloadTweetFile } from './media-downloader';

// Service Worker 生命周期事件
chrome.runtime.onInstalled.addListener((details) => {
  log('info', 'ServiceWorker', 'Extension installed', { reason: details.reason });
});

chrome.runtime.onStartup.addListener(() => {
  log('info', 'ServiceWorker', 'Extension startup');
});

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('info', 'ServiceWorker', 'Message received', { 
    type: message.type || message.action,
    sender: sender.tab?.url || 'popup' 
  });

  // Handle legacy messages for backward compatibility
  if (isLegacyMessage(message)) {
    handleLegacyMessage(message, sender, sendResponse);
    return true;
  }

  // Handle new message format
  if (isExtensionMessage(message)) {
    handleExtensionMessage(message, sender, sendResponse);
    return true;
  }

  // Unknown message format
  log('warn', 'ServiceWorker', 'Unknown message format', message);
  sendResponse({ success: false, error: 'Unknown message format' });
  return false;
});

/**
 * Handle legacy message format (for backward compatibility)
 */
async function handleLegacyMessage(
  message: any,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    if (message.action === 'collectTweet') {
      const result = await handleCollectTweet(message.tweetData);
      sendResponse(result);
    } else {
      sendResponse({ success: false, error: 'Unknown legacy action' });
    }
  } catch (error) {
    log('error', 'ServiceWorker', 'Legacy message handling failed', error);
    sendResponse({ 
      success: false, 
      error: getErrorMessage(error as Error) 
    });
  }
}

/**
 * Handle new extension message format
 */
async function handleExtensionMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    switch (message.type) {
      case MessageType.COLLECT_TWEET:
        const collectMessage = message as CollectTweetMessage;
        const result = await handleCollectTweet(collectMessage.tweetData);
        sendResponse(result);
        break;

      case MessageType.TEST_CONNECTION:
        sendResponse({ 
          success: true, 
          message: 'Connection successful',
          version: chrome.runtime.getManifest().version
        });
        break;

      case MessageType.CONTENT_LOADED:
        log('info', 'ServiceWorker', 'Content script loaded', { url: sender.tab?.url });
        sendResponse({ success: true });
        break;

      case MessageType.GET_SETTINGS:
        const settings = await getSettings();
        sendResponse({ success: true, settings });
        break;

      case MessageType.SAVE_SETTINGS:
        const saveMessage = message as SaveSettingsMessage;
        await saveSettings(saveMessage.settings);
        sendResponse({ success: true, message: '设置保存成功' });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    log('error', 'ServiceWorker', 'Extension message handling failed', error);
    sendResponse({ 
      success: false, 
      error: getErrorMessage(error as Error) 
    });
  }
}

/**
 * Handle tweet collection request
 */
async function handleCollectTweet(tweetData: TweetData): Promise<CollectTweetResponse> {
  try {
    log('info', 'ServiceWorker', 'Starting tweet collection', {
      user: tweetData.userName,
      hasText: !!tweetData.text,
      hasMedia: tweetData.media.images.length > 0 || tweetData.media.videos.length > 0
    });

    // Validate tweet data
    const validationError = validateTweetData(tweetData);
    if (validationError) {
      throw createError(
        validationError.type,
        validationError.message,
        validationError.details
      );
    }

    // Get settings
    const settings = await getSettings();
    log('info', 'ServiceWorker', 'Settings retrieved', settings);

    // Generate filename
    const filename = generateTweetFilename(tweetData);
    log('info', 'ServiceWorker', 'Generated filename', { filename });

    // Generate file content
    const fileResult = await generateFile(tweetData, settings);
    log('info', 'ServiceWorker', 'File content generated', { 
      size: fileResult.content.length,
      extension: fileResult.extension 
    });

    // Download main tweet file
    await downloadTweetFile(
      filename,
      fileResult.content,
      settings.savePath,
      fileResult.extension
    );
    log('info', 'ServiceWorker', 'Tweet file downloaded successfully');

    let mediaCount = 0;

    // Download media files if enabled
    if (settings.downloadMedia) {
      const mediaToDownload: MediaToDownload = {
        images: tweetData.media?.images || [],
        videos: tweetData.media?.videos || [],
        avatar: tweetData.userAvatar || null
      };

      const totalMedia = mediaToDownload.images.length + 
                        mediaToDownload.videos.length + 
                        (mediaToDownload.avatar ? 1 : 0);

      if (totalMedia > 0) {
        log('info', 'ServiceWorker', 'Starting media download', { totalMedia });
        
        try {
          await downloadMediaFiles(mediaToDownload, settings.savePath, filename);
          mediaCount = totalMedia;
          log('info', 'ServiceWorker', 'Media download completed', { mediaCount });
        } catch (mediaError) {
          log('warn', 'ServiceWorker', 'Media download failed, but tweet saved', mediaError);
          // Don't throw error here, tweet is already saved
        }
      }
    }

    log('info', 'ServiceWorker', 'Tweet collection completed successfully', {
      filename,
      mediaCount
    });

    return {
      success: true,
      message: '推文收藏成功',
      filename,
      mediaCount
    };
  } catch (error) {
    log('error', 'ServiceWorker', 'Tweet collection failed', error);
    
    return {
      success: false,
      error: getErrorMessage(error as Error)
    };
  }
}

// Export for testing
export {
  handleCollectTweet,
  handleLegacyMessage,
  handleExtensionMessage
}; 