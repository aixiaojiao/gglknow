/**
 * GglKnow Extension Utility Functions
 * 
 * This file contains reusable utility functions used across the extension.
 */

import { 
  TweetData, 
  ExtensionSettings, 
  FilePathInfo, 
  ExtensionError, 
  ExtensionErrorInfo 
} from '@/types';

// ===== File Utilities =====

/**
 * Generate a safe filename from tweet data
 */
export function generateTweetFilename(tweetData: TweetData): string {
  const timestamp = new Date(tweetData.timestamp).toISOString().replace(/[:.]/g, '-');
  let userHandle = tweetData.userHandle || tweetData.userName || 'unknown_user';
  
  // Clean user handle, remove @ symbol and special characters
  userHandle = userHandle.replace('@', '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
  
  // If user handle is empty or only underscores, use default name
  if (!userHandle || userHandle.replace(/_/g, '') === '') {
    userHandle = 'unknown_user';
  }
  
  return `tweet_${userHandle}_${timestamp}`;
}

/**
 * Extract file extension from URL
 */
export function getFileExtension(url: string): string {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const lastDot = pathname.lastIndexOf('.');
    
    if (lastDot === -1) return '';
    
    const extension = pathname.substring(lastDot).toLowerCase();
    
    // Common image/video extensions
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm'];
    
    return validExtensions.includes(extension) ? extension : '.jpg';
  } catch (error) {
    console.warn('Failed to parse URL for extension:', url);
    return '.jpg';
  }
}

/**
 * Parse file path information
 */
export function parseFilePath(fullPath: string): FilePathInfo {
  const lastSlash = fullPath.lastIndexOf('/');
  const directory = lastSlash === -1 ? '' : fullPath.substring(0, lastSlash);
  const fullName = lastSlash === -1 ? fullPath : fullPath.substring(lastSlash + 1);
  
  const lastDot = fullName.lastIndexOf('.');
  const baseName = lastDot === -1 ? fullName : fullName.substring(0, lastDot);
  const extension = lastDot === -1 ? '' : fullName.substring(lastDot);
  
  return {
    baseName,
    extension,
    fullName,
    directory,
    fullPath
  };
}

/**
 * Sanitize filename for safe file system usage
 */
export function sanitizeFilename(filename: string): string {
  // Remove or replace invalid characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// ===== Data Validation =====

/**
 * Validate tweet data completeness
 */
export function validateTweetData(tweetData: TweetData): ExtensionErrorInfo | null {
  if (!tweetData) {
    return {
      type: ExtensionError.INVALID_TWEET_DATA,
      message: '推文数据为空'
    };
  }
  
  if (!tweetData.userName && !tweetData.userHandle) {
    return {
      type: ExtensionError.INVALID_TWEET_DATA,
      message: '无法提取推文用户信息'
    };
  }
  
  if (!tweetData.text && (!tweetData.media || (tweetData.media.images.length === 0 && tweetData.media.videos.length === 0))) {
    return {
      type: ExtensionError.INVALID_TWEET_DATA,
      message: '推文内容和媒体都为空'
    };
  }
  
  return null;
}

/**
 * Validate extension settings
 */
export function validateSettings(settings: Partial<ExtensionSettings>): ExtensionErrorInfo | null {
  if (!settings.savePath || settings.savePath.trim() === '') {
    return {
      type: ExtensionError.SETTINGS_NOT_FOUND,
      message: '保存路径不能为空'
    };
  }
  
  if (!settings.fileFormats || settings.fileFormats.length === 0) {
    return {
      type: ExtensionError.SETTINGS_NOT_FOUND,
      message: '请至少选择一种文件格式'
    };
  }
  
  return null;
}

// ===== String Utilities =====

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format timestamp to readable string
 */
export function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    return timestamp;
  }
}

// ===== Chrome Extension Utilities =====

/**
 * Check if Chrome extension APIs are available
 */
export function checkExtensionContext(): boolean {
  return typeof chrome !== 'undefined' && 
         !!chrome.runtime && 
         !!chrome.runtime.sendMessage;
}

/**
 * Safe Chrome storage get operation
 */
export function getChromeStorage<T>(keys: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!chrome.storage || !chrome.storage.sync) {
      reject(new Error('Chrome storage API not available'));
      return;
    }
    
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result as T);
      }
    });
  });
}

/**
 * Safe Chrome storage set operation
 */
export function setChromeStorage(items: Record<string, any>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome.storage || !chrome.storage.sync) {
      reject(new Error('Chrome storage API not available'));
      return;
    }
    
    chrome.storage.sync.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Safe Chrome runtime message sending
 */
