// Twitter推文收藏器 - 内容脚本
class TwitterCollector {
  constructor() {
    this.init();
  }

  init() {
    // 等待页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.startObserving());
    } else {
      this.startObserving();
    }
  }

  startObserving() {
    // 创建观察器来监听DOM变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.addCollectButtons(node);
            }
          });
        }
      });
    });

    // 开始观察
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 为现有推文添加按钮
    this.addCollectButtons(document.body);
  }

  addCollectButtons(container) {
    // 查找推文容器（适配新版Twitter/X的结构）
    const tweetSelectors = [
      'article[data-testid="tweet"]',
      '[data-testid="tweet"]',
      'div[data-testid="tweetText"]'
    ];

    tweetSelectors.forEach(selector => {
      const tweets = container.querySelectorAll ? container.querySelectorAll(selector) : [];
      tweets.forEach(tweet => {
        if (!tweet.querySelector('.twitter-collector-btn')) {
          this.addCollectButton(tweet);
        }
      });
    });
  }

  addCollectButton(tweetElement) {
    // 查找推文的操作栏
    const actionBar = tweetElement.querySelector('[role="group"]') || 
                     tweetElement.querySelector('div[data-testid="reply"]')?.parentElement ||
                     tweetElement.querySelector('[data-testid="like"]')?.parentElement?.parentElement;

    if (actionBar) {
      // 创建收藏按钮
      const collectBtn = document.createElement('div');
      collectBtn.className = 'twitter-collector-btn';
      collectBtn.innerHTML = `
        <div class="collect-button" title="收藏推文">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
          </svg>
          <span class="collect-text">收藏</span>
        </div>
      `;

      // 添加点击事件
      collectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.collectTweet(tweetElement, collectBtn);
      });

      // 插入到操作栏
      actionBar.appendChild(collectBtn);
    }
  }

  // 检查Chrome扩展API是否可用
  isChromeExtensionAvailable() {
    return typeof chrome !== 'undefined' && 
           chrome.runtime && 
           chrome.runtime.sendMessage && 
           !chrome.runtime.lastError;
  }

  async collectTweet(tweetElement, buttonElement) {
    try {
      // 检查Chrome扩展API是否可用
      if (!this.isChromeExtensionAvailable()) {
        throw new Error('扩展上下文不可用，请刷新页面重试');
      }

      // 显示加载状态
      const button = buttonElement.querySelector('.collect-button');
      const originalContent = button.innerHTML;
      button.innerHTML = `
        <svg class="loading-spinner" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="31.416" stroke-dashoffset="31.416">
            <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
            <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
          </circle>
        </svg>
        <span>收藏中...</span>
      `;

      // 提取推文数据
      const tweetData = this.extractTweetData(tweetElement);
      console.log('提取的推文数据:', tweetData);
      
      // 验证提取的数据
      if (!tweetData.userName && !tweetData.userHandle && !tweetData.text) {
        throw new Error('无法提取推文数据，请稍后重试');
      }
      
      // 使用Promise包装sendMessage以更好地处理错误
      const sendMessagePromise = new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({
            action: 'collectTweet',
            tweetData: tweetData
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        } catch (error) {
          reject(error);
        }
      });

      const response = await sendMessagePromise;
      console.log('后台脚本响应:', response);
      
      if (response && response.success) {
        // 显示成功状态
        button.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#1d9bf0">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
          </svg>
          <span style="color: #1d9bf0;">已收藏</span>
        `;
        
        // 2秒后恢复原状
        setTimeout(() => {
          button.innerHTML = originalContent;
        }, 2000);
      } else {
        // 显示错误状态
        const errorMsg = response?.error || '未知错误';
        console.error('收藏失败:', errorMsg);
        
        button.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#f91880">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          <span style="color: #f91880;" title="${errorMsg}">收藏失败</span>
        `;
        
        setTimeout(() => {
          button.innerHTML = originalContent;
        }, 3000);
      }

    } catch (error) {
      console.error('收藏推文时出错:', error);
      
      // 显示错误状态
      const button = buttonElement.querySelector('.collect-button');
      const originalContent = button.innerHTML;
      
      let errorMessage = '提取失败';
      if (error.message.includes('扩展上下文')) {
        errorMessage = '扩展失效';
      } else if (error.message.includes('sendMessage')) {
        errorMessage = '连接失败';
      }
      
      button.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="#f91880">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span style="color: #f91880;" title="${error.message}">${errorMessage}</span>
      `;
      
      setTimeout(() => {
        button.innerHTML = originalContent;
      }, 3000);
    }
  }

  extractTweetData(tweetElement) {
    const data = {
      timestamp: new Date().toISOString(),
      url: window.location.href
    };

    try {
      // 提取用户信息 - 使用多种选择器
      const userNameSelectors = [
        '[data-testid="User-Names"] a span',
        '[data-testid="User-Names"] span',
        '[data-testid="User-Name"] span',
        'div[dir="ltr"] span',
        'article span[dir="ltr"]'
      ];
      
      let userNameElement = null;
      for (const selector of userNameSelectors) {
        userNameElement = tweetElement.querySelector(selector);
        if (userNameElement && userNameElement.textContent.trim()) {
          break;
        }
      }
      data.userName = userNameElement ? userNameElement.textContent.trim() : '';

      // 提取用户handle
      const userHandleSelectors = [
        '[data-testid="User-Names"] a[href*="/"]',
        'a[href^="/"][role="link"]',
        'a[href*="twitter.com/"]',
        'a[href*="x.com/"]'
      ];
      
      let userHandleElement = null;
      for (const selector of userHandleSelectors) {
        userHandleElement = tweetElement.querySelector(selector);
        if (userHandleElement && userHandleElement.getAttribute('href')) {
          break;
        }
      }
      
      if (userHandleElement) {
        const href = userHandleElement.getAttribute('href');
        data.userHandle = href.replace(/^.*\//, '').replace('@', '');
      } else {
        data.userHandle = '';
      }

      // 提取推文文本 - 使用多种选择器
      const textSelectors = [
        '[data-testid="tweetText"]',
        'div[lang]',
        'div[dir="ltr"]',
        'span[lang]'
      ];
      
      let tweetTextElement = null;
      for (const selector of textSelectors) {
        const elements = tweetElement.querySelectorAll(selector);
        for (const element of elements) {
          if (element.textContent && element.textContent.trim().length > 0) {
            tweetTextElement = element;
            break;
          }
        }
        if (tweetTextElement) break;
      }
      
      data.text = tweetTextElement ? tweetTextElement.textContent.trim() : '';

      // 提取推文时间
      const timeElement = tweetElement.querySelector('time');
      data.tweetTime = timeElement ? timeElement.getAttribute('datetime') : '';

      // 提取媒体信息 - 更精确的图片选择器，排除头像和界面图标
      const imageSelectors = [
        'img[src*="pbs.twimg.com/media"]',  // Twitter媒体图片
        'img[src*="video_thumb"]',          // 视频缩略图
        'div[data-testid="tweetPhoto"] img', // 推文图片容器
        'div[data-testid="videoComponent"] img' // 视频组件图片
      ];
      
      const images = [];
      for (const selector of imageSelectors) {
        const foundImages = Array.from(tweetElement.querySelectorAll(selector));
        foundImages.forEach(img => {
          const src = img.src;
          // 过滤掉头像、表情符号和界面图标
          if (src && 
              !src.includes('profile_images') && 
              !src.includes('emoji') && 
              !src.includes('icon') && 
              !src.includes('avatar') &&
              !images.includes(src)) {
            images.push(src);
          }
        });
      }
      
      const videos = Array.from(tweetElement.querySelectorAll('video')).map(video => video.src).filter(src => src);
      
      data.media = {
        images: images,
        videos: videos
      };

      // 提取推文链接
      const tweetLinkSelectors = [
        'a[href*="/status/"]',
        'a[href*="/tweet/"]',
        'time'
      ];
      
      let tweetLink = null;
      for (const selector of tweetLinkSelectors) {
        const element = tweetElement.querySelector(selector);
        if (element) {
          if (element.tagName === 'TIME') {
            tweetLink = element.closest('a');
          } else {
            tweetLink = element;
          }
          if (tweetLink && tweetLink.getAttribute('href')) {
            break;
          }
        }
      }
      
      if (tweetLink) {
        const href = tweetLink.getAttribute('href');
        data.tweetUrl = href.startsWith('http') ? href : 'https://twitter.com' + href;
      } else {
        data.tweetUrl = '';
      }

      // 提取互动数据
      const replyElement = tweetElement.querySelector('[data-testid="reply"] span, [aria-label*="repl"] span');
      const retweetElement = tweetElement.querySelector('[data-testid="retweet"] span, [aria-label*="retweet"] span');
      const likeElement = tweetElement.querySelector('[data-testid="like"] span, [aria-label*="like"] span');

      data.stats = {
        replies: replyElement ? replyElement.textContent.trim() : '0',
        retweets: retweetElement ? retweetElement.textContent.trim() : '0',
        likes: likeElement ? likeElement.textContent.trim() : '0'
      };

      // 如果没有提取到用户名，尝试从URL中获取
      if (!data.userName && !data.userHandle) {
        const urlMatch = window.location.href.match(/(?:twitter\.com|x\.com)\/([^\/]+)/);
        if (urlMatch) {
          data.userHandle = urlMatch[1];
          data.userName = urlMatch[1];
        }
      }

      // 最后的数据验证
      console.log('最终提取的数据:', {
        userName: data.userName,
        userHandle: data.userHandle,
        text: data.text ? data.text.substring(0, 100) + '...' : '(空)',
        images: data.media.images,
        imageCount: data.media.images.length,
        videoCount: data.media.videos.length,
        hasMedia: data.media.images.length > 0 || data.media.videos.length > 0
      });

    } catch (error) {
      console.error('提取推文数据时出错:', error);
    }

    return data;
  }
}

// 启动收藏器
new TwitterCollector(); 