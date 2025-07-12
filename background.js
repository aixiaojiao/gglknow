// Twitter推文收藏器 - 后台脚本
class TwitterCollectorBackground {
  constructor() {
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'collectTweet') {
        this.handleCollectTweet(request.tweetData)
          .then(result => {
            try {
              sendResponse(result);
            } catch (error) {
              console.warn('无法发送响应，可能是上下文已失效:', error);
            }
          })
          .catch(error => {
            console.error('处理收藏请求时出错:', error);
            try {
              sendResponse({ success: false, error: error.message });
            } catch (sendError) {
              console.warn('无法发送错误响应，可能是上下文已失效:', sendError);
            }
          });
        return true; // 保持消息通道开放
      }
    });
  }

  async handleCollectTweet(tweetData) {
    try {
      console.log('开始处理推文收藏:', tweetData);
      
      // 获取用户设置的保存路径
      const settings = await this.getSettings();
      console.log('获取到设置:', settings);
      
      if (!settings.savePath || settings.savePath.trim() === '') {
        throw new Error('收藏失败：请先设置保存路径。点击插件图标 → 设置保存路径 → 保存设置');
      }

      // 验证推文数据
      if (!tweetData.userName && !tweetData.userHandle) {
        throw new Error('无法提取推文用户信息，请刷新页面后重试');
      }

      if (!tweetData.text) {
        console.warn('推文内容为空，继续处理...');
        tweetData.text = '[无文字内容]';
      }

      // 生成文件名
      const fileName = this.generateFileName(tweetData);
      console.log('生成文件名:', fileName);
      
      // 创建推文内容
      const content = await this.createTweetContent(tweetData);
      console.log('生成内容长度:', content.length);
      
      // 下载推文文件
      await this.downloadTweetFile(fileName, content, settings.savePath);
      console.log('推文文件下载成功');
      
      // 如果启用了媒体下载
      if (settings.downloadMedia) {
        // 准备媒体文件列表，包括头像
        const mediaToDownload = {
          images: tweetData.media?.images || [],
          videos: tweetData.media?.videos || [],
          avatar: tweetData.userAvatar || null
        };
        
        if (mediaToDownload.images.length > 0 || mediaToDownload.videos.length > 0 || mediaToDownload.avatar) {
          console.log('开始下载媒体文件...');
          try {
            // 注意这里传递的是fileName，作为子目录的基础名称
            await this.downloadMediaFiles(mediaToDownload, settings.savePath, fileName);
            console.log('媒体文件下载完成');
          } catch (mediaError) {
            console.warn('媒体文件下载失败，但推文已保存:', mediaError.message);
          }
        }
      }

      console.log('推文收藏成功完成');
      return { success: true, message: '推文收藏成功' };
    } catch (error) {
      console.error('收藏推文失败:', error);
      
      // 根据错误类型提供更具体的错误信息
      let errorMessage = error.message;
      
      if (error.message.includes('savePath')) {
        errorMessage = '请先设置保存路径：点击插件图标进行设置';
      } else if (error.message.includes('INVALID_FILENAME') || error.message.includes('filename')) {
        errorMessage = '文件名无效，请检查保存路径设置';
      } else if (error.message.includes('DOWNLOAD_CANCELED')) {
        errorMessage = '下载被取消，请重试';
      } else if (error.message.includes('NETWORK_FAILED')) {
        errorMessage = '网络错误，请检查网络连接';
      }
      
      return { success: false, error: errorMessage };
    }
  }

  async getSettings() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(['savePath', 'fileFormat', 'downloadMedia'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('获取设置失败:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          const settings = {
            savePath: result.savePath || 'Downloads/Twitter',
            fileFormat: result.fileFormat || 'html',
            downloadMedia: result.downloadMedia !== false
          };
          console.log('获取到的设置:', settings);
          resolve(settings);
        }
      });
    });
  }

  generateFileName(tweetData) {
    const timestamp = new Date(tweetData.timestamp).toISOString().replace(/[:.]/g, '-');
    let userHandle = tweetData.userHandle || tweetData.userName || 'unknown_user';
    
    // 清理用户名，移除@符号和特殊字符
    userHandle = userHandle.replace('@', '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    
    // 如果用户名为空或只有下划线，使用默认名称
    if (!userHandle || userHandle.replace(/_/g, '') === '') {
      userHandle = 'unknown_user';
    }
    
    return `tweet_${userHandle}_${timestamp}`;
  }

  async createTweetContent(tweetData) {
    const settings = await this.getSettings();
    
    if (settings.fileFormat === 'html') {
      return this.createHTMLContent(tweetData);
    } else if (settings.fileFormat === 'markdown') {
      return this.createMarkdownContent(tweetData);
    } else {
      return JSON.stringify(tweetData, null, 2);
    }
  }

  createHTMLContent(tweetData) {
    let avatarPath = '';
    // 如果有头像，生成相对于HTML文件的本地路径
    if (tweetData.userAvatar) {
        const extension = this.getFileExtension(tweetData.userAvatar) || '.jpg';
        avatarPath = `./media/avatar${extension}`;
    }

    // 为媒体图片生成相对路径
    const mediaPaths = (tweetData.media?.images || []).map((imgUrl, i) => {
        const extension = this.getFileExtension(imgUrl) || '.jpg';
        return `./media/image_${i + 1}${extension}`;
    });

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>推文收藏 - ${this.escapeHtml(tweetData.userName)}</title>
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
            opacity: 0.9;
            font-size: 14px;
        }
        .tweet-content {
            padding: 24px;
        }
        .user-info {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 12px;
        }
        .user-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            margin-right: 12px;
            background: #e1e8ed;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            font-weight: bold;
            color: #1da1f2;
            overflow: hidden;
        }
        .user-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .user-details h3 {
            font-size: 16px;
            font-weight: 700;
            color: #14171a;
            margin-bottom: 2px;
        }
        .user-handle {
            color: #657786;
            font-size: 14px;
        }
        .tweet-text {
            font-size: 18px;
            line-height: 1.6;
            color: #14171a;
            margin-bottom: 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .media-container {
            margin: 20px 0;
        }
        .media-container h4 {
            color: #14171a;
            margin-bottom: 12px;
            font-size: 16px;
        }
        .media-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }
        .media-container img {
            width: 100%;
            height: auto;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            transition: transform 0.2s ease;
        }
        .media-container img:hover {
            transform: scale(1.02);
        }
        .tweet-meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin: 20px 0;
        }
        .meta-card {
            background: #f8f9fa;
            padding: 16px;
            border-radius: 12px;
            border-left: 4px solid #1da1f2;
        }
        .meta-card h4 {
            color: #14171a;
            font-size: 14px;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .meta-card p {
            color: #657786;
            font-size: 16px;
        }
        .tweet-stats {
            display: flex;
            justify-content: space-around;
            background: #f8f9fa;
            padding: 16px;
            border-radius: 12px;
            margin: 20px 0;
        }
        .stat-item {
            text-align: center;
        }
        .stat-number {
            font-size: 20px;
            font-weight: 700;
            color: #14171a;
            display: block;
        }
        .stat-label {
            font-size: 12px;
            color: #657786;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .action-buttons {
            display: flex;
            gap: 12px;
            margin: 20px 0;
        }
        .btn {
            flex: 1;
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            text-decoration: none;
            text-align: center;
            transition: all 0.2s ease;
            cursor: pointer;
        }
        .btn-primary {
            background: #1da1f2;
            color: white;
        }
        .btn-primary:hover {
            background: #1991db;
            transform: translateY(-2px);
        }
        .footer {
            padding-top: 20px;
            margin-top: 20px;
            border-top: 1px solid #e1e8ed;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: #657786;
        }
        .view-original-btn {
            color: #1da1f2;
            text-decoration: none;
            font-weight: bold;
        }
        .view-original-btn:hover {
            text-decoration: underline;
        }
        .timestamp {
            opacity: 0.9;
        }
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            .tweet-content {
                padding: 16px;
            }
            .tweet-text {
                font-size: 16px;
            }
            .tweet-stats {
                flex-direction: column;
                gap: 12px;
            }
            .action-buttons {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐦 推文收藏</h1>
            <p>Twitter推文收藏器</p>
        </div>
        
        <div class="tweet-content">
            <div class="user-info">
                <div class="user-avatar">
                    ${avatarPath
                        ? `<img src="${this.escapeHtml(avatarPath)}" alt="User Avatar">`
                        : `${this.escapeHtml(tweetData.userName || '?').charAt(0).toUpperCase()}`
                    }
                </div>
                <div class="user-details">
                    <h3>${this.escapeHtml(tweetData.userName || '未知用户')}</h3>
                    <div class="user-handle">@${this.escapeHtml(tweetData.userHandle || 'unknown')}</div>
                </div>
            </div>
            
            <p class="tweet-text">${this.escapeHtml(tweetData.text || '[无文字内容]')}</p>
            
            ${tweetData.media && tweetData.media.images && tweetData.media.images.length > 0 ? `
            <div class="media-container">
                <h4>📷 媒体文件</h4>
                <div class="media-grid">
                    ${mediaPaths.map(path => `<img src="${path}" alt="推文图片" loading="lazy">`).join('')}
                </div>
            </div>
            ` : ''}
            
            <div class="tweet-stats">
                <div class="stat-item">
                    <span class="stat-number">${tweetData.stats?.replies || '0'}</span>
                    <span class="stat-label">回复</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${tweetData.stats?.retweets || '0'}</span>
                    <span class="stat-label">转推</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${tweetData.stats?.likes || '0'}</span>
                    <span class="stat-label">点赞</span>
                </div>
            </div>
            
            <div class="tweet-meta">
                <div class="meta-card">
                    <h4>发布时间</h4>
                    <p>${new Date(tweetData.tweetTime || tweetData.timestamp).toLocaleString('zh-CN')}</p>
                </div>
                <div class="meta-card">
                    <h4>收藏时间</h4>
                    <p>${new Date(tweetData.timestamp).toLocaleString('zh-CN')}</p>
                </div>
            </div>
            
            <div class="footer">
                <a href="${tweetData.tweetUrl || '#'}" class="view-original-btn" target="_blank" rel="noopener noreferrer">
                    🔗 查看原始推文
                </a>
                <span class="timestamp">收藏于: ${new Date(tweetData.timestamp).toLocaleString('zh-CN')}</span>
            </div>
        </div>
        
        <div class="footer">
            <p>原始页面: <a href="${tweetData.url || '#'}" target="_blank">${tweetData.url || '未知页面'}</a></p>
            <p>由 Twitter推文收藏器 收藏 | ${new Date().getFullYear()}</p>
        </div>
    </div>
</body>
</html>`;
  }

  createMarkdownContent(tweetData) {
    const mediaSection = tweetData.media && tweetData.media.images && tweetData.media.images.length > 0 
      ? `\n\n## 媒体文件\n${tweetData.media.images.map(img => `![图片](${img})`).join('\n')}\n`
      : '';

    return `# 推文收藏

## 用户信息
- **用户名**: ${tweetData.userName || '未知用户'}
- **用户ID**: @${tweetData.userHandle || 'unknown'}

## 推文内容
${tweetData.text || '[无文字内容]'}

## 推文信息
- **发布时间**: ${new Date(tweetData.tweetTime || tweetData.timestamp).toLocaleString('zh-CN')}
- **推文链接**: [查看原推文](${tweetData.tweetUrl || '#'})
- **回复数**: ${tweetData.stats?.replies || '0'}
- **转推数**: ${tweetData.stats?.retweets || '0'}
- **点赞数**: ${tweetData.stats?.likes || '0'}

${mediaSection}

## 收藏信息
- **收藏时间**: ${new Date(tweetData.timestamp).toLocaleString('zh-CN')}
- **原始页面**: ${tweetData.url || '未知页面'}
- **收藏工具**: Twitter推文收藏器
`;
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async downloadTweetFile(fileName, content, savePath) {
    const settings = await this.getSettings();
    const extension = settings.fileFormat === 'html' ? '.html' : 
                     settings.fileFormat === 'markdown' ? '.md' : '.json';
    
    // 清理文件名和路径
    const cleanFileName = fileName.replace(/[<>:"|?*]/g, '_');
    const cleanPath = savePath.replace(/[<>:"|?*]/g, '_');
    // **核心改动**：将文件保存在以其文件名命名的子目录中
    const fullFileName = `${cleanPath}/${cleanFileName}/${cleanFileName}${extension}`;
    
    console.log('准备下载文件:', fullFileName);
    
    return new Promise((resolve, reject) => {
      const mimeType = settings.fileFormat === 'html' ? 'text/html' : 
                      settings.fileFormat === 'markdown' ? 'text/markdown' : 
                      'application/json';
      
      chrome.downloads.download({
        url: `data:${mimeType};charset=utf-8,` + encodeURIComponent(content),
        filename: fullFileName,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('下载失败:', chrome.runtime.lastError.message);
          reject(new Error(`下载失败: ${chrome.runtime.lastError.message}`));
        } else if (downloadId) {
          console.log('下载成功，ID:', downloadId);
          
          // 监听下载完成状态
          const onChanged = (delta) => {
            if (delta.id === downloadId && delta.state && delta.state.current === 'complete') {
              chrome.downloads.onChanged.removeListener(onChanged);
              resolve(downloadId);
            } else if (delta.id === downloadId && delta.state && delta.state.current === 'interrupted') {
              chrome.downloads.onChanged.removeListener(onChanged);
              reject(new Error('下载被中断'));
            }
          };
          
          chrome.downloads.onChanged.addListener(onChanged);
          
          // 设置超时，避免永久等待
          setTimeout(() => {
            chrome.downloads.onChanged.removeListener(onChanged);
            resolve(downloadId); // 即使没有收到完成事件，也认为成功
          }, 5000);
        } else {
          reject(new Error('下载ID无效'));
        }
      });
    });
  }

  async downloadMediaFiles(mediaData, savePath, baseFileName) {
    // **核心改动**：媒体文件保存在与HTML文件同级的media子目录中
    const mediaFolder = `${savePath}/${baseFileName}/media`;
    
    // 下载头像
    if (mediaData.avatar) {
        const extension = this.getFileExtension(mediaData.avatar) || '.jpg';
        const avatarFileName = `${mediaFolder}/avatar${extension}`;
        try {
            await this.downloadFile(mediaData.avatar, avatarFileName);
        } catch (error) {
            console.warn(`下载头像失败: ${error.message}`);
        }
    }

    // 下载图片
    if (mediaData.images && mediaData.images.length > 0) {
      for (let i = 0; i < mediaData.images.length; i++) {
        const imageUrl = mediaData.images[i];
        const extension = this.getFileExtension(imageUrl) || '.jpg';
        const imageFileName = `${mediaFolder}/image_${i + 1}${extension}`;
        try {
          await this.downloadFile(imageUrl, imageFileName);
        } catch (error) {
          console.warn(`下载图片 ${imageUrl} 失败: ${error.message}`);
        }
      }
    }

    // 下载视频
    if (mediaData.videos && mediaData.videos.length > 0) {
      for (let i = 0; i < mediaData.videos.length; i++) {
        const videoUrl = mediaData.videos[i];
        const extension = this.getFileExtension(videoUrl) || '.mp4';
        const videoFileName = `${mediaFolder}/video_${i + 1}${extension}`;
        try {
          await this.downloadFile(videoUrl, videoFileName);
        } catch (error) {
          console.warn(`下载视频 ${videoUrl} 失败: ${error.message}`);
        }
      }
    }
  }

  async downloadFile(url, filename) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (downloadId) {
                // 简单的成功/失败处理
                const listener = (delta) => {
                    if (delta.id === downloadId) {
                        if (delta.state && delta.state.current === 'complete') {
                            chrome.downloads.onChanged.removeListener(listener);
                            resolve(downloadId);
                        } else if (delta.state && delta.state.current === 'interrupted') {
                            chrome.downloads.onChanged.removeListener(listener);
                            reject(new Error('Download interrupted'));
                        }
                    }
                };
                chrome.downloads.onChanged.addListener(listener);
            } else {
                reject(new Error('Invalid download ID'));
            }
        });
    });
  }

  getFileExtension(url) {
    if (!url) return null;
    try {
        const pathname = new URL(url).pathname;
        const match = pathname.match(/\.([^.?]+)$/);
        return match ? '.' + match[1] : null;
    } catch(e) {
        return null;
    }
  }
}

// 启动后台服务
new TwitterCollectorBackground(); 