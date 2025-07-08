class TweetBrowser {
    constructor() {
        this.tweets = [];
        this.filteredTweets = [];
        this.loadedFileIds = new Set();
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
            let loadedCount = 0;
            let skippedCount = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileId = `${file.name}-${file.size}-${file.lastModified}`;
                if (this.loadedFileIds.has(fileId)) {
                    skippedCount++;
                    continue;
                }

                try {
                    const content = await this.readFile(file);
                    const parsedData = this.parseFile(content, file.name);
                    if (parsedData) {
                        const tweetsToAdd = Array.isArray(parsedData) ? parsedData : [parsedData];
                        tweetsToAdd.forEach(tweet => {
                            tweet.id = `tweet-${this.tweets.length}-${Date.now()}`;
                            tweet.sourceFileId = fileId;
                            this.tweets.push(tweet);
                        });
                        this.loadedFileIds.add(fileId);
                        loadedCount++;
                    }
                } catch (error) {
                    console.error(`Failed to read or parse file ${file.name}:`, error);
                }
            }

            this.tweets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // 最终的数据处理流程
            this.updateStats();
            this.applyFilters();

            let message = `您选择了 ${files.length} 个文件。`;
            if (loadedCount > 0) {
                message += ` ${loadedCount} 个新文件加载成功。`;
            }
            if (skippedCount > 0) {
                message += ` ${skippedCount} 个文件因重复被跳过。`;
            }
            this.showNotification(message);

        } catch (fatalError) {
            console.error('A critical error occurred during the file loading process:', fatalError);
            this.showNotification('加载过程中发生严重错误，请检查控制台。');
        }
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
                return this.parseHTMLFile(content);
            }
        } catch (error) {
            console.error('解析文件失败:', filename, error);
        }
        return null;
    }

    parseHTMLFile(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const userNameEl = doc.querySelector('.user-details h3, .user-name, .user-info h4');
        const userHandleEl = doc.querySelector('.user-handle');
        const tweetTextEl = doc.querySelector('.tweet-text, .tweet-text-full');
        const images = Array.from(doc.querySelectorAll('.media-container img, .tweet-media img')).map(img => img.src);
        
        // 尝试从多个可能的元素和属性中解析时间
        let timestamp = new Date().toISOString(); // Default to now if not found
        const timeEl = doc.querySelector('time[datetime], .tweet-timestamp, .time');
        if (timeEl) {
            const timeString = timeEl.getAttribute('datetime') || timeEl.textContent;
            const parsedDate = new Date(timeString);
            if (!isNaN(parsedDate)) {
                timestamp = parsedDate.toISOString();
            }
        }

        return {
            userName: userNameEl ? userNameEl.textContent.trim() : '未知用户',
            userHandle: userHandleEl ? userHandleEl.textContent.replace('@', '').trim() : '',
            text: tweetTextEl ? tweetTextEl.textContent.trim() : '',
            timestamp: timestamp,
            media: { images: images, videos: [] },
            stats: { 
                replies: doc.querySelector('.replies')?.textContent || '0',
                retweets: doc.querySelector('.retweets, .retweet-count')?.textContent || '0',
                likes: doc.querySelector('.likes, .like-count')?.textContent || '0'
            },
            tweetUrl: doc.querySelector('a.tweet-link')?.href || '',
            url: '' // url is often the same as tweetUrl, can be refined
        };
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

            card.innerHTML = `
                <button class="delete-btn" data-tweet-id="${tweet.id}">&times;</button>
                <div class="tweet-user">
                    <div class="user-avatar">
                        ${userName.charAt(0).toUpperCase()}
                    </div>
                    <div class="user-info">
                        <h4>${userName}</h4>
                        <span class="user-handle">@${userHandle}</span>
                    </div>
                </div>
                <p class="tweet-text">${this.escapeHtml(text)}</p>
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

        const imagesHTML = (tweet.media?.images || [])
            .map(src => `<img src="${src}" alt="Tweet Image" style="max-width: 100%; border-radius: 12px; margin-top: 10px;">`)
            .join('');

        modalContent.innerHTML = `
            <div class="tweet-card" style="box-shadow: none; border: none;">
                <div class="tweet-user">
                    <div class="user-avatar">${(tweet.userName || 'U').charAt(0).toUpperCase()}</div>
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
    }

    updateAuthorFilter() {
        const authorFilter = document.getElementById('authorFilter');
        const authors = [...new Set(this.tweets.map(t => t.userHandle).filter(Boolean))];
        const selectedAuthor = authorFilter.value;

        authorFilter.innerHTML = '<option value="all-authors">所有作者</option>';
        
        authors.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        authors.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            authorFilter.appendChild(option);
        });

        // 仅更新UI，不触发任何副作用
        if (authors.includes(selectedAuthor)) {
            authorFilter.value = selectedAuthor;
        } else {
            authorFilter.value = 'all-authors';
            // 如果之前选中的作者被删，重置筛选状态，下次applyFilters时会自动生效
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
    
    modalContent.innerHTML = `
        <div style="padding: 30px;">
            <div style="display: flex; align-items: center; margin-bottom: 20px;">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #1da1f2, #1991db); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; margin-right: 15px;">
                    ${tweet.userName.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h3 style="margin: 0; color: #14171a;">${browser.escapeHtml(tweet.userName)}</h3>
                    <div style="color: #657786;">@${browser.escapeHtml(tweet.userHandle)}</div>
                </div>
            </div>
            
            <div style="font-size: 18px; line-height: 1.6; color: #14171a; margin-bottom: 20px; white-space: pre-wrap;">
                ${browser.escapeHtml(tweet.text)}
            </div>
            
            ${tweet.media && tweet.media.images && tweet.media.images.length > 0 ? `
                <div style="margin: 20px 0;">
                    <h4 style="margin-bottom: 10px;">📷 图片</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                        ${tweet.media.images.map(img => `<img src="${img}" style="width: 100%; border-radius: 8px;" alt="推文图片">`).join('')}
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