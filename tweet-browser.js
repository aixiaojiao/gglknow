class TweetBrowser {
    constructor() {
        this.tweets = [];
        this.filteredTweets = [];
        this.fileMap = new Map();
        this.objectUrls = [];
        this.filters = {
            searchQuery: '',
            author: 'all-authors',
            content: 'all-content', // 'all-content', 'images'
            time: 'all-time',      // 'all-time', 'today', 'week', 'month'
            tag: 'all-tags',       // 'all-tags' or specific tag
            collection: 'all-collections' // 'all-collections' or specific collection
        };
        this.uiLocale = 'default';
        this.init();
    }

    init() {
        if (typeof chrome !== 'undefined' && chrome.i18n) {
            this.uiLocale = chrome.i18n.getUILanguage();
            this.localizePage();
        }
        this.bindEvents();
        this.showEmptyState();
    }

    localizePage() {
      // Set the language of the document
      document.documentElement.lang = this.uiLocale;

      // Localize elements with data-i18n attribute for text content
      document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.dataset.i18n;
        if (key) {
          const translatedText = chrome.i18n.getMessage(key);
          if (translatedText) {
            if (element.tagName === 'P' && key === 'tweetBrowserEmptyStateDescription') {
              element.innerHTML = translatedText; // Allow <br> tag
            } else {
              element.textContent = translatedText;
            }
          }
        }
      });

      // Localize elements with data-i18n-placeholder for placeholder attribute
      document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.dataset.i18nPlaceholder;
        if (key) {
          const translatedText = chrome.i18n.getMessage(key);
          if (translatedText) {
            element.placeholder = translatedText;
          }
        }
      });
    }

    bindEvents() {
        const fileInput = document.getElementById('fileInput');
        
        // 在文件选择前清空，确保选择相同文件也能触发change事件
        fileInput.addEventListener('click', (e) => {
            e.target.value = null;
        });

        fileInput.addEventListener('change', (e) => {
            this.loadFiles(e.target.files);
        });

        // 重新加载图片按钮事件
        document.getElementById('reloadMediaBtn').addEventListener('click', (e) => {
            this.triggerFileSelection();
        });

        document.getElementById('authorFilter').addEventListener('change', (e) => {
            this.filters.author = e.target.value;
            this.applyFilters();
        });

        document.getElementById('searchBox').addEventListener('input', (e) => {
            this.filters.searchQuery = e.target.value.toLowerCase();
            this.applyFilters();
        });

        document.getElementById('content-filters').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                this.filters.content = e.target.dataset.filter;
                document.querySelectorAll('#content-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                this.applyFilters();
            }
        });

        document.getElementById('time-filters').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                this.filters.time = e.target.dataset.filter;
                document.querySelectorAll('#time-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                this.applyFilters();
            }
        });

        // Tag filter
        document.getElementById('tagFilter').addEventListener('change', (e) => {
            this.filters.tag = e.target.value;
            this.applyFilters();
        });

        // Collection filter
        document.getElementById('collectionFilter').addEventListener('change', (e) => {
            this.filters.collection = e.target.value;
            this.applyFilters();
        });

        // Export/Import metadata
        document.getElementById('exportMetadata').addEventListener('click', () => {
            this.exportMetadata();
        });

        document.getElementById('importMetadata').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        document.getElementById('importFile').addEventListener('change', (e) => {
            this.importMetadata(e.target.files[0]);
        });
    }

    showNotification(message) {
        const notificationArea = document.getElementById('notification-area');
        notificationArea.textContent = message;
        notificationArea.style.opacity = '1';

        setTimeout(() => {
            notificationArea.style.opacity = '0';
        }, 5000); // 5秒后自动消失
    }

    async loadFiles(files) {
        if (!files.length) return;

        // 获取当前选择的文件夹名称
        const firstFile = files[0];
        const currentFolderName = firstFile.webkitRelativePath ? 
            firstFile.webkitRelativePath.split('/')[0] : '选择的文件';

        // 检查是否需要重新加载媒体文件
        if (this.needsMediaReload && this.tweets.length > 0) {
            const isSameFolder = currentFolderName === this.lastFolderName;
            
            if (isSameFolder) {
                // 相同文件夹，自动重新加载图片
                await this.reloadMediaForTweets(files);
                this.needsMediaReload = false;
                return;
            } else {
                // 不同文件夹，询问用户是否要替换数据
                const shouldReplace = confirm(
                    `检测到新的文件夹 "${currentFolderName}"，与之前的文件夹 "${this.lastFolderName}" 不同。\n\n` +
                    `是否要替换现有数据？\n` +
                    `- 点击"确定"：清除现有数据并加载新文件夹\n` +
                    `- 点击"取消"：保持现有数据并为其加载图片`
                );
                
                if (!shouldReplace) {
                    // 用户选择保持现有数据，为现有数据加载图片
                    await this.reloadMediaForTweets(files);
                    this.needsMediaReload = false;
                    return;
                }
                // 用户选择替换，继续执行下面的正常加载流程
                this.needsMediaReload = false;
            }
        }

        try {
            this.showLoading();
            this.clearPreviousData();

            this.fileMap = new Map(Array.from(files).map(file => [file.webkitRelativePath, file]));
            this.lastFolderName = currentFolderName;
            
            const htmlFiles = Array.from(files).filter(file => file.name.endsWith('.html'));
            let loadedCount = 0;

            for (const file of htmlFiles) {
                try {
                    const content = await this.readFile(file);
                    const parsedData = this.parseHTMLFile(content, file.webkitRelativePath);
                    if (parsedData) {
                        const tweet = await this.resolveMediaPaths(parsedData);
                        tweet.id = `tweet-${this.tweets.length}-${Date.now()}`;
                        this.tweets.push(tweet);
                        loadedCount++;
                    }
                } catch (error) {
                    console.error(`处理文件 ${file.name} 失败:`, error);
                }
            }

            this.tweets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            this.updateStats();
            this.applyFilters();
            this.updateReloadMediaButtonVisibility();

            const notifyText = this.getI18nMessage('notifyLoadedTweets') || `Loaded ${loadedCount} tweets`;
            this.showNotification(notifyText.replace('%s', loadedCount.toString()));

        } catch (fatalError) {
            console.error('加载文件时发生严重错误:', fatalError);
            const errorText = this.getI18nMessage('notifyLoadError') || 'Failed to load tweets';
            this.showNotification(errorText);
        }
    }

    clearPreviousData() {
        this.tweets = [];
        this.filteredTweets = [];
        this.fileMap.clear();
        this.objectUrls.forEach(url => URL.revokeObjectURL(url));
        this.objectUrls = [];
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    parseFile(content, filename) {
        try {
            if (filename.endsWith('.json')) {
                const data = JSON.parse(content);
                // 确保时间戳存在且有效
                if (!data.timestamp && data.tweetTime) {
                    data.timestamp = data.tweetTime;
                }
                return data;
            } else if (filename.endsWith('.html')) {
                return this.parseHTMLFile(content, filename);
            }
        } catch (error) {
            console.error('解析文件失败:', filename, error);
        }
        return null;
    }

    parseHTMLFile(html, filePath) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 检测是否是推文串（包含多个 tweet-card 块）
        const tweetCards = Array.from(doc.querySelectorAll('.tweet-card'));
        const isThread = tweetCards.length > 1;
        
        const getRelativePath = (src, basePath) => {
            if (!src || !basePath) return '';
            
            // 规范化路径，移除"./"
            const cleanedSrc = src.startsWith('./') ? src.substring(2) : src;
            
            // 获取HTML文件所在的目录
            const baseDir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/')) : '';
            
            // 组合成完整路径
            // 如果baseDir为空（HTML在根目录），则直接返回清理后的src
            return baseDir ? `${baseDir}/${cleanedSrc}` : cleanedSrc;
        };

        if (isThread) {
            // 处理推文串：解析所有推文并合并
            const threadTweets = tweetCards.map(card => {
                const userNameEl = card.querySelector('.user-details h2');
                const userHandleEl = card.querySelector('.user-details p');
                const tweetTextEl = card.querySelector('.tweet-text');
                // 尝试多种图片选择器，但排除头像
                let imageEls = Array.from(card.querySelectorAll('.media-item img, .media-item video'));
                if (imageEls.length === 0) {
                    // 尝试其他可能的选择器，但排除头像和用户相关图片
                    imageEls = Array.from(card.querySelectorAll('img[src*=".jpg"], img[src*=".jpeg"], img[src*=".png"], img[src*=".gif"], img[src*=".webp"], video'))
                        .filter(img => {
                            const src = img.getAttribute('src') || '';
                            const className = img.className || '';
                            // 排除头像相关的图片
                            return !className.includes('avatar') && 
                                   !src.includes('avatar') && 
                                   !img.closest('.user-details') &&
                                   !img.closest('.avatar');
                        });
                }
                console.log(`Found ${imageEls.length} media elements in thread card`);
                const tweetUrlEl = card.querySelector('.view-original-btn');
                const avatarImgEl = card.querySelector('.avatar');
                
                let timestamp = new Date().toISOString();
                const timeEl = card.querySelector('.meta-item span:last-child');
                if (timeEl) {
                    const timeText = timeEl.textContent.trim();
                    const date = new Date(timeText);
                    if (!isNaN(date)) timestamp = date.toISOString();
                }

                const getStat = (label) => {
                    const statElements = Array.from(card.querySelectorAll('.stat'));
                    const targetStat = statElements.find(el => el.querySelector('.stat-label')?.textContent.trim() === label);
                    return targetStat?.querySelector('.stat-number')?.textContent.trim() || '0';
                }

                return {
                    userName: userNameEl ? userNameEl.textContent.trim() : chrome.i18n.getMessage('unknownUser'),
                    userHandle: userHandleEl ? userHandleEl.textContent.replace('@', '').trim() : '',
                    text: tweetTextEl ? tweetTextEl.innerHTML.trim() : '',
                    timestamp: timestamp,
                    userAvatarUrl: avatarImgEl ? getRelativePath(avatarImgEl.getAttribute('src'), filePath) : '',
                    media: { 
                        images: imageEls.filter(el => el.tagName === 'IMG').map(img => getRelativePath(img.getAttribute('src'), filePath)), 
                        videos: imageEls.filter(el => el.tagName === 'VIDEO').map(vid => getRelativePath(vid.getAttribute('src'), filePath)), 
                    },
                    stats: { 
                        replies: getStat('Replies'),
                        retweets: getStat('Retweets'),
                        likes: getStat('Likes')
                    },
                    tweetUrl: tweetUrlEl ? tweetUrlEl.href : '',
                };
            });

            // 使用第一条推文的信息作为主要信息，但合并所有推文内容
            const mainTweet = threadTweets[0];
            const allImages = [];
            const allTexts = [];
            
            threadTweets.forEach(tweet => {
                if (tweet.text) allTexts.push(tweet.text);
                if (tweet.media?.images) allImages.push(...tweet.media.images);
            });

            return {
                ...mainTweet,
                text: allTexts.join('<br><br>'),
                media: {
                    images: allImages,
                    videos: []
                },
                isThread: true,
                threadTweets: threadTweets,
                url: ''
            };
        } else {
            // 处理单个推文
            const userNameEl = doc.querySelector('.user-details h2');
            const userHandleEl = doc.querySelector('.user-details p');
            const tweetTextEl = doc.querySelector('.tweet-text');
            // 尝试多种图片选择器，但排除头像
            let imageEls = Array.from(doc.querySelectorAll('.media-item img, .media-item video'));
            if (imageEls.length === 0) {
                // 尝试其他可能的选择器，但排除头像和用户相关图片
                imageEls = Array.from(doc.querySelectorAll('img[src*=".jpg"], img[src*=".jpeg"], img[src*=".png"], img[src*=".gif"], img[src*=".webp"], video'))
                    .filter(img => {
                        const src = img.getAttribute('src') || '';
                        const className = img.className || '';
                        // 排除头像相关的图片
                        return !className.includes('avatar') && 
                               !src.includes('avatar') && 
                               !img.closest('.user-details') &&
                               !img.closest('.avatar');
                    });
            }
            console.log(`Found ${imageEls.length} media elements in single tweet`);
            if (imageEls.length > 0) {
                console.log('Image sources:', imageEls.map(img => img.getAttribute('src')));
            }
            const tweetUrlEl = doc.querySelector('.view-original-btn');
            const avatarImgEl = doc.querySelector('.avatar');

            let timestamp = new Date().toISOString();
            const timeEl = doc.querySelector('.meta-item span:last-child');
            if (timeEl) {
                const timeText = timeEl.textContent.trim();
                const date = new Date(timeText);
                if (!isNaN(date)) timestamp = date.toISOString();
            }

            const getStat = (label) => {
                const statElements = Array.from(doc.querySelectorAll('.stat'));
                const targetStat = statElements.find(el => el.querySelector('.stat-label')?.textContent.trim() === label);
                return targetStat?.querySelector('.stat-number')?.textContent.trim() || '0';
            }

            return {
                userName: userNameEl ? userNameEl.textContent.trim() : chrome.i18n.getMessage('unknownUser'),
                userHandle: userHandleEl ? userHandleEl.textContent.replace('@', '').trim() : '',
                text: tweetTextEl ? tweetTextEl.innerHTML.trim() : '',
                timestamp: timestamp,
                userAvatarUrl: avatarImgEl ? getRelativePath(avatarImgEl.getAttribute('src'), filePath) : '',
                media: { 
                    images: imageEls.filter(el => el.tagName === 'IMG').map(img => getRelativePath(img.getAttribute('src'), filePath)), 
                    videos: imageEls.filter(el => el.tagName === 'VIDEO').map(vid => getRelativePath(vid.getAttribute('src'), filePath)), 
                },
                stats: { 
                    replies: getStat('Replies'),
                    retweets: getStat('Retweets'),
                    likes: getStat('Likes')
                },
                tweetUrl: tweetUrlEl ? tweetUrlEl.href : '',
                isThread: false,
                url: ''
            };
        }
    }
    
    async resolveMediaPaths(tweetData) {
        const resolvedTweet = { ...tweetData };
        resolvedTweet.displayAvatarUrl = '';
        resolvedTweet.displayImageUrls = [];

        const findFile = (path) => {
            if (!path) return null;
            
            // 规范化路径，统一使用正斜杠
            const normalizedPath = path.replace(/\\/g, '/');
            
            // 尝试多种路径匹配策略
            const attempts = [
                normalizedPath,                                    // 原始路径
                normalizedPath.replace(/^\.\//, ''),              // 移除 ./
                normalizedPath.split('/').slice(1).join('/'),     // 移除第一个目录
                normalizedPath.split('/').slice(2).join('/'),     // 移除前两个目录
                normalizedPath.split('/').pop(),                  // 仅文件名
            ];
            
            // 同时尝试不同的文件扩展名
            const extensions = ['', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
            
            for (const attempt of attempts) {
                if (!attempt) continue;
                
                // 尝试不同扩展名
                for (const ext of extensions) {
                    const testPath = attempt + ext;
                    
                    // 在 fileMap 中查找
                    for (const [key, file] of this.fileMap.entries()) {
                        const normalizedKey = key.replace(/\\/g, '/');
                        
                        // 精确匹配
                        if (normalizedKey === testPath) return file;
                        
                        // 文件名匹配（忽略路径）
                        if (normalizedKey.endsWith('/' + testPath) || normalizedKey === testPath) return file;
                        
                        // 路径结尾匹配
                        if (testPath.length > 3 && normalizedKey.endsWith(testPath)) return file;
                    }
                }
            }
            
            return null;
        };
        
        // 解析头像
        if (tweetData.userAvatarUrl) {
            const file = findFile(tweetData.userAvatarUrl);
            if (file) {
                const url = URL.createObjectURL(file);
                resolvedTweet.displayAvatarUrl = url;
                this.objectUrls.push(url);
            }
        }

        // 解析媒体图片
        if (tweetData.media?.images?.length > 0) {
            for (const imagePath of tweetData.media.images) {
                const file = findFile(imagePath);
                if (file) {
                    const url = URL.createObjectURL(file);
                    resolvedTweet.displayImageUrls.push(url);
                    this.objectUrls.push(url);
                } else {
                    console.warn(`Image not found: ${imagePath}`);
                    console.warn('Available files:', Array.from(this.fileMap.keys()).filter(k => /\.(jpg|jpeg|png|gif|webp)$/i.test(k)));
                }
            }
        }
        
        return resolvedTweet;
    }

    updateStats() {
        const totalTweets = this.tweets.length;
        const totalUsers = new Set(this.tweets.map(t => t.userHandle)).size;
        const totalImages = this.tweets.reduce((sum, t) => sum + (t.media?.images?.length || 0), 0);
        
        let dateRange = '-';
        if (totalTweets > 0) {
            const dates = this.tweets.map(t => new Date(t.timestamp)).sort((a, b) => a - b);
            const oldest = dates[0];
            const newest = dates[dates.length - 1];
            
            if (oldest.getTime() === newest.getTime()) {
                dateRange = oldest.toLocaleDateString(this.uiLocale);
            } else {
                dateRange = `${oldest.toLocaleDateString(this.uiLocale)} - ${newest.toLocaleDateString(this.uiLocale)}`;
            }
        }

        document.getElementById('totalTweets').textContent = totalTweets;
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('totalImages').textContent = totalImages;
        document.getElementById('dateRange').textContent = dateRange;
    }

    applyFilters() {
        // Step 1: 在所有过滤操作之前，更新作者列表UI
        this.updateAuthorFilter();
        
        let result = [...this.tweets];

        // Step 2: 应用所有筛选条件
        // 作者过滤
        if (this.filters.author !== 'all-authors') {
            result = result.filter(tweet => tweet.userHandle === this.filters.author);
        }
        // 搜索查询过滤
        if (this.filters.searchQuery) {
            result = result.filter(tweet => {
                const query = this.filters.searchQuery;
                return (tweet.text && tweet.text.toLowerCase().includes(query)) ||
                       (tweet.userName && tweet.userName.toLowerCase().includes(query)) ||
                       (tweet.userHandle && tweet.userHandle.toLowerCase().includes(query));
            });
        }
        // 内容过滤
        if (this.filters.content === 'images') {
            result = result.filter(tweet => tweet.media && tweet.media.images && tweet.media.images.length > 0);
        }
        // 时间过滤
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        switch (this.filters.time) {
            case 'today':
                result = result.filter(tweet => new Date(tweet.timestamp) >= today);
                break;
            case 'week':
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)); // 本周一
                result = result.filter(tweet => new Date(tweet.timestamp) >= startOfWeek);
                break;
            case 'month':
                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                result = result.filter(tweet => new Date(tweet.timestamp) >= startOfMonth);
                break;
        }

        // Tag filtering
        if (this.filters.tag !== 'all-tags') {
            result = result.filter(tweet => {
                try {
                    const metadata = this.getMetadataManager();
                    if (!metadata || typeof metadata.getTweetMetadata !== 'function') return false;
                    const tweetMetadata = metadata.getTweetMetadata(tweet.id);
                    return tweetMetadata && tweetMetadata.tags && tweetMetadata.tags.includes(this.filters.tag);
                } catch (error) {
                    console.warn('Tag filtering error:', error);
                    return false;
                }
            });
        }

        // Collection filtering
        if (this.filters.collection !== 'all-collections') {
            result = result.filter(tweet => {
                try {
                    const metadata = this.getMetadataManager();
                    if (!metadata || typeof metadata.getTweetMetadata !== 'function') return false;
                    const tweetMetadata = metadata.getTweetMetadata(tweet.id);
                    return tweetMetadata && tweetMetadata.collection === this.filters.collection;
                } catch (error) {
                    console.warn('Collection filtering error:', error);
                    return false;
                }
            });
        }

        // Step 3: 更新过滤器选项并渲染
        this.updateTagFilter();
        this.updateCollectionFilter();
        this.filteredTweets = result;
        this.renderTweets();
    }

    renderTweets() {
        const container = document.getElementById('tweetsContainer');
        container.innerHTML = ''; // 清空容器

        if (this.filteredTweets.length === 0) {
            const emptyTitle = this.getI18nMessage('emptyStateNoMatchesTitle') || 'No matches found';
            const emptyDesc = this.getI18nMessage('emptyStateNoMatchesDescription') || 'Try adjusting your filters';
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${emptyTitle}</h3>
                    <p>${emptyDesc}</p>
                </div>
            `;
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'tweets-grid';

        this.filteredTweets.forEach((tweet, index) => {
            const card = document.createElement('div');
            card.className = 'tweet-card';
            card.dataset.tweetIndex = index;
            card.dataset.tweetId = tweet.id;

            const userName = tweet.userName || this.getI18nMessage('unknownUser') || 'Unknown User';
            const userHandle = tweet.userHandle || 'unknown';
            const text = tweet.text || '';
            const timestamp = tweet.timestamp ? new Date(tweet.timestamp).toLocaleDateString(this.uiLocale) : (this.getI18nMessage('unknownDate') || 'Unknown Date');
            const likes = tweet.stats?.likes || '0';
            const retweets = tweet.stats?.retweets || '0';

            const avatarHtml = tweet.displayAvatarUrl
                ? `<img src="${tweet.displayAvatarUrl}" alt="${userName}'s avatar">`
                : `<span>${userName.charAt(0).toUpperCase()}</span>`;

            card.innerHTML = `
                <button class="delete-btn" data-tweet-id="${tweet.id}">&times;</button>
                <div class="tweet-user">
                    <div class="user-avatar">
                        ${avatarHtml}
                    </div>
                    <div class="user-info">
                        <h4>${this.escapeHtml(userName)}</h4>
                        <span class="user-handle">@${this.escapeHtml(userHandle)}</span>
                        ${tweet.isThread ? `<span style="background: #1da1f2; color: white; padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: bold; margin-top: 2px; display: inline-block;">🧵 推文串 (${tweet.threadTweets?.length || 0}条)</span>` : ''}
                    </div>
                </div>
                <p class="tweet-text">${text}</p>
                <div class="tweet-footer">
                    <span>❤️ ${likes}</span>
                    <span>🔁 ${retweets}</span>
                    <span class="tweet-timestamp">${timestamp}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                showTweetDetail(index);
            });

            const deleteButton = card.querySelector('.delete-btn');
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTweet(tweet.id);
            });

            grid.appendChild(card);
        });

        container.appendChild(grid);
    }

    showLoading() {
        const container = document.getElementById('tweetsContainer');
        const loadingText = this.getI18nMessage('loadingTweets') || 'Loading tweets...';
        container.innerHTML = `<div class="loading">${loadingText}</div>`;
    }

    showEmptyState() {
        const container = document.getElementById('tweetsContainer');
        container.innerHTML = `
            <div class="empty-state">
                <h3>📂 开始浏览你的推文收藏</h3>
                <p>点击上方的"📁 Select Tweet Folder"按钮选择保存的推文文件夹。<br>支持HTML和JSON格式的推文文件。</p>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    deleteTweet(tweetId) {
        const tweetToDelete = this.tweets.find(t => t.id === tweetId);
        if (!tweetToDelete) return;

        const sourceFileId = tweetToDelete.sourceFileId;
        this.tweets = this.tweets.filter(t => t.id !== tweetId);

        const remainingTweetsFromSource = this.tweets.some(t => t.sourceFileId === sourceFileId);
        if (!remainingTweetsFromSource && sourceFileId) {
            this.loadedFileIds.delete(sourceFileId);
        }
        
        // 最终的数据处理流程
        this.updateStats();
        this.applyFilters();
        this.updateReloadMediaButtonVisibility();
        const deleteText = this.getI18nMessage('notifyTweetDeleted') || 'Tweet deleted';
        this.showNotification(deleteText);
    }



    getI18nMessage(key) {
        try {
            return chrome && chrome.i18n ? chrome.i18n.getMessage(key) : null;
        } catch (error) {
            return null;
        }
    }


    updateAuthorFilter() {
        const authorFilter = document.getElementById('authorFilter');
        const selectedAuthorHandle = authorFilter.value; // 保存当前选中的账号名

        // 1. 使用 Map 收集唯一的作者信息，以账号名为键，名字为值
        const authorMap = new Map();
        this.tweets.forEach(tweet => {
            if (tweet.userHandle && !authorMap.has(tweet.userHandle)) {
                // 如果作者名字不存在，则用账号名作为备用
                authorMap.set(tweet.userHandle, tweet.userName || tweet.userHandle);
            }
        });

        // 2. 将作者信息从 Map 转为数组，并按名字排序
        const sortedAuthors = Array.from(authorMap.entries())
            .sort(([, nameA], [, nameB]) => nameA.toLowerCase().localeCompare(nameB.toLowerCase()));

        // 3. 清空并重新填充下拉列表
        // Note: The text for 'all-authors' is set via localizePage now
        const allAuthorsText = this.getI18nMessage('allAuthorsOption') || 'All Authors';
        authorFilter.innerHTML = `<option value="all-authors" data-i18n="allAuthorsOption">${allAuthorsText}</option>`;
        sortedAuthors.forEach(([handle, name]) => {
            const option = document.createElement('option');
            option.value = handle; // 值是唯一的账号名，用于筛选
            option.textContent = name; // 显示的是作者名字
            authorFilter.appendChild(option);
        });

        // 4. 恢复之前的选中状态
        if (authorMap.has(selectedAuthorHandle)) {
            authorFilter.value = selectedAuthorHandle;
        } else {
            authorFilter.value = 'all-authors';
            if (this.filters.author !== 'all-authors') {
                this.filters.author = 'all-authors';
            }
        }
    }

    getMetadataManager() {
        if (!window.tweetMetadataManager) {
            // Initialize if not exists
            window.tweetMetadataManager = new TweetMetadataManager();
        }
        return window.tweetMetadataManager;
    }

    updateTagFilter() {
        const tagFilter = document.getElementById('tagFilter');
        if (!tagFilter) return;
        
        const selectedTag = tagFilter.value;
        
        // Collect all unique tags from tweets
        const allTags = new Set();
        
        try {
            const metadata = this.getMetadataManager();
            if (metadata && typeof metadata.getTweetMetadata === 'function') {
                this.tweets.forEach(tweet => {
                    try {
                        const tweetMetadata = metadata.getTweetMetadata(tweet.id);
                        if (tweetMetadata && tweetMetadata.tags) {
                            tweetMetadata.tags.forEach(tag => allTags.add(tag));
                        }
                    } catch (error) {
                        console.warn('Error getting tweet metadata for tag filter:', error);
                    }
                });
            }
        } catch (error) {
            console.warn('Error updating tag filter:', error);
        }

        // Clear and repopulate tag filter
        tagFilter.innerHTML = '<option value="all-tags">All Tags</option>';
        
        Array.from(allTags).sort().forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            tagFilter.appendChild(option);
        });

        // Restore selection
        if (allTags.has(selectedTag)) {
            tagFilter.value = selectedTag;
        } else {
            tagFilter.value = 'all-tags';
            if (this.filters.tag !== 'all-tags') {
                this.filters.tag = 'all-tags';
            }
        }
    }

    updateCollectionFilter() {
        const collectionFilter = document.getElementById('collectionFilter');
        if (!collectionFilter) return;
        
        const selectedCollection = collectionFilter.value;
        
        // Collect all unique collections from tweets
        const allCollections = new Set();
        
        try {
            const metadata = this.getMetadataManager();
            if (metadata && typeof metadata.getTweetMetadata === 'function') {
                this.tweets.forEach(tweet => {
                    try {
                        const tweetMetadata = metadata.getTweetMetadata(tweet.id);
                        if (tweetMetadata && tweetMetadata.collection) {
                            allCollections.add(tweetMetadata.collection);
                        }
                    } catch (error) {
                        console.warn('Error getting tweet metadata for collection filter:', error);
                    }
                });
            }
        } catch (error) {
            console.warn('Error updating collection filter:', error);
        }

        // Clear and repopulate collection filter
        collectionFilter.innerHTML = '<option value="all-collections">All Collections</option>';
        
        Array.from(allCollections).sort().forEach(collection => {
            const option = document.createElement('option');
            option.value = collection;
            option.textContent = collection;
            collectionFilter.appendChild(option);
        });

        // Restore selection
        if (allCollections.has(selectedCollection)) {
            collectionFilter.value = selectedCollection;
        } else {
            collectionFilter.value = 'all-collections';
            if (this.filters.collection !== 'all-collections') {
                this.filters.collection = 'all-collections';
            }
        }
    }

    exportMetadata() {
        const metadata = this.getMetadataManager();
        const data = {
            metadata: metadata.getAllMetadata(),
            exportDate: new Date().toISOString(),
            version: '2.2.0'
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `tweet-metadata-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Metadata exported successfully!');
    }

    importMetadata(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (data.metadata) {
                    const metadata = this.getMetadataManager();
                    
                    // Import metadata
                    Object.entries(data.metadata.tweets || {}).forEach(([tweetId, tweetData]) => {
                        metadata.updateTweetMetadata(tweetId, tweetData);
                    });
                    
                    // Save to localStorage
                    metadata.saveToStorage();
                    
                    // Update filters to show new data
                    this.applyFilters();
                    
                    this.showNotification('Metadata imported successfully!');
                } else {
                    throw new Error('Invalid metadata format');
                }
            } catch (error) {
                console.error('Import error:', error);
                this.showNotification('Failed to import metadata: Invalid file format');
            }
        };
        
        reader.readAsText(file);
        // Clear the file input so the same file can be imported again
        document.getElementById('importFile').value = '';
    }

    // 更新重新加载图片按钮的可见性
    updateReloadMediaButtonVisibility() {
        const reloadBtn = document.getElementById('reloadMediaBtn');
        const hasDataWithoutImages = this.tweets.length > 0 && 
                                   this.tweets.some(tweet => 
                                       (tweet.userAvatarUrl && !tweet.displayAvatarUrl) ||
                                       (tweet.media?.images?.length > 0 && tweet.displayImageUrls?.length === 0)
                                   );
        reloadBtn.style.display = hasDataWithoutImages ? 'inline-block' : 'none';
    }

    // 触发文件选择对话框
    triggerFileSelection() {
        const fileInput = document.getElementById('fileInput');
        fileInput.click();
    }



    // 恢复过滤器UI状态
    restoreFilterUI() {
        // 恢复搜索框
        document.getElementById('searchBox').value = this.filters.searchQuery || '';
        
        // 恢复内容过滤器
        document.querySelectorAll('#content-filters .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === this.filters.content);
        });
        
        // 恢复时间过滤器
        document.querySelectorAll('#time-filters .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === this.filters.time);
        });
    }



    // 重新加载推文的媒体文件
    async reloadMediaForTweets(files) {
        if (!files.length || !this.tweets.length) return;

        try {
            this.showLoading();
            
            // 更新文件映射
            this.fileMap = new Map(Array.from(files).map(file => [file.webkitRelativePath, file]));
            
            // 为每个推文重新解析媒体路径
            for (let i = 0; i < this.tweets.length; i++) {
                const tweet = this.tweets[i];
                const updatedTweet = await this.resolveMediaPaths(tweet);
                this.tweets[i] = updatedTweet;
            }

            // 更新UI
            this.applyFilters();
            this.updateReloadMediaButtonVisibility();
            
            this.showNotification('图片已自动重新加载');
            
        } catch (error) {
            console.error('重新加载图片失败:', error);
            this.showNotification('重新加载图片失败');
        }
    }
}

// 全局函数
let browser;

function showTweetDetail(index) {
    console.log('Global showTweetDetail called with index:', index);
    
    if (!browser) {
        console.error('Browser instance not initialized');
        return;
    }
    
    if (!browser.filteredTweets) {
        console.error('No filteredTweets array');
        return;
    }
    
    if (browser.filteredTweets.length === 0) {
        console.error('No tweets loaded');
        return;
    }
    
    const tweet = browser.filteredTweets[index];
    if (!tweet) {
        console.error('No tweet found at index:', index, 'Total tweets:', browser.filteredTweets.length);
        return;
    }
    
    console.log('Tweet data:', tweet);
    
    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Modal element not found');
        return;
    }
    
    // Get the individual modal elements
    const modalTweetUser = document.getElementById('modalTweetUser');
    const modalTweetText = document.getElementById('modalTweetText');
    const modalTweetMedia = document.getElementById('modalTweetMedia');
    const modalTweetLink = document.getElementById('modalTweetLink');
    
    console.log('Modal elements found in showTweetDetail:', {
        modalTweetUser: !!modalTweetUser,
        modalTweetText: !!modalTweetText,
        modalTweetMedia: !!modalTweetMedia,
        modalTweetLink: !!modalTweetLink
    });
    
    if (!modalTweetUser) {
        console.error('modalTweetUser element not found');
        return;
    }
    if (!modalTweetText) {
        console.error('modalTweetText element not found');
        return;
    }
    if (!modalTweetMedia) {
        console.error('modalTweetMedia element not found');
        return;
    }
    
    // Create avatar HTML
    const avatarHtml = tweet.displayAvatarUrl
        ? `<img src="${tweet.displayAvatarUrl}" alt="${tweet.userName}" class="user-avatar-img">`
        : `<div class="user-avatar-placeholder">${(tweet.userName || 'U').charAt(0).toUpperCase()}</div>`;
    
    // Populate user info
    modalTweetUser.innerHTML = `
        ${avatarHtml}
        <div class="user-info">
            <h4>${tweet.userName || 'Unknown User'}</h4>
            <span class="user-handle">@${tweet.userHandle || 'unknown'}</span>
        </div>
    `;
    
    // Populate text
    modalTweetText.innerHTML = tweet.text || '';
    
    // Populate media
    console.log('Tweet displayImageUrls:', tweet.displayImageUrls);
    console.log('Tweet media.images:', tweet.media?.images);
    
    const imagesHTML = (tweet.displayImageUrls || [])
        .map(src => `<img src="${src}" alt="Tweet Image" style="max-width: 100%; border-radius: 12px; margin-top: 10px;">`)
        .join('');
    console.log('Generated imagesHTML:', imagesHTML);
    modalTweetMedia.innerHTML = imagesHTML;
    
    // If no displayImageUrls but original images exist, show placeholder
    if ((!tweet.displayImageUrls || tweet.displayImageUrls.length === 0) && 
        tweet.media?.images && tweet.media.images.length > 0) {
        modalTweetMedia.innerHTML = `
            <div style="padding: 10px; border: 2px dashed var(--border-color); border-radius: 8px; text-align: center; margin-top: 10px;">
                <span style="color: var(--text-secondary);">📷 ${tweet.media.images.length} image(s) - Please reload images by selecting the tweet folder</span>
            </div>
        `;
    }
    
    // Set up tweet link
    if (tweet.tweetUrl) {
        modalTweetLink.href = tweet.tweetUrl;
        modalTweetLink.style.display = 'inline-block';
    } else {
        modalTweetLink.style.display = 'none';
    }
    
    // Store current tweet data for metadata manager
    window.currentTweetData = tweet;
    
    // Initialize metadata for this tweet if manager is available
    if (window.metadataManager) {
        window.metadataManager.renderTweetTags(tweet);
        window.metadataManager.renderTweetCollections(tweet);
    }
    
    // Show the modal
    modal.style.display = 'block';
    console.log('Modal opened successfully');
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

// 绑定模态框事件监听器
document.addEventListener('DOMContentLoaded', () => {
    browser = new TweetBrowser();
    
    // Debug: Check if modal elements exist
    console.log('Modal elements check:', {
        modal: !!document.getElementById('modal'),
        modalTweetUser: !!document.getElementById('modalTweetUser'),
        modalTweetText: !!document.getElementById('modalTweetText'),
        modalTweetMedia: !!document.getElementById('modalTweetMedia'),
        modalTweetLink: !!document.getElementById('modalTweetLink'),
        modalCloseBtn: !!document.getElementById('modalCloseBtn')
    });
    
    // 模态框关闭按钮
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    
    // 点击模态框外部关闭
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') {
            closeModal();
        }
    });

    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}); 