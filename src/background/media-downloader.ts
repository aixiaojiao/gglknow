/**
 * Media Downloader Module
 * 
 * Handles downloading of media files (images, videos, avatars) from tweets
 */

import { MediaToDownload, ExtensionError } from '@/types';
import { getFileExtension, createError, log } from '@/utils';

/**
 * Download all media files for a tweet
 */
export async function downloadMediaFiles(
  mediaData: MediaToDownload,
  savePath: string,
  baseFileName: string
): Promise<void> {
  try {
    log('info', 'MediaDownloader', 'Starting media download', {
      images: mediaData.images.length,
      videos: mediaData.videos.length,
      hasAvatar: !!mediaData.avatar
    });

    const downloadPromises: Promise<void>[] = [];

    // Download images
    mediaData.images.forEach((imageUrl, index) => {
      const extension = getFileExtension(imageUrl) || '.jpg';
      const filename = `image_${index + 1}${extension}`;
      const fullPath = `${savePath}/${baseFileName}/media/${filename}`;
      
      downloadPromises.push(
        downloadFile(imageUrl, fullPath, `图片 ${index + 1}`)
      );
    });

    // Download videos
    mediaData.videos.forEach((videoUrl, index) => {
      const extension = getFileExtension(videoUrl) || '.mp4';
      const filename = `video_${index + 1}${extension}`;
      const fullPath = `${savePath}/${baseFileName}/media/${filename}`;
      
      downloadPromises.push(
        downloadFile(videoUrl, fullPath, `视频 ${index + 1}`)
      );
    });

    // Download avatar
    if (mediaData.avatar) {
      const extension = getFileExtension(mediaData.avatar) || '.jpg';
      const filename = `avatar${extension}`;
      const fullPath = `${savePath}/${baseFileName}/media/${filename}`;
      
      downloadPromises.push(
        downloadFile(mediaData.avatar, fullPath, '头像')
      );
    }

    // Wait for all downloads to complete
    await Promise.all(downloadPromises);

    log('info', 'MediaDownloader', 'All media downloads completed successfully');
  } catch (error) {
    log('error', 'MediaDownloader', 'Media download failed', error);
    throw createError(
      ExtensionError.DOWNLOAD_FAILED,
      '媒体文件下载失败',
      'Failed to download media files',
      error as Error
    );
  }
}

/**
 * Download a single file
 */
async function downloadFile(url: string, filepath: string, description: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      log('info', 'MediaDownloader', `Starting download: ${description}`, { url, filepath });

      chrome.downloads.download({
        url: url,
        filename: filepath,
        conflictAction: 'overwrite'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          log('error', 'MediaDownloader', `Download failed: ${description}`, chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!downloadId) {
          log('error', 'MediaDownloader', `Download failed: ${description}`, 'No download ID returned');
          reject(new Error('Download failed: No download ID returned'));
          return;
        }

        log('info', 'MediaDownloader', `Download started: ${description}`, { downloadId });

        // Listen for download completion
        const listener = (delta: chrome.downloads.DownloadDelta) => {
          if (delta.id === downloadId && delta.state) {
            if (delta.state.current === 'complete') {
              log('info', 'MediaDownloader', `Download completed: ${description}`, { downloadId });
              chrome.downloads.onChanged.removeListener(listener);
              resolve();
            } else if (delta.state.current === 'interrupted') {
              log('error', 'MediaDownloader', `Download interrupted: ${description}`, { downloadId });
              chrome.downloads.onChanged.removeListener(listener);
              reject(new Error(`Download interrupted: ${description}`));
            }
          }
        };

        chrome.downloads.onChanged.addListener(listener);

        // Set timeout for download (30 seconds)
        setTimeout(() => {
          chrome.downloads.onChanged.removeListener(listener);
          reject(new Error(`Download timeout: ${description}`));
        }, 30000);
      });
    } catch (error) {
      log('error', 'MediaDownloader', `Download error: ${description}`, error);
      reject(error);
    }
  });
}

/**
 * Download main tweet file
 */
export async function downloadTweetFile(
  filename: string,
  content: string,
  savePath: string,
  extension: string = '.html'
): Promise<void> {
  try {
    log('info', 'MediaDownloader', 'Downloading tweet file', { filename, size: content.length });

    // Create blob from content
    const blob = new Blob([content], { type: getContentType(extension) });
    
    // Convert blob to data URL, which is supported in Service Workers
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

    const fullPath = `${savePath}/${filename}/${filename}${extension}`;

    await downloadFile(url, fullPath, '推文文件');

    log('info', 'MediaDownloader', 'Tweet file downloaded successfully');
  } catch (error) {
    log('error', 'MediaDownloader', 'Tweet file download failed', error);
    throw createError(
      ExtensionError.DOWNLOAD_FAILED,
      '推文文件下载失败',
      'Failed to download tweet file',
      error as Error
    );
  }
}

/**
 * Get content type for file extension
 */
function getContentType(extension: string): string {
  switch (extension.toLowerCase()) {
    case '.html':
      return 'text/html';
    case '.md':
      return 'text/markdown';
    case '.json':
      return 'application/json';
    case '.txt':
      return 'text/plain';
    default:
      return 'text/plain';
  }
}

/**
 * Check if downloads API is available
 */
export function isDownloadApiAvailable(): boolean {
  return typeof chrome !== 'undefined' && 
         !!chrome.downloads && 
         !!chrome.downloads.download;
}

/**
 * Get download progress for a download ID
 */
export async function getDownloadProgress(downloadId: number): Promise<chrome.downloads.DownloadItem | null> {
  return new Promise((resolve) => {
    if (!chrome.downloads || !chrome.downloads.search) {
      resolve(null);
      return;
    }

    chrome.downloads.search({ id: downloadId }, (items) => {
      if (chrome.runtime.lastError) {
        log('error', 'MediaDownloader', 'Failed to get download progress', chrome.runtime.lastError);
        resolve(null);
      } else {
        resolve(items.length > 0 ? items[0] : null);
      }
    });
  });
}

/**
 * Cancel a download
 */
export async function cancelDownload(downloadId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome.downloads || !chrome.downloads.cancel) {
      reject(new Error('Downloads API not available'));
      return;
    }

    chrome.downloads.cancel(downloadId, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        log('info', 'MediaDownloader', 'Download cancelled', { downloadId });
        resolve();
      }
    });
  });
}

export default {
  downloadMediaFiles,
  downloadTweetFile,
  isDownloadApiAvailable,
  getDownloadProgress,
  cancelDownload
}; 