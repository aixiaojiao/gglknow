import { tr } from '../ui-language';
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
  ThreadData,
  CollectThreadMessage,
  MediaToDownload,
  isLegacyMessage,
  isExtensionMessage,
  ExtensionError
} from '@/types';
import { 
  validateTweetData, 
  generateTweetFilename, 
  createError, 
  getErrorMessage,
  log
} from '@/utils';
import { getSettings, saveSettings } from './settings';
import { generateFile, generateFileForThread } from './file-generator';
import { downloadMediaFiles, downloadTweetFile } from './media-downloader';

// A session-persisted cooldown plus a process mutex prevents parallel saves across tabs.
let collectionBusy = false;
async function limitedCollection(work: () => Promise<CollectTweetResponse>): Promise<CollectTweetResponse> {
  if (collectionBusy) return {success:false,error:tr('正在保存，请完成后再试', 'A save is already in progress.')};
  collectionBusy = true;
  try {
    const {nextCollectionAt = 0} = await chrome.storage.session.get('nextCollectionAt');
    if (Date.now() < nextCollectionAt) return {success:false,error:tr('请间隔 5 秒再收藏', 'Wait 5 seconds between saves.')};
    await chrome.storage.session.set({nextCollectionAt:Date.now()+5000});
    return await work();
  } finally { collectionBusy = false; }
}

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
      const result = await limitedCollection(() => handleCollectTweet(message.tweetData));
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
      case MessageType.COLLECT_TWEET: {
        const collectMessage = message as CollectTweetMessage;
        const result = await limitedCollection(() => handleCollectTweet(collectMessage.tweetData));
        sendResponse(result);
        break;
      }

      case MessageType.COLLECT_THREAD: {
        const collectThreadMessage = message as CollectThreadMessage;
        const threadResult = await limitedCollection(() => handleCollectThread(collectThreadMessage.threadData));
        sendResponse(threadResult);
        break;
      }

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

      case MessageType.GET_SETTINGS: {
        const settings = await getSettings();
        sendResponse({ success: true, settings });
        break;
      }

      case MessageType.SAVE_SETTINGS: {
        const saveMessage = message as SaveSettingsMessage;
        await saveSettings(saveMessage.settings);
        sendResponse({ success: true, message: tr('设置保存成功', 'Settings saved') });
        break;
      }

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
    if ((tweetData?.media?.images?.length || 0) > 50) throw new Error(tr('单次最多保存 50 张图片', 'Save up to 50 images at a time'));
    log('info', 'ServiceWorker', 'Starting tweet collection', {
      user: tweetData.userName,
      hasText: !!tweetData.text,
      hasMedia: (tweetData.media?.images?.length || 0) > 0
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

    // Generate and download file for each selected format
    for (const format of settings.fileFormats) {
      const fileResult = await generateFile(tweetData, format, settings.downloadMedia);
      log('info', 'ServiceWorker', `File content generated for ${format}`, { 
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
      log('info', 'ServiceWorker', `Tweet file (${format}) downloaded successfully`);
    }

    let mediaCount = 0;
    let mediaIncomplete = false;

    // Download media files if enabled
    if (settings.downloadMedia) {
      const mediaToDownload: MediaToDownload = {
        images: [...new Set(tweetData.media?.images || [])],
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
          mediaIncomplete = true;
        }
      }
    }

    log('info', 'ServiceWorker', 'Tweet collection completed successfully', {
      filename,
      mediaCount
    });

    return {
      success: true,
      message: mediaIncomplete ? tr('正文已保存，部分图片下载失败', 'Text saved; some images could not be downloaded') : tr('推文收藏成功', 'Post saved'),
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

/**
 * Handle thread collection request
 */
async function handleCollectThread(threadData: ThreadData): Promise<CollectTweetResponse> {
  try {
    if (!Array.isArray(threadData?.tweets) || threadData.tweets.length > 25) throw new Error(tr('单次最多保存 25 条已加载推文', 'Save up to 25 loaded posts at a time'));
    if (new Set(threadData.tweets.flatMap(t => t.media?.images || [])).size > 50) throw new Error(tr('单次最多保存 50 张图片', 'Save up to 50 images at a time'));
    const mainTweet = threadData.mainTweet || threadData.tweets[0];
    if (!mainTweet) {
      throw createError(ExtensionError.INVALID_TWEET_DATA, tr('线程数据为空或无效', 'The loaded thread is empty or invalid'));
    }

    log('info', 'ServiceWorker', 'Starting thread collection', {
      tweetCount: threadData.tweets.length,
      author: mainTweet.userName
    });

    const settings = await getSettings();
    const baseFilename = `${generateTweetFilename(mainTweet)}_thread`;

    for (const format of settings.fileFormats) {
      const fileResult = await generateFileForThread(threadData, format, settings.downloadMedia);
      
      await downloadTweetFile(
        baseFilename, // Use consistent base filename
        fileResult.content,
        settings.savePath,
        fileResult.extension
      );
      log('info', 'ServiceWorker', `Thread file (${format}) downloaded successfully`);
    }

    let totalMediaCount = 0;
    let mediaIncomplete = false;
    if (settings.downloadMedia) {
      const allMedia: MediaToDownload = { images: [], videos: [], avatar: null };
      
      threadData.tweets.forEach(tweet => {
        allMedia.images.push(...(tweet.media?.images || []));
        allMedia.videos.push(...(tweet.media?.videos || []));
        if (!allMedia.avatar) {
          allMedia.avatar = tweet.userAvatar || null;
        }
      });
      
      allMedia.images = [...new Set(allMedia.images)];
      totalMediaCount = allMedia.images.length + allMedia.videos.length + (allMedia.avatar ? 1 : 0);

      if (totalMediaCount > 0) {
        log('info', 'ServiceWorker', 'Starting media download for thread', { totalMediaCount });
        try { await downloadMediaFiles(allMedia, settings.savePath, baseFilename); }
        catch { mediaIncomplete = true; totalMediaCount = 0; }
        log('info', 'ServiceWorker', 'Media download for thread completed', { totalMediaCount });
      }
    }
    
    return {
      success: true,
      message: mediaIncomplete ? tr('正文已保存，部分图片下载失败', 'Text saved; some images could not be downloaded') : tr('已保存本页已加载推文（不保证串完整）', 'Loaded posts saved (the thread may be incomplete)'),
      filename: baseFilename,
      mediaCount: totalMediaCount
    };

  } catch (error) {
    log('error', 'ServiceWorker', 'Thread collection failed', error);
    
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