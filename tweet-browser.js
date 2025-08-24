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
            time: 'all-time'      // 'all-time', 'today', 'week', 'month'
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

            this.showNotification(chrome.i18n.getMessage('notifyLoadedTweets', [loadedCount.toString()]));

        } catch (fatalError) {
            console.error('加载文件时发生严重错误:', fatalError);
            this.showNotification(chrome.i18n.getMessage('notifyLoadError'));
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
                const imageEls = Array.from(card.querySelectorAll('.media-item img, .media-item video'));
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
            const imageEls = Array.from(doc.querySelectorAll('.media-item img, .media-item video'));
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
            // 尝试直接匹配和移除开头的项目文件夹名称后匹配
            const normalizedPath = path.replace(/\\/g, '/');
            const pathParts = normalizedPath.split('/');
            const key = pathParts.slice(1).join('/'); // 移除根文件夹
            return this.fileMap.get(normalizedPath) || this.fileMap.get(key);
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

        // Step 3: 更新过滤后的推文列表并渲染
        this.filteredTweets = result;
        this.renderTweets();
    }

    renderTweets() {
        const container = document.getElementById('tweetsContainer');
        container.innerHTML = ''; // 清空容器

        if (this.filteredTweets.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${chrome.i18n.getMessage('emptyStateNoMatchesTitle')}</h3>
                    <p>${chrome.i18n.getMessage('emptyStateNoMatchesDescription')}</p>
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

            const userName = tweet.userName || chrome.i18n.getMessage('unknownUser');
            const userHandle = tweet.userHandle || 'unknown';
            const text = tweet.text || '';
            const timestamp = tweet.timestamp ? new Date(tweet.timestamp).toLocaleDateString(this.uiLocale) : chrome.i18n.getMessage('unknownDate');
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
        container.innerHTML = `<div class="loading">${chrome.i18n.getMessage('loadingTweets')}</div>`;
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
        this.showNotification(chrome.i18n.getMessage('notifyTweetDeleted'));
    }



    showTweetDetail(index) {
        const tweet = this.filteredTweets[index];
        if (!tweet) return;

        const modal = document.getElementById('tweetModal');
        const modalContent = document.getElementById('modalContent');

        const imagesHTML = (tweet.displayImageUrls || [])
            .map(src => `<img src="${src}" alt="Tweet Image" style="max-width: 100%; border-radius: 12px; margin-top: 10px;">`)
            .join('');

        const avatarHtml = tweet.displayAvatarUrl
            ? `<img src="${tweet.displayAvatarUrl}" alt="${tweet.userName}" class="user-avatar-img">`
            : `<div class="user-avatar-placeholder">${(tweet.userName || 'U').charAt(0).toUpperCase()}</div>`;

        modalContent.innerHTML = `
            <div class="tweet-card" style="box-shadow: none; border: none;">
                <div class="tweet-user">
                    ${avatarHtml}
                    <div class="user-info">
                        <h4>${tweet.userName || chrome.i18n.getMessage('unknownUser')}</h4>
                        <span class="user-handle">@${tweet.userHandle || 'unknown'}</span>
                    </div>
                </div>
                <p class="tweet-text-full">${tweet.text || ''}</p>
                <div class="media-container">${imagesHTML}</div>
                <div class="tweet-stats">
                    <span>${chrome.i18n.getMessage('likesStat', [tweet.stats?.likes || '0'])}</span>
                    <span>${chrome.i18n.getMessage('retweetsStat', [tweet.stats?.retweets || '0'])}</span>
                    <span class="tweet-timestamp">${tweet.timestamp ? new Date(tweet.timestamp).toLocaleString(this.uiLocale) : ''}</span>
                </div>
            </div>
        `;

        modal.style.display = 'block';

        document.getElementById('modalRetweets').textContent = tweet.stats?.retweets || '0';
        document.getElementById('modalLikes').textContent = tweet.stats?.likes || '0';

        const tweetLink = document.getElementById('modalTweetLink');
        if (tweet.tweetUrl) {
            tweetLink.href = tweet.tweetUrl;
            tweetLink.style.display = 'inline-block';
        } else {
            tweetLink.style.display = 'none';
        }
        
        document.getElementById('tweetDetailModal').style.display = 'block';
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
        authorFilter.innerHTML = `<option value="all-authors" data-i18n="allAuthorsOption">${chrome.i18n.getMessage('allAuthorsOption')}</option>`;
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
    const tweet = browser.filteredTweets[index];
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modalContent');
    
    const avatarHtml = tweet.displayAvatarUrl
        ? `<img src="${tweet.displayAvatarUrl}" alt="${tweet.userName}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 15px;">`
        : `<div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #1da1f2, #1991db); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; margin-right: 15px;">
               ${(tweet.userName || 'U').charAt(0).toUpperCase()}
           </div>`;

    // 如果是推文串，显示特殊的布局
    if (tweet.isThread && tweet.threadTweets) {
        const threadContent = tweet.threadTweets.map((threadTweet, i) => `
            <div style="border: 1px solid #e1e8ed; border-radius: 12px; padding: 20px; margin-bottom: 15px; background: ${i === 0 ? '#f8f9ff' : 'white'};">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <div style="width: 35px; height: 35px; border-radius: 50%; background: linear-gradient(135deg, #1da1f2, #1991db); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; margin-right: 12px;">
                        ${i + 1}
                    </div>
                    <div>
                        <h4 style="margin: 0; font-size: 14px; color: #14171a;">${browser.escapeHtml(threadTweet.userName)}</h4>
                        <p style="margin: 2px 0 0 0; color: #657786; font-size: 12px;">@${browser.escapeHtml(threadTweet.userHandle)}</p>
                    </div>
                </div>
                
                <div style="margin: 12px 0; font-size: 15px; line-height: 1.5; color: #14171a;">
                    ${threadTweet.text || ''}
                </div>
                
                ${(threadTweet.media?.images && threadTweet.media.images.length > 0) ? `
                    <div style="margin: 12px 0;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px;">
                            ${threadTweet.media.images.map(img => {
                                // 查找对应的显示URL
                                const imgIndex = tweet.media?.images?.indexOf(img) || 0;
                                const displayUrl = tweet.displayImageUrls?.[imgIndex] || img;
                                return `<img src="${displayUrl}" style="width: 100%; border-radius: 6px;" alt="推文图片">`;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');

        modalContent.innerHTML = `
            <div style="padding: 30px;">
                <div style="display: flex; align-items: center; margin-bottom: 25px;">
                    ${avatarHtml}
                    <div>
                        <h3 style="margin: 0; color: #14171a;">${browser.escapeHtml(tweet.userName)}</h3>
                        <div style="color: #657786;">@${browser.escapeHtml(tweet.userHandle)}</div>
                        <span style="background: #1da1f2; color: white; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-top: 5px; display: inline-block;">🧵 推文串 (${tweet.threadTweets.length}条)</span>
                    </div>
                </div>
                
                <div style="margin: 20px 0; max-height: 60vh; overflow-y: auto;">
                    ${threadContent}
                </div>
                
                <div style="display: flex; justify-content: space-between; padding: 15px; background: #f8f9fa; border-radius: 8px; margin-top: 20px;">
                    <span>💬 ${tweet.stats?.replies || '0'} 回复</span>
                    <span>🔁 ${tweet.stats?.retweets || '0'} 转推</span>
                    <span>❤️ ${tweet.stats?.likes || '0'} 点赞</span>
                </div>
                
                <div style="margin-top: 15px; text-align: center; color: #657786; font-size: 12px;">
                    收藏时间: ${new Date(tweet.timestamp).toLocaleString('zh-CN')}
                    ${tweet.tweetUrl ? `<br><a href="${tweet.tweetUrl}" target="_blank" style="color: #1da1f2;">查看原推文</a>` : ''}
                </div>
            </div>
        `;
    } else {
        // 显示单个推文
        modalContent.innerHTML = `
            <div style="padding: 30px;">
                <div style="display: flex; align-items: center; margin-bottom: 20px;">
                    ${avatarHtml}
                    <div>
                        <h3 style="margin: 0; color: #14171a;">${browser.escapeHtml(tweet.userName)}</h3>
                        <div style="color: #657786;">@${browser.escapeHtml(tweet.userHandle)}</div>
                    </div>
                </div>
                
                <div style="font-size: 18px; line-height: 1.6; color: #14171a; margin-bottom: 20px; white-space: pre-wrap;">
                    ${tweet.text}
                </div>
                
                ${(tweet.displayImageUrls && tweet.displayImageUrls.length > 0) ? `
                    <div style="margin: 20px 0;">
                        <h4 style="margin-bottom: 10px;">📷 图片</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                            ${tweet.displayImageUrls.map(img => `<img src="${img}" style="width: 100%; border-radius: 8px;" alt="推文图片">`).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div style="display: flex; justify-content: space-between; padding: 15px; background: #f8f9fa; border-radius: 8px; margin-top: 20px;">
                    <span>💬 ${tweet.stats?.replies || '0'} 回复</span>
                    <span>🔁 ${tweet.stats?.retweets || '0'} 转推</span>
                    <span>❤️ ${tweet.stats?.likes || '0'} 点赞</span>
                </div>
                
                <div style="margin-top: 15px; text-align: center; color: #657786; font-size: 12px;">
                    收藏时间: ${new Date(tweet.timestamp).toLocaleString('zh-CN')}
                    ${tweet.tweetUrl ? `<br><a href="${tweet.tweetUrl}" target="_blank" style="color: #1da1f2;">查看原推文</a>` : ''}
                </div>
            </div>
        `;
    }
    
    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

// 绑定模态框事件监听器
document.addEventListener('DOMContentLoaded', () => {
    browser = new TweetBrowser();
    
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