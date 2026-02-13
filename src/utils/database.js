const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/aiautoincome',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const db = {
  async init() {
    const createTables = `
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        slug VARCHAR(500) UNIQUE NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        category VARCHAR(100),
        tags TEXT[],
        keywords TEXT[],
        meta_title VARCHAR(200),
        meta_description TEXT,
        image_url VARCHAR(500),
        source_url VARCHAR(500),
        source_type VARCHAR(50),
        word_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        published BOOLEAN DEFAULT FALSE,
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published);
      CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
      CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
      CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created_at DESC);

      CREATE TABLE IF NOT EXISTS trending_topics (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        keyword VARCHAR(200) NOT NULL,
        search_volume INTEGER,
        competition VARCHAR(20),
        source VARCHAR(100),
        url VARCHAR(500),
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ad_clicks (
        id SERIAL PRIMARY KEY,
        article_id INTEGER REFERENCES articles(id),
        ad_type VARCHAR(50),
        clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(50),
        user_agent TEXT
      );

      CREATE TABLE IF NOT EXISTS daily_stats (
        id SERIAL PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        page_views INTEGER DEFAULT 0,
        unique_visitors INTEGER DEFAULT 0,
        articles_published INTEGER DEFAULT 0,
        ad_clicks INTEGER DEFAULT 0,
        estimated_revenue DECIMAL(10, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await pool.query(createTables);
    logger.info('Database tables initialized');
  },

  async getArticles({ limit = 20, offset = 0, published = true }) {
    const query = `
      SELECT * FROM articles 
      WHERE published = $1 
      ORDER BY published_at DESC 
      LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [published, limit, offset]);
    return result.rows;
  },

  async getArticleBySlug(slug) {
    const result = await pool.query('SELECT * FROM articles WHERE slug = $1', [slug]);
    return result.rows[0];
  },

  async getArticleById(id) {
    const result = await pool.query('SELECT * FROM articles WHERE id = $1', [id]);
    return result.rows[0];
  },

  async createArticle(article) {
    const query = `
      INSERT INTO articles 
      (title, slug, content, summary, category, tags, keywords, meta_title, meta_description, image_url, source_url, source_type, word_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    const values = [
      article.title,
      article.slug,
      article.content,
      article.summary,
      article.category,
      article.tags,
      article.keywords,
      article.metaTitle,
      article.metaDescription,
      article.imageUrl,
      article.sourceUrl,
      article.sourceType,
      article.wordCount
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async updateArticle(id, updates) {
    const fields = Object.keys(updates).map((key, i) => `${key} = $${i + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];
    const query = `UPDATE articles SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async publishArticle(id) {
    return this.updateArticle(id, { 
      published: true, 
      published_at: new Date().toISOString() 
    });
  },

  async getArticlesByCategory(category, limit = 20) {
    const result = await pool.query(
      'SELECT * FROM articles WHERE category = $1 AND published = TRUE ORDER BY published_at DESC LIMIT $2',
      [category, limit]
    );
    return result.rows;
  },

  async getArticlesByTag(tag, limit = 20) {
    const result = await pool.query(
      'SELECT * FROM articles WHERE $1 = ANY(tags) AND published = TRUE ORDER BY published_at DESC LIMIT $2',
      [tag, limit]
    );
    return result.rows;
  },

  async getRelatedArticles(id, tags, limit = 5) {
    if (!tags || tags.length === 0) return [];
    const result = await pool.query(
      `SELECT * FROM articles 
       WHERE id != $1 AND published = TRUE 
       AND tags && $2::text[]
       ORDER BY published_at DESC LIMIT $3`,
      [id, tags, limit]
    );
    return result.rows;
  },

  async incrementViewCount(id) {
    await pool.query('UPDATE articles SET view_count = view_count + 1 WHERE id = $1', [id]);
  },

  async saveTrendingTopic(topic) {
    const query = `
      INSERT INTO trending_topics (title, keyword, search_volume, competition, source, url)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    const result = await pool.query(query, [
      topic.title, topic.keyword, topic.searchVolume, 
      topic.competition, topic.source, topic.url
    ]);
    return result.rows[0];
  },

  async getUnprocessedTopics(limit = 10) {
    const result = await pool.query(
      'SELECT * FROM trending_topics WHERE processed = FALSE ORDER BY search_volume DESC NULLS LAST LIMIT $1',
      [limit]
    );
    return result.rows;
  },

  async markTopicProcessed(id) {
    await pool.query('UPDATE trending_topics SET processed = TRUE WHERE id = $1', [id]);
  },

  async getUnpublishedArticles(limit = 5) {
    const result = await pool.query(
      'SELECT * FROM articles WHERE published = FALSE ORDER BY created_at ASC LIMIT $1',
      [limit]
    );
    return result.rows;
  },

  async getStats() {
    const articles = await pool.query('SELECT COUNT(*) FROM articles');
    const published = await pool.query('SELECT COUNT(*) FROM articles WHERE published = TRUE');
    const totalViews = await pool.query('SELECT SUM(view_count) FROM articles');
    
    return {
      totalArticles: parseInt(articles.rows[0].count),
      publishedArticles: parseInt(published.rows[0].count),
      totalViews: parseInt(totalViews.rows[0].sum || 0)
    };
  },

  async recordAdClick(articleId, adType, ip, userAgent) {
    await pool.query(
      'INSERT INTO ad_clicks (article_id, ad_type, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
      [articleId, adType, ip, userAgent]
    );
  }
};

module.exports = db;