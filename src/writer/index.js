const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../utils/database');

/**
 * AI 写作模块
 * 使用大模型生成高质量文章
 */
class AIWriter {
  constructor() {
    this.apiKey = process.env.KIMI_API_KEY || process.env.OPENAI_API_KEY;
    this.apiUrl = process.env.KIMI_API_KEY 
      ? 'https://api.moonshot.cn/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    this.model = process.env.KIMI_API_KEY ? 'moonshot-v1-8k' : 'gpt-4';
  }

  async run() {
    logger.info('Starting AI writing process...');
    
    const topics = await db.getUnprocessedTopics(10);
    logger.info(`Found ${topics.length} unprocessed topics`);
    
    for (const topic of topics) {
      try {
        logger.info(`Generating article for: ${topic.title}`);
        
        const article = await this.generateArticle(topic);
        
        if (article) {
          const saved = await db.createArticle(article);
          await db.markTopicProcessed(topic.id);
          logger.info(`Article saved: ${saved.slug}`);
        }
        
        // Rate limiting
        await this.sleep(2000);
        
      } catch (error) {
        logger.error(`Failed to generate article for ${topic.title}:`, error.message);
      }
    }
    
    logger.info('AI writing process completed');
  }

  async generateArticle(topic) {
    const wordCount = this.getRandomWordCount();
    const category = this.categorizeTopic(topic.keyword);
    
    // Generate title
    const title = await this.generateTitle(topic.title);
    
    // Generate content
    const content = await this.generateContent(title, topic.keyword, wordCount);
    
    // Generate summary
    const summary = await this.generateSummary(content);
    
    // Extract keywords
    const keywords = this.extractKeywords(content, topic.keyword);
    
    // Generate slug
    const slug = this.generateSlug(title);
    
    // Generate meta tags
    const metaTitle = title.slice(0, 60);
    const metaDescription = summary.slice(0, 160);
    
    // Generate tags
    const tags = this.generateTags(topic.keyword, category);
    
    return {
      title,
      slug,
      content: this.addAffiliateLinks(content),
      summary,
      category,
      tags,
      keywords,
      metaTitle,
      metaDescription,
      imageUrl: null, // Could integrate with image generation API
      sourceUrl: topic.url,
      sourceType: topic.source,
      wordCount: this.countWords(content)
    };
  }

  async generateTitle(topic) {
    const prompt = `为以下话题生成一个吸引人的文章标题（15-25字）：
话题：${topic}
要求：
- 包含数字或具体价值
- 引发好奇心
- 适合SEO
- 直接返回标题，不要其他内容`;

    const title = await this.callAI(prompt);
    return title.replace(/["']/g, '').trim();
  }

  async generateContent(title, keyword, wordCount) {
    const sections = Math.ceil(wordCount / 500);
    let content = '';
    
    // Introduction
    const introPrompt = `为文章"${title}"写一个引人入胜的开头（200-300字）。
关键词：${keyword}
要求：
- 提出痛点或问题
- 承诺解决方案
- 语言自然流畅`;
    
    content += await this.callAI(introPrompt);
    content += '\n\n';
    
    // Body sections
    for (let i = 1; i <= sections; i++) {
      const sectionPrompt = `继续写文章的第${i}部分（400-500字）。
文章标题：${title}
关键词：${keyword}
要求：
- 使用小标题
- 提供具体方法或案例
- 语言通俗易懂
- 适当使用列表和加粗`;
      
      content += await this.callAI(sectionPrompt);
      content += '\n\n';
    }
    
    // Conclusion
    const conclusionPrompt = `为文章"${title}"写一个总结段落（150-200字）。
要求：
- 总结要点
- 给出行动建议
- 引导读者评论或分享`;
    
    content += await this.callAI(conclusionPrompt);
    
    return this.formatContent(content, title);
  }

  async generateSummary(content) {
    const prompt = `总结以下文章的核心内容（100字以内）：
${content.slice(0, 2000)}
要求：简洁明了，包含主要观点。`;
    
    return await this.callAI(prompt);
  }

  async callAI(prompt) {
    if (!this.apiKey) {
      logger.warn('No API key configured, using mock response');
      return this.getMockResponse(prompt);
    }

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            { role: 'system', content: '你是一个专业的内容创作者，擅长写高质量的SEO文章。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );
      
      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('AI API call failed:', error.message);
      return this.getMockResponse(prompt);
    }
  }

  getMockResponse(prompt) {
    // Fallback content generation
    if (prompt.includes('标题')) {
      return '2025年最值得学习的10个AI工具，助你效率翻倍';
    }
    if (prompt.includes('开头') || prompt.includes('开头')) {
      return '随着人工智能技术的快速发展，越来越多的AI工具走进了我们的日常生活。无论是工作效率的提升，还是创作能力的增强，AI都在发挥着越来越重要的作用。今天，我将为大家推荐2025年最值得关注的AI工具。';
    }
    return '这是一段由AI生成的示例内容。在实际运行中，当你配置了API密钥后，这里将显示由真实AI模型生成的内容。';
  }

  formatContent(content, title) {
    // Add HTML formatting
    let formatted = content
      .replace(/^#+\s*/gm, '') // Remove markdown headers
      .replace(/\*\*/g, '') // Remove bold markers for now
      .replace(/\n\n/g, '</p>\u003cp>') // Paragraphs
      .replace(/^(.+)$/gm, (match) => {
        if (match.includes('：') && match.length < 50) {
          return `<h2>${match}</h2>`;
        }
        return match;
      });
    
    return `<h1>${title}</h1>\n<article>\n<p>${formatted}</p>\n</article>`;
  }

  addAffiliateLinks(content) {
    // Auto-insert affiliate links for product mentions
    const affiliateProducts = [
      { name: 'ChatGPT', link: 'https://chat.openai.com' },
      { name: 'Notion', link: 'https://notion.so' },
      { name: 'Midjourney', link: 'https://midjourney.com' }
    ];
    
    let modified = content;
    affiliateProducts.forEach(product => {
      const regex = new RegExp(product.name, 'g');
      modified = modified.replace(regex, `<a href="${product.link}" target="_blank" rel="nofollow">${product.name}</a>`);
    });
    
    return modified;
  }

  categorizeTopic(keyword) {
    const categories = {
      'tech': ['AI', 'ChatGPT', '编程', '软件', '数码', '科技'],
      'finance': ['赚钱', '理财', '投资', '副业', '收入'],
      'lifestyle': ['健康', '生活', '效率', '工具', '方法'],
      'education': ['学习', '教程', '入门', '课程', '技能']
    };
    
    for (const [cat, keywords] of Object.entries(categories)) {
      if (keywords.some(k => keyword.includes(k))) {
        return cat;
      }
    }
    return 'general';
  }

  extractKeywords(content, mainKeyword) {
    // Simple keyword extraction
    const words = content.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    const freq = {};
    words.forEach(w => {
      if (w.length >= 2 && w.length <= 6) {
        freq[w] = (freq[w] || 0) + 1;
      }
    });
    
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w);
    
    return [mainKeyword, ...sorted].slice(0, 10);
  }

  generateTags(keyword, category) {
    const baseTags = [keyword, category];
    const extraTags = {
      'tech': ['人工智能', '科技', '工具'],
      'finance': ['赚钱', '副业', '财务自由'],
      'lifestyle': ['效率', '生活', '方法'],
      'education': ['学习', '教程', '技能']
    };
    
    return [...baseTags, ...(extraTags[category] || [])].slice(0, 5);
  }

  generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50) + '-' + Date.now().toString(36);
  }

  countWords(content) {
    const cn = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const en = (content.match(/[a-zA-Z]+/g) || []).length;
    return cn + en;
  }

  getRandomWordCount() {
    // Random between 1500 and 3000
    return Math.floor(Math.random() * 1500) + 1500;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AIWriter();