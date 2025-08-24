/**
 * File Generator Module
 * 
 * Generates different file formats (HTML, Markdown, JSON) from tweet data
 */

import {
    generateTweetFilename,
    getFileExtension,
    formatTimestamp,
    log
} from '@/utils';
import { TweetData, FileGenerationResult, ThreadData } from '@/types';

/**
 * Generate file content based on tweet data and settings
 */
export async function generateFile(
  tweetData: TweetData, 
  format: 'html' | 'markdown' | 'json'
): Promise<FileGenerationResult> {
  try {
    log('info', 'FileGenerator', `Generating ${format} file`, {
      user: tweetData.userName,
      hasMedia: tweetData.media.images.length > 0
    });
    
    switch (format) {
      case 'html':
        return generateHTMLFile(tweetData);
      case 'markdown':
        return generateMarkdownFile(tweetData);
      case 'json':
        return generateJSONFile(tweetData);
      default:
        throw new Error(`Unsupported file format: ${format}`);
    }
  } catch (error) {
    log('error', 'FileGenerator', 'Failed to generate file', error);
    throw error;
  }
}

/**
 * Generate file content for a thread based on format
 */
export async function generateFileForThread(
  threadData: ThreadData,
  format: 'html' | 'markdown' | 'json'
): Promise<FileGenerationResult> {
  try {
    log('info', 'FileGenerator', `Generating ${format} file for thread`);
    switch (format) {
      case 'html':
        return generateThreadHTMLFile(threadData);
      case 'markdown':
        return generateThreadMarkdownFile(threadData);
      case 'json':
        return generateThreadJSONFile(threadData);
      default:
        throw new Error(`Unsupported file format for thread: ${format}`);
    }
  } catch (error) {
    log('error', 'FileGenerator', 'Failed to generate thread file', error);
    throw error;
  }
}

/**
 * Generate HTML file content for a complete thread
 */
function generateThreadHTMLFile(threadData: ThreadData): FileGenerationResult {
    const mainTweet = threadData.mainTweet || threadData.tweets[0];
    const pageTitle = `推文串 - ${mainTweet.userName}`;
    const filename = `${generateTweetFilename(mainTweet)}_thread`;

    // Create a global mapping for all media URLs to unique local paths
    const imagePathMap = new Map<string, string>();
    const videoPathMap = new Map<string, string>();
    let imageCounter = 1;
    let videoCounter = 1;

    threadData.tweets.forEach(tweet => {
        (tweet.media?.images || []).forEach(imgUrl => {
            if (!imagePathMap.has(imgUrl)) {
                const ext = getFileExtension(imgUrl) || '.jpg';
                imagePathMap.set(imgUrl, `media/image_${imageCounter++}${ext}`);
            }
        });
        (tweet.media?.videos || []).forEach(vidUrl => {
            if (!videoPathMap.has(vidUrl)) {
                const ext = getFileExtension(vidUrl) || '.mp4';
                videoPathMap.set(vidUrl, `media/video_${videoCounter++}${ext}`);
            }
        });
    });

    const tweetBlocks = threadData.tweets.map(tweet => 
        createTweetHTMLBlock(tweet, imagePathMap, videoPathMap)
    ).join('');

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f0f2f5; padding: 20px; }
        .container { max-width: 680px; margin: 0 auto; }
        h1 { margin-bottom: 8px; font-size: 24px; color: #0f1419; }
        .tweet-card { background: white; border-radius: 12px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; transition: box-shadow 0.2s; }
        .tweet-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .tweet-content { padding: 20px; }
        .user-info { display: flex; align-items: center; margin-bottom: 12px; }
        .avatar { width: 48px; height: 48px; border-radius: 50%; margin-right: 12px; }
        .user-details h2 { font-size: 16px; font-weight: bold; }
        .user-details p { font-size: 14px; color: #536471; }
        .tweet-text { font-size: 16px; line-height: 1.6; color: #0f1419; margin-bottom: 12px; white-space: pre-wrap; }
        .tweet-media { margin: 12px 0; }
        .media-grid { display: grid; gap: 4px; border-radius: 12px; overflow: hidden; }
        .media-grid.single { grid-template-columns: 1fr; }
        .media-grid.double, .media-grid.triple, .media-grid.quad { grid-template-columns: 1fr 1fr; }
        .media-grid img, .media-grid video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tweet-meta { font-size: 13px; color: #536471; padding-top: 12px; border-top: 1px solid #e7e7e7; margin-top: 12px; }
        .view-original-btn { display: inline-block; margin-top: 8px; color: #1d9bf0; text-decoration: none; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${pageTitle}</h1>
        <p style="color: #536471; margin-bottom: 20px;">由 @${mainTweet.userHandle} 发布于 ${formatTimestamp(mainTweet.timestamp)}</p>
        ${tweetBlocks}
    </div>
</body>
</html>`;

    return {
        content: htmlContent,
        extension: '.html',
        filename: filename
    };
}

/**
 * Generate Markdown file for a complete thread
 */
function generateThreadMarkdownFile(threadData: ThreadData): FileGenerationResult {
    const mainTweet = threadData.mainTweet || threadData.tweets[0];
    const filename = `${generateTweetFilename(mainTweet)}_thread`;

    const markdownBlocks = threadData.tweets.map(tweet => {
        let content = `> ${tweet.text}\n\n`;
        (tweet.media?.images || []).forEach((img, index) => {
            content += `![Image ${index + 1}](./media/image_${index + 1}${getFileExtension(img) || '.jpg'})\n\n`;
        });
        (tweet.media?.videos || []).forEach((vid, index) => {
            content += `[Video ${index + 1}](./media/video_${index + 1}${getFileExtension(vid) || '.mp4'})\n\n`;
        });
        content += `*— ${tweet.userName} (@${tweet.userHandle}) on ${formatTimestamp(tweet.tweetTime || tweet.timestamp)}* | [View Original](${tweet.tweetUrl})\n\n---\n\n`;
        return content;
    }).join('');

    const fullContent = `
# Thread by @${mainTweet.userHandle}

${markdownBlocks}
`;

    return {
        content: fullContent,
        filename: filename,
        extension: '.md'
    };
}

/**
 * Generate JSON file for a complete thread
 */
function generateThreadJSONFile(threadData: ThreadData): FileGenerationResult {
    const mainTweet = threadData.mainTweet || threadData.tweets[0];
    const filename = `${generateTweetFilename(mainTweet)}_thread`;
    const content = JSON.stringify(threadData, null, 2);

    return {
        content: content,
        filename: filename,
        extension: '.json'
    };
}


/**
 * Generate HTML file content from tweet data
 */
function generateHTMLFile(tweetData: TweetData): FileGenerationResult {
    const imagePathMap = new Map<string, string>();
    const videoPathMap = new Map<string, string>();
    (tweetData.media?.images || []).forEach((imgUrl, index) => {
        const ext = getFileExtension(imgUrl) || '.jpg';
        imagePathMap.set(imgUrl, `media/image_${index + 1}${ext}`);
    });
    (tweetData.media?.videos || []).forEach((vidUrl, index) => {
        const ext = getFileExtension(vidUrl) || '.mp4';
        videoPathMap.set(vidUrl, `media/video_${index + 1}${ext}`);
    });

    const htmlBlock = createTweetHTMLBlock(tweetData, imagePathMap, videoPathMap);
    const pageTitle = `推文收藏 - ${tweetData.userName}`;
    const filename = generateTweetFilename(tweetData);

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f0f2f5; padding: 20px; }
        .container { max-width: 680px; margin: 0 auto; }
        .tweet-card { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
        .tweet-content { padding: 20px; }
        .user-info { display: flex; align-items: center; margin-bottom: 12px; }
        .avatar { width: 48px; height: 48px; border-radius: 50%; margin-right: 12px; }
        .user-details h2 { font-size: 16px; font-weight: bold; }
        .user-details p { font-size: 14px; color: #536471; }
        .tweet-text { font-size: 16px; line-height: 1.6; color: #0f1419; margin-bottom: 12px; white-space: pre-wrap; }
        .tweet-media { margin: 12px 0; }
        .media-grid { display: grid; gap: 4px; border-radius: 12px; overflow: hidden; }
        .media-grid.single { grid-template-columns: 1fr; }
        .media-grid.double, .media-grid.triple, .media-grid.quad { grid-template-columns: 1fr 1fr; }
        .media-grid img, .media-grid video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tweet-meta { font-size: 13px; color: #536471; padding-top: 12px; border-top: 1px solid #e7e7e7; margin-top: 12px; }
        .view-original-btn { display: inline-block; margin-top: 8px; color: #1d9bf0; text-decoration: none; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        ${htmlBlock}
    </div>
</body>
</html>`;
    
    return {
        content: htmlContent,
        extension: '.html',
        filename: filename
    };
}

/**
 * Creates an HTML block for a single tweet.
 */
function createTweetHTMLBlock(
    tweetData: TweetData,
    imagePathMap: Map<string, string>,
    videoPathMap: Map<string, string>
): string {
    const userAvatarPath = tweetData.userAvatar ? `media/avatar${getFileExtension(tweetData.userAvatar) || '.jpg'}` : '';
    
    // Process text with inline media
    let processedText = tweetData.text;
    
    if (tweetData.inlineMedia && tweetData.inlineMedia.length > 0) {
        // Replace inline media placeholders with actual HTML
        tweetData.inlineMedia.forEach((mediaItem) => {
            const mediaPath = mediaItem.type === 'image' 
                ? imagePathMap.get(mediaItem.src) 
                : videoPathMap.get(mediaItem.src);
                
            if (mediaPath) {
                const mediaHtml = mediaItem.type === 'image'
                    ? `<img src="${mediaPath}" alt="内联图片" style="max-width: 100%; border-radius: 8px; margin: 8px 0; display: block;">`
                    : `<video src="${mediaPath}" controls muted loop playsinline style="max-width: 100%; border-radius: 8px; margin: 8px 0; display: block;"></video>`;
                
                // Replace placeholder with actual media
                const placeholder = `[${mediaItem.type === 'image' ? '图片' : '视频'}${mediaItem.index + 1}]`;
                processedText = processedText.replace(placeholder, mediaHtml);
            }
        });
    }
    
    // Handle remaining media (not inline)
    const imagePaths = (tweetData.media?.images || []).filter(url => {
        // Only include images that are not already inline
        return !tweetData.inlineMedia?.some(item => item.src === url);
    }).map(url => imagePathMap.get(url) || '').filter(path => path);
    
    const videoPaths = (tweetData.media?.videos || []).filter(url => {
        // Only include videos that are not already inline
        return !tweetData.inlineMedia?.some(item => item.src === url);
    }).map(url => videoPathMap.get(url) || '').filter(path => path);

    const remainingMediaCount = imagePaths.length + videoPaths.length;
    const mediaGridClass = getMediaGridClass(remainingMediaCount);

    return `
    <div class="tweet-card">
        <div class="tweet-content">
            <div class="user-info">
                ${userAvatarPath ? `<img src="${userAvatarPath}" alt="${tweetData.userName}" class="avatar">` : ''}
                <div class="user-details">
                    <h2>${tweetData.userName}</h2>
                    <p>@${tweetData.userHandle}</p>
                </div>
            </div>
            <div class="tweet-text">${processedText}</div>
            ${remainingMediaCount > 0 ? `
            <div class="tweet-media">
                <div class="media-grid ${mediaGridClass}">
                    ${imagePaths.map(p => `<img src="${p}" loading="lazy">`).join('')}
                    ${videoPaths.map(p => `<video src="${p}" controls muted loop playsinline></video>`).join('')}
                </div>
            </div>
            ` : ''}
            <div class="tweet-meta">
                <span>${formatTimestamp(tweetData.tweetTime || tweetData.timestamp)}</span>
                <a href="${tweetData.tweetUrl}" target="_blank" class="view-original-btn">查看原文</a>
            </div>
        </div>
    </div>`;
}

/**
 * Generate Markdown file content from tweet data
 */
function generateMarkdownFile(tweetData: TweetData): FileGenerationResult {
    let content = `
# Tweet by ${tweetData.userName} (@${tweetData.userHandle})

> ${tweetData.text}

`;

    (tweetData.media?.images || []).forEach((img, index) => {
        const ext = getFileExtension(img) || '.jpg';
        content += `![Image ${index + 1}](media/image_${index + 1}${ext})\n\n`;
    });

    (tweetData.media?.videos || []).forEach((vid, index) => {
        const ext = getFileExtension(vid) || '.mp4';
        content += `[Video ${index + 1}](media/video_${index + 1}${ext})\n\n`;
    });

    content += `
---
- **发布时间:** ${formatTimestamp(tweetData.tweetTime || tweetData.timestamp)}
- **原始链接:** [View on Twitter](${tweetData.tweetUrl})
`;
   
   return {
     content,
     filename: generateTweetFilename(tweetData),
     extension: '.md'
   };
}

/**
 * Generate JSON file content from tweet data
 */
function generateJSONFile(tweetData: TweetData): FileGenerationResult {
  const content = JSON.stringify(tweetData, null, 2);
  
  return {
    content,
    filename: generateTweetFilename(tweetData),
    extension: '.json'
  };
}

/**
 * Get CSS grid class based on media count
 */
function getMediaGridClass(count: number): string {
  switch (count) {
    case 1: return 'single';
    case 2: return 'double';
    case 3: return 'triple';
    case 4: return 'quad';
    default: return 'single';
  }
}

export default {
  generateFile,
  generateFileForThread,
  generateThreadHTMLFile,
  generateMarkdownFile,
  generateJSONFile
};