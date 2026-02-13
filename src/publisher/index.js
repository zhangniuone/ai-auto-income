const logger = require('../utils/logger');
const db = require('../utils/database');

/**
 * 文章发布模块
 * 自动发布文章到网站
 */
class Publisher {
  async publishScheduled() {
    logger.info('Checking for scheduled articles to publish...');
    
    const articles = await db.getUnpublishedArticles(5);
    
    if (articles.length === 0) {
      logger.info('No articles to publish');
      return;
    }
    
    for (const article of articles) {
      try {
        logger.info(`Publishing article: ${article.title}`);
        
        // Add internal links before publishing
        const enhancedContent = await this.addInternalLinks(article);
        
        // Update article with enhanced content
        await db.updateArticle(article.id, {
          content: enhancedContent,
          published: true,
          published_at: new Date().toISOString()
        });
        
        logger.info(`Article published: ${article.slug}`);
        
        // Rate limiting
        await this.sleep(1000);
        
      } catch (error) {
        logger.error(`Failed to publish article ${article.id}:`, error.message);
      }
    }
    
    logger.info(`Published ${articles.length} articles`);
  }

  async addInternalLinks(article) {
    // Find related articles for internal linking
    const related = await db.getRelatedArticles(article.id, article.tags, 3);
    
    if (related.length === 0) {
      return article.content;
    }
    
    let content = article.content;
    
    // Insert "Related Reading" section at the end
    const relatedSection = `
      <div class="related-articles">
        <h3>推荐阅读</h3>
        <ul>
          ${related.map(r => `
            <li><a href="/article/${r.slug}">${r.title}</a></li>
          `).join('')}
        </ul>
      </div>
    `;
    
    // Insert before closing article tag
    content = content.replace('</article>', `${relatedSection}</article>`);
    
    return content;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new Publisher();