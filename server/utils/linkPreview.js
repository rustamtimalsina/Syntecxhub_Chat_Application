const cheerio = require('cheerio');

const URL_REGEX = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/i;
const previewCache = new Map(); // url -> preview object

const extractUrl = (text) => {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
};

const getLinkPreview = async (text) => {
  const url = extractUrl(text);
  if (!url) return null;

  // Don't fetch direct media files
  if (/\.(jpeg|jpg|png|gif|webp|mp4|webm|svg)(\?.*)?$/i.test(url)) {
    return null;
  }

  if (previewCache.has(url)) {
    return previewCache.get(url);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    let image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      '';

    // Normalize relative image URLs
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, url).href;
      } catch {
        image = '';
      }
    }

    const siteName =
      $('meta[property="og:site_name"]').attr('content') ||
      new URL(url).hostname.replace(/^www\./, '');

    if (!title && !description) return null;

    const preview = {
      url,
      title: title.trim().slice(0, 150),
      description: description.trim().slice(0, 240),
      image: image ? image.trim() : null,
      siteName: siteName.trim(),
    };

    // Cache up to 300 previews in memory
    if (previewCache.size > 300) {
      const firstKey = previewCache.keys().next().value;
      previewCache.delete(firstKey);
    }
    previewCache.set(url, preview);

    return preview;
  } catch {
    return null;
  }
};

module.exports = {
  extractUrl,
  getLinkPreview,
};
