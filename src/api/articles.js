const express = require('express');
const router = express.Router();
const db = require('../utils/database');

// Get articles list
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0, category, tag } = req.query;
    let articles;
    
    if (category) {
      articles = await db.getArticlesByCategory(category, parseInt(limit));
    } else if (tag) {
      articles = await db.getArticlesByTag(tag, parseInt(limit));
    } else {
      articles = await db.getArticles({ 
        limit: parseInt(limit), 
        offset: parseInt(offset),
        published: true 
      });
    }
    
    res.json({ success: true, data: articles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single article
router.get('/:id', async (req, res) => {
  try {
    const article = await db.getArticleById(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    res.json({ success: true, data: article });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;