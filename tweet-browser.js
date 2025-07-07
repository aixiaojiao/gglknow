class TweetBrowser {
    constructor() {
        this.tweets = [];
        this.filteredTweets = [];
        this.currentFilter = 'all';
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.loadFiles(e.target.files);
        });

        document.getElementById('searchBox').addEventListener('input', (e) => {
            this.searchTweets(e.target.value);
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFilter(e.target.dataset.filter);
            });
        });
    }

    async loadFiles(files) {
        if (!files.length) return;

        this.showLoading();
        this.tweets = [];

        for (let file of files) {
            try {
                const content = await this.readFile(file);
                const parsedData = this.parseFile(content, file.name);
                if (parsedData) {
                    if (Array.isArray(parsedData)) {
                        // Handle JSON file with an array of tweets
                        this.tweets.push(...parsedData);
                    } else {
                        // Handle HTML file or JSON with a single tweet object
                        this.tweets.push(parsedData);
                    }
                }
            } catch (error) {
                console.error('读取文件失败:', file.name, error);
            }
        }

        this.tweets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        this.updateStats();
        this.filterTweets();
        this.renderTweets();
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
                return JSON.parse(content);
            } else if (filename.endsWith('.html')) {
                return this.parseHTMLFile(content);
            }
        } catch (error) {
            console.error('解析文件失败:', filename, error);
        }
        return null;
    }

    parseHTMLFile(html) {
        // 简单的HTML解析，从文件名或内容中提取信息
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 尝试从HTML中提取推文信息
        const userNameEl = doc.querySelector('.user-details h3, .user-name');
        const userHandleEl = doc.querySelector('.user-handle');
        const tweetTextEl = doc.querySelector('.tweet-text');
        const images = Array.from(doc.querySelectorAll('.media-container img')).map(img => img.src);
        
        return {
            userName: userNameEl ? userNameEl.textContent.trim() : '未知用户',
            userHandle: userHandleEl ? userHandleEl.textContent.replace('@', '') : '',
            text: tweetTextEl ? tweetTextEl.textContent.trim() : '',
            timestamp: new Date().toISOString(),
            media: { images: images, videos: [] },
            stats: { replies: '0', retweets: '0', likes: '0' },
            tweetUrl: '',
            url: ''
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

    setFilter(filter) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        
        this.currentFilter = filter;
        this.filterTweets();
        this.renderTweets();
    }

    filterTweets() {
        this.filteredTweets = this.tweets.filter(tweet => {
            switch (this.currentFilter) {
                case 'images':
                    return tweet.media && tweet.media.images && tweet.media.images.length > 0;
                case 'recent':
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return new Date(tweet.timestamp) > weekAgo;
                default:
                    return true;
            }
        });
    }

    searchTweets(query) {
        if (!query.trim()) {
            this.filterTweets();
            this.renderTweets();
            return;
        }

        const searchQuery = query.toLowerCase();
        this.filteredTweets = this.tweets.filter(tweet => {
            return tweet.text.toLowerCase().includes(searchQuery) ||
                   tweet.userName.toLowerCase().includes(searchQuery) ||
                   tweet.userHandle.toLowerCase().includes(searchQuery);
        });

        this.renderTweets();
    }

    renderTweets() {
        const container = document.getElementById('tweetsContainer');
        
        if (this.filteredTweets.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>🔍 没有找到匹配的推文</h3>
                    <p>尝试调整搜索条件或筛选器</p>
                </div>
            `;
            return;
        }

        const tweetsHTML = this.filteredTweets.map((tweet, index) => {
            // Add default value protection for potentially missing fields
            const userName = tweet.userName || '未知用户';
            const userHandle = tweet.userHandle || 'unknown';
            const text = tweet.text || '';
            const timestamp = tweet.timestamp ? new Date(tweet.timestamp).toLocaleDateString('zh-CN') : '未知日期';
            const images = tweet.media?.images || [];
            const likes = tweet.stats?.likes || '0';
            const retweets = tweet.stats?.retweets || '0';

            return `
            <div class="tweet-card" data-tweet-index="${index}">
                <div class="tweet-user">
                    <div class="user-avatar">
                        ${userName.charAt(0).toUpperCase()}
                    </div>
                    <div class="user-info">
                        <h4>${this.escapeHtml(userName)}</h4>
                        <div class="user-handle">@${this.escapeHtml(userHandle)}</div>
                    </div>
                </div>
                
                <div class="tweet-text">${this.escapeHtml(text)}</div>
                
                <div class="tweet-meta">
                    <span class="tweet-date">${timestamp}</span>
                    <div class="tweet-stats">
                        ${images.length > 0 ? `<span>📷 ${images.length}</span>` : ''}
                        <span>❤️ ${likes}</span>
                        <span>🔁 ${retweets}</span>
                    </div>
                </div>
            </div>
            `;
        }).join('');

        container.innerHTML = `<div class="tweets-grid">${tweetsHTML}</div>`;
        
        // 添加事件委托处理推文卡片点击
        const tweetsGrid = container.querySelector('.tweets-grid');
        if (tweetsGrid) {
            tweetsGrid.addEventListener('click', (e) => {
                const tweetCard = e.target.closest('.tweet-card');
                if (tweetCard) {
                    const index = parseInt(tweetCard.dataset.tweetIndex);
                    showTweetDetail(index);
                }
            });
        }
    }

    showLoading() {
        document.getElementById('tweetsContainer').innerHTML = '<div class="loading">正在加载推文...</div>';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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