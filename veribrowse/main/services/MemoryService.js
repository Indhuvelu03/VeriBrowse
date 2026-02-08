/**
    * MemoryService - Persistent Memory Storage
 * 
 * Responsibilities:
 * - Store browsing interactions
 * - Store AI summaries and insights
 * - Store user preferences and context
 * - Provide memory retrieval for RAG (Retrieval-Augmented Generation)
 * 
 * Storage: memory.json
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { pipeline } from '@xenova/transformers';

class MemoryService {
    constructor() {
        this.embedder = null;
        this.memoryStore = new Map();
        this._initialized = false;

        // Default empty memory structure
        this.memory = {
            interactions: [],
            summaries: [],
            insights: [],
            preferences: {},
            metadata: {
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            }
        };

        // Set memoryFile path (deferred until app is ready)
        this.memoryFile = null;
    }

    /**
     * Ensure memory is initialized (lazy init, safe to call multiple times)
     */
    _ensureInit() {
        if (this._initialized) return;
        try {
            if (!this.memoryFile) {
                const userDataPath = app.getPath('userData');
                this.memoryFile = path.join(userDataPath, 'memory', 'memory.json');
            }
            this.initialize();
            this._initialized = true;
        } catch (err) {
            console.warn('[MemoryService] Lazy init failed (app may not be ready yet):', err.message);
        }
    }

    /**
     * Initialize memory storage
     */
    initialize() {
        if (!this.memoryFile) {
            const userDataPath = app.getPath('userData');
            this.memoryFile = path.join(userDataPath, 'memory', 'memory.json');
        }
        const storageDir = path.dirname(this.memoryFile);
        
        // Ensure storage directory exists
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }

        // Load existing memory or create new
        if (fs.existsSync(this.memoryFile)) {
            try {
                const data = fs.readFileSync(this.memoryFile, 'utf8');
                this.memory = JSON.parse(data);
            } catch (error) {
                console.error('[MemoryService] Error loading memory:', error);
                this.save(); // Save fresh memory
            }
        } else {
            this.save();
        }
    }

    /**
     * Save memory to disk
     */
    save() {
        try {
            if (!this.memoryFile) return; // not initialized yet
            if (!this.memory) return;
            this.memory.metadata.lastUpdated = new Date().toISOString();
            fs.writeFileSync(this.memoryFile, JSON.stringify(this.memory, null, 2), 'utf8');
        } catch (error) {
            console.error('[MemoryService] Error saving memory:', error);
        }
    }

    /**
     * Store an interaction
     * @param {Object} interaction - { type, prompt, response, url, timestamp }
     */
    storeInteraction(interaction) {
        this._ensureInit();
        const entry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            ...interaction
        };

        this.memory.interactions.push(entry);

        // Keep only last 1000 interactions
        if (this.memory.interactions.length > 1000) {
            this.memory.interactions = this.memory.interactions.slice(-1000);
        }

        this.save();
        return entry;
    }

    /**
     * Store a summary
     * @param {Object} summary - { url, title, content, tags }
     */
    storeSummary(summary) {
        const entry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            ...summary
        };

        this.memory.summaries.push(entry);

        // Keep only last 500 summaries
        if (this.memory.summaries.length > 500) {
            this.memory.summaries = this.memory.summaries.slice(-500);
        }

        this.save();
        return entry;
    }

    /**
     * Store an insight or learned pattern
     * @param {Object} insight - { topic, content, relevance }
     */
    storeInsight(insight) {
        const entry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            ...insight
        };

        this.memory.insights.push(entry);

        // Keep only last 200 insights
        if (this.memory.insights.length > 200) {
            this.memory.insights = this.memory.insights.slice(-200);
        }

        this.save();
        return entry;
    }

    /**
     * Get recent interactions
     * @param {Number} limit - Number of interactions to retrieve
     * @returns {Array} - Recent interactions
     */
    getRecentInteractions(limit = 10) {
        this._ensureInit();
        if (!this.memory || !Array.isArray(this.memory.interactions)) return [];
        return this.memory.interactions
            .slice(-limit)
            .reverse();
    }

    /**
     * Search interactions by query
     * @param {String} query - Search query
     * @param {Number} limit - Max results
     * @returns {Array} - Matching interactions
     */
    searchInteractions(query, limit = 10) {
        const lowerQuery = query.toLowerCase();
        
        return this.memory.interactions
            .filter(interaction => {
                const prompt = (interaction.prompt || '').toLowerCase();
                const response = (interaction.response || '').toLowerCase();
                const url = (interaction.url || '').toLowerCase();
                
                return prompt.includes(lowerQuery) || 
                       response.includes(lowerQuery) || 
                       url.includes(lowerQuery);
            })
            .slice(-limit)
            .reverse();
    }

    /**
     * Get summaries by URL or keyword
     * @param {String} query - Search query
     * @param {Number} limit - Max results
     * @returns {Array} - Matching summaries
     */
    searchSummaries(query, limit = 10) {
        const lowerQuery = query.toLowerCase();
        
        return this.memory.summaries
            .filter(summary => {
                const title = (summary.title || '').toLowerCase();
                const content = (summary.content || '').toLowerCase();
                const url = (summary.url || '').toLowerCase();
                const tags = (summary.tags || []).join(' ').toLowerCase();
                
                return title.includes(lowerQuery) || 
                       content.includes(lowerQuery) || 
                       url.includes(lowerQuery) ||
                       tags.includes(lowerQuery);
            })
            .slice(-limit)
            .reverse();
    }

    /**
     * Get relevant context for RAG (Retrieval-Augmented Generation)
     * @param {String} query - User query
     * @param {Number} limit - Max items to return
     * @returns {Object} - Relevant context { interactions, summaries, insights }
     */
    getRelevantContext(query, limit = 5) {
        this._ensureInit();
        return {
            interactions: this.searchInteractions(query, limit),
            summaries: this.searchSummaries(query, limit),
            insights: this.searchInsights(query, limit)
        };
    }

    /**
     * Search insights
     * @param {String} query - Search query
     * @param {Number} limit - Max results
     * @returns {Array} - Matching insights
     */
    searchInsights(query, limit = 5) {
        const lowerQuery = query.toLowerCase();
        
        return this.memory.insights
            .filter(insight => {
                const topic = (insight.topic || '').toLowerCase();
                const content = (insight.content || '').toLowerCase();
                
                return topic.includes(lowerQuery) || content.includes(lowerQuery);
            })
            .slice(-limit)
            .reverse();
    }

    /**
     * Set user preference
     * @param {String} key - Preference key
     * @param {*} value - Preference value
     */
    setPreference(key, value) {
        this.memory.preferences[key] = value;
        this.save();
    }

    /**
     * Get user preference
     * @param {String} key - Preference key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} - Preference value
     */
    getPreference(key, defaultValue = null) {
        return this.memory.preferences[key] ?? defaultValue;
    }

    /**
     * Get all preferences
     * @returns {Object} - All preferences
     */
    getAllPreferences() {
        return { ...this.memory.preferences };
    }

    /**
     * Clear all memory (careful!)
     */
    clearAll() {
        this.memory = {
            interactions: [],
            summaries: [],
            insights: [],
            preferences: {},
            metadata: {
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            }
        };
        this.save();
    }

    /**
     * Clear specific memory type
     * @param {String} type - Memory type ('interactions', 'summaries', 'insights')
     */
    clear(type) {
        if (type in this.memory && Array.isArray(this.memory[type])) {
            this.memory[type] = [];
            this.save();
        }
    }

    /**
     * Get memory statistics
     * @returns {Object} - Memory stats
     */
    getStats() {
        return {
            interactions: this.memory.interactions.length,
            summaries: this.memory.summaries.length,
            insights: this.memory.insights.length,
            preferences: Object.keys(this.memory.preferences).length,
            created: this.memory.metadata.created,
            lastUpdated: this.memory.metadata.lastUpdated,
            fileSize: this.getFileSize()
        };
    }

    /**
     * Get memory file size
     * @returns {Number} - File size in bytes
     */
    getFileSize() {
        try {
            if (fs.existsSync(this.memoryFile)) {
                const stats = fs.statSync(this.memoryFile);
                return stats.size;
            }
        } catch (error) {
            console.error('[MemoryService] Error getting file size:', error);
        }
        return 0;
    }

    /**
     * Export memory to file
     * @param {String} format - Export format ('json')
     * @returns {Object} - Export result
     */
    export(format = 'json') {
        try {
            const exportDir = path.join(app.getPath('userData'), 'exports');
            
            if (!fs.existsSync(exportDir)) {
                fs.mkdirSync(exportDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `memory_export_${timestamp}.${format}`;
            const filePath = path.join(exportDir, fileName);

            if (format === 'json') {
                fs.writeFileSync(filePath, JSON.stringify(this.memory, null, 2), 'utf8');
            } else {
                throw new Error(`Unsupported export format: ${format}`);
            }

            return {
                success: true,
                filePath,
                fileName
            };
        } catch (error) {
            console.error('[MemoryService] Export error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Import memory from file
     * @param {String} filePath - Path to import file
     * @returns {Object} - Import result
     */
    import(filePath) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const imported = JSON.parse(data);

            // Validate structure
            if (!imported.interactions || !imported.summaries || !imported.insights) {
                throw new Error('Invalid memory file structure');
            }

            this.memory = imported;
            this.save();

            return {
                success: true,
                message: 'Memory imported successfully'
            };
        } catch (error) {
            console.error('[MemoryService] Import error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate embedding for text
     * @param {String} text - Text to embed
     * @returns {Array} - Embedding vector
     */
    async generateEmbedding(text) {
        try {
            // Lazy-load the MiniLM embedding model on first use
            if (!this.embedder) {
                console.log('[MemoryService] Loading MiniLM embedding model...');
                this.embedder = await pipeline(
                    'feature-extraction',
                    'Xenova/all-MiniLM-L6-v2'
                );
                console.log('[MemoryService] MiniLM model loaded.');
            }

            const output = await this.embedder(text, {
                pooling: 'mean',
                normalize: true,
            });

            return Array.from(output.data);
        } catch (error) {
            console.error('Embedding generation error:', error);
            throw error;
        }
    }

    /**
     * Calculate cosine similarity
     * @param {Array} vecA - First vector
     * @param {Array} vecB - Second vector
     * @returns {Number} - Similarity score
     */
    cosineSimilarity(vecA, vecB) {
        const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
        const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
        const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
        return dotProduct / (magnitudeA * magnitudeB);
    }

    /**
     * Store memory
     * @param {String} sessionId - Session ID
     * @param {String} text - Text to store
     * @param {Object} metadata - Additional metadata
     * @returns {String} - Memory ID
     */
    async storeMemory(sessionId, text, metadata = {}) {
        const embedding = await this.generateEmbedding(text);
        const memory = {
            id: `${sessionId}_${Date.now()}`,
            text,
            embedding,
            metadata,
            timestamp: Date.now(),
        };

        if (!this.memoryStore.has(sessionId)) {
            this.memoryStore.set(sessionId, []);
        }
        this.memoryStore.get(sessionId).push(memory);
        return memory.id;
    }

    /**
     * Search memory
     * @param {String} sessionId - Session ID
     * @param {String} query - Search query
     * @param {Number} topK - Max results
     * @returns {Array} - Scored memories
     */
    async searchMemory(sessionId, query, topK = 5) {
        const queryEmbedding = await this.generateEmbedding(query);
        const memories = this.memoryStore.get(sessionId) || [];

        const scoredMemories = memories.map(memory => ({
            ...memory,
            score: this.cosineSimilarity(queryEmbedding, memory.embedding),
        }));

        scoredMemories.sort((a, b) => b.score - a.score);
        return scoredMemories.slice(0, topK);
    }

    /**
     * Clear memory
     * @param {String} sessionId - Session ID
     */
    clearMemory(sessionId) {
        this.memoryStore.delete(sessionId);
    }

    /**
     * Get all memories
     * @param {String} sessionId - Session ID
     * @returns {Array} - All memories
     */
    getAllMemories(sessionId) {
        return this.memoryStore.get(sessionId) || [];
    }
}

export default new MemoryService();
