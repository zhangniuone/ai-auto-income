const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const db = require('../utils/database');

/**
 * 热点爬虫模块
 * 从多个平台抓取热门话题
 */
class TrendingCrawler {
  constructor() {
    this.sources = [
      { name: 'baidu', handler: this.crawlBaidu.bind(this) },
      { name: 'weibo', handler: this.crawlWeibo.bind(this) },
      { name: 'zhihu', handler: this.crawlZhihu.bind(this) },
      { name: 'toutiao', handler: this.crawlToutiao.bind(this) }
    ];
  }

  async run() {
    logger.info('Starting trending topics crawling...');
    
    for (const source of this.sources) {
      try {
        logger.info(`Crawling ${source.name}...`);
        const topics = await source.handler();
        
        for (const topic of topics) {
          await db.saveTrendingTopic({
            title: topic.title,
            keyword: topic.keyword || topic.title,
            searchVolume: topic.searchVolume || null,
            competition: topic.competition || 'medium',
            source: source.name,
            url: topic.url || null
          });
        }
        
        logger.info(`Saved ${topics.length} topics from ${source.name}`);
      } catch (error) {
        logger.error(`Failed to crawl ${source.name}:`, error.message);
      }
    }
    
    logger.info('Trending crawling completed');
  }

  async crawlBaidu() {
    try {
      const response = await axios.get('https://top.baidu.com/board', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      const topics = [];
      
      $('.category-wrap_iQLoo').each((i, el) => {
        const title = $(el).find('.c-single-text-ellipsis').first().text().trim();
        const hot = $(el).find('.hot-index_1Bl1a').text().trim();
        if (title) {
          topics.push({
            title,
            keyword: title,
            searchVolume: this.parseHotNumber(hot),
            url: $(el).find('a').attr('href')
          });
        }
      });
      
      return topics.slice(0, 20);
    } catch (error) {
      logger.error('Baidu crawling failed:', error.message);
      return this.getMockTopics('baidu');
    }
  }

  async crawlWeibo() {
    // Weibo requires special handling, use mock for now
    return this.getMockTopics('weibo');
  }

  async crawlZhihu() {
    try {
      const response = await axios.get('https://www.zhihu.com/hot', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      const topics = [];
      
      $('.HotList-item').each((i, el) => {
        const title = $(el).find('.HotList-title').text().trim();
        const hot = $(el).find('.HotList-metrics').text().trim();
        if (title) {
          topics.push({
            title,
            keyword: title,
            searchVolume: this.parseHotNumber(hot),
            url: 'https://zhihu.com' + $(el).find('a').attr('href')
          });
        }
      });
      
      return topics.slice(0, 20);
    } catch (error) {
      logger.error('Zhihu crawling failed:', error.message);
      return this.getMockTopics('zhihu');
    }
  }

  async crawlToutiao() {
    return this.getMockTopics('toutiao');
  }

  parseHotNumber(hotStr) {
    if (!hotStr) return null;
    const num = parseFloat(hotStr.replace(/[^\d.]/g, ''));
    if (hotStr.includes('万')) return num * 10000;
    if (hotStr.includes('亿')) return num * 100000000;
    return num;
  }

  getMockTopics(source) {
    // Fallback mock data for testing
    const mockTopics = {
      baidu: [
        { title: 'ChatGPT最新功能发布', keyword: 'ChatGPT', searchVolume: 5000000 },
        { title: 'AI绘画工具推荐', keyword: 'AI绘画', searchVolume: 2000000 },
        { title: '2025年赚钱副业', keyword: '副业赚钱', searchVolume: 1800000 },
        { title: 'Python入门教程', keyword: 'Python教程', searchVolume: 1500000 },
        { title: '高效工作方法', keyword: '效率工具', searchVolume: 1200000 }
      ],
      weibo: [
        { title: 'AI取代哪些工作', keyword: 'AI就业', searchVolume: 3000000 },
        { title: '自媒体运营技巧', keyword: '自媒体', searchVolume: 2500000 },
        { title: '数码产品评测', keyword: '数码评测', searchVolume: 2000000 }
      ],
      zhihu: [
        { title: '如何学习编程', keyword: '编程学习', searchVolume: 2800000 },
        { title: '好用的软件推荐', keyword: '软件推荐', searchVolume: 2200000 },
        { title: '人工智能发展趋势', keyword: 'AI趋势', searchVolume: 1900000 }
      ],
      toutiao: [
        { title: '手机摄影技巧', keyword: '手机摄影', searchVolume: 1600000 },
        { title: '短视频制作方法', keyword: '短视频', searchVolume: 1400000 },
        { title: '健康生活方式', keyword: '健康生活', searchVolume: 1100000 }
      ]
    };
    return mockTopics[source] || [];
  }
}

module.exports = new TrendingCrawler();