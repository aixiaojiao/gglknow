/**
 * AI Tag Engine for GglKnow
 * 
 * Intelligent auto-tagging system with multiple layers:
 * 1. Rule-based keyword matching
 * 2. Pattern recognition 
 * 3. User behavior learning
 * 4. Context analysis
 */

class AITagEngine {
    constructor() {
        this.storageKey = 'aiTagEngine';
        this.loadSettings();
        this.initializeRules();
        this.userPatterns = this.loadUserPatterns();
    }

    /**
     * Load AI engine settings
     */
    loadSettings() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            this.settings = stored ? JSON.parse(stored) : {
                enabled: true,
                confidence_threshold: 0.6,
                max_suggestions: 5,
                learn_from_user: true,
                auto_apply_threshold: 0.9
            };
        } catch (error) {
            console.error('Error loading AI settings:', error);
            this.settings = { enabled: true, confidence_threshold: 0.6, max_suggestions: 5 };
        }
    }

    /**
     * Save settings
     */
    saveSettings() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    }

    /**
     * Load user learned patterns
     */
    loadUserPatterns() {
        try {
            const stored = localStorage.getItem('aiTagPatterns');
            return stored ? JSON.parse(stored) : {
                authorTags: {}, // author -> frequently used tags
                keywordTags: {}, // keyword -> user confirmed tags
                domainTags: {} // domain -> associated tags
            };
        } catch (error) {
            console.error('Error loading user patterns:', error);
            return { authorTags: {}, keywordTags: {}, domainTags: {} };
        }
    }

    /**
     * Save user patterns
     */
    saveUserPatterns() {
        localStorage.setItem('aiTagPatterns', JSON.stringify(this.userPatterns));
    }

    /**
     * Initialize tagging rules
     */
    initializeRules() {
        // Keyword-based rules with confidence scores
        this.rules = {
            // Technology & Programming
            'tech': {
                keywords: ['javascript', 'python', 'react', 'nodejs', 'typescript', 'api', 'database', 'framework', 'library', 'code', 'programming', 'developer', 'software', 'web development'],
                confidence: 0.8,
                color: '#007acc'
            },
            'ai': {
                keywords: ['artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'chatgpt', 'openai', 'claude', 'llm', 'model', 'algorithm', 'automation', 'ai'],
                confidence: 0.9,
                color: '#7c3aed'
            },
            
            // Finance & Business
            'crypto': {
                keywords: ['bitcoin', 'ethereum', 'blockchain', 'cryptocurrency', 'defi', 'nft', 'web3', 'smart contract', 'mining', 'wallet', 'exchange'],
                confidence: 0.9,
                color: '#ff922b'
            },
            'business': {
                keywords: ['startup', 'entrepreneur', 'investment', 'funding', 'revenue', 'marketing', 'strategy', 'growth', 'management', 'leadership'],
                confidence: 0.7,
                color: '#28a745'
            },
            
            // Content Types
            'tutorial': {
                keywords: ['how to', 'tutorial', 'guide', 'step by step', 'learn', 'beginner', 'example', 'walkthrough'],
                confidence: 0.8,
                color: '#17a2b8'
            },
            'news': {
                keywords: ['breaking', 'announced', 'released', 'update', 'new version', 'launch', 'official'],
                confidence: 0.7,
                color: '#dc3545'
            },
            'thread': {
                patterns: ['🧵', '1/', '👇', 'thread'],
                confidence: 0.9,
                color: '#6f42c1'
            },
            
            // Media & Entertainment
            'entertainment': {
                keywords: ['movie', 'film', 'music', 'game', 'gaming', 'netflix', 'youtube', 'streaming', 'entertainment'],
                confidence: 0.7,
                color: '#e64980'
            },
            
            // Science & Research
            'science': {
                keywords: ['research', 'study', 'paper', 'journal', 'experiment', 'data', 'analysis', 'scientific'],
                confidence: 0.8,
                color: '#20c997'
            },

            // Social & Opinion
            'opinion': {
                patterns: ['i think', 'in my opinion', 'personally', 'hot take', 'unpopular opinion'],
                confidence: 0.6,
                color: '#fd7e14'
            },
            'question': {
                patterns: ['?', 'what do you think', 'any thoughts', 'help me', 'does anyone'],
                confidence: 0.7,
                color: '#6610f2'
            }
        };

        // Domain-based rules
        this.domainRules = {
            'github.com': ['tech', 'open-source'],
            'youtube.com': ['video', 'entertainment'],
            'arxiv.org': ['research', 'science'],
            'medium.com': ['article', 'blog'],
            'stackoverflow.com': ['tech', 'programming'],
            'linkedin.com': ['business', 'career']
        };
    }

    /**
     * Analyze tweet content and suggest tags
     */
    async analyzeTweet(tweetData) {
        if (!this.settings.enabled) {
            return { suggestions: [], confidence: 0 };
        }

        const suggestions = [];
        const text = this.extractAnalyzableText(tweetData);
        
        // 1. Rule-based analysis
        const ruleResults = this.applyRules(text, tweetData);
        suggestions.push(...ruleResults);

        // 2. User pattern matching
        const patternResults = this.matchUserPatterns(text, tweetData);
        suggestions.push(...patternResults);

        // 3. Context analysis (links, mentions, etc.)
        const contextResults = this.analyzeContext(tweetData);
        suggestions.push(...contextResults);

        // 4. Content structure analysis
        const structureResults = this.analyzeStructure(text, tweetData);
        suggestions.push(...structureResults);

        // Deduplicate and sort by confidence
        const uniqueSuggestions = this.deduplicateAndRank(suggestions);
        
        return {
            suggestions: uniqueSuggestions.slice(0, this.settings.max_suggestions),
            confidence: uniqueSuggestions.length > 0 ? uniqueSuggestions[0].confidence : 0,
            analysis: {
                textLength: text.length,
                hasLinks: this.hasLinks(tweetData),
                hasMedia: this.hasMedia(tweetData),
                isReply: this.isReply(tweetData),
                isThread: this.isThread(text)
            }
        };
    }

    /**
     * Extract analyzable text from tweet data
     */
    extractAnalyzableText(tweetData) {
        let text = '';
        
        // Main tweet text
        if (tweetData.tweetText) {
            text += tweetData.tweetText + ' ';
        }
        
        // User bio or description if available
        if (tweetData.userBio) {
            text += tweetData.userBio + ' ';
        }

        return text.toLowerCase();
    }

    /**
     * Apply rule-based tagging
     */
    applyRules(text, tweetData) {
        const results = [];

        for (const [tag, rule] of Object.entries(this.rules)) {
            let matches = 0;
            let totalChecks = 0;

            // Check keywords
            if (rule.keywords) {
                for (const keyword of rule.keywords) {
                    totalChecks++;
                    if (text.includes(keyword.toLowerCase())) {
                        matches++;
                    }
                }
            }

            // Check patterns
            if (rule.patterns) {
                for (const pattern of rule.patterns) {
                    totalChecks++;
                    if (text.includes(pattern.toLowerCase())) {
                        matches += 2; // Patterns are more specific
                    }
                }
            }

            // Calculate confidence based on matches
            if (matches > 0) {
                const matchRatio = matches / totalChecks;
                const confidence = Math.min(rule.confidence * matchRatio * 1.5, 1.0);
                
                if (confidence >= this.settings.confidence_threshold) {
                    results.push({
                        tag,
                        confidence,
                        reason: `Matched ${matches} keywords/patterns`,
                        color: rule.color || this.generateTagColor(),
                        source: 'rules'
                    });
                }
            }
        }

        return results;
    }

    /**
     * Match against learned user patterns
     */
    matchUserPatterns(text, tweetData) {
        const results = [];

        // Check author patterns
        const author = tweetData.userHandle || tweetData.userName;
        if (author && this.userPatterns.authorTags[author]) {
            const authorTags = this.userPatterns.authorTags[author];
            for (const [tag, frequency] of Object.entries(authorTags)) {
                if (frequency >= 3) { // Used at least 3 times for this author
                    results.push({
                        tag,
                        confidence: Math.min(frequency / 10, 0.9),
                        reason: `You often tag @${author} with this`,
                        source: 'user-pattern'
                    });
                }
            }
        }

        // Check keyword patterns
        for (const [keyword, tags] of Object.entries(this.userPatterns.keywordTags)) {
            if (text.includes(keyword)) {
                for (const [tag, confidence] of Object.entries(tags)) {
                    results.push({
                        tag,
                        confidence: Math.min(confidence, 0.8),
                        reason: `You usually tag "${keyword}" content with this`,
                        source: 'user-keyword'
                    });
                }
            }
        }

        return results;
    }

    /**
     * Analyze tweet context (links, media, etc.)
     */
    analyzeContext(tweetData) {
        const results = [];

        // Analyze links
        if (tweetData.tweetText) {
            const links = this.extractLinks(tweetData.tweetText);
            for (const link of links) {
                const domain = this.extractDomain(link);
                if (this.domainRules[domain]) {
                    for (const tag of this.domainRules[domain]) {
                        results.push({
                            tag,
                            confidence: 0.8,
                            reason: `Contains link to ${domain}`,
                            source: 'context'
                        });
                    }
                }

                // Check user learned domain patterns
                if (this.userPatterns.domainTags[domain]) {
                    for (const [tag, confidence] of Object.entries(this.userPatterns.domainTags[domain])) {
                        results.push({
                            tag,
                            confidence: Math.min(confidence, 0.7),
                            reason: `You often tag ${domain} links with this`,
                            source: 'user-domain'
                        });
                    }
                }
            }
        }

        // Media analysis
        if (this.hasMedia(tweetData)) {
            results.push({
                tag: 'media',
                confidence: 0.6,
                reason: 'Contains images or videos',
                source: 'context'
            });
        }

        return results;
    }

    /**
     * Analyze tweet structure
     */
    analyzeStructure(text, tweetData) {
        const results = [];

        // Thread detection
        if (this.isThread(text)) {
            results.push({
                tag: 'thread',
                confidence: 0.9,
                reason: 'Appears to be a thread',
                source: 'structure'
            });
        }

        // Long-form content
        if (text.length > 200) {
            results.push({
                tag: 'long-read',
                confidence: 0.7,
                reason: 'Long-form content',
                source: 'structure'
            });
        }

        // Question detection
        if (text.includes('?')) {
            results.push({
                tag: 'question',
                confidence: 0.6,
                reason: 'Contains questions',
                source: 'structure'
            });
        }

        return results;
    }

    /**
     * Deduplicate and rank suggestions
     */
    deduplicateAndRank(suggestions) {
        const tagMap = {};
        
        // Combine suggestions for same tag
        for (const suggestion of suggestions) {
            if (!tagMap[suggestion.tag]) {
                tagMap[suggestion.tag] = suggestion;
            } else {
                // Take the one with higher confidence
                if (suggestion.confidence > tagMap[suggestion.tag].confidence) {
                    tagMap[suggestion.tag] = suggestion;
                }
            }
        }

        // Sort by confidence
        return Object.values(tagMap).sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Learn from user feedback
     */
    learnFromUserAction(tweetData, suggestedTag, userAccepted) {
        if (!this.settings.learn_from_user) return;

        const text = this.extractAnalyzableText(tweetData);
        const author = tweetData.userHandle || tweetData.userName;

        // Learn author patterns
        if (author) {
            if (!this.userPatterns.authorTags[author]) {
                this.userPatterns.authorTags[author] = {};
            }
            
            if (userAccepted) {
                this.userPatterns.authorTags[author][suggestedTag] = 
                    (this.userPatterns.authorTags[author][suggestedTag] || 0) + 1;
            } else {
                // Negative feedback - reduce confidence
                this.userPatterns.authorTags[author][suggestedTag] = 
                    Math.max((this.userPatterns.authorTags[author][suggestedTag] || 0) - 0.5, 0);
            }
        }

        // Learn from keywords
        const keywords = this.extractKeywords(text);
        for (const keyword of keywords) {
            if (!this.userPatterns.keywordTags[keyword]) {
                this.userPatterns.keywordTags[keyword] = {};
            }
            
            if (userAccepted) {
                this.userPatterns.keywordTags[keyword][suggestedTag] = 
                    Math.min((this.userPatterns.keywordTags[keyword][suggestedTag] || 0) + 0.1, 1.0);
            } else {
                this.userPatterns.keywordTags[keyword][suggestedTag] = 
                    Math.max((this.userPatterns.keywordTags[keyword][suggestedTag] || 0) - 0.1, 0);
            }
        }

        // Learn from domains
        const links = this.extractLinks(tweetData.tweetText || '');
        for (const link of links) {
            const domain = this.extractDomain(link);
            if (domain) {
                if (!this.userPatterns.domainTags[domain]) {
                    this.userPatterns.domainTags[domain] = {};
                }
                
                if (userAccepted) {
                    this.userPatterns.domainTags[domain][suggestedTag] = 
                        Math.min((this.userPatterns.domainTags[domain][suggestedTag] || 0) + 0.2, 1.0);
                }
            }
        }

        this.saveUserPatterns();
    }

    /**
     * Helper methods
     */
    extractLinks(text) {
        const urlRegex = /https?:\/\/[^\s]+/g;
        return text.match(urlRegex) || [];
    }

    extractDomain(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return null;
        }
    }

    extractKeywords(text) {
        // Simple keyword extraction - can be improved
        return text
            .split(/\s+/)
            .filter(word => word.length > 3 && !this.isStopWord(word))
            .slice(0, 10);
    }

    isStopWord(word) {
        const stopWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'man', 'may', 'she', 'use', 'her', 'here', 'they', 'this', 'that', 'with', 'have', 'from', 'will', 'been', 'said', 'each', 'which', 'their', 'time', 'about', 'would', 'there', 'could', 'other', 'after', 'first', 'never', 'these', 'think', 'where', 'being', 'every', 'great', 'might', 'shall', 'still', 'those', 'under', 'while'];
        return stopWords.includes(word.toLowerCase());
    }

    hasLinks(tweetData) {
        return (tweetData.tweetText && tweetData.tweetText.includes('http')) || false;
    }

    hasMedia(tweetData) {
        return (tweetData.images && tweetData.images.length > 0) || 
               (tweetData.videos && tweetData.videos.length > 0) || false;
    }

    isReply(tweetData) {
        return (tweetData.tweetText && tweetData.tweetText.startsWith('@')) || false;
    }

    isThread(text) {
        const threadIndicators = ['🧵', '1/', '👇', 'thread', '/end'];
        return threadIndicators.some(indicator => text.includes(indicator));
    }

    generateTagColor() {
        const colors = [
            '#1d9bf0', '#794bc4', '#ff6b6b', '#51cf66', 
            '#ffd43b', '#ff922b', '#e64980', '#7c3aed',
            '#20c997', '#fd7e14', '#6610f2', '#dc3545'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Get AI engine statistics
     */
    getStats() {
        return {
            totalPatterns: Object.keys(this.userPatterns.authorTags).length + 
                          Object.keys(this.userPatterns.keywordTags).length + 
                          Object.keys(this.userPatterns.domainTags).length,
            rulesCount: Object.keys(this.rules).length,
            settings: this.settings
        };
    }

    /**
     * Reset learned patterns
     */
    resetLearning() {
        this.userPatterns = { authorTags: {}, keywordTags: {}, domainTags: {} };
        this.saveUserPatterns();
    }

    /**
     * Update settings
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }
}

// Export for use in other modules
window.AITagEngine = AITagEngine;