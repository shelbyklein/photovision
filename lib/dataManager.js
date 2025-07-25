// PhotoVision Data Manager
// Handles JSON file-based data storage operations

const fs = require('fs/promises');
const path = require('path');
const CryptoUtils = require('./cryptoUtils');
const AlbumDataManager = require('./albumDataManager');

class DataManager {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.imagesFile = path.join(this.dataDir, 'images.json');
        this.configFile = path.join(this.dataDir, 'config.json');
        this.albumPreviewsFile = path.join(this.dataDir, 'albumPreviews.json');
        
        // In-memory cache for performance optimization
        this.cache = {
            images: null,
            imagesTimestamp: null,
            config: null,
            configTimestamp: null,
            albumPreviews: null,
            albumPreviewsTimestamp: null
        };
        
        // Initialize crypto utilities
        this.cryptoUtils = new CryptoUtils();
        
        // Album data manager for album-based storage
        this.albumDataManager = null;
        this.storageMode = 'single'; // 'single' or 'album'
        this.initialized = false;
    }

    // Check if file has changed since last cache
    async isFileCacheValid(filename, cacheTimestamp) {
        try {
            const filePath = path.join(this.dataDir, filename);
            const stats = await fs.stat(filePath);
            return cacheTimestamp && stats.mtime.getTime() === cacheTimestamp;
        } catch (error) {
            return false;
        }
    }

    // Load JSON data from file with caching
    async loadData(filename) {
        try {
            const filePath = path.join(this.dataDir, filename);
            const stats = await fs.stat(filePath);
            const fileTimestamp = stats.mtime.getTime();
            
            // Check if we can use cached data
            if (filename === 'images.json' && this.cache.images && 
                this.cache.imagesTimestamp === fileTimestamp) {
                return this.cache.images;
            }
            
            if (filename === 'config.json' && this.cache.config && 
                this.cache.configTimestamp === fileTimestamp) {
                return this.cache.config;
            }
            
            if (filename === 'albumPreviews.json' && this.cache.albumPreviews && 
                this.cache.albumPreviewsTimestamp === fileTimestamp) {
                return this.cache.albumPreviews;
            }
            
            // Load fresh data
            const data = await fs.readFile(filePath, 'utf8');
            const parsedData = JSON.parse(data);
            
            // Cache the data
            if (filename === 'images.json') {
                this.cache.images = parsedData;
                this.cache.imagesTimestamp = fileTimestamp;
            } else if (filename === 'config.json') {
                this.cache.config = parsedData;
                this.cache.configTimestamp = fileTimestamp;
            } else if (filename === 'albumPreviews.json') {
                this.cache.albumPreviews = parsedData;
                this.cache.albumPreviewsTimestamp = fileTimestamp;
            }
            
            return parsedData;
        } catch (error) {
            console.error(`Error loading ${filename}:`, error.message);
            // Throw the original error so we can check for ENOENT
            throw error;
        }
    }

    // Save JSON data to file
    async saveData(filename, data) {
        try {
            const filePath = path.join(this.dataDir, filename);
            const jsonData = JSON.stringify(data, null, 2);
            await fs.writeFile(filePath, jsonData, 'utf8');
            
            // Update cache with new data and timestamp
            const stats = await fs.stat(filePath);
            const fileTimestamp = stats.mtime.getTime();
            
            if (filename === 'images.json') {
                this.cache.images = data;
                this.cache.imagesTimestamp = fileTimestamp;
            } else if (filename === 'config.json') {
                this.cache.config = data;
                this.cache.configTimestamp = fileTimestamp;
            } else if (filename === 'albumPreviews.json') {
                this.cache.albumPreviews = data;
                this.cache.albumPreviewsTimestamp = fileTimestamp;
            }
            
            console.log(`Data saved to ${filename}`);
        } catch (error) {
            console.error(`Error saving ${filename}:`, error.message);
            throw new Error(`Failed to save data to ${filename}`);
        }
    }

    // Clear cache - useful for testing or when external changes occur
    clearCache() {
        this.cache.images = null;
        this.cache.imagesTimestamp = null;
        this.cache.config = null;
        this.cache.configTimestamp = null;
        this.cache.albumPreviews = null;
        this.cache.albumPreviewsTimestamp = null;
        console.log('DataManager cache cleared');
    }

    // Initialize storage mode from config
    async initialize() {
        if (this.initialized) return;
        
        try {
            const config = await this.getConfig();
            if (config.storageConfig && config.storageConfig.mode) {
                this.storageMode = config.storageConfig.mode;
                console.log(`DataManager initialized with storage mode: ${this.storageMode}`);
            }
            
            // Initialize album data manager if in album mode
            if (this.storageMode === 'album') {
                this.albumDataManager = new AlbumDataManager(this.dataDir);
                await this.albumDataManager.initialize();
            }
            
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing DataManager:', error.message);
            // Default to single mode on error
            this.storageMode = 'single';
            this.initialized = true;
        }
    }
    
    // Get current storage mode
    async getStorageMode() {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.storageMode;
    }
    
    // Update storage mode in config
    async setStorageMode(mode) {
        if (mode !== 'single' && mode !== 'album') {
            throw new Error('Invalid storage mode. Must be "single" or "album"');
        }
        
        await this.updateConfig('storageConfig.mode', mode);
        await this.updateConfig('storageConfig.lastModified', new Date().toISOString());
        
        this.storageMode = mode;
        
        // Initialize album data manager if switching to album mode
        if (mode === 'album' && !this.albumDataManager) {
            this.albumDataManager = new AlbumDataManager(this.dataDir);
            await this.albumDataManager.initialize();
        }
        
        console.log(`Storage mode changed to: ${mode}`);
    }
    
    // Load images data
    async getImages() {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (this.storageMode === 'album') {
            return await this.albumDataManager.getAllImages();
        } else {
            return await this.loadData('images.json');
        }
    }

    // Save images data
    async saveImages(images) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        if (this.storageMode === 'album') {
            // In album mode, this method should not be used directly
            throw new Error('Cannot save all images at once in album storage mode. Use addImage() instead.');
        } else {
            return await this.saveData('images.json', images);
        }
    }

    // Load config data
    async getConfig() {
        return await this.loadData('config.json');
    }

    // Save config data
    async saveConfig(config) {
        return await this.saveData('config.json', config);
    }

    // Get image analysis configuration
    async getImageAnalysisConfig() {
        try {
            const config = await this.getConfig();
            return config.imageAnalysisConfig || {
                enabled: false,
                preContext: '',
                template: 'default',
                lastModified: null,
                modifiedBy: null
            };
        } catch (error) {
            console.error('Error getting image analysis config:', error.message);
            // Return default config if file doesn't exist
            return {
                enabled: false,
                preContext: '',
                template: 'default',
                lastModified: null,
                modifiedBy: null
            };
        }
    }

    // Save image analysis configuration
    async saveImageAnalysisConfig(analysisConfig) {
        try {
            let config;
            try {
                config = await this.getConfig();
            } catch (error) {
                // If config doesn't exist, create new one
                config = {};
            }
            
            // Preserve the current enabled state if it exists
            const currentEnabled = config.imageAnalysisConfig?.enabled ?? false;
            
            config.imageAnalysisConfig = {
                enabled: currentEnabled,  // Preserve existing enabled state
                ...analysisConfig,
                lastModified: new Date().toISOString()
            };
            
            await this.saveConfig(config);
            return config.imageAnalysisConfig;
        } catch (error) {
            console.error('Error saving image analysis config:', error.message);
            throw error;
        }
    }

    // Toggle image analysis enabled state
    async toggleImageAnalysisEnabled(enabled) {
        try {
            let config;
            try {
                config = await this.getConfig();
            } catch (error) {
                // If config doesn't exist, create new one
                config = {};
            }
            
            if (!config.imageAnalysisConfig) {
                config.imageAnalysisConfig = {
                    enabled: false,
                    preContext: '',
                    template: 'default',
                    lastModified: null,
                    modifiedBy: null
                };
            }
            
            config.imageAnalysisConfig.enabled = enabled;
            config.imageAnalysisConfig.lastToggled = new Date().toISOString();
            
            await this.saveConfig(config);
            return config.imageAnalysisConfig;
        } catch (error) {
            console.error('Error toggling image analysis enabled state:', error.message);
            throw error;
        }
    }

    // Get available image analysis templates
    getImageAnalysisTemplates() {
        return {
            'default': {
                id: 'default',
                name: 'Default Analysis',
                description: 'General purpose image analysis',
                preContext: ''
            },
            'sports-photography': {
                id: 'sports-photography',
                name: 'Sports Photography',
                description: 'Focused on athletic performance and competition',
                preContext: 'You are analyzing photos from a sports competition. Focus on athletic performance, technique, equipment, and competitive atmosphere. Emphasize participant achievements, skill demonstration, and event organization. Pay attention to sports-specific terminology and competitive elements.'
            },
            'event-photography': {
                id: 'event-photography',
                name: 'Event Photography',
                description: 'Focused on formal events and ceremonies',
                preContext: 'You are analyzing photos from a formal event or ceremony. Focus on ceremony details, participant interactions, organizational elements, and memorable moments. Emphasize the formal nature and significance of the occasion. Pay attention to event structure and participant roles.'
            },
            'portrait-photography': {
                id: 'portrait-photography',
                name: 'Portrait Photography',
                description: 'Focused on individuals and personal characteristics',
                preContext: 'You are analyzing portrait photographs. Focus on facial expressions, emotions, poses, and individual characteristics. Emphasize personal qualities, professional appearance, and portrait composition. Pay attention to lighting, mood, and individual presentation.'
            },
            'archery-competition': {
                id: 'archery-competition',
                name: 'Archery Competition',
                description: 'Specialized for archery competitions and training',
                preContext: 'You are analyzing photos from an archery competition or training event. Focus on archery technique, equipment (bows, arrows, targets), competitive atmosphere, and participant skill levels. Emphasize athletic performance, precision, concentration, and archery-specific terminology. Pay attention to scoring, target details, and competitive elements.'
            }
        };
    }

    // Get specific template by ID
    getImageAnalysisTemplate(templateId) {
        const templates = this.getImageAnalysisTemplates();
        return templates[templateId] || templates['default'];
    }

    // Get vision verification configuration
    async getVisionVerificationConfig() {
        try {
            const config = await this.getConfig();
            return config.visionVerification || {
                enabled: true,
                batchSize: 5,
                maxImages: 30,
                model: 'claude-3-haiku-20240307'
            };
        } catch (error) {
            console.error('Error getting vision verification config:', error.message);
            return {
                enabled: true,
                batchSize: 5,
                maxImages: 30,
                model: 'claude-3-haiku-20240307'
            };
        }
    }

    // Save vision verification configuration
    async saveVisionVerificationConfig(visionConfig) {
        try {
            let config;
            try {
                config = await this.getConfig();
            } catch (error) {
                config = {};
            }
            
            config.visionVerification = {
                ...visionConfig,
                lastModified: new Date().toISOString()
            };
            
            await this.saveConfig(config);
            
            return {
                success: true,
                config: config.visionVerification
            };
        } catch (error) {
            console.error('Error saving vision verification config:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Get search broadening configuration
    async getSearchBroadeningConfig() {
        try {
            const config = await this.getConfig();
            return config.searchBroadening || {
                enabled: true,
                maxLevel: 6,
                enableSemanticExpansion: true,
                enablePartialMatches: true,
                removeNegativeKeywords: true,
                showRecentOnNoResults: true,
                randomFallback: true
            };
        } catch (error) {
            console.error('Error getting search broadening config:', error.message);
            return {
                enabled: true,
                maxLevel: 6,
                enableSemanticExpansion: true,
                enablePartialMatches: true,
                removeNegativeKeywords: true,
                showRecentOnNoResults: true,
                randomFallback: true
            };
        }
    }
    
    // Save search broadening configuration
    async saveSearchBroadeningConfig(broadeningConfig) {
        try {
            let config;
            try {
                config = await this.getConfig();
            } catch (error) {
                config = {};
            }
            
            config.searchBroadening = {
                ...broadeningConfig,
                lastModified: new Date().toISOString()
            };
            
            await this.saveConfig(config);
            
            return {
                success: true,
                config: config.searchBroadening
            };
        } catch (error) {
            console.error('Error saving search broadening config:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get Claude model configuration
    async getClaudeModelConfig() {
        try {
            const config = await this.getConfig();
            return config.claudeModelConfig || {
                chatModel: 'claude-3-5-sonnet-20241022',
                batchProcessingModel: 'claude-3-haiku-20240307',
                availableModels: [
                    {
                        id: 'claude-3-5-sonnet-20241022',
                        name: 'Claude 3.5 Sonnet',
                        description: 'Most intelligent model, best for complex tasks and conversations',
                        speed: 'medium',
                        cost: 'high'
                    },
                    {
                        id: 'claude-3-5-haiku-20241022',
                        name: 'Claude 3.5 Haiku',
                        description: 'Fastest model, good for quick responses and simple tasks',
                        speed: 'fast',
                        cost: 'low'
                    },
                    {
                        id: 'claude-3-opus-20240229',
                        name: 'Claude 3 Opus',
                        description: 'Most capable model for complex reasoning and analysis',
                        speed: 'slow',
                        cost: 'highest'
                    },
                    {
                        id: 'claude-3-sonnet-20240229',
                        name: 'Claude 3 Sonnet',
                        description: 'Balanced model for most tasks',
                        speed: 'medium',
                        cost: 'medium'
                    },
                    {
                        id: 'claude-3-haiku-20240307',
                        name: 'Claude 3 Haiku',
                        description: 'Fast and efficient for simple tasks',
                        speed: 'fast',
                        cost: 'low'
                    }
                ],
                lastModified: null,
                modifiedBy: null
            };
        } catch (error) {
            console.error('Error getting Claude model config:', error.message);
            // Return default config if file doesn't exist
            return {
                chatModel: 'claude-3-5-sonnet-20241022',
                batchProcessingModel: 'claude-3-haiku-20240307',
                availableModels: [
                    {
                        id: 'claude-3-5-sonnet-20241022',
                        name: 'Claude 3.5 Sonnet',
                        description: 'Most intelligent model, best for complex tasks and conversations',
                        speed: 'medium',
                        cost: 'high'
                    },
                    {
                        id: 'claude-3-5-haiku-20241022',
                        name: 'Claude 3.5 Haiku',
                        description: 'Fastest model, good for quick responses and simple tasks',
                        speed: 'fast',
                        cost: 'low'
                    },
                    {
                        id: 'claude-3-opus-20240229',
                        name: 'Claude 3 Opus',
                        description: 'Most capable model for complex reasoning and analysis',
                        speed: 'slow',
                        cost: 'highest'
                    },
                    {
                        id: 'claude-3-sonnet-20240229',
                        name: 'Claude 3 Sonnet',
                        description: 'Balanced model for most tasks',
                        speed: 'medium',
                        cost: 'medium'
                    },
                    {
                        id: 'claude-3-haiku-20240307',
                        name: 'Claude 3 Haiku',
                        description: 'Fast and efficient for simple tasks',
                        speed: 'fast',
                        cost: 'low'
                    }
                ],
                lastModified: null,
                modifiedBy: null
            };
        }
    }

    // Save Claude model configuration
    async saveClaudeModelConfig(modelConfig) {
        try {
            let config;
            try {
                config = await this.getConfig();
            } catch (error) {
                // If config doesn't exist, create new one
                config = {};
            }
            
            config.claudeModelConfig = {
                ...modelConfig,
                lastModified: new Date().toISOString()
            };
            
            await this.saveConfig(config);
            return config.claudeModelConfig;
        } catch (error) {
            console.error('Error saving Claude model config:', error.message);
            throw error;
        }
    }

    // Validate model ID exists in available models
    validateModelId(modelId) {
        const modelConfig = this.getClaudeModelConfig();
        return modelConfig.availableModels.some(model => model.id === modelId);
    }

    // Get model information by ID
    async getModelInfo(modelId) {
        try {
            const modelConfig = await this.getClaudeModelConfig();
            return modelConfig.availableModels.find(model => model.id === modelId) || null;
        } catch (error) {
            console.error('Error getting model info:', error.message);
            return null;
        }
    }

    // Find existing image by SmugMug key
    async findImageBySmugmugKey(smugmugImageKey) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            if (this.storageMode === 'album') {
                return await this.albumDataManager.findImageBySmugmugKey(smugmugImageKey);
            } else {
                const images = await this.getImages();
                return images.find(img => img.smugmugImageKey === smugmugImageKey) || null;
            }
        } catch (error) {
            console.error('Error finding image by SmugMug key:', error.message);
            throw error;
        }
    }

    // Check if image already exists by SmugMug key
    async imageExists(smugmugImageKey) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            if (this.storageMode === 'album') {
                return await this.albumDataManager.imageExists(smugmugImageKey);
            } else {
                const existingImage = await this.findImageBySmugmugKey(smugmugImageKey);
                return existingImage !== null;
            }
        } catch (error) {
            console.error('Error checking image existence:', error.message);
            throw error;
        }
    }

    // Find all duplicates by SmugMug key
    async findDuplicatesByImageKey(smugmugImageKey) {
        try {
            const images = await this.getImages();
            const duplicates = images.filter(img => img.smugmugImageKey === smugmugImageKey);
            return duplicates;
        } catch (error) {
            console.error('Error finding duplicates by image key:', error.message);
            throw error;
        }
    }

    // Update existing image by key (SmugMug key, image key, or ID)
    async updateImage(imageKey, newData) {
        try {
            if (this.storageMode === 'album') {
                // In album mode, we need to find which album contains this image
                const allImages = await this.getImages();
                const existingImage = allImages.find(img => 
                    img.smugmugImageKey === imageKey || img.imageKey === imageKey || img.id === imageKey
                );
                
                if (!existingImage) {
                    throw new Error(`Image ${imageKey} not found`);
                }
                
                // Delegate to album data manager
                return await this.albumDataManager.updateImageInAlbum(
                    existingImage.albumKey,
                    imageKey,
                    newData
                );
            } else {
                // Single file mode
                const images = await this.getImages();
                const existingIndex = images.findIndex(img => 
                    img.smugmugImageKey === imageKey || img.imageKey === imageKey || img.id === imageKey
                );
                
                if (existingIndex === -1) {
                    throw new Error(`Image ${imageKey} not found`);
                }
                
                const existingImage = images[existingIndex];
                const updatedImage = {
                    ...existingImage,
                    ...newData,
                    id: existingImage.id, // Keep original ID
                    timestamp: existingImage.timestamp, // Keep original timestamp
                    lastUpdated: new Date().toISOString()
                };
                
                images[existingIndex] = updatedImage;
                await this.saveImages(images);
                
                console.log(`Updated existing image: ${existingImage.id} (${imageKey})`);
                return updatedImage;
            }
        } catch (error) {
            console.error('Error updating image:', error.message);
            throw error;
        }
    }

    // Add a new image analysis with duplicate detection
    async addImage(imageData, options = { duplicateHandling: 'skip' }) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            // Handle legacy option names for backwards compatibility
            if (options.allowDuplicates) {
                options.duplicateHandling = 'replace';
            } else if (options.updateExisting) {
                options.duplicateHandling = 'update';
            }
            
            // Default to 'skip' if no duplicateHandling specified
            if (!options.duplicateHandling) {
                options.duplicateHandling = 'skip';
            }
            
            // Check for existing image by smugmugImageKey if provided
            if (imageData.smugmugImageKey) {
                const existingImage = await this.findImageBySmugmugKey(imageData.smugmugImageKey);
                
                if (existingImage) {
                    // Handle duplicate based on options
                    switch (options.duplicateHandling) {
                        case 'skip':
                            console.log(`Duplicate image skipped: ${imageData.smugmugImageKey} (existing ID: ${existingImage.id})`);
                            return { ...existingImage, wasSkipped: true };
                            
                        case 'update':
                            if (this.storageMode === 'album') {
                                // In album mode, update in the specific album
                                const updatedImage = await this.albumDataManager.addImageToAlbum(
                                    existingImage.albumKey,
                                    { ...existingImage, ...imageData }
                                );
                                return { ...updatedImage, wasUpdated: true };
                            } else {
                                const updatedImage = await this.updateImage(imageData.smugmugImageKey, imageData);
                                return { ...updatedImage, wasUpdated: true };
                            }
                            
                        case 'replace':
                            if (this.storageMode === 'album') {
                                // In album mode, replace in the specific album
                                const replacedImage = {
                                    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                                    timestamp: new Date().toISOString(),
                                    ...imageData
                                };
                                await this.albumDataManager.addImageToAlbum(existingImage.albumKey, replacedImage);
                                console.log(`Replaced existing image in album: ${existingImage.id} -> ${replacedImage.id} (${imageData.smugmugImageKey})`);
                                return { ...replacedImage, wasReplaced: true };
                            } else {
                                const images = await this.getImages();
                                const existingIndex = images.findIndex(img => img.smugmugImageKey === imageData.smugmugImageKey);
                                
                                const replacedImage = {
                                    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                                    timestamp: new Date().toISOString(),
                                    ...imageData
                                };
                                
                                images[existingIndex] = replacedImage;
                                await this.saveImages(images);
                                
                                console.log(`Replaced existing image: ${existingImage.id} -> ${replacedImage.id} (${imageData.smugmugImageKey})`);
                                return { ...replacedImage, wasReplaced: true };
                            }
                            
                        default:
                            throw new Error(`Invalid duplicateHandling option: ${options.duplicateHandling}`);
                    }
                }
            }
            
            // Add timestamp and ID for new image
            const newImage = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2), // More unique ID
                timestamp: new Date().toISOString(),
                ...imageData
            };
            
            if (this.storageMode === 'album') {
                // In album mode, add to the specific album
                if (!imageData.albumKey) {
                    throw new Error('albumKey is required for album storage mode');
                }
                const savedImage = await this.albumDataManager.addImageToAlbum(imageData.albumKey, newImage);
                console.log(`Added new image to album ${imageData.albumKey}: ${savedImage.id} (${imageData.smugmugImageKey || 'no SmugMug key'})`);
                return { ...savedImage, wasAdded: true };
            } else {
                const images = await this.getImages();
                images.push(newImage);
                await this.saveImages(images);
                console.log(`Added new image: ${newImage.id} (${imageData.smugmugImageKey || 'no SmugMug key'})`);
                return { ...newImage, wasAdded: true };
            }
        } catch (error) {
            console.error('Error adding image:', error.message);
            throw error;
        }
    }

    // Search images by description and keywords
    async searchImages(query) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            if (this.storageMode === 'album') {
                return await this.albumDataManager.searchImages(query);
            } else {
                const images = await this.getImages();
                const lowercaseQuery = query.toLowerCase();
                
                // Search through descriptions, keywords, and filenames
                const results = images.filter(image => {
                    // Search in description
                    const descriptionMatch = image.description && 
                                           image.description.toLowerCase().includes(lowercaseQuery);
                    
                    // Search in keywords
                    const keywordMatch = image.keywords && 
                                       image.keywords.some(keyword => 
                                           keyword.toLowerCase().includes(lowercaseQuery));
                    
                    // Search in filename
                    const filenameMatch = image.filename && 
                                        image.filename.toLowerCase().includes(lowercaseQuery);
                    
                    return descriptionMatch || keywordMatch || filenameMatch;
                });
                
                console.log(`Search for "${query}" returned ${results.length} results`);
                return results;
            }
        } catch (error) {
            console.error('Error searching images:', error.message);
            throw error;
        }
    }

    // Update config setting
    async updateConfig(key, value) {
        try {
            const config = await this.getConfig();
            
            // Support nested key updates using dot notation
            const keys = key.split('.');
            let current = config;
            
            for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) {
                    current[keys[i]] = {};
                }
                current = current[keys[i]];
            }
            
            current[keys[keys.length - 1]] = value;
            
            await this.saveConfig(config);
            console.log(`Updated config ${key} = ${value}`);
            return config;
        } catch (error) {
            console.error('Error updating config:', error.message);
            throw error;
        }
    }

    // Get processing status
    async getStatus() {
        try {
            const config = await this.getConfig();
            const images = await this.getImages();
            
            return {
                connected: config.smugmug.connected,
                totalImages: images.length,
                processing: config.processing,
                lastSync: config.smugmug.lastSync
            };
        } catch (error) {
            console.error('Error getting status:', error.message);
            throw error;
        }
    }

    // Get album processing status
    async getAlbumProcessingStatus(albumKey, smugmugImages) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            let albumProcessedImages = [];
            
            if (this.storageMode === 'album') {
                // In album mode, just load the specific album
                try {
                    albumProcessedImages = await this.albumDataManager.loadAlbum(albumKey);
                } catch (error) {
                    // Album doesn't exist yet, that's okay
                    if (error.code !== 'ENOENT') {
                        throw error;
                    }
                }
            } else {
                // In single mode, load all images and filter
                const processedImages = await this.getImages();
                albumProcessedImages = processedImages.filter(img => 
                    img.albumKey === albumKey && img.smugmugImageKey
                );
            }
            
            // Create lookup for quick checking
            const processedImageKeys = new Set(
                albumProcessedImages.map(img => img.smugmugImageKey)
            );
            
            // Count total images and processed images
            const totalImages = smugmugImages.length;
            const processedCount = albumProcessedImages.length;
            const unprocessedImages = smugmugImages.filter(img => 
                !processedImageKeys.has(img.ImageKey)
            );
            
            const processingProgress = totalImages > 0 ? 
                Math.round((processedCount / totalImages) * 100) : 0;
            
            return {
                albumKey: albumKey,
                processedImageKeys: processedImageKeys.size,
                totalImages: totalImages,
                albumProcessedImages: processedCount,
                processedImages: albumProcessedImages.length,
                unprocessedImages: unprocessedImages.length,
                processingProgress: processingProgress,
                isCompletelyProcessed: processedCount === totalImages && totalImages > 0,
                processedImageKeys: Array.from(processedImageKeys),
                unprocessedImageKeys: unprocessedImages.map(img => img.ImageKey),
                lastProcessedAt: albumProcessedImages.length > 0 ? 
                    Math.max(...albumProcessedImages.map(img => new Date(img.timestamp || img.metadata?.timestamp || 0).getTime())) : null
            };
        } catch (error) {
            console.error('Error getting album processing status:', error.message);
            throw error;
        }
    }

    // Get processing status for multiple albums efficiently
    async getBulkAlbumProcessingStatus(albumsWithImages) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            const results = {};
            
            if (this.storageMode === 'album') {
                // In album mode, load each album individually
                for (const { albumKey, smugmugImages } of albumsWithImages) {
                    let albumProcessedImages = [];
                    try {
                        albumProcessedImages = await this.albumDataManager.loadAlbum(albumKey);
                    } catch (error) {
                        // Album doesn't exist yet, that's okay
                        if (error.code !== 'ENOENT') {
                            throw error;
                        }
                    }
                    
                    const processedImageKeys = new Set(
                        albumProcessedImages.map(img => img.smugmugImageKey)
                    );
                    
                    const totalImages = smugmugImages.length;
                    const processedCount = processedImageKeys.size;
                    const unprocessedImages = smugmugImages.filter(img => 
                        !processedImageKeys.has(img.ImageKey)
                    );
                    
                    const processingProgress = totalImages > 0 ? 
                        Math.round((processedCount / totalImages) * 100) : 0;
                    
                    results[albumKey] = {
                        albumKey: albumKey,
                        processedImageKeys: processedCount,
                        totalImages: totalImages,
                        processedImages: processedCount,
                        unprocessedImages: unprocessedImages.length,
                        processingProgress: processingProgress,
                        isCompletelyProcessed: processedCount === totalImages && totalImages > 0,
                        processedImageKeys: Array.from(processedImageKeys),
                        unprocessedImageKeys: unprocessedImages.map(img => img.ImageKey),
                        lastProcessedAt: albumProcessedImages.length > 0 ? 
                            Math.max(...albumProcessedImages.map(img => new Date(img.timestamp || img.metadata?.timestamp || 0).getTime())) : null
                    };
                }
            } else {
                // In single mode, use the old logic
                const processedImages = await this.getImages();
                
                // Create a map of albumKey -> processed images for efficient lookup
                const processedImagesByAlbum = new Map();
                
                // Group processed images by album
                processedImages.forEach(img => {
                    if (img.albumKey && img.smugmugImageKey) {
                        if (!processedImagesByAlbum.has(img.albumKey)) {
                            processedImagesByAlbum.set(img.albumKey, new Set());
                        }
                        processedImagesByAlbum.get(img.albumKey).add(img.smugmugImageKey);
                    }
                });
                
                // Calculate status for each album
                for (const { albumKey, smugmugImages } of albumsWithImages) {
                    const processedImageKeys = processedImagesByAlbum.get(albumKey) || new Set();
                    const totalImages = smugmugImages.length;
                    const processedCount = processedImageKeys.size;
                    const unprocessedImages = smugmugImages.filter(img => 
                        !processedImageKeys.has(img.ImageKey)
                    );
                    
                    const processingProgress = totalImages > 0 ? 
                        Math.round((processedCount / totalImages) * 100) : 0;
                    
                    // Find last processed timestamp for this album
                    const albumProcessedImages = processedImages.filter(img => 
                        img.albumKey === albumKey && img.smugmugImageKey
                    );
                    
                    results[albumKey] = {
                        albumKey: albumKey,
                        processedImageKeys: processedCount,
                        totalImages: totalImages,
                        processedImages: processedCount,
                        unprocessedImages: unprocessedImages.length,
                        processingProgress: processingProgress,
                        isCompletelyProcessed: processedCount === totalImages && totalImages > 0,
                        processedImageKeys: Array.from(processedImageKeys),
                        unprocessedImageKeys: unprocessedImages.map(img => img.ImageKey),
                        lastProcessedAt: albumProcessedImages.length > 0 ? 
                            Math.max(...albumProcessedImages.map(img => new Date(img.timestamp || img.metadata?.timestamp || 0).getTime())) : null
                    };
                }
            }
            
            return results;
        } catch (error) {
            console.error('Error getting bulk album processing status:', error.message);
            throw error;
        }
    }

    // Album Preview Methods

    // Get all album previews
    async getAlbumPreviews() {
        try {
            return await this.loadData('albumPreviews.json');
        } catch (error) {
            // If file doesn't exist, return empty object
            if (error.message.includes('ENOENT') || error.message.includes('no such file')) {
                console.log('Album previews file does not exist yet, returning empty object');
                return {};
            }
            throw error;
        }
    }

    // Get a specific album preview
    async getAlbumPreview(albumKey) {
        try {
            const previews = await this.getAlbumPreviews();
            return previews[albumKey] || null;
        } catch (error) {
            console.error('Error getting album preview:', error.message);
            throw error;
        }
    }

    // Save album preview data
    async saveAlbumPreview(albumKey, previewData) {
        try {
            const previews = await this.getAlbumPreviews();
            
            // Add albumKey and timestamp to the preview data
            previews[albumKey] = {
                ...previewData,
                albumKey: albumKey,
                lastFetched: new Date().toISOString()
            };
            
            await this.saveData('albumPreviews.json', previews);
            console.log(`Saved album preview for ${albumKey}`);
            return previews[albumKey];
        } catch (error) {
            console.error('Error saving album preview:', error.message);
            throw error;
        }
    }

    // Check if album preview exists
    async hasAlbumPreview(albumKey) {
        try {
            const preview = await this.getAlbumPreview(albumKey);
            return preview !== null;
        } catch (error) {
            console.error('Error checking album preview existence:', error.message);
            return false;
        }
    }

    // Get all stored album previews summary
    async getAllAlbumPreviews() {
        try {
            const previews = await this.getAlbumPreviews();
            return Object.keys(previews).map(albumKey => ({
                albumKey: albumKey,
                albumName: previews[albumKey].albumName,
                imageCount: previews[albumKey].imageCount || previews[albumKey].images?.length || 0,
                lastFetched: previews[albumKey].lastFetched
            }));
        } catch (error) {
            console.error('Error getting all album previews:', error.message);
            return [];
        }
    }

    // Delete album preview
    async deleteAlbumPreview(albumKey) {
        try {
            const previews = await this.getAlbumPreviews();
            if (previews[albumKey]) {
                delete previews[albumKey];
                await this.saveData('albumPreviews.json', previews);
                console.log(`Deleted album preview for ${albumKey}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting album preview:', error.message);
            throw error;
        }
    }

    // API Key Management Methods

    /**
     * Get Claude API key configuration status
     * @returns {Object} Status object with configured flag and masked key
     */
    async getClaudeApiKeyStatus() {
        try {
            const config = await this.getConfig();
            
            // Check encrypted storage first
            if (config.apiKeys && config.apiKeys.claude) {
                try {
                    const decryptedKey = await this.cryptoUtils.decrypt(config.apiKeys.claude);
                    return {
                        configured: true,
                        source: 'database',
                        maskedKey: this.cryptoUtils.maskApiKey(decryptedKey)
                    };
                } catch (error) {
                    console.error('Error decrypting API key:', error.message);
                }
            }
            
            // Fall back to environment variable
            if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
                return {
                    configured: true,
                    source: 'environment',
                    maskedKey: this.cryptoUtils.maskApiKey(process.env.ANTHROPIC_API_KEY)
                };
            }
            
            return {
                configured: false,
                source: null,
                maskedKey: null
            };
        } catch (error) {
            console.error('Error getting API key status:', error.message);
            return {
                configured: false,
                source: null,
                maskedKey: null,
                error: error.message
            };
        }
    }

    /**
     * Get decrypted Claude API key
     * @returns {string|null} The decrypted API key or null if not found
     */
    async getClaudeApiKey() {
        try {
            const config = await this.getConfig();
            
            // Check encrypted storage first
            if (config.apiKeys && config.apiKeys.claude) {
                try {
                    return await this.cryptoUtils.decrypt(config.apiKeys.claude);
                } catch (error) {
                    console.error('Error decrypting API key:', error.message);
                }
            }
            
            // Fall back to environment variable
            if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
                return process.env.ANTHROPIC_API_KEY;
            }
            
            return null;
        } catch (error) {
            console.error('Error getting API key:', error.message);
            return null;
        }
    }

    /**
     * Save Claude API key (encrypted)
     * @param {string} apiKey - The API key to save
     * @returns {Object} Result object
     */
    async saveClaudeApiKey(apiKey) {
        try {
            // Validate API key format
            if (!this.cryptoUtils.validateClaudeApiKeyFormat(apiKey)) {
                throw new Error('Invalid API key format. Claude API keys should start with "sk-ant-"');
            }
            
            // Get current config
            let config;
            try {
                config = await this.getConfig();
            } catch (error) {
                config = {};
            }
            
            // Initialize apiKeys object if doesn't exist
            if (!config.apiKeys) {
                config.apiKeys = {};
            }
            
            // Encrypt and save the API key
            config.apiKeys.claude = await this.cryptoUtils.encrypt(apiKey);
            config.apiKeys.lastUpdated = new Date().toISOString();
            
            await this.saveConfig(config);
            
            // Clear the plaintext key from memory
            this.cryptoUtils.clearSensitiveData(apiKey);
            
            return {
                success: true,
                message: 'API key saved successfully'
            };
        } catch (error) {
            console.error('Error saving API key:', error.message);
            throw error;
        }
    }

    /**
     * Remove Claude API key from storage
     * @returns {Object} Result object
     */
    async removeClaudeApiKey() {
        try {
            const config = await this.getConfig();
            
            if (config.apiKeys && config.apiKeys.claude) {
                delete config.apiKeys.claude;
                await this.saveConfig(config);
                
                return {
                    success: true,
                    message: 'API key removed successfully'
                };
            }
            
            return {
                success: false,
                message: 'No API key found to remove'
            };
        } catch (error) {
            console.error('Error removing API key:', error.message);
            throw error;
        }
    }

    /**
     * Migrate API key from environment variable to encrypted storage
     * @returns {Object} Migration result
     */
    async migrateApiKeyFromEnv() {
        try {
            // Check if already migrated
            const status = await this.getClaudeApiKeyStatus();
            if (status.source === 'database') {
                return {
                    success: false,
                    message: 'API key already migrated to database'
                };
            }
            
            // Check if environment variable exists
            if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
                return {
                    success: false,
                    message: 'No API key found in environment variables'
                };
            }
            
            // Save to encrypted storage
            await this.saveClaudeApiKey(process.env.ANTHROPIC_API_KEY);
            
            return {
                success: true,
                message: 'API key migrated from environment variable to encrypted storage'
            };
        } catch (error) {
            console.error('Error migrating API key:', error.message);
            return {
                success: false,
                message: error.message
            };
        }
    }

    // Starred Images Methods

    /**
     * Get all starred image IDs
     * @returns {Array} Array of starred image IDs
     */
    async getStarredImageIds() {
        try {
            const config = await this.getConfig();
            return config.starredImages || [];
        } catch (error) {
            console.error('Error getting starred images:', error.message);
            return [];
        }
    }

    /**
     * Check if an image is starred
     * @param {string} imageId - The image ID to check
     * @returns {boolean} True if starred, false otherwise
     */
    async isImageStarred(imageId) {
        try {
            const starredIds = await this.getStarredImageIds();
            return starredIds.includes(imageId);
        } catch (error) {
            console.error('Error checking starred status:', error.message);
            return false;
        }
    }

    /**
     * Star an image
     * @param {string} imageId - The image ID to star
     * @returns {Object} Result object
     */
    async starImage(imageId) {
        try {
            const config = await this.getConfig();
            
            // Initialize starredImages array if it doesn't exist
            if (!config.starredImages) {
                config.starredImages = [];
            }
            
            // Check if already starred
            if (config.starredImages.includes(imageId)) {
                return {
                    success: false,
                    message: 'Image is already starred'
                };
            }
            
            // Add to starred images
            config.starredImages.push(imageId);
            await this.saveConfig(config);
            
            return {
                success: true,
                message: 'Image starred successfully',
                starredCount: config.starredImages.length
            };
        } catch (error) {
            console.error('Error starring image:', error.message);
            throw error;
        }
    }

    /**
     * Unstar an image
     * @param {string} imageId - The image ID to unstar
     * @returns {Object} Result object
     */
    async unstarImage(imageId) {
        try {
            const config = await this.getConfig();
            
            // Initialize starredImages array if it doesn't exist
            if (!config.starredImages) {
                config.starredImages = [];
                await this.saveConfig(config);
                return {
                    success: false,
                    message: 'Image is not starred'
                };
            }
            
            // Remove from starred images
            const index = config.starredImages.indexOf(imageId);
            if (index === -1) {
                return {
                    success: false,
                    message: 'Image is not starred'
                };
            }
            
            config.starredImages.splice(index, 1);
            await this.saveConfig(config);
            
            return {
                success: true,
                message: 'Image unstarred successfully',
                starredCount: config.starredImages.length
            };
        } catch (error) {
            console.error('Error unstarring image:', error.message);
            throw error;
        }
    }

    /**
     * Get all starred images with full data
     * @returns {Array} Array of starred image objects
     */
    async getStarredImages() {
        try {
            const starredIds = await this.getStarredImageIds();
            if (starredIds.length === 0) {
                return [];
            }
            
            const allImages = await this.getImages();
            
            // Filter images that are starred
            const starredImages = [];
            for (const imageId of starredIds) {
                const image = allImages.find(img => 
                    img.id === imageId || 
                    img.smugmugImageKey === imageId || 
                    img.imageKey === imageId
                );
                if (image) {
                    starredImages.push({
                        ...image,
                        isStarred: true,
                        starredId: imageId  // Include the actual ID that was starred
                    });
                }
            }
            
            return starredImages;
        } catch (error) {
            console.error('Error getting starred images:', error.message);
            return [];
        }
    }

    /**
     * Toggle star status of an image
     * @param {string} imageId - The image ID to toggle
     * @returns {Object} Result object with new starred status
     */
    async toggleStarImage(imageId) {
        try {
            const isStarred = await this.isImageStarred(imageId);
            
            if (isStarred) {
                const result = await this.unstarImage(imageId);
                return { ...result, isStarred: false };
            } else {
                const result = await this.starImage(imageId);
                return { ...result, isStarred: true };
            }
        } catch (error) {
            console.error('Error toggling star status:', error.message);
            throw error;
        }
    }
}

module.exports = DataManager;