export function sendChromeMessage<T>(message: any): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      reject(new Error('Chrome runtime API not available'));
      return;
    }
    
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response as T);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Checks if the current page is Twitter/X
 */
export function isTwitterPage(): boolean {
  return window.location.hostname === 'twitter.com' ||
         window.location.hostname === 'x.com' ||
         window.location.hostname === 'www.twitter.com' ||
         window.location.hostname === 'www.x.com';
}

/**
 * Localizes the current document by replacing elements with data-i18n attributes.
 */
export function localizePage(): void {
  // Set the language of the document
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    document.documentElement.lang = chrome.i18n.getUILanguage();
  }

  // Localize elements with data-i18n attribute for text content
  const i18nElements = document.querySelectorAll<HTMLElement>('[data-i18n]');
  i18nElements.forEach(element => {
    const key = element.dataset.i18n;
    if (key) {
      const translatedText = chrome.i18n.getMessage(key);
      if (translatedText) {
        element.textContent = translatedText;
      }
    }
  });

  // Localize elements with data-i18n-placeholder for placeholder attribute
  const placeholderElements = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]');
  placeholderElements.forEach(element => {
    const key = element.dataset.i18nPlaceholder;
    if (key) {
      const translatedText = chrome.i18n.getMessage(key);
      if (translatedText) {
        element.placeholder = translatedText;
      }
    }
  });

  // Localize elements with data-i18n-title for title attribute
  const titleElements = document.querySelectorAll<HTMLElement>('[data-i18n-title]');
  titleElements.forEach(element => {
    const key = element.dataset.i18nTitle;
    if (key) {
      const translatedText = chrome.i18n.getMessage(key);
      if (translatedText) {
        element.title = translatedText;
      }
    }
  });
}

// ===== Error Handling =====

/**
 * Create structured error information
 */
export function createError(
  type: ExtensionError, 
  message: string, 
  details?: string, 
  originalError?: Error
): ExtensionErrorInfo {
  return {
    type,
    message,
    details,
    stack: originalError?.stack
  };
}

/**
 * Convert error to user-friendly message
 */
export function getErrorMessage(error: ExtensionErrorInfo | Error | string): string {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  // Handle ExtensionErrorInfo
  const errorInfo = error as ExtensionErrorInfo;
  switch (errorInfo.type) {
    case ExtensionError.SETTINGS_NOT_FOUND:
      return '请先设置保存路径：点击插件图标进行设置';
    case ExtensionError.INVALID_TWEET_DATA:
      return '推文数据无效，请刷新页面后重试';
    case ExtensionError.DOWNLOAD_FAILED:
      return '下载失败，请检查网络连接';
    case ExtensionError.STORAGE_ERROR:
      return '存储错误，请检查浏览器设置';
    case ExtensionError.NETWORK_ERROR:
      return '网络错误，请检查网络连接';
    case ExtensionError.PERMISSION_DENIED:
      return '权限不足，请检查扩展权限设置';
    case ExtensionError.CONTEXT_INVALIDATED:
      return '扩展上下文已失效，请刷新页面';
    default:
      return errorInfo.message || '未知错误';
  }
}

// ===== Logging Utilities =====

/**
 * Enhanced console logging with context
 */
export function log(level: 'info' | 'warn' | 'error', context: string, message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const prefix = `[GglKnow][${timestamp}][${context}]`;
  
  switch (level) {
    case 'info':
      console.log(`${prefix} ${message}`, data || '');
      break;
    case 'warn':
      console.warn(`${prefix} ${message}`, data || '');
      break;
    case 'error':
      console.error(`${prefix} ${message}`, data || '');
      break;
  }
}

// ===== Debounce Utility =====

/**
 * Debounce function to limit rapid function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T, 
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

// ===== URL Utilities =====

/**
 * Check if URL is a valid Twitter/X URL
 */
export function isTwitterUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'twitter.com' || 
           urlObj.hostname === 'x.com' ||
           urlObj.hostname === 'www.twitter.com' ||
           urlObj.hostname === 'www.x.com';
  } catch {
    return false;
  }
}

/**
 * Check if URL is a media URL
 */
export function isMediaUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('twimg.com') || 
           urlObj.hostname.includes('twitter.com') ||
           urlObj.hostname.includes('x.com');
  } catch {
    return false;
  }
}

export default {
  generateTweetFilename,
  getFileExtension,
  parseFilePath,
  sanitizeFilename,
  validateTweetData,
  validateSettings,
  truncateText,
  formatTimestamp,
  checkExtensionContext,
  getChromeStorage,
  setChromeStorage,
  sendChromeMessage,
  createError,
  getErrorMessage,
  log,
  debounce,
  isTwitterUrl,
  isMediaUrl,
  isTwitterPage
}; 