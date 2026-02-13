require('dotenv').config();
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const cron = require('node-cron');

const logger = require('./utils/logger');
const db = require('./utils/database');
const crawler = require('./crawler');
const writer = require('./writer');
const publisher = require('./publisher');
const seo = require('./seo');
const articleRoutes = require('./api/articles');
const sitemapRoutes = require('./api/sitemap');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Performance
app.use(helmet());
app.use(compression());

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/articles', articleRoutes);
app.use('/api/sitemap', sitemapRoutes);

// Homepage
app.get('/', async (req, res) => {
  try {
    const articles = await db.getArticles({ limit: 20, published: true });
    res.render('index', { 
      articles, 
      siteName: process.env.SITE_NAME || 'AI Auto Income',
      siteDescription: process.env.SITE_DESCRIPTION || 'AI自动生成的高质量内容'
    });
  } catch (error) {
    logger.error('Error loading homepage:', error);
    res.status(500).send('Server Error');
  }
});

// Article page
app.get('/article/:slug', async (req, res) => {
  try {
    const article = await db.getArticleBySlug(req.params.slug);
    if (!article) {
      return res.status(404).render('404');
    }
    
    // Get related articles
    const related = await db.getRelatedArticles(article.id, article.tags, 5);
    
    res.render('article', { 
      article, 
      related,
      siteName: process.env.SITE_NAME,
      googleAdsenseClient: process.env.GOOGLE_ADSENSE_CLIENT,
      baiduAdSlot: process.env.BAIDU_ADS_SLOT
    });
  } catch (error) {
    logger.error('Error loading article:', error);
    res.status(500).send('Server Error');
  }
});

// Category pages
app.get('/category/:category', async (req, res) => {
  try {
    const articles = await db.getArticlesByCategory(req.params.category, 20);
    res.render('category', { 
      category: req.params.category,
      articles,
      siteName: process.env.SITE_NAME
    });
  } catch (error) {
    logger.error('Error loading category:', error);
    res.status(500).send('Server Error');
  }
});

// Tag pages
app.get('/tag/:tag', async (req, res) => {
  try {
    const articles = await db.getArticlesByTag(req.params.tag, 20);
    res.render('tag', { 
      tag: req.params.tag,
      articles,
      siteName: process.env.SITE_NAME
    });
  } catch (error) {
    logger.error('Error loading tag:', error);
    res.status(500).send('Server Error');
  }
});

// 404 page
app.use((req, res) => {
  res.status(404).render('404');
});

// Scheduled tasks
if (process.env.ENABLE_AUTO_GENERATION === 'true') {
  // Crawl trending topics every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    logger.info('Starting scheduled crawling...');
    try {
      await crawler.run();
    } catch (error) {
      logger.error('Crawling failed:', error);
    }
  });

  // Generate articles every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    logger.info('Starting scheduled writing...');
    try {
      await writer.run();
    } catch (error) {
      logger.error('Writing failed:', error);
    }
  });

  // Publish articles every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Starting scheduled publishing...');
    try {
      await publisher.publishScheduled();
    } catch (error) {
      logger.error('Publishing failed:', error);
    }
  });

  // Submit sitemap to search engines daily
  cron.schedule('0 2 * * *', async () => {
    logger.info('Submitting sitemap to search engines...');
    try {
      await seo.submitToSearchEngines();
    } catch (error) {
      logger.error('Sitemap submission failed:', error);
    }
  });
}

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info('💰 AI Auto Income System Started');
  logger.info(`📊 Auto-generation: ${process.env.ENABLE_AUTO_GENERATION === 'true' ? 'ENABLED' : 'DISABLED'}`);
});

// Initialize database
db.init().then(() => {
  logger.info('✅ Database initialized');
}).catch(err => {
  logger.error('❌ Database initialization failed:', err);
});