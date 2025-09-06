class TweetBrowser {
    constructor() {
        console.log('TweetBrowser constructor called');
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
        
        // Clear before file selection to ensure same file can trigger change event
        fileInput.addEventListener('click', (e) => {
            e.target.value = null;
        });

        fileInput.addEventListener('change', (e) => {
            this.loadFiles(e.target.files);
        });

        // Reload media button event
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
            console.log('Collection filter changed to:', e.target.value);
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
        }, 5000); // Auto hide after 5 seconds
    }

    async loadFiles(files) {
        if (!files.length) return;

        // Get current selected folder name
        const firstFile = files[0];
        const currentFolderName = firstFile.webkitRelativePath ? 
            firstFile.webkitRelativePath.split('/')[0] : 'Selected files';

        // Check if need to reload media files
        if (this.needsMediaReload && this.tweets.length > 0) {
            const isSameFolder = currentFolderName === this.lastFolderName;
            
            if (isSameFolder) {
                // Same folder, auto reload images
                await this.reloadMediaForTweets(files);
                this.needsMediaReload = false;
                return;
            } else {
                // Different folder, ask user if want to replace data
                const shouldReplace = confirm(
                    `Detected new folder "${currentFolderName}", different from previous folder "${this.lastFolderName}".\n\n` +
                    `Do you want to replace existing data?\n` +
                    `- Click "OK": Clear existing data and load new folder\n` +
                    `- Click "Cancel": Keep existing data and load images for it`
                );
                
                if (!shouldReplace) {
                    // User chose to keep existing data, load images for existing data
                    await this.reloadMediaForTweets(files);
                    this.needsMediaReload = false;
                    return;
                }
                // User chose to replace, continue normal loading process below
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
                    console.error(`Failed to process file ${file.name}:`, error);
                }
            }

            this.tweets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            this.updateStats();
            this.applyFilters();
            
            // Delayed filter update to ensure metadata manager is initialized
            setTimeout(() => {
                console.log('Manually updating filters after file load');
                this.updateTagFilter();
                this.updateCollectionFilter();
            }, 100);
            
            this.updateReloadMediaButtonVisibility();

            const notifyText = this.getI18nMessage('notifyLoadedTweets') || `Loaded ${loadedCount} tweets`;
            this.showNotification(notifyText.replace('%s', loadedCount.toString()));

        } catch (fatalError) {
            console.error('Fatal error occurred while loading files:', fatalError);
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
                // Ensure timestamp exists and is valid
                if (!data.timestamp && data.tweetTime) {
                    data.timestamp = data.tweetTime;
                }
                return data;
            } else if (filename.endsWith('.html')) {
                return this.parseHTMLFile(content, filename);
            }
        } catch (error) {
            console.error('Failed to parse file:', filename, error);
        }
        return null;
    }

    parseHTMLFile(html, filePath) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Detect if this is a tweet thread (contains multiple tweet-card blocks)
        const tweetCards = Array.from(doc.querySelectorAll('.tweet-card'));
        const isThread = tweetCards.length > 1;
        
        const getRelativePath = (src, basePath) => {
            if (!src || !basePath) return '';
            
            // Normalize path, remove "./"
            const cleanedSrc = src.startsWith('./') ? src.substring(2) : src;
            
            // Get HTML file directory
            const baseDir = basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/')) : '';
            
            // Combine into full path
            // If baseDir is empty (HTML in root directory), return cleaned src directly
            return baseDir ? `${baseDir}/${cleanedSrc}` : cleanedSrc;
        };

        if (isThread) {
            // Handle tweet thread: parse all tweets and merge
            const threadTweets = tweetCards.map(card => {
                const userNameEl = card.querySelector('.user-details h2');
                const userHandleEl = card.querySelector('.user-details p');
                const tweetTextEl = card.querySelector('.tweet-text');
                // Try multiple image selectors, but exclude avatars
                let imageEls = Array.from(card.querySelectorAll('.media-item img, .media-item video'));
                if (imageEls.length === 0) {
                    // Try other possible selectors, but exclude avatars and user related images
                    imageEls = Array.from(card.querySelectorAll('img[src*=".jpg"], img[src*=".jpeg"], img[src*=".png"], img[src*=".gif"], img[src*=".webp"], video'))
                        .filter(img => {
                            const src = img.getAttribute('src') || '';
                            const className = img.className || '';
                            // Exclude avatar related images
                            return !className.includes('avatar') && 
                                   !src.includes('avatar') && 
                                   !img.closest('.user-details') &&
                                   !img.closest('.avatar');
                        });
                }
                console.log(`Found ${imageEls.length} media elements in thread card`);
                const tweetUrlEl = card.querySelector('.view-original-btn');
                const avatarImgEl = card.querySelector('.avatar');
                
                let timestamp = null;
                const timeEl = card.querySelector('.meta-item span:last-child');
                if (timeEl) {
                    const timeText = timeEl.textContent.trim();
                    console.log('Found time element with text:', timeText);
                    const date = new Date(timeText);
                    if (!isNaN(date)) {
                        timestamp = date.toISOString();
                        console.log('Parsed timestamp:', timestamp);
                    } else {
                        console.log('Failed to parse time:', timeText);
                    }
                } else {
                    console.log('No time element found with selector .meta-item span:last-child');
                }
                // Only use current time as fallback if no valid timestamp found
                if (!timestamp) {
                    timestamp = new Date().toISOString();
                    console.log('Using fallback timestamp:', timestamp);
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

            // Use first tweet's info as main info, but merge all tweet content
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
            // Handle single tweet
            const userNameEl = doc.querySelector('.user-details h2');
            const userHandleEl = doc.querySelector('.user-details p');
            const tweetTextEl = doc.querySelector('.tweet-text');
            // Try multiple image selectors, but exclude avatars
            let imageEls = Array.from(doc.querySelectorAll('.media-item img, .media-item video'));
            if (imageEls.length === 0) {
                // Try other possible selectors, but exclude avatars and user related images
                imageEls = Array.from(doc.querySelectorAll('img[src*=".jpg"], img[src*=".jpeg"], img[src*=".png"], img[src*=".gif"], img[src*=".webp"], video'))
                    .filter(img => {
                        const src = img.getAttribute('src') || '';
                        const className = img.className || '';
                        // Exclude avatar related images
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

            let timestamp = null;
            const timeEl = doc.querySelector('.meta-item span:last-child');
            if (timeEl) {
                const timeText = timeEl.textContent.trim();
                console.log('Found time element with text:', timeText);
                const date = new Date(timeText);
                if (!isNaN(date)) {
                    timestamp = date.toISOString();
                    console.log('Parsed timestamp:', timestamp);
                } else {
                    console.log('Failed to parse time:', timeText);
                }
            } else {
                console.log('No time element found with selector .meta-item span:last-child');
            }
            // Only use current time as fallback if no valid timestamp found
            if (!timestamp) {
                timestamp = new Date().toISOString();
                console.log('Using fallback timestamp:', timestamp);
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
            
            // Normalize path, use forward slashes consistently
            const normalizedPath = path.replace(/\\/g, '/');
            
            // Try multiple path matching strategies
            const attempts = [
                normalizedPath,                                    // Original path
                normalizedPath.replace(/^\.\//, ''),              // Remove ./
                normalizedPath.split('/').slice(1).join('/'),     // Remove first directory
                normalizedPath.split('/').slice(2).join('/'),     // Remove first two directories
                normalizedPath.split('/').pop(),                  // File name only
            ];
            
            // Try different file extensions at the same time
            const extensions = ['', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
            
            for (const attempt of attempts) {
                if (!attempt) continue;
                
                // Try different extensions
                for (const ext of extensions) {
                    const testPath = attempt + ext;
                    
                    // Search in fileMap
                    for (const [key, file] of this.fileMap.entries()) {
                        const normalizedKey = key.replace(/\\/g, '/');
                        
                        // Exact match
                        if (normalizedKey === testPath) return file;
                        
                        // File name match (ignore path)
                        if (normalizedKey.endsWith('/' + testPath) || normalizedKey === testPath) return file;
                        
                        // Path ending match
                        if (testPath.length > 3 && normalizedKey.endsWith(testPath)) return file;
                    }
                }
            }
            
            return null;
        };
        
        // Parse avatar
        if (tweetData.userAvatarUrl) {
            const file = findFile(tweetData.userAvatarUrl);
            if (file) {
                const url = URL.createObjectURL(file);
                resolvedTweet.displayAvatarUrl = url;
                this.objectUrls.push(url);
            }
        }

        // Parse media images
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
        // Step 1: Update author list UI before all filter operations
        this.updateAuthorFilter();
        
        let result = [...this.tweets];

        // Step 2: Apply all filter conditions
        // Author filter
        if (this.filters.author !== 'all-authors') {
            result = result.filter(tweet => tweet.userHandle === this.filters.author);
        }
        // Search query filter
        if (this.filters.searchQuery) {
            result = result.filter(tweet => {
                const query = this.filters.searchQuery;
                return (tweet.text && tweet.text.toLowerCase().includes(query)) ||
                       (tweet.userName && tweet.userName.toLowerCase().includes(query)) ||
                       (tweet.userHandle && tweet.userHandle.toLowerCase().includes(query));
            });
        }
        // Content filter
        if (this.filters.content === 'images') {
            result = result.filter(tweet => tweet.media && tweet.media.images && tweet.media.images.length > 0);
        }
        // Time filter
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        switch (this.filters.time) {
            case 'today':
                result = result.filter(tweet => new Date(tweet.timestamp) >= today);
                break;
            case 'week':
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)); // Monday of this week
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
                    const tweetMetadata = metadata.getTweetMetadata(tweet);
                    return tweetMetadata && tweetMetadata.tags && tweetMetadata.tags.includes(this.filters.tag);
                } catch (error) {
                    console.warn('Tag filtering error:', error);
                    return false;
                }
            });
        }

        // Collection filtering
        if (this.filters.collection !== 'all-collections') {
            console.log('Applying collection filter:', this.filters.collection);
            const beforeCount = result.length;
            result = result.filter(tweet => {
                try {
                    const metadata = this.getMetadataManager();
                    if (!metadata || typeof metadata.getTweetMetadata !== 'function') return false;
                    const tweetMetadata = metadata.getTweetMetadata(tweet);
                    const hasCollection = tweetMetadata && tweetMetadata.collection === this.filters.collection;
                    if (hasCollection) {
                        console.log('Tweet matches collection:', tweet.id, tweetMetadata.collection);
                    }
                    return hasCollection;
                } catch (error) {
                    console.warn('Collection filtering error:', error);
                    return false;
                }
            });
            console.log('Collection filtering result:', beforeCount, '->', result.length);
        }

        // Step 3: Update filter options and render
        this.updateTagFilter();
        this.updateCollectionFilter();
        this.filteredTweets = result;
        this.renderTweets();
    }

    renderTweets() {
        const container = document.getElementById('tweetsContainer');
        container.innerHTML = ''; // Clear container

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
                        ${tweet.isThread ? `<span style="background: #1da1f2; color: white; padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: bold; margin-top: 2px; display: inline-block;">🧵 Thread (${tweet.threadTweets?.length || 0} tweets)</span>` : ''}
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
                <h3>📂 Start browsing your tweet collection</h3>
                <p>Click the "📁 Select Tweet Folder" button above to select your saved tweet folder.<br>Supports HTML and JSON format tweet files.</p>
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
        
        // Final data processing flow
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
        const selectedAuthorHandle = authorFilter.value; // Save current selected account name

        // 1. Use Map to collect unique author info, with account name as key and name as value
        const authorMap = new Map();
        this.tweets.forEach(tweet => {
            if (tweet.userHandle && !authorMap.has(tweet.userHandle)) {
                // If author name doesn't exist, use account name as fallback
                authorMap.set(tweet.userHandle, tweet.userName || tweet.userHandle);
            }
        });

        // 2. Convert author info from Map to array and sort by name
        const sortedAuthors = Array.from(authorMap.entries())
            .sort(([, nameA], [, nameB]) => nameA.toLowerCase().localeCompare(nameB.toLowerCase()));

        // 3. Clear and repopulate dropdown list
        // Note: The text for 'all-authors' is set via localizePage now
        const allAuthorsText = this.getI18nMessage('allAuthorsOption') || 'All Authors';
        authorFilter.innerHTML = `<option value="all-authors" data-i18n="allAuthorsOption">${allAuthorsText}</option>`;
        sortedAuthors.forEach(([handle, name]) => {
            const option = document.createElement('option');
            option.value = handle; // Value is unique account name for filtering
            option.textContent = name; // Display author name
            authorFilter.appendChild(option);
        });

        // 4. Restore previous selection state
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
        if (!tagFilter) {
            console.warn('tagFilter element not found');
            return;
        }
        
        const selectedTag = tagFilter.value;
        console.log('Updating tag filter, current selection:', selectedTag);
        
        // Collect all unique tags from tweets
        const allTags = new Set();
        
        try {
            const metadata = this.getMetadataManager();
            if (metadata && typeof metadata.getTweetMetadata === 'function') {
                console.log('Checking', this.tweets.length, 'tweets for tags');
                this.tweets.forEach(tweet => {
                    try {
                        const tweetMetadata = metadata.getTweetMetadata(tweet);
                        if (tweetMetadata && tweetMetadata.tags) {
                            console.log('Tweet', tweet.id, 'has tags:', tweetMetadata.tags);
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

        console.log('Found unique tags:', Array.from(allTags));

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
        
        console.log('Tag filter updated, final value:', tagFilter.value);
    }

    updateCollectionFilter() {
        const collectionFilter = document.getElementById('collectionFilter');
        if (!collectionFilter) {
            console.warn('collectionFilter element not found');
            return;
        }
        
        const selectedCollection = collectionFilter.value;
        console.log('Updating collection filter, current selection:', selectedCollection);
        
        // Collect all unique collections from tweets
        const allCollections = new Set();
        
        try {
            const metadata = this.getMetadataManager();
            if (metadata && typeof metadata.getTweetMetadata === 'function') {
                console.log('Checking', this.tweets.length, 'tweets for collections');
                this.tweets.forEach(tweet => {
                    try {
                        const tweetMetadata = metadata.getTweetMetadata(tweet);
                        if (tweetMetadata && tweetMetadata.collection) {
                            console.log('Tweet', tweet.id, 'has collection:', tweetMetadata.collection);
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

        console.log('Found unique collections:', Array.from(allCollections));

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
        
        console.log('Collection filter updated, final value:', collectionFilter.value);
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

    // Update reload media button visibility
    updateReloadMediaButtonVisibility() {
        const reloadBtn = document.getElementById('reloadMediaBtn');
        const hasDataWithoutImages = this.tweets.length > 0 && 
                                   this.tweets.some(tweet => 
                                       (tweet.userAvatarUrl && !tweet.displayAvatarUrl) ||
                                       (tweet.media?.images?.length > 0 && tweet.displayImageUrls?.length === 0)
                                   );
        reloadBtn.style.display = hasDataWithoutImages ? 'inline-block' : 'none';
    }

    // Trigger file selection dialog
    triggerFileSelection() {
        const fileInput = document.getElementById('fileInput');
        fileInput.click();
    }



    // Restore filter UI state
    restoreFilterUI() {
        // Restore search box
        document.getElementById('searchBox').value = this.filters.searchQuery || '';
        
        // Restore content filters
        document.querySelectorAll('#content-filters .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === this.filters.content);
        });
        
        // Restore time filters
        document.querySelectorAll('#time-filters .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === this.filters.time);
        });
    }



    // Reload tweet media files
    async reloadMediaForTweets(files) {
        if (!files.length || !this.tweets.length) return;

        try {
            this.showLoading();
            
            // Update file mapping
            this.fileMap = new Map(Array.from(files).map(file => [file.webkitRelativePath, file]));
            
            // Re-parse media paths for each tweet
            for (let i = 0; i < this.tweets.length; i++) {
                const tweet = this.tweets[i];
                const updatedTweet = await this.resolveMediaPaths(tweet);
                this.tweets[i] = updatedTweet;
            }

            // Update UI
            this.applyFilters();
            this.updateReloadMediaButtonVisibility();
            
            this.showNotification('Images automatically reloaded');
            
        } catch (error) {
            console.error('Failed to reload images:', error);
            this.showNotification('Failed to reload images');
        }
    }
}

// Global functions
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

// Basic test logging
console.log('=== TWEET BROWSER SCRIPT LOADED ===');

// Bind modal event listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DOM CONTENT LOADED ===');
    browser = new TweetBrowser();
    window.tweetBrowser = browser; // Global access
    console.log('=== TWEET BROWSER INITIALIZED ===', browser);
    
    // Debug: Check if modal elements exist
    console.log('Modal elements check:', {
        modal: !!document.getElementById('modal'),
        modalTweetUser: !!document.getElementById('modalTweetUser'),
        modalTweetText: !!document.getElementById('modalTweetText'),
        modalTweetMedia: !!document.getElementById('modalTweetMedia'),
        modalTweetLink: !!document.getElementById('modalTweetLink'),
        modalCloseBtn: !!document.getElementById('modalCloseBtn')
    });
    
    // Modal close button
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    
    // Click outside modal to close
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') {
            closeModal();
        }
    });

    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}); 