/**
 * CrawlerService - Page Content Extraction
 * 
 * Built with: Claude Sonnet 4.5
 * Date: February 7, 2026
 * 
 * Responsibilities:
 * - Extract page content for AI processing
 * - Extract links and structured data
 * - Clean and format content for summarization
 * - Extract metadata (title, description, etc.)
 */

import { AutomationService } from './AutomationService.js';

class CrawlerService {
    constructor() {
        this.automationService = new AutomationService();
    }

    /**
     * Extract complete page data for AI processing
     * @param {WebContents} webContents - Electron webContents
     * @returns {Object} - { title, content, links, url, metadata }
     */
    async extractPageData(webContents) {
        try {
            if (!webContents || webContents.isDestroyed()) {
                return { success: false, error: 'Invalid webContents' };
            }

            const url = webContents.getURL();
            const title = webContents.getTitle();

            // Get text content for summarization
            const textContent = await this.automationService.getTextContent(webContents);

            // Extract links
            const links = await this.extractLinks(webContents);

            // Extract metadata
            const metadata = await this.extractMetadata(webContents);

            // Get structured content
            const structuredContent = await this.extractStructuredContent(webContents);

            return {
                success: true,
                url,
                title,
                content: textContent,
                links,
                metadata,
                structuredData: structuredContent,
                extractedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('[CrawlerService] Error extracting page data:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Extract all links from the page
     * @param {WebContents} webContents
     * @returns {Array} - Array of { text, href }
     */
    async extractLinks(webContents) {
        try {
            await this.automationService.checkSession(webContents);

            const { result } = await this.automationService.sendCommand(
                webContents,
                'Runtime.evaluate',
                {
                    expression: `
                        (function() {
                            try {
                                const links = Array.from(document.querySelectorAll('a[href]'));
                                return links.slice(0, 100).map(a => ({
                                    text: a.textContent.trim().substring(0, 100),
                                    href: a.href
                                }));
                            } catch(e) {
                                return [];
                            }
                        })()
                    `,
                    returnByValue: true
                }
            );

            return result?.value || [];
        } catch (error) {
            console.error('[CrawlerService] Error extracting links:', error);
            return [];
        }
    }

    /**
     * Extract metadata (og:tags, meta tags, etc.)
     * @param {WebContents} webContents
     * @returns {Object} - Metadata object
     */
    async extractMetadata(webContents) {
        try {
            await this.automationService.checkSession(webContents);

            const { result } = await this.automationService.sendCommand(
                webContents,
                'Runtime.evaluate',
                {
                    expression: `
                        (function() {
                            try {
                                const metadata = {};
                                
                                // Extract meta tags
                                const metas = document.querySelectorAll('meta');
                                metas.forEach(meta => {
                                    const name = meta.getAttribute('name') || meta.getAttribute('property');
                                    const content = meta.getAttribute('content');
                                    if (name && content) {
                                        metadata[name] = content;
                                    }
                                });
                                
                                // Extract description
                                const desc = document.querySelector('meta[name="description"]');
                                if (desc) metadata.description = desc.content;
                                
                                // Extract keywords
                                const keywords = document.querySelector('meta[name="keywords"]');
                                if (keywords) metadata.keywords = keywords.content;
                                
                                return metadata;
                            } catch(e) {
                                return {};
                            }
                        })()
                    `,
                    returnByValue: true
                }
            );

            return result?.value || {};
        } catch (error) {
            console.error('[CrawlerService] Error extracting metadata:', error);
            return {};
        }
    }

    /**
     * Extract structured content (headings, main content, etc.)
     * @param {WebContents} webContents
     * @returns {Object} - Structured content
     */
    async extractStructuredContent(webContents) {
        try {
            await this.automationService.checkSession(webContents);

            const { result } = await this.automationService.sendCommand(
                webContents,
                'Runtime.evaluate',
                {
                    expression: `
                        (function() {
                            try {
                                const structured = {
                                    headings: [],
                                    mainContent: ''
                                };
                                
                                // Extract headings
                                const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
                                structured.headings = Array.from(headings).slice(0, 20).map(h => ({
                                    level: h.tagName,
                                    text: h.textContent.trim().substring(0, 200)
                                }));
                                
                                // Try to find main content
                                const main = document.querySelector('main, article, [role="main"]');
                                if (main) {
                                    structured.mainContent = main.innerText.substring(0, 10000);
                                }
                                
                                return structured;
                            } catch(e) {
                                return { headings: [], mainContent: '' };
                            }
                        })()
                    `,
                    returnByValue: true
                }
            );

            return result?.value || { headings: [], mainContent: '' };
        } catch (error) {
            console.error('[CrawlerService] Error extracting structured content:', error);
            return { headings: [], mainContent: '' };
        }
    }

    /**
     * Get clean text content optimized for AI summarization
     * @param {WebContents} webContents
     * @returns {String} - Clean text content
     */
    async getCleanContent(webContents) {
        try {
            const pageData = await this.extractPageData(webContents);
            
            if (!pageData.success) {
                return '';
            }

            // Combine title, metadata, and content for better context
            let cleanContent = '';
            
            if (pageData.title) {
                cleanContent += `Title: ${pageData.title}\n\n`;
            }
            
            if (pageData.metadata?.description) {
                cleanContent += `Description: ${pageData.metadata.description}\n\n`;
            }
            
            if (pageData.structuredData?.headings?.length > 0) {
                cleanContent += `Key Topics:\n`;
                pageData.structuredData.headings.forEach(h => {
                    cleanContent += `- ${h.text}\n`;
                });
                cleanContent += '\n';
            }
            
            if (pageData.content) {
                cleanContent += `Content:\n${pageData.content}`;
            }

            return cleanContent;
        } catch (error) {
            console.error('[CrawlerService] Error getting clean content:', error);
            return '';
        }
    }
}

export default new CrawlerService();
