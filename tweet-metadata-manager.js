/**
 * Tweet Metadata Manager
 * 
 * Handles tags, collections, and persistent storage for tweet metadata
 * This solves the browser limitation problem by storing metadata separately from files
 */

class TweetMetadataManager {
    constructor() {
        this.storageKey = 'tweetMetadata';
        this.metadata = this.loadMetadata();
        this.aiEngine = new AITagEngine();
        this.setupEventListeners();
    }

    /**
     * Load metadata from Chrome storage
     */
    loadMetadata() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? this.migrateMetadata(JSON.parse(stored)) : {
                tweets: {}, // tweetId -> { tags: [], collection: '', notes: '', favorite: false }
                collections: {
                    'favorites': { name: '⭐ Favorites', tweets: [] },
                    'important': { name: '🔥 Important', tweets: [] },
                    'read-later': { name: '📖 Read Later', tweets: [] }
                },
                tags: {
                    'ai': { count: 0, color: '#7c3aed' },
                    'crypto': { count: 0, color: '#ff922b' },
                    'entertainment': { count: 0, color: '#e64980' },
                    'others': { count: 0, color: '#51cf66' }
                } // tagName -> { count: number, color: string }
            };
        } catch (error) {
            console.error('Error loading metadata:', error);
            return { tweets: {}, collections: {}, tags: {} };
        }
    }

    /**
     * Repair metadata keys written by older versions.
     *
     * Keys used to come from `tweetUrl.split('/').pop()`, which kept any query
     * string attached ("123?s=20") and produced an empty string for URLs ending
     * in a slash. Fold the recoverable ones back onto the plain status id so
     * existing tags survive; quarantine rather than delete the rest.
     */
    migrateMetadata(metadata) {
        if (!metadata || typeof metadata !== 'object') return metadata;
        if (metadata.schemaVersion >= 2) return metadata;

        const tweets = metadata.tweets || {};
        const repaired = {};
        const orphaned = {};
        let mergedCount = 0;

        for (const [key, value] of Object.entries(tweets)) {
            // The empty key was a collision bucket holding tags from many
            // different tweets at once. There is no way to tell them apart, so
            // set it aside instead of silently mis-attributing it to one tweet.
            if (!key) {
                orphaned[''] = value;
                continue;
            }

            const match = key.match(/^(\d+)(?:[?#].*)?$/);
            const target = match ? match[1] : key;

            if (repaired[target]) {
                repaired[target] = this.mergeMetadataEntries(repaired[target], value);
                mergedCount++;
            } else {
                repaired[target] = value;
            }
        }

        metadata.tweets = repaired;
        if (Object.keys(orphaned).length > 0) {
            metadata.orphanedTweets = orphaned;
        }
        metadata.schemaVersion = 2;

        console.log('[MetadataManager] Migrated metadata keys to schema 2', {
            entries: Object.keys(repaired).length,
            merged: mergedCount,
            quarantined: Object.keys(orphaned).length
        });

        return metadata;
    }

    /**
     * Combine two metadata records that turned out to describe the same tweet
     */
    mergeMetadataEntries(a, b) {
        return {
            tags: [...new Set([...(a.tags || []), ...(b.tags || [])])],
            collection: a.collection || b.collection || '',
            notes: [a.notes, b.notes].filter(Boolean).join('\n') || '',
            favorite: Boolean(a.favorite || b.favorite),
            created: a.created || b.created || new Date().toISOString()
        };
    }

    /**
     * Save metadata to Chrome storage
     *
     * Returns false when the write failed. localStorage is capped at ~5MB and
     * throws QuotaExceededError once tags/notes accumulate past it; swallowing
     * that silently used to lose the user's tag with only a console line.
     */
    saveMetadata() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.metadata));
            this.notifyDataChange();
            return true;
        } catch (error) {
            console.error('Error saving metadata:', error);

            const isQuota = error && (
                error.name === 'QuotaExceededError' ||
                error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                error.code === 22
            );

            this.notifySaveFailure(isQuota
                ? '存储空间已满，标签未能保存。请先导出备份再清理部分数据。'
                : '标签保存失败，请重试。');

            return false;
        }
    }

    /**
     * Surface a save failure to the user rather than only to the console
     */
    notifySaveFailure(message) {
        try {
            if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
                window.showNotification(message);
                return;
            }
            if (typeof document !== 'undefined') {
                const area = document.getElementById('notificationArea');
                if (area) {
                    area.textContent = message;
                    area.style.display = 'block';
                    return;
                }
            }
            if (typeof alert === 'function') alert(message);
        } catch (error) {
            console.error('Failed to surface save failure:', error);
        }
    }

    /**
     * Generate unique tweet ID from tweet data
     */
    generateTweetId(tweetData) {
        const url = (tweetData && tweetData.tweetUrl) || '';

        // Pull the numeric status id out of the URL rather than taking the last
        // path segment. `split('/').pop()` kept tracking params ("123?s=20",
        // which then never matched the same tweet saved without them) and
        // returned an empty string for URLs ending in a slash — and an empty
        // key silently merged every such tweet's tags into one bucket.
        const status = url.match(/\/status(?:es)?\/(\d+)/);
        if (status) {
            return status[1];
        }

        // Fall back to a hash of the identifying fields. This used btoa(),
        // which throws InvalidCharacterError on anything outside Latin1 — so
        // every tweet from a user with a CJK or emoji display name aborted the
        // whole tagging operation instead of getting an id.
        const content = [
            (tweetData && tweetData.userName) || '',
            (tweetData && tweetData.userHandle) || '',
            (tweetData && tweetData.timestamp) || ''
        ].join('_');

        return `h${this.hashString(content)}`;
    }

    /**
     * FNV-1a over UTF-16 code units.
     *
     * Deterministic, ASCII-safe output, and total — it cannot throw on any
     * input, which is the property the previous btoa() call lacked.
     */
    hashString(input) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(36);
    }

    /**
     * Get metadata for a tweet
     */
    getTweetMetadata(tweetData) {
        const tweetId = this.generateTweetId(tweetData);
        return this.metadata.tweets[tweetId] || {
            tags: [],
            collection: '',
            notes: '',
            favorite: false,
            created: new Date().toISOString()
        };
    }

    /**
     * Add tag to tweet
     */
    addTagToTweet(tweetData, tagName) {
        const tweetId = this.generateTweetId(tweetData);
        const cleanTag = tagName.trim().toLowerCase();
        
        if (!cleanTag) return;

        // Initialize tweet metadata if not exists, preserving existing data
        if (!this.metadata.tweets[tweetId]) {
            this.metadata.tweets[tweetId] = {
                tags: [],
                collection: '',
                notes: '',
                favorite: false,
                created: new Date().toISOString()
            };
        }
        
        // Ensure tags array exists
        if (!this.metadata.tweets[tweetId].tags) {
            this.metadata.tweets[tweetId].tags = [];
        }

        // Add tag if not already exists
        if (!this.metadata.tweets[tweetId].tags.includes(cleanTag)) {
            this.metadata.tweets[tweetId].tags.push(cleanTag);
            
            // Update tag count
            if (!this.metadata.tags[cleanTag]) {
                this.metadata.tags[cleanTag] = {
                    count: 0,
                    color: this.generateTagColor()
                };
            }
            this.metadata.tags[cleanTag].count++;
        }

        this.saveMetadata();
        
        // Notify filters update
        this.notifyFiltersUpdate();
        
        return tweetId;
    }

    /**
     * Remove tag from tweet
     */
    removeTagFromTweet(tweetData, tagName) {
        const tweetId = this.generateTweetId(tweetData);
        const cleanTag = tagName.trim().toLowerCase();
        
        if (this.metadata.tweets[tweetId] && this.metadata.tweets[tweetId].tags) {
            const index = this.metadata.tweets[tweetId].tags.indexOf(cleanTag);
            if (index > -1) {
                this.metadata.tweets[tweetId].tags.splice(index, 1);
                
                // Update tag count
                if (this.metadata.tags[cleanTag]) {
                    this.metadata.tags[cleanTag].count--;
                    if (this.metadata.tags[cleanTag].count <= 0) {
                        delete this.metadata.tags[cleanTag];
                    }
                }
                
                this.saveMetadata();
            }
        }
    }

    /**
     * Add tweet to collection
     */
    addToCollection(tweetData, collectionId) {
        const tweetId = this.generateTweetId(tweetData);
        
        // Initialize tweet metadata if not exists
        if (!this.metadata.tweets[tweetId]) {
            this.metadata.tweets[tweetId] = {
                tags: [],
                collection: '',
                notes: '',
                favorite: false,
                created: new Date().toISOString()
            };
        }

        // Remove from previous collection
        const previousCollection = this.metadata.tweets[tweetId].collection;
        if (previousCollection && this.metadata.collections[previousCollection]) {
            const index = this.metadata.collections[previousCollection].tweets.indexOf(tweetId);
            if (index > -1) {
                this.metadata.collections[previousCollection].tweets.splice(index, 1);
            }
        }

        // Add to new collection
        this.metadata.tweets[tweetId].collection = collectionId;
        
        if (!this.metadata.collections[collectionId]) {
            this.metadata.collections[collectionId] = {
                name: collectionId,
                tweets: []
            };
        }
        
        if (!this.metadata.collections[collectionId].tweets.includes(tweetId)) {
            this.metadata.collections[collectionId].tweets.push(tweetId);
        }

        this.saveMetadata();
        
        // Notify filters update
        this.notifyFiltersUpdate();
        
        return tweetId;
    }

    /**
     * Remove tweet from collection
     */
    removeFromCollection(tweetData) {
        const tweetId = this.generateTweetId(tweetData);
        
        if (this.metadata.tweets[tweetId] && this.metadata.tweets[tweetId].collection) {
            const collectionId = this.metadata.tweets[tweetId].collection;
            
            // Remove from collection's tweets array
            if (this.metadata.collections[collectionId]) {
                const index = this.metadata.collections[collectionId].tweets.indexOf(tweetId);
                if (index > -1) {
                    this.metadata.collections[collectionId].tweets.splice(index, 1);
                }
            }
            
            // Clear collection from tweet metadata
            this.metadata.tweets[tweetId].collection = '';
            
            this.saveMetadata();
        }
    }

    /**
     * Create new collection
     */
    createCollection(name, icon = '📁') {
        const collectionId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        this.metadata.collections[collectionId] = {
            name: `${icon} ${name}`,
            tweets: []
        };
        this.saveMetadata();
        return collectionId;
    }

    /**
     * Get all collections with tweet counts
     */
    getCollections() {
        const collections = {};
        for (const [id, collection] of Object.entries(this.metadata.collections)) {
            collections[id] = {
                ...collection,
                count: collection.tweets.length
            };
        }
        return collections;
    }

    /**
     * Get all tags with counts
     */
    getTags() {
        return this.metadata.tags;
    }

    /**
     * Get all metadata (for export purposes)
     */
    getAllMetadata() {
        return this.metadata;
    }

    /**
     * Update tweet metadata (for import purposes)
     */
    updateTweetMetadata(tweetId, tweetData) {
        if (!this.metadata.tweets) {
            this.metadata.tweets = {};
        }
        this.metadata.tweets[tweetId] = tweetData;
        this.saveMetadata();
    }

    /**
     * Save to storage (alias for saveMetadata for backward compatibility)
     */
    saveToStorage() {
        this.saveMetadata();
    }

    /**
     * Generate AI tag suggestions for a tweet
     */
    async generateAITagSuggestions(tweetData) {
        try {
            const analysis = await this.aiEngine.analyzeTweet(tweetData);
            return analysis;
        } catch (error) {
            console.error('Error generating AI tag suggestions:', error);
            return { suggestions: [], confidence: 0 };
        }
    }

    /**
     * Apply AI-suggested tags with user confirmation
     */
    async suggestAndApplyTags(tweetData, autoApply = false) {
        const analysis = await this.generateAITagSuggestions(tweetData);
        
        if (analysis.suggestions.length === 0) {
            return { applied: [], suggested: [] };
        }

        const applied = [];
        const suggested = [];

        for (const suggestion of analysis.suggestions) {
            // Auto-apply high confidence tags if enabled
            if (autoApply && suggestion.confidence >= this.aiEngine.settings.auto_apply_threshold) {
                this.addTagToTweet(tweetData, suggestion.tag);
                applied.push(suggestion);
                
                // Learn from auto-application (considered as accepted)
                this.aiEngine.learnFromUserAction(tweetData, suggestion.tag, true);
            } else {
                suggested.push(suggestion);
            }
        }

        return { applied, suggested, analysis };
    }

    /**
     * Handle user feedback on AI suggestions
     */
    handleAISuggestionFeedback(tweetData, suggestion, accepted) {
        if (accepted) {
            this.addTagToTweet(tweetData, suggestion.tag);
        }
        
        // Learn from user feedback
        this.aiEngine.learnFromUserAction(tweetData, suggestion.tag, accepted);
    }

    /**
     * Generate random color for tags
     */
    generateTagColor() {
        const colors = [
            '#1d9bf0', '#794bc4', '#ff6b6b', '#51cf66', 
            '#ffd43b', '#ff922b', '#e64980', '#7c3aed'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Export metadata for backup
     */
    exportMetadata() {
        return {
            version: '1.0',
            exported: new Date().toISOString(),
            data: this.metadata
        };
    }

    /**
     * Import metadata from backup
     */
    importMetadata(data) {
        try {
            if (data.version === '1.0' && data.data) {
                this.metadata = data.data;
                this.saveMetadata();
                return true;
            }
        } catch (error) {
            console.error('Error importing metadata:', error);
        }
        return false;
    }

    /**
     * Setup event listeners for UI interactions
     */
    setupEventListeners() {
        // Modal tag input
        document.addEventListener('keydown', (e) => {
            if (e.target.id === 'tagInput' && e.key === 'Enter') {
                e.preventDefault();
                const tagName = e.target.value.trim();
                if (tagName && window.currentTweetData) {
                    this.addTagToTweet(window.currentTweetData, tagName);
                    e.target.value = '';
                    this.renderTweetTags(window.currentTweetData);
                }
            }
        });

        // Add tag button
        document.addEventListener('click', (e) => {
            console.log('Click detected on:', e.target.id, e.target);
            if (e.target.id === 'modalAddTag') {
                console.log('Add Tag button clicked!');
                const tagInput = document.getElementById('tagInput');
                if (!tagInput) {
                    console.warn('tagInput element not found');
                    return;
                }
                
                // Use getComputedStyle to correctly detect display state
                const computedStyle = window.getComputedStyle(tagInput);
                const isVisible = computedStyle.display !== 'none' && tagInput.style.display === 'block';
                
                tagInput.style.display = isVisible ? 'none' : 'block';
                
                if (!isVisible) {
                    // Show input box
                    console.log('Showing tag input');
                    setTimeout(() => tagInput.focus(), 50); // Delayed focus to ensure element is shown
                    this.showSuggestedTags();
                } else {
                    // Hide input box
                    console.log('Hiding tag input');
                    this.hideSuggestedTags();
                }
            }
        });

        // Add to collection button
        document.addEventListener('click', (e) => {
            if (e.target.id === 'modalAddToCollection') {
                this.showCollectionsPanel();
            }
        });

        // Collections panel
        document.addEventListener('click', (e) => {
            if (e.target.id === 'collectionsCloseBtn') {
                this.hideCollectionsPanel();
            }
            
            if (e.target.closest('.collection-item')) {
                const collectionId = e.target.closest('.collection-item').dataset.collection;
                if (window.currentTweetData && collectionId) {
                    this.addToCollection(window.currentTweetData, collectionId);
                    this.hideCollectionsPanel();
                    this.renderTweetCollections(window.currentTweetData);
                    this.renderCollectionsList();
                }
            }
        });

        // New collection input
        document.addEventListener('keydown', (e) => {
            if (e.target.id === 'newCollectionInput' && e.key === 'Enter') {
                e.preventDefault();
                const name = e.target.value.trim();
                if (name) {
                    const collectionId = this.createCollection(name);
                    e.target.value = '';
                    this.renderCollectionsList();
                    
                    // Add current tweet to new collection
                    if (window.currentTweetData) {
                        this.addToCollection(window.currentTweetData, collectionId);
                        this.hideCollectionsPanel();
                        this.renderTweetCollections(window.currentTweetData);
                    }
                }
            }
        });

        // Tag removal
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-tag')) {
                const tagName = e.target.dataset.tag;
                if (window.currentTweetData && tagName) {
                    this.removeTagFromTweet(window.currentTweetData, tagName);
                    this.renderTweetTags(window.currentTweetData);
                }
            }
        });

        // Collection removal
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-collection')) {
                if (window.currentTweetData) {
                    this.removeFromCollection(window.currentTweetData);
                    this.renderTweetCollections(window.currentTweetData);
                    this.renderCollectionsList();
                }
            }
        });

        // Export metadata
        document.addEventListener('click', (e) => {
            if (e.target.id === 'exportMetadata') {
                this.exportToFile();
            }
        });

        // Import metadata
        document.addEventListener('click', (e) => {
            if (e.target.id === 'importMetadata') {
                document.getElementById('importFile').click();
            }
        });

        // Handle file import
        document.addEventListener('change', (e) => {
            if (e.target.id === 'importFile') {
                const file = e.target.files[0];
                if (file) {
                    this.importFromFile(file);
                }
            }
        });
    }

    /**
     * Render tags for a tweet in modal
     */
    renderTweetTags(tweetData) {
        const container = document.getElementById('modalTweetTags');
        if (!container) return;

        const metadata = this.getTweetMetadata(tweetData);
        const tags = metadata.tags || [];

        container.innerHTML = tags.map(tag => {
            const tagInfo = this.metadata.tags[tag] || { color: '#1d9bf0' };
            return `
                <span class="tag" style="background: ${tagInfo.color}">
                    ${tag}
                    <span class="remove-tag" data-tag="${tag}">×</span>
                </span>
            `;
        }).join('');
    }

    /**
     * Render collection indicator for a tweet
     */
    renderTweetCollections(tweetData) {
        const container = document.getElementById('modalTweetCollections');
        if (!container) return;

        const metadata = this.getTweetMetadata(tweetData);
        const collection = metadata.collection;
        
        container.innerHTML = '';
        
        if (collection && this.metadata.collections[collection]) {
            const collectionName = this.metadata.collections[collection].name;
            container.innerHTML = `
                <div class="collection-indicator">
                    ${collectionName}
                    <span class="remove-collection" data-collection="${collection}">×</span>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div style="color: var(--text-secondary); font-style: italic;">
                    No collection assigned
                </div>
            `;
        }
    }

    /**
     * Show collections panel
     */
    showCollectionsPanel() {
        const panel = document.getElementById('collectionsPanel');
        if (panel) {
            panel.style.display = 'block';
            this.renderCollectionsList();
        }
    }

    /**
     * Hide collections panel
     */
    hideCollectionsPanel() {
        const panel = document.getElementById('collectionsPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    /**
     * Render collections list
     */
    renderCollectionsList() {
        const container = document.getElementById('collectionsList');
        if (!container) return;

        const collections = this.getCollections();
        container.innerHTML = Object.entries(collections).map(([id, collection]) => `
            <div class="collection-item" data-collection="${id}">
                <span>${collection.name}</span>
                <span>${collection.count} tweets</span>
            </div>
        `).join('');
    }

    /**
     * Notify about data changes (for external listeners)
     */
    notifyDataChange() {
        const event = new CustomEvent('metadataChanged', {
            detail: {
                tags: this.getTags(),
                collections: this.getCollections()
            }
        });
        document.dispatchEvent(event);
    }

    /**
     * Search tweets by tags or collection
     */
    searchTweets(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();

        for (const [tweetId, metadata] of Object.entries(this.metadata.tweets)) {
            // Search in tags
            if (metadata.tags.some(tag => tag.includes(lowerQuery))) {
                results.push({ tweetId, metadata, matchType: 'tag' });
            }
            
            // Search in collection
            if (metadata.collection && 
                this.metadata.collections[metadata.collection] &&
                this.metadata.collections[metadata.collection].name.toLowerCase().includes(lowerQuery)) {
                results.push({ tweetId, metadata, matchType: 'collection' });
            }
        }

        return results;
    }

    /**
     * Show suggested tags
     */
    showSuggestedTags() {
        const tagInput = document.getElementById('tagInput');
        if (!tagInput) return;

        let suggestedTagsContainer = document.getElementById('suggestedTags');
        if (!suggestedTagsContainer) {
            suggestedTagsContainer = document.createElement('div');
            suggestedTagsContainer.id = 'suggestedTags';
            suggestedTagsContainer.className = 'suggested-tags';
            tagInput.parentNode.insertBefore(suggestedTagsContainer, tagInput.nextSibling);
        }

        // Get all available tags
        const allTags = Object.keys(this.metadata.tags);
        const currentTweetTags = window.currentTweetData ? 
            this.getTweetMetadata(window.currentTweetData).tags : [];
        
        // Show only tags not already assigned to current tweet
        const availableTags = allTags.filter(tag => !currentTweetTags.includes(tag));

        suggestedTagsContainer.innerHTML = availableTags.map(tag => {
            const tagInfo = this.metadata.tags[tag];
            return `
                <span class="suggested-tag" data-tag="${tag}" style="background: ${tagInfo.color}">
                    ${tag} (${tagInfo.count})
                </span>
            `;
        }).join('');

        suggestedTagsContainer.style.display = 'block';

        // Add click handlers for suggested tags
        suggestedTagsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggested-tag')) {
                const tagName = e.target.dataset.tag;
                if (window.currentTweetData && tagName) {
                    this.addTagToTweet(window.currentTweetData, tagName);
                    this.renderTweetTags(window.currentTweetData);
                    this.hideSuggestedTags();
                }
            }
        });
    }

    /**
     * Hide suggested tags
     */
    hideSuggestedTags() {
        const suggestedTagsContainer = document.getElementById('suggestedTags');
        if (suggestedTagsContainer) {
            suggestedTagsContainer.style.display = 'none';
        }
    }

    /**
     * Export metadata to file
     */
    exportToFile() {
        const data = this.exportMetadata();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `tweet-metadata-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Import metadata from file
     */
    importFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (this.importMetadata(data)) {
                    alert('Metadata imported successfully!');
                    // Refresh any displayed data
                    this.notifyDataChange();
                } else {
                    alert('Failed to import metadata. Please check the file format.');
                }
            } catch (error) {
                alert('Failed to parse the file. Please ensure it\'s a valid JSON file.');
            }
        };
        reader.readAsText(file);
    }

    /**
     * Notify filters update
     */
    notifyFiltersUpdate() {
        console.log('Notifying filters update');
        
        // Delayed execution to ensure DOM updates complete
        setTimeout(() => {
            if (window.tweetBrowser && typeof window.tweetBrowser.updateTagFilter === 'function') {
                console.log('Updating tag filter via tweetBrowser');
                window.tweetBrowser.updateTagFilter();
            }
            
            if (window.tweetBrowser && typeof window.tweetBrowser.updateCollectionFilter === 'function') {
                console.log('Updating collection filter via tweetBrowser');
                window.tweetBrowser.updateCollectionFilter();
            }
            
            // Try direct method calls if in same context
            if (typeof updateTagFilter === 'function') {
                console.log('Updating tag filter directly');
                updateTagFilter();
            }
            if (typeof updateCollectionFilter === 'function') {
                console.log('Updating collection filter directly');
                updateCollectionFilter();
            }
        }, 50);
    }
}

// Basic test logging
console.log('=== TWEET METADATA MANAGER SCRIPT LOADED ===');

// Initialize the metadata manager when the page loads
let metadataManager;
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== METADATA MANAGER DOM CONTENT LOADED ===');
    metadataManager = new TweetMetadataManager();
    
    // Make it globally available
    window.metadataManager = metadataManager;
    window.tweetMetadataManager = metadataManager; // backward compatibility
    
    console.log('=== TWEET METADATA MANAGER INITIALIZED ===', metadataManager);
});