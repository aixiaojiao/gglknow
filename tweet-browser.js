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
        this.init();
    }

    init() {
        this.bindEvents();
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

        try {
            this.showLoading();
            this.clearPreviousData();

            this.fileMap = new Map(Array.from(files).map(file => [file.webkitRelativePath, file]));
            
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

            this.showNotification(`成功加载 ${loadedCount} 条推文。`);

        } catch (fatalError) {
            console.error('加载文件时发生严重错误:', fatalError);
            this.showNotification('加载过程中发生严重错误，请检查控制台。');
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
        
        const userNameEl = doc.querySelector('.user-details h2');
        const userHandleEl = doc.querySelector('.user-details p');
        const tweetTextEl = doc.querySelector('.tweet-text');
        const imageEls = Array.from(doc.querySelectorAll('.media-item img, .media-item video'));
        const tweetUrlEl = doc.querySelector('.view-original-btn');
        const avatarImgEl = doc.querySelector('.avatar');
        
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
            userName: userNameEl ? userNameEl.textContent.trim() : '未知用户',
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
            url: ''
        };
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
            const dates = this.tweets.map(t => new Date(t.timestamp)).sort();
            const oldest = dates[0];
            const newest = dates[dates.length - 1];
            
            if (oldest.getTime() === newest.getTime()) {
                dateRange = oldest.toLocaleDateString('zh-CN');
            } else {
                dateRange = `${oldest.toLocaleDateString('zh-CN')} - ${newest.toLocaleDateString('zh-CN')}`;
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
                    <h3>🔍 没有找到匹配的推文</h3>
                    <p>尝试调整搜索条件或筛选器</p>
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

            const userName = tweet.userName || '未知用户';
            const userHandle = tweet.userHandle || 'unknown';
            const text = tweet.text || '';
            const timestamp = tweet.timestamp ? new Date(tweet.timestamp).toLocaleDateString('zh-CN') : '未知日期';
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
        container.innerHTML = '<div class="loading">正在加载推文...</div>';
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
        this.showNotification('推文已删除。');
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
                        <h4>${tweet.userName || '未知用户'}</h4>
                        <span class="user-handle">@${tweet.userHandle || 'unknown'}</span>
                    </div>
                </div>
                <p class="tweet-text-full">${tweet.text || ''}</p>
                <div class="media-container">${imagesHTML}</div>
                <div class="tweet-stats">
                    <span>${tweet.stats?.likes || 0} Likes</span>
                    <span>${tweet.stats?.retweets || 0} Retweets</span>
                    <span class="tweet-timestamp">${tweet.timestamp ? new Date(tweet.timestamp).toLocaleString('zh-CN') : ''}</span>
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
        authorFilter.innerHTML = '<option value="all-authors">所有作者</option>';
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