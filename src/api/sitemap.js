const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const SEO = require('../seo');

// Get sitemap
router.get('/', async (req, res) => {
  try {
    const sitemapPath = path.join(__dirname, '../../public/sitemap.xml');
    const sitemap = await fs.readFile(sitemapPath, 'utf8');
    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    // Generate on the fly if not exists
    await SEO.generateSitemap();
    const sitemap = await fs.readFile(path.join(__dirname, '../../public/sitemap.xml'), 'utf8');
    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  }
});

// Regenerate sitemap
router.post('/regenerate', async (req, res) => {
  try {
    await SEO.generateSitemap();
    res.json({ success: true, message: 'Sitemap regenerated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;