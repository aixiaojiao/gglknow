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
import { TweetData, FileGenerationResult, ExtensionSettings } from '@/types';

/**
 * Generate file content based on tweet data and settings
 */
export async function generateFile(
  tweetData: TweetData, 
  settings: ExtensionSettings
): Promise<FileGenerationResult> {
  try {
    log('info', 'FileGenerator', `Generating ${settings.fileFormat} file`, {
      user: tweetData.userName,
      hasMedia: tweetData.media.images.length > 0 || tweetData.media.videos.length > 0
    });
    
    switch (settings.fileFormat) {
      case 'html':
        return generateHTMLFile(tweetData);
      case 'markdown':
        return generateMarkdownFile(tweetData);
      case 'json':
        return generateJSONFile(tweetData);
      default:
        throw new Error(`Unsupported file format: ${settings.fileFormat}`);
    }
  } catch (error) {
    log('error', 'FileGenerator', 'Failed to generate file', error);
    throw error;
  }
}

/**
 * Generate HTML file content from tweet data
 */
function generateHTMLFile(tweetData: TweetData): FileGenerationResult {
    const userAvatarPath = tweetData.userAvatar ? `media/avatar${getFileExtension(tweetData.userAvatar) || '.jpg'}` : '';
    const imagePaths = (tweetData.media?.images || []).map((img, index) => {
        const ext = getFileExtension(img) || '.jpg';
        return `media/image_${index + 1}${ext}`;
    });
    const videoPaths = (tweetData.media?.videos || []).map((vid, index) => {
        const ext = getFileExtension(vid) || '.mp4';
        return `media/video_${index + 1}${ext}`;
    });

    return {
        content: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>推文收藏 - ${tweetData.userName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 650px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #1da1f2 0%, #1991db 100%);
            color: white;
            padding: 20px 24px;
            text-align: center;
        }
        .header h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .header p {
            font-size: 14px;
            opacity: 0.9;
        }
        .tweet-content {
            padding: 24px;
        }
        .user-info {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid #eee;
        }
        .avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            margin-right: 12px;
            object-fit: cover;
            border: 2px solid #e1e8ed;
        }
        .avatar-placeholder {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            margin-right: 12px;
            background: linear-gradient(135deg, #1da1f2, #1991db);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 18px;
        }
        .user-details h2 {
            font-size: 16px;
            font-weight: 700;
            color: #14171a;
            margin-bottom: 2px;
        }
        .user-details p {
            font-size: 14px;
            color: #657786;
        }
        .tweet-text {
            font-size: 16px;
            line-height: 1.6;
            color: #14171a;
            margin-bottom: 16px;
            white-space: pre-wrap;
        }
        .tweet-media {
            margin-bottom: 16px;
        }
        .media-grid {
            display: grid;
            gap: 8px;
            border-radius: 12px;
            overflow: hidden;
        }
        .media-grid.single { grid-template-columns: 1fr; }
        .media-grid.double { grid-template-columns: 1fr 1fr; }
        .media-grid.triple { grid-template-columns: 2fr 1fr; }
        .media-grid.quad { grid-template-columns: 1fr 1fr; }
        .media-item {
            position: relative;
            overflow: hidden;
            border-radius: 8px;
        }
        .media-item img, .media-item video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .media-item.tall {
            grid-row: span 2;
        }
        .tweet-stats {
            display: flex;
            justify-content: space-around;
            padding: 16px 0;
            border-top: 1px solid #eee;
            margin-top: 16px;
        }
        .stat {
            text-align: center;
            color: #657786;
        }
        .stat-number {
            font-size: 18px;
            font-weight: 700;
            color: #14171a;
            display: block;
        }
        .stat-label {
            font-size: 12px;
            text-transform: uppercase;
            margin-top: 2px;
        }
        .tweet-meta {
            background: #f7f9fa;
            padding: 16px 24px;
            border-top: 1px solid #eee;
            font-size: 12px;
            color: #657786;
        }
        .meta-item {
            margin-bottom: 4px;
        }
        .meta-item:last-child {
            margin-bottom: 0;
        }
        .meta-label {
            font-weight: 600;
            margin-right: 8px;
        }
        .view-original-btn {
            display: inline-block;
            margin-top: 12px;
            padding: 8px 16px;
            background-color: #1da1f2;
            color: white;
            text-decoration: none;
            border-radius: 9999px;
            font-size: 14px;
            font-weight: bold;
            transition: background-color 0.2s;
        }
        .view-original-btn:hover {
            background-color: #1991db;
        }
        @media (max-width: 480px) {
            .container {
                margin: 10px;
                border-radius: 12px;
            }
            .tweet-content {
                padding: 16px;
            }
            .header {
                padding: 16px;
            }
            .media-grid.double,
            .media-grid.triple,
            .media-grid.quad {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>推文收藏</h1>
            <p>由 GglKnow 扩展保存</p>
        </div>
        
        <div class="tweet-content">
            <div class="user-info">
                ${userAvatarPath ? `<img src="${userAvatarPath}" alt="用户头像" class="avatar">` : `<div class="avatar-placeholder">${tweetData.userName.charAt(0).toUpperCase()}</div>`}
                <div class="user-details">
                    <h2>${tweetData.userName}</h2>
                    <p>@${tweetData.userHandle}</p>
                </div>
            </div>
            
            ${tweetData.text ? `<div class="tweet-text">${tweetData.text}</div>` : ''}
            
            ${imagePaths.length > 0 || videoPaths.length > 0 ? `
            <div class="tweet-media">
                <div class="media-grid ${getMediaGridClass(imagePaths.length + videoPaths.length)}">
                    ${imagePaths.map(path => `
                        <div class="media-item">
                            <img src="${path}" alt="推文图片" loading="lazy">
                        </div>
                    `).join('')}
                    ${videoPaths.map(path => `
                        <div class="media-item">
                            <video src="${path}" controls muted loop playsinline poster=""></video>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <div class="tweet-stats">
                <div class="stat">
                    <span class="stat-number">${tweetData.stats.replies}</span>
                    <span class="stat-label">Replies</span>
                </div>
                <div class="stat">
                    <span class="stat-number">${tweetData.stats.retweets}</span>
                    <span class="stat-label">Retweets</span>
                </div>
                <div class="stat">
                    <span class="stat-number">${tweetData.stats.likes}</span>
                    <span class="stat-label">Likes</span>
                </div>
            </div>
            
            <div class="tweet-meta">
                <div class="meta-item">
                    <span class="meta-label">发布时间:</span>
                    <span>${formatTimestamp(tweetData.timestamp)}</span>
                </div>
                ${tweetData.tweetUrl ? `<a href="${tweetData.tweetUrl}" target="_blank" rel="noopener noreferrer" class="view-original-btn">查看原文</a>` : ''}
            </div>
        </div>
    </div>
</body>
</html>`,
        filename: generateTweetFilename(tweetData),
        extension: '.html'
    };
}

/**
 * Generate Markdown file content from tweet data
 */
function generateMarkdownFile(tweetData: TweetData): FileGenerationResult {
    let content = `# 推文收藏\n\n`;

    content += `**${tweetData.userName}** (@${tweetData.userHandle})\n`;
    content += `*${formatTimestamp(tweetData.timestamp)}*\n\n`;

    if (tweetData.text) {
        content += `${tweetData.text}\n\n`;
    }

    if (tweetData.media.images.length > 0) {
        content += '### 图片\n';
        tweetData.media.images.forEach((_, i) => {
            const extension = getFileExtension(tweetData.media.images[i]) || '.jpg';
            content += `![图片 ${i + 1}](./media/image_${i + 1}${extension})\n\n`;
        });
    }
  
  if (tweetData.media.videos.length > 0) {
    content += `## 视频\n\n`;
    tweetData.media.videos.forEach((_, i) => {
      const extension = getFileExtension(tweetData.media.videos[i]) || '.mp4';
      content += `[视频 ${i + 1}](./media/video_${i + 1}${extension})\n\n`;
    });
  }
  
  // Stats
  content += `## 互动数据\n\n`;
  content += `- 回复: ${tweetData.stats.replies}\n`;
  content += `- 转推: ${tweetData.stats.retweets}\n`;
  content += `- 喜欢: ${tweetData.stats.likes}\n\n`;
  
  // Meta
  content += `## 元数据\n\n`;
  content += `- 保存时间: ${formatTimestamp(tweetData.timestamp)}\n`;
  if (tweetData.tweetTime) {
    content += `- 发布时间: ${formatTimestamp(tweetData.tweetTime)}\n`;
  }
  if (tweetData.tweetUrl) {
    content += `- 原始链接: ${tweetData.tweetUrl}\n`;
  }
  content += `- 页面链接: ${tweetData.url}\n`;
  
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
  generateHTMLFile,
  generateMarkdownFile,
  generateJSONFile
}; 