import { NewsArticle } from '../types';

const NEWS_FEED_URLS = [
  'https://news.google.com/rss/search?q=motorcycle+india+when:7d&hl=en-IN&gl=IN&ceid=IN:en',
  'https://news.google.com/rss/search?q=bike+launch+india+when:7d&hl=en-IN&gl=IN&ceid=IN:en',
  'https://news.google.com/rss/search?q=motogp+when:7d&hl=en&gl=US&ceid=US:en'
];

const MAX_NEWS_ITEMS = 24;
const FETCH_TIMEOUT_MS = 12000;
const ARTICLE_IMAGE_FETCH_TIMEOUT_MS = 6000;
const GOOGLE_NEWS_ARTICLE_FETCH_TIMEOUT_MS = 7000;
const ARTICLE_IMAGE_ENRICH_LIMIT = MAX_NEWS_ITEMS;
const ARTICLE_URL_RESOLVE_LIMIT = MAX_NEWS_ITEMS;
const GOOGLE_NEWS_BATCH_EXECUTE_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute';

type ParsedNewsItem = {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  image?: string;
  tags: string[];
};

const articleImageCache = new Map<string, string | null>();
const resolvedArticleUrlCache = new Map<string, string | null>();
let googleNewsDecodeCooldownUntil = 0;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripCdata = (value: string): string => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

const decodeXmlEntities = (value: string): string =>
  stripCdata(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(x?[0-9a-fA-F]+);/g, (_, rawCode: string) => {
      const code = rawCode.startsWith('x') || rawCode.startsWith('X') ? Number.parseInt(rawCode.slice(1), 16) : Number.parseInt(rawCode, 10);
      if (!Number.isFinite(code) || code <= 0) return '';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    });

const stripHtml = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const readTag = (block: string, tagName: string): string => {
  const pattern = new RegExp(`<${escapeRegex(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, 'i');
  const match = block.match(pattern);
  return match ? decodeXmlEntities(match[1]).trim() : '';
};

const readTagAttr = (block: string, tagName: string, attrName: string): string => {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*\\b${escapeRegex(attrName)}=(["'])([^"']+)\\1[^>]*>`, 'i');
  const match = block.match(pattern);
  return match ? decodeXmlEntities(match[2]).trim() : '';
};

const toIsoDate = (value: string): string => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const normalizeImageUrl = (value: string): string | undefined => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return undefined;
  if (normalized.startsWith('//')) return `https:${normalized}`;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return undefined;
};

const extractImageFromHtml = (value: string): string | undefined => {
  if (!value) return undefined;
  const match = value.match(/<img\b[^>]*\bsrc=(["'])(https?:\/\/[^"']+)\1/i);
  if (!match?.[2]) return undefined;
  return normalizeImageUrl(match[2]);
};

const readHtmlAttr = (tag: string, attrName: string): string => {
  const pattern = new RegExp(`\\b${escapeRegex(attrName)}=(["'])([\\s\\S]*?)\\1`, 'i');
  const match = tag.match(pattern);
  return match ? decodeXmlEntities(match[2]).trim() : '';
};

const resolveImageUrl = (candidate: string, baseUrl: string): string | undefined => {
  const normalizedCandidate = normalizeWhitespace(candidate);
  if (!normalizedCandidate) return undefined;
  try {
    return new URL(normalizedCandidate, baseUrl).toString();
  } catch {
    return normalizeImageUrl(normalizedCandidate);
  }
};

const getUrlHostname = (value: string): string => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const isGoogleNewsHost = (hostname: string): boolean => /^news\.google\./i.test(hostname);

const isGoogleOwnedHost = (hostname: string): boolean =>
  /^(.+\.)?google\./i.test(hostname) || hostname.endsWith('gstatic.com') || hostname.endsWith('googleusercontent.com');

const extractGoogleNewsArticleId = (value: string): string | undefined => {
  try {
    const parsed = new URL(value);
    if (!isGoogleNewsHost(parsed.hostname.toLowerCase())) return undefined;
    const match = parsed.pathname.match(/\/(?:rss\/articles|articles|read)\/([^/?#]+)/i);
    return match?.[1] ? normalizeWhitespace(match[1]) : undefined;
  } catch {
    return undefined;
  }
};

const extractHttpLinksFromHtml = (value: string): string[] => {
  if (!value) return [];
  const links: string[] = [];
  const matches = value.matchAll(/\bhref=(["'])(https?:\/\/[^"']+)\1/gi);
  for (const match of matches) {
    if (!match[2]) continue;
    const normalized = normalizeImageUrl(match[2]);
    if (normalized) links.push(normalized);
  }
  return links;
};

const unwrapGoogleRedirect = (value: string): string => {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (!isGoogleOwnedHost(hostname)) return value;
    const redirected = parsed.searchParams.get('url') || parsed.searchParams.get('q') || '';
    const normalizedRedirect = normalizeImageUrl(redirected);
    return normalizedRedirect ?? value;
  } catch {
    return value;
  }
};

const resolvePublisherArticleUrl = (primaryUrl: string, htmlBlocks: string[]): string => {
  const normalizedPrimary = normalizeImageUrl(primaryUrl);
  if (!normalizedPrimary) return primaryUrl;

  const primaryHost = getUrlHostname(normalizedPrimary);
  if (!isGoogleNewsHost(primaryHost)) return normalizedPrimary;

  const linkCandidates = htmlBlocks.flatMap(extractHttpLinksFromHtml);
  for (const candidate of linkCandidates) {
    const unwrapped = unwrapGoogleRedirect(candidate);
    const host = getUrlHostname(unwrapped);
    if (!host || isGoogleNewsHost(host)) continue;
    return unwrapped;
  }

  return normalizedPrimary;
};

const isLikelyGenericGoogleNewsImage = (imageUrl: string): boolean => {
  try {
    const parsed = new URL(imageUrl);
    const hostname = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (!isGoogleOwnedHost(hostname)) return false;
    if (hostname.includes('blogspot') || hostname.includes('ggpht') || /^lh\d+\.googleusercontent\.com$/i.test(hostname)) {
      return false;
    }
    return (
      path.includes('/images/branding/product') ||
      path.includes('news_') ||
      path.includes('googlenews') ||
      path.includes('/news/') ||
      path.includes('/logos/') ||
      path.includes('/favicon') ||
      path.includes('/branding/') ||
      hostname.endsWith('gstatic.com')
    );
  } catch {
    return false;
  }
};

const shouldDiscardImageForArticle = (articleUrl: string, imageUrl: string): boolean => {
  const imageHost = getUrlHostname(imageUrl);
  if (!imageHost) return true;

  const articleHost = getUrlHostname(articleUrl);
  if (isGoogleNewsHost(articleHost) && isGoogleOwnedHost(imageHost)) return true;

  return isLikelyGenericGoogleNewsImage(imageUrl);
};

const decodeGoogleNewsArticleUrl = async (url: string): Promise<string | undefined> => {
  if (Date.now() < googleNewsDecodeCooldownUntil) return undefined;

  const articleId = extractGoogleNewsArticleId(url);
  if (!articleId) return url;

  if (resolvedArticleUrlCache.has(url)) {
    const cached = resolvedArticleUrlCache.get(url);
    return cached ?? undefined;
  }

  const articleController = new AbortController();
  const articleTimeout = setTimeout(() => articleController.abort(), GOOGLE_NEWS_ARTICLE_FETCH_TIMEOUT_MS);

  try {
    const articleResponse = await fetch(`https://news.google.com/articles/${articleId}`, {
      signal: articleController.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        Referer: 'https://news.google.com/'
      }
    });

    if (!articleResponse.ok) {
      if (articleResponse.status === 429) {
        googleNewsDecodeCooldownUntil = Date.now() + 10 * 60 * 1000;
      }
      resolvedArticleUrlCache.set(url, null);
      return undefined;
    }

    const articleHtml = await articleResponse.text();
    const articleIdMatch = articleHtml.match(/data-n-a-id="([^"]+)"/);
    const signatureMatch = articleHtml.match(/data-n-a-sg="([^"]+)"/);
    const timestampMatch = articleHtml.match(/data-n-a-ts="([^"]+)"/);
    const articleRequestId = articleIdMatch?.[1] ? normalizeWhitespace(articleIdMatch[1]) : articleId;
    const signature = signatureMatch?.[1] ? normalizeWhitespace(signatureMatch[1]) : '';
    const timestamp = timestampMatch?.[1] ? normalizeWhitespace(timestampMatch[1]) : '';

    if (!articleRequestId || !signature || !timestamp || !/^\d+$/.test(timestamp)) {
      resolvedArticleUrlCache.set(url, null);
      return undefined;
    }

    const decodeController = new AbortController();
    const decodeTimeout = setTimeout(() => decodeController.abort(), GOOGLE_NEWS_ARTICLE_FETCH_TIMEOUT_MS);
    try {
      const requestParams =
        `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],` +
        `"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${articleRequestId}",${timestamp},"${signature}"]`;
      const requestPayload = JSON.stringify([[['Fbv4je', requestParams, null, 'generic']]]);
      const decodeResponse = await fetch(GOOGLE_NEWS_BATCH_EXECUTE_URL, {
        method: 'POST',
        signal: decodeController.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Referer: 'https://news.google.com/'
        },
        body: `f.req=${encodeURIComponent(requestPayload)}`
      });

      if (!decodeResponse.ok) {
        if (decodeResponse.status === 429) {
          googleNewsDecodeCooldownUntil = Date.now() + 10 * 60 * 1000;
        }
        resolvedArticleUrlCache.set(url, null);
        return undefined;
      }

      const responseText = await decodeResponse.text();
      const chunk = responseText
        .split('\n\n')
        .find((part) => part.trim().startsWith('[[') && part.includes('"wrb.fr"') && part.includes('"Fbv4je"'));
      if (!chunk) {
        resolvedArticleUrlCache.set(url, null);
        return undefined;
      }

      const parsedChunk = JSON.parse(chunk) as unknown[];
      const decodeRow = parsedChunk.find(
        (row): row is [string, string, string] =>
          Array.isArray(row) &&
          row.length >= 3 &&
          row[0] === 'wrb.fr' &&
          row[1] === 'Fbv4je' &&
          typeof row[2] === 'string'
      );
      if (!decodeRow) {
        if (responseText.includes('[3]')) {
          googleNewsDecodeCooldownUntil = Date.now() + 5 * 60 * 1000;
        }
        resolvedArticleUrlCache.set(url, null);
        return undefined;
      }

      const parsedDecodePayload = JSON.parse(decodeRow[2]) as unknown[];
      const decodedUrl = Array.isArray(parsedDecodePayload) && typeof parsedDecodePayload[1] === 'string'
        ? normalizeImageUrl(parsedDecodePayload[1])
        : undefined;
      if (!decodedUrl) {
        resolvedArticleUrlCache.set(url, null);
        return undefined;
      }

      resolvedArticleUrlCache.set(url, decodedUrl);
      return decodedUrl;
    } finally {
      clearTimeout(decodeTimeout);
    }
  } catch {
    resolvedArticleUrlCache.set(url, null);
    return undefined;
  } finally {
    clearTimeout(articleTimeout);
  }
};

const extractMetaImageFromHtml = (html: string, baseUrl: string): string | undefined => {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const property = readHtmlAttr(tag, 'property').toLowerCase();
    const name = readHtmlAttr(tag, 'name').toLowerCase();
    const itemProp = readHtmlAttr(tag, 'itemprop').toLowerCase();
    const key = property || name || itemProp;
    if (!['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image'].includes(key)) continue;

    const content = readHtmlAttr(tag, 'content');
    const resolved = resolveImageUrl(content, baseUrl);
    if (resolved) return resolved;
  }
  return undefined;
};

const fetchArticlePreviewImage = async (url: string): Promise<string | undefined> => {
  if (!url.startsWith('http')) return undefined;
  if (articleImageCache.has(url)) {
    const cached = articleImageCache.get(url);
    return cached ?? undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) {
      articleImageCache.set(url, null);
      return undefined;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      articleImageCache.set(url, null);
      return undefined;
    }

    const html = await response.text();
    const pageUrl = response.url || url;
    const metaImage = extractMetaImageFromHtml(html, pageUrl);
    const inlineImage = extractImageFromHtml(html);
    const image = metaImage || (inlineImage ? resolveImageUrl(inlineImage, pageUrl) : undefined);
    const pageHost = getUrlHostname(pageUrl);
    const imageHost = image ? getUrlHostname(image) : '';
    const sanitizedImage = image && isGoogleNewsHost(pageHost) && (isLikelyGenericGoogleNewsImage(image) || isGoogleOwnedHost(imageHost))
      ? undefined
      : image;
    articleImageCache.set(url, sanitizedImage ?? null);
    return sanitizedImage;
  } catch {
    articleImageCache.set(url, null);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};

const titleToKey = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getHostnameSource = (url: string): string => {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname || 'News';
  } catch {
    return 'News';
  }
};

const normalizeUrlForDedup = (value: string): string => {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref', 'ref_src'].forEach((param) =>
      parsed.searchParams.delete(param)
    );
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
    parsed.pathname = normalizedPath;
    return parsed.toString();
  } catch {
    return value.trim();
  }
};

const TAG_MATCHERS: Array<{ tag: string; terms: string[] }> = [
  { tag: 'Launch', terms: ['launch', 'unveiled', 'debut', 'facelift'] },
  { tag: 'Safety', terms: ['helmet', 'safety', 'abs', 'brake', 'crash'] },
  { tag: 'EV', terms: ['electric', 'battery', 'charging', 'ev', 'range'] },
  { tag: 'Racing', terms: ['motogp', 'race', 'prix', 'championship'] },
  { tag: 'Policy', terms: ['policy', 'rule', 'regulation', 'government', 'norms'] },
  { tag: 'Market', terms: ['sales', 'demand', 'market', 'segment', 'growth'] },
  { tag: 'India', terms: ['india', 'bharat', 'delhi', 'mumbai', 'bengaluru'] }
];

const buildTags = (title: string, summary: string): string[] => {
  const searchable = `${title} ${summary}`.toLowerCase();
  const tags = TAG_MATCHERS.filter(({ terms }) => terms.some((term) => searchable.includes(term))).map(({ tag }) => tag);
  if (tags.length > 0) return tags.slice(0, 4);
  return ['Motorcycles'];
};

const recencyHours = (publishedAt: string): number => {
  const time = new Date(publishedAt).getTime();
  if (Number.isNaN(time)) return 9999;
  return Math.max(0, (Date.now() - time) / (1000 * 60 * 60));
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const scoreNewsItem = (item: ParsedNewsItem): { relevanceScore: number; viralityScore: number } => {
  const searchable = `${item.title} ${item.summary}`.toLowerCase();
  const keywordMatches = TAG_MATCHERS.reduce((count, matcher) => count + (matcher.terms.some((term) => searchable.includes(term)) ? 1 : 0), 0);
  const ageHours = recencyHours(item.publishedAt);

  const recencyBoost = ageHours <= 2 ? 22 : ageHours <= 6 ? 16 : ageHours <= 24 ? 10 : ageHours <= 72 ? 4 : 0;
  const relevanceScore = clamp(52 + keywordMatches * 8 + recencyBoost, 35, 99);

  const titleSignals = Number(/\d/.test(item.title)) + Number(item.title.includes(':')) + Number(item.title.length > 70);
  const viralityScore = clamp(45 + keywordMatches * 7 + titleSignals * 4 + (ageHours <= 12 ? 11 : 0), 30, 95);

  return { relevanceScore, viralityScore };
};

const parseItemFromRss = (block: string): ParsedNewsItem | null => {
  const title = normalizeWhitespace(readTag(block, 'title'));
  const rawLink = readTag(block, 'link') || readTag(block, 'guid');
  const normalizedRawUrl = normalizeWhitespace(rawLink);
  if (!title || !normalizedRawUrl.startsWith('http')) return null;

  const rawDescription = readTag(block, 'description');
  const rawContent = readTag(block, 'content:encoded');
  const url = resolvePublisherArticleUrl(normalizedRawUrl, [rawDescription, rawContent]);
  const sourceFromTag = normalizeWhitespace(readTag(block, 'source'));
  const source = sourceFromTag || getHostnameSource(url);
  const publishedAt = toIsoDate(readTag(block, 'pubDate'));
  const summary = stripHtml(rawDescription || rawContent) || title;

  const mediaContentType = readTagAttr(block, 'media:content', 'type').toLowerCase();
  const mediaContentImage = mediaContentType && !mediaContentType.startsWith('image/') ? '' : readTagAttr(block, 'media:content', 'url');
  const mediaThumbnailImage = readTagAttr(block, 'media:thumbnail', 'url');
  const enclosureType = readTagAttr(block, 'enclosure', 'type').toLowerCase();
  const enclosureImage = enclosureType && !enclosureType.startsWith('image/') ? '' : readTagAttr(block, 'enclosure', 'url');
  const itunesImage = readTagAttr(block, 'itunes:image', 'href');
  const descriptionImage = extractImageFromHtml(rawDescription);
  const contentImage = extractImageFromHtml(rawContent);

  const imageCandidates = [mediaContentImage, mediaThumbnailImage, enclosureImage, itunesImage, descriptionImage, contentImage];
  const image = imageCandidates
    .map((candidate) => normalizeImageUrl(candidate ?? ''))
    .filter((candidate): candidate is string => Boolean(candidate))
    .find((candidate) => !shouldDiscardImageForArticle(url, candidate));

  return {
    title,
    summary,
    url,
    source,
    publishedAt,
    image,
    tags: buildTags(title, summary)
  };
};

const parseRssFeed = (xml: string): ParsedNewsItem[] => {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  return itemBlocks.map(parseItemFromRss).filter((item): item is ParsedNewsItem => item !== null);
};

const fetchSingleFeed = async (url: string): Promise<ParsedNewsItem[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`Feed request failed with status ${response.status}`);
    }

    const xml = await response.text();
    if (!xml.includes('<rss') && !xml.includes('<feed')) {
      throw new Error('Feed response was not a valid RSS or Atom payload.');
    }

    return parseRssFeed(xml);
  } finally {
    clearTimeout(timeout);
  }
};

const mergeAndRankArticles = (items: ParsedNewsItem[]): NewsArticle[] => {
  if (items.length === 0) return [];

  const titleCounts = new Map<string, number>();
  items.forEach((item) => {
    const key = titleToKey(item.title);
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  });

  const sortedByDate = [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const uniqueByTitle = new Map<string, ParsedNewsItem>();
  sortedByDate.forEach((item) => {
    const key = titleToKey(item.title);
    const existing = uniqueByTitle.get(key);
    if (!existing) {
      uniqueByTitle.set(key, item);
      return;
    }

    if (!existing.image && item.image) {
      uniqueByTitle.set(key, { ...existing, image: item.image });
    }
  });

  const result: NewsArticle[] = Array.from(uniqueByTitle.values()).map((item) => {
    const key = titleToKey(item.title);
    const duplicates = Math.max(0, (titleCounts.get(key) ?? 1) - 1);
    const duplicateScore = clamp(duplicates / 3, 0, 0.95);
    const { relevanceScore, viralityScore } = scoreNewsItem(item);

    return {
      id: `${key.slice(0, 48)}-${new Date(item.publishedAt).getTime()}`,
      title: item.title,
      source: item.source,
      url: item.url,
      image: item.image,
      imageDebugSource: item.image ? 'feed' : 'fallback',
      publishedAt: item.publishedAt,
      summary: item.summary,
      tags: item.tags,
      duplicateScore,
      relevanceScore,
      viralityScore
    };
  });

  const ranked = result
    .sort((a, b) => {
      const timeDiff = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      const relevanceDiff = b.relevanceScore - a.relevanceScore;
      if (relevanceDiff !== 0) return relevanceDiff;
      return b.viralityScore - a.viralityScore;
    })
    .slice(0, MAX_NEWS_ITEMS * 2);

  // Final dedupe guard: some feeds repeat the same story with tracking URL variants.
  const seenDedupKeys = new Set<string>();
  const deduped: NewsArticle[] = [];
  for (const article of ranked) {
    const normalizedUrl = normalizeUrlForDedup(article.url);
    const titleKey = titleToKey(article.title);
    const timeKey = new Date(article.publishedAt).getTime();
    const dedupKeys = [`url:${normalizedUrl}`, `title_time:${titleKey}:${timeKey}`];
    const isDuplicate = dedupKeys.some((key) => seenDedupKeys.has(key));
    if (isDuplicate) continue;
    dedupKeys.forEach((key) => seenDedupKeys.add(key));
    deduped.push(article);
    if (deduped.length >= MAX_NEWS_ITEMS) break;
  }

  return deduped;
};

const enrichArticleImages = async (articles: NewsArticle[]): Promise<NewsArticle[]> => {
  const resolveCandidates = articles
    .map((article, index) => ({ article, index }))
    .filter(({ article }) => isGoogleNewsHost(getUrlHostname(article.url)))
    .slice(0, ARTICLE_URL_RESOLVE_LIMIT);

  const resolvedUpdates = await Promise.all(
    resolveCandidates.map(async ({ article, index }) => ({
      index,
      resolvedUrl: await decodeGoogleNewsArticleUrl(article.url)
    }))
  );

  const resolvedArticles = [...articles];
  resolvedUpdates.forEach(({ index, resolvedUrl }) => {
    if (!resolvedUrl || resolvedUrl === resolvedArticles[index].url) return;
    resolvedArticles[index] = {
      ...resolvedArticles[index],
      url: resolvedUrl
    };
  });

  const imageCandidateIndexes = resolvedArticles
    .map((article, index) => ({ article, index }))
    .filter(({ article }) => !article.image || shouldDiscardImageForArticle(article.url, article.image))
    .slice(0, ARTICLE_IMAGE_ENRICH_LIMIT);

  const updates = await Promise.all(
    imageCandidateIndexes.map(async ({ article, index }) => ({
      index,
      image: await fetchArticlePreviewImage(article.url)
    }))
  );

  const nextArticles = [...resolvedArticles];
  updates.forEach(({ index, image }) => {
    if (!image) return;
    nextArticles[index] = {
      ...nextArticles[index],
      image,
      imageDebugSource: 'enriched'
    };
  });

  return nextArticles.map((article) =>
    article.image && !shouldDiscardImageForArticle(article.url, article.image)
      ? article
      : {
          ...article,
          image: undefined,
          imageDebugSource: 'fallback'
        }
  );
};

export const fetchLatestNewsArticles = async (): Promise<NewsArticle[]> => {
  const feedResults = await Promise.allSettled(NEWS_FEED_URLS.map((url) => fetchSingleFeed(url)));
  const successfulFeeds = feedResults
    .filter((result): result is PromiseFulfilledResult<ParsedNewsItem[]> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (successfulFeeds.length === 0) {
    throw new Error('Unable to reach any news feed endpoint.');
  }

  const merged = mergeAndRankArticles(successfulFeeds.flat());
  if (merged.length === 0) {
    throw new Error('No news items were returned by the available feeds.');
  }

  return enrichArticleImages(merged);
};
