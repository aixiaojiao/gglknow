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
        this.setupEventListeners();
    }

    /**
     * Load metadata from Chrome storage
     */
    loadMetadata() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {
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
     * Save metadata to Chrome storage
     */
    saveMetadata() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.metadata));
            this.notifyDataChange();
        } catch (error) {
            console.error('Error saving metadata:', error);
        }
    }

    /**
     * Generate unique tweet ID from tweet data
     */
    generateTweetId(tweetData) {
        // Use URL if available, otherwise create hash from content
        if (tweetData.tweetUrl) {
            return tweetData.tweetUrl.split('/').pop();
        }
        
        // Create simple hash from user and timestamp
        const content = `${tweetData.userName}_${tweetData.userHandle}_${tweetData.timestamp}`;
        return btoa(content).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
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
        return tweetId;
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
            if (e.target.id === 'modalAddTag') {
                const tagInput = document.getElementById('tagInput');
                const isVisible = tagInput.style.display === 'block';
                tagInput.style.display = isVisible ? 'none' : 'block';
                if (!isVisible) {
                    tagInput.focus();
                    this.showSuggestedTags();
                } else {
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
        const metadata = this.getTweetMetadata(tweetData);
        const collection = metadata.collection;
        
        if (collection && this.metadata.collections[collection]) {
            const collectionName = this.metadata.collections[collection].name;
            const indicator = document.createElement('div');
            indicator.className = 'collection-indicator';
            indicator.innerHTML = `📁 ${collectionName}`;
            
            const container = document.getElementById('modalTweetTags');
            if (container) {
                container.appendChild(indicator);
            }
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
}

// Initialize the metadata manager when the page loads
let metadataManager;
document.addEventListener('DOMContentLoaded', () => {
    metadataManager = new TweetMetadataManager();
    
    // Make it globally available
    window.metadataManager = metadataManager;
    
    console.log('Tweet Metadata Manager initialized');
});