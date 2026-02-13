const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const db = require('../utils/database');

/**
 * SEO 模块
 * 生成 sitemap 和提交搜索引擎
 */
class SEO {
  async generateSitemap() {
    logger.info('Generating sitemap...');
    
    const articles = await db.getArticles({ limit: 1000, published: true });
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${process.env.SITE_URL || 'http://localhost:3000'}/</loc>
    <priority>1.0</priority>
    <changefreq>daily</changefreq>
  </url>
  ${articles.map(article => `
  <url>
    <loc>${process.env.SITE_URL || 'http://localhost:3000'}/article/${article.slug}</loc>
    <lastmod>${article.published_at ? new Date(article.published_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>
  `).join('')}
</urlset>`;
    
    const sitemapPath = path.join(__dirname, '../../public/sitemap.xml');
    await fs.writeFile(sitemapPath, sitemap);
    
    logger.info(`Sitemap generated with ${articles.length} URLs`);
    return sitemapPath;
  }

  async submitToSearchEngines() {
    const sitemapUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/sitemap.xml`;
    
    // Submit to Google
    if (process.env.GOOGLE_SEARCH_CONSOLE_URL) {
      try {
        await axios.get(`${process.env.GOOGLE_SEARCH_CONSOLE_URL}/sitemap.xml`, {
          params: { sitemap: sitemapUrl }
        });
        logger.info('Submitted sitemap to Google');
      } catch (error) {
        logger.error('Failed to submit to Google:', error.message);
      }
    }
    
    // Submit to Baidu
    if (process.env.BAIDU_SEARCH_SUBMIT_URL) {
      try {
        await axios.post(process.env.BAIDU_SEARCH_SUBMIT_URL, {
          site: process.env.SITE_URL,
          token: process.env.BAIDU_TOKEN,
          sitemap: sitemapUrl
        });
        logger.info('Submitted sitemap to Baidu');
      } catch (error) {
        logger.error('Failed to submit to Baidu:', error.message);
      }
    }
    
    // Ping other search engines
    await this.pingSearchEngines(sitemapUrl);
  }

  async pingSearchEngines(sitemapUrl) {
    const pingUrls = [
      `http://www.google.com/webmasters/sitemaps/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
      `http://www.bing.com/webmaster/ping.aspx?siteMap=${encodeURIComponent(sitemapUrl)}`
    ];
    
    for (const url of pingUrls) {
      try {
        await axios.get(url, { timeout: 10000 });
        logger.info(`Pinged: ${url}`);
      } catch (error) {
        logger.warn(`Ping failed: ${url}`);
      }
    }
  }

  generateMetaTags(article) {
    return {
      title: article.meta_title || article.title,
      description: article.meta_description || article.summary,
      keywords: article.keywords ? article.keywords.join(', ') : '',
      ogTitle: article.title,
      ogDescription: article.summary,
      ogImage: article.image_url || `${process.env.SITE_URL}/default-og.jpg`,
      ogUrl: `${process.env.SITE_URL}/article/${article.slug}`,
      canonical: `${process.env.SITE_URL}/article/${article.slug}`
    };
  }

  generateSchemaOrg(article) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.summary,
      image: article.image_url,
      datePublished: article.published_at,
      dateModified: article.updated_at,
      author: {
        '@type': 'Organization',
        name: process.env.SITE_NAME
      },
      publisher: {
        '@type': 'Organization',
        name: process.env.SITE_NAME,
        logo: {
          '@type': 'ImageObject',
          url: `${process.env.SITE_URL}/logo.png`
        }
      }
    };
  }
}

module.exports = new SEO();