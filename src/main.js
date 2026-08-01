import { readFile } from 'node:fs/promises';

import { Actor, log } from 'apify';
import { Impit } from 'impit';

const DEFAULT_COLLECTION_URL = 'https://antonioli.eu/en-row/collections/man';
const MAX_COLLECTION_PAGE_SIZE = 250;
const SEARCH_SUGGESTION_LIMIT = 10;
const MAX_REQUEST_RETRIES = 3;

await Actor.init();

function parsePositiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanValue(value) {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'string') {
        return value.trim() ? value : undefined;
    }

    if (Array.isArray(value)) {
        const cleaned = value.map(cleanValue).filter((item) => item !== undefined);
        return cleaned.length ? cleaned : undefined;
    }

    if (isObject(value)) {
        const cleaned = {};
        for (const [key, nestedValue] of Object.entries(value)) {
            const nextValue = cleanValue(nestedValue);
            if (nextValue !== undefined) cleaned[key] = nextValue;
        }
        return Object.keys(cleaned).length ? cleaned : undefined;
    }

    return value;
}

function getLocalePrefix(pathname) {
    const segments = pathname.split('/').filter(Boolean);
    const markerIndex = segments.findIndex((segment) => {
        const marker = segment.toLowerCase().replace(/\.(?:json|js)$/i, '');
        return ['collections', 'products', 'search'].includes(marker);
    });
    return markerIndex > 0 ? `/${segments.slice(0, markerIndex).join('/')}` : '';
}

function ensureTargetUrl(rawUrl) {
    const candidate = new URL(rawUrl || DEFAULT_COLLECTION_URL);
    if (!['http:', 'https:'].includes(candidate.protocol) || !candidate.hostname.endsWith('antonioli.eu')) {
        throw new Error('The URL must point to antonioli.eu.');
    }
    return candidate;
}

function getRoute(targetUrl) {
    const pathname = targetUrl.pathname.replace(/\/+$/, '');
    if (/\/products\/[^/]+(?:\.(?:json|js))?$/i.test(pathname)) return 'product';
    if (/\/search(?:\/|$)/i.test(pathname) || targetUrl.searchParams.has('q')) return 'search';
    if (/\/collections\//i.test(pathname) || /\/products\.json$/i.test(pathname)) return 'collection';
    return 'catalog';
}

function getProductHandle(productUrl) {
    const segments = productUrl.pathname.split('/').filter(Boolean);
    const productIndex = segments.findIndex((segment) => segment.toLowerCase() === 'products');
    const handle = segments[productIndex + 1]?.replace(/\.(?:json|js)$/i, '');
    if (!handle) throw new Error(`Could not find a product handle in ${productUrl.href}`);
    return { handle, productIndex, segments };
}

function productApiUrl(productUrl, extension = '.json') {
    const { handle, productIndex, segments } = getProductHandle(productUrl);
    const prefix = productIndex > 0 ? `/${segments.slice(0, productIndex).join('/')}` : '';
    return new URL(`${prefix}/products/${encodeURIComponent(handle)}${extension}`, productUrl.origin).href;
}

function collectionApiUrl(collectionUrl, page) {
    const segments = collectionUrl.pathname.split('/').filter(Boolean);
    const collectionIndex = segments.findIndex((segment) => segment.toLowerCase() === 'collections');
    const collectionSegments =
        collectionIndex >= 0
            ? segments.slice(0, collectionIndex + 2)
            : segments.filter((segment) => !/\.json$/i.test(segment));
    const path = `/${collectionSegments.join('/')}/products.json`;
    const apiUrl = new URL(path, collectionUrl.origin);
    const preservedParams = new URLSearchParams(collectionUrl.search);
    preservedParams.delete('page');
    preservedParams.delete('limit');
    preservedParams.delete('view');
    apiUrl.search = preservedParams.toString();
    apiUrl.searchParams.set('limit', String(MAX_COLLECTION_PAGE_SIZE));
    apiUrl.searchParams.set('page', String(page));
    return apiUrl.href;
}

function catalogApiUrl(sourceUrl, page) {
    const prefix = getLocalePrefix(sourceUrl.pathname);
    const apiUrl = new URL(`${prefix}/products.json`, sourceUrl.origin);
    apiUrl.searchParams.set('limit', String(MAX_COLLECTION_PAGE_SIZE));
    apiUrl.searchParams.set('page', String(page));
    return apiUrl.href;
}

function searchSuggestApiUrl(sourceUrl, keyword) {
    const prefix = getLocalePrefix(sourceUrl.pathname);
    const apiUrl = new URL(`${prefix}/search/suggest.json`, sourceUrl.origin);
    apiUrl.searchParams.set('q', keyword);
    apiUrl.searchParams.set('resources[type]', 'product');
    apiUrl.searchParams.set('resources[limit]', String(SEARCH_SUGGESTION_LIMIT));
    return apiUrl.href;
}

function productSearchKeyword(productUrl) {
    const { handle } = getProductHandle(productUrl);
    return handle
        .split('-')
        .filter((part) => part.length >= 3 && !['man', 'woman'].includes(part.toLowerCase()) && !/\d/.test(part))
        .slice(0, 6)
        .join(' ');
}

function canonicalProductUrl(rawUrl, baseUrl, handle) {
    const base = new URL(baseUrl);
    const localePrefix = getLocalePrefix(base.pathname);
    const fallback = handle ? `${localePrefix}/products/${handle}` : undefined;
    if (!rawUrl && !fallback) return undefined;
    const url = new URL(rawUrl || fallback, base.origin);
    url.search = '';
    return url.href;
}

function toFiniteNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
}

function getImageUrl(image) {
    if (typeof image === 'string') return image;
    if (!isObject(image)) return undefined;
    return image.src || image.url || image.originalSrc;
}

function enrichProductSummary(product) {
    const record = { ...product };
    const variants = Array.isArray(record.variants) ? record.variants.filter(isObject) : [];
    const prices = variants.map((variant) => toFiniteNumber(variant.price)).filter((price) => price !== undefined);
    const compareAtPrices = variants
        .map((variant) => toFiniteNumber(variant.compare_at_price))
        .filter((price) => price !== undefined);

    if (prices.length) {
        const priceMin = Math.min(...prices);
        const priceMax = Math.max(...prices);
        if (record.price === undefined || record.price === null) record.price = priceMin;
        if (record.price_min === undefined || record.price_min === null) record.price_min = priceMin;
        if (record.price_max === undefined || record.price_max === null) record.price_max = priceMax;
    }

    if (compareAtPrices.length) {
        const compareAtPriceMin = Math.min(...compareAtPrices);
        const compareAtPriceMax = Math.max(...compareAtPrices);
        if (record.compare_at_price === undefined || record.compare_at_price === null) {
            record.compare_at_price = compareAtPriceMin;
        }
        if (record.compare_at_price_min === undefined || record.compare_at_price_min === null) {
            record.compare_at_price_min = compareAtPriceMin;
        }
        if (record.compare_at_price_max === undefined || record.compare_at_price_max === null) {
            record.compare_at_price_max = compareAtPriceMax;
        }
    }

    if (
        (record.available === undefined || record.available === null) &&
        variants.some((variant) => typeof variant.available === 'boolean')
    ) {
        record.available = variants.some((variant) => variant.available);
    }

    const imageUrls = [
        ...new Set(
            [...(Array.isArray(record.images) ? record.images : []), record.featured_image, record.image]
                .map(getImageUrl)
                .filter(Boolean),
        ),
    ];

    if (imageUrls.length) {
        record.images = imageUrls;
        record.featured_image = getImageUrl(record.featured_image) || imageUrls[0];
        record.image = getImageUrl(record.image) || imageUrls[0];
    }

    return record;
}

function mergeProductRecords(summaryProduct, detailProduct) {
    const record = { ...summaryProduct, ...detailProduct };
    for (const key of [
        'available',
        'price',
        'price_min',
        'price_max',
        'compare_at_price',
        'compare_at_price_min',
        'compare_at_price_max',
        'featured_image',
        'image',
    ]) {
        if ((detailProduct[key] === undefined || detailProduct[key] === null) && summaryProduct[key] !== undefined) {
            record[key] = summaryProduct[key];
        }
    }
    return record;
}

function normalizeProduct(product, sourceUrl, sourceType, keyword) {
    const record = enrichProductSummary(product);
    const body = record.body_html || record.body || record.description;
    if (!record.body_html && body) record.body_html = body;
    if (!record.product_type && record.type) record.product_type = record.type;

    for (const key of [
        'price',
        'price_min',
        'price_max',
        'compare_at_price',
        'compare_at_price_min',
        'compare_at_price_max',
    ]) {
        if (record[key] !== undefined && record[key] !== null) {
            const numericValue = toFiniteNumber(record[key]);
            if (numericValue !== undefined) record[key] = numericValue;
        }
    }

    record.url = canonicalProductUrl(record.url, sourceUrl, record.handle);
    record.source_url = sourceUrl;
    record.source_type = sourceType;
    if (keyword) record.search_keyword = keyword;
    record.scraped_at = new Date().toISOString();

    return cleanValue(record);
}

function matchesKeyword(product, keyword) {
    const haystack = [
        product.title,
        product.handle,
        product.vendor,
        product.type,
        product.product_type,
        product.body,
        product.body_html,
        ...(Array.isArray(product.tags) ? product.tags : [product.tags]),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return keyword
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((term) => haystack.includes(term));
}

async function getRuntimeInput() {
    const runtimeInput = (await Actor.getInput()) || {};
    if (Object.keys(runtimeInput).length) return runtimeInput;

    try {
        const localInput = await readFile(new URL('../INPUT.json', import.meta.url), 'utf8');
        return JSON.parse(localInput);
    } catch {
        return runtimeInput;
    }
}

async function fetchJson(client, url, referer) {
    for (let attempt = 1; attempt <= MAX_REQUEST_RETRIES; attempt++) {
        try {
            const response = await client.fetch(url, {
                headers: referer ? { referer } : undefined,
            });

            if ([429, 500, 502, 503, 504].includes(response.status) && attempt < MAX_REQUEST_RETRIES) {
                const waitMs = attempt * 1000;
                log.warning(`Retry ${attempt}/${MAX_REQUEST_RETRIES - 1} after HTTP ${response.status}`);
                await new Promise((resolve) => {
                    setTimeout(resolve, waitMs);
                });
                continue;
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const payload = await response.json();
            if (!payload || typeof payload !== 'object') throw new Error('The response was not a JSON object.');
            return payload;
        } catch (error) {
            if (attempt === MAX_REQUEST_RETRIES) throw error;
            const waitMs = attempt * 1000;
            log.warning(`Retry ${attempt}/${MAX_REQUEST_RETRIES - 1}: ${error.message}`);
            await new Promise((resolve) => {
                setTimeout(resolve, waitMs);
            });
        }
    }

    throw new Error(`Unable to fetch ${url}`);
}

async function enrichSearchProducts(client, products, sourceUrl) {
    const enrichedProducts = [];
    let enrichedCount = 0;

    for (const product of products) {
        const productUrl = canonicalProductUrl(product.url, sourceUrl.href, product.handle);
        if (!productUrl) {
            enrichedProducts.push(product);
            continue;
        }

        try {
            const detailUrl = ensureTargetUrl(productUrl);
            let payload;
            try {
                payload = await fetchJson(client, productApiUrl(detailUrl), sourceUrl.href);
            } catch {
                payload = await fetchJson(client, productApiUrl(detailUrl, '.js'), sourceUrl.href);
            }
            enrichedProducts.push(mergeProductRecords(product, payload.product || payload));
            enrichedCount++;
        } catch {
            enrichedProducts.push(product);
        }
    }

    if (enrichedCount) log.info(`Enriched ${enrichedCount}/${products.length} keyword matches with full product data.`);
    if (enrichedCount < products.length) {
        log.warning(
            `Kept source data for ${products.length - enrichedCount} keyword matches after detail requests failed.`,
        );
    }

    return enrichedProducts;
}

async function findProductSuggestion(client, productUrl) {
    const { handle } = getProductHandle(productUrl);
    const fallbackKeyword = productSearchKeyword(productUrl);
    const searchPayload = await fetchJson(client, searchSuggestApiUrl(productUrl, fallbackKeyword), productUrl.href);
    const suggestions = searchPayload.resources?.results?.products;
    return Array.isArray(suggestions) ? suggestions.find((product) => product.handle === handle) : undefined;
}

async function findProductInCatalog(client, productUrl, maxPages) {
    const { handle } = getProductHandle(productUrl);
    for (let page = 1; page <= maxPages; page++) {
        const catalogPayload = await fetchJson(client, catalogApiUrl(productUrl, page), productUrl.href);
        const products = Array.isArray(catalogPayload.products) ? catalogPayload.products : [];
        const matchedProduct = products.find((product) => product.handle === handle);
        if (matchedProduct) return matchedProduct;
        if (products.length < MAX_COLLECTION_PAGE_SIZE) break;
    }
    return undefined;
}

async function main() {
    const input = await getRuntimeInput();
    const requestedUrl = typeof input.url === 'string' ? input.url.trim() : '';
    const keyword = typeof input.keyword === 'string' ? input.keyword.trim() : '';
    const resultsWanted = parsePositiveInteger(input.results_wanted, 20);
    const maxPages = parsePositiveInteger(input.max_pages, 3);

    if (!requestedUrl && !keyword) {
        throw new Error('Provide either a product, collection, catalog, or search URL, or provide a keyword.');
    }

    const sourceUrl = ensureTargetUrl(requestedUrl || DEFAULT_COLLECTION_URL);
    const route = requestedUrl ? getRoute(sourceUrl) : 'search';
    const searchKeyword = route === 'search' ? keyword || sourceUrl.searchParams.get('q')?.trim() || '' : '';
    if (route === 'search' && !searchKeyword) throw new Error('A search URL must include a q parameter or keyword.');

    const { proxyConfiguration } = input;
    const wantsProxy =
        Boolean(proxyConfiguration?.useApifyProxy) ||
        (Array.isArray(proxyConfiguration?.proxyUrls) && proxyConfiguration.proxyUrls.length > 0);
    const proxy =
        wantsProxy && Actor.isAtHome() ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;
    if (wantsProxy && !Actor.isAtHome()) log.info('Local run detected; skipping Apify Proxy.');
    const proxyUrl = proxy ? await proxy.newUrl() : undefined;

    const client = new Impit({
        browser: 'chrome',
        ignoreTlsErrors: true,
        ...(proxyUrl && { proxyUrl }),
    });

    const seen = new Set();
    let saved = 0;
    let pagesProcessed = 0;

    async function pushProducts(products, sourceType, source) {
        const batch = [];
        for (const product of products) {
            if (!product || saved + batch.length >= resultsWanted) break;
            const key = String(product.id || product.handle || product.url || '');
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const item = normalizeProduct(product, source, sourceType, searchKeyword);
            if (item) batch.push(item);
        }

        if (batch.length) {
            await Actor.pushData(batch);
            saved += batch.length;
            log.info(`Saved ${batch.length} products. Total: ${saved}/${resultsWanted}`);
        }
    }

    log.info(`Starting Antonioli product run | route=${route} | target=${resultsWanted} | max_pages=${maxPages}`);

    if (route === 'product') {
        let payload;
        try {
            payload = await fetchJson(client, productApiUrl(sourceUrl), sourceUrl.href);
        } catch (error) {
            log.warning(`Product JSON request failed: ${error.message}; trying the alternate product response.`);
            try {
                payload = await fetchJson(client, productApiUrl(sourceUrl, '.js'), sourceUrl.href);
            } catch (alternateError) {
                log.warning(`Alternate product response failed: ${alternateError.message}; trying search fallback.`);
            }
        }

        if (!payload) {
            const matchedSuggestion = await findProductSuggestion(client, sourceUrl);

            if (matchedSuggestion) {
                payload = matchedSuggestion;
            } else {
                payload = await findProductInCatalog(client, sourceUrl, maxPages);
            }
        }

        if (!payload)
            throw new Error('The product URL was valid, but the product could not be found in available JSON results.');
        let product = payload.product || payload;
        if (product.available === undefined || product.available === null) {
            let productSummary;
            try {
                productSummary = await findProductSuggestion(client, sourceUrl);
            } catch {
                // The catalog fallback below can still provide the same public availability field.
            }
            if (!productSummary) {
                try {
                    productSummary = await findProductInCatalog(client, sourceUrl, maxPages);
                } catch {
                    log.warning('Product availability summary was unavailable; preserving product detail data.');
                }
            }
            if (productSummary) product = mergeProductRecords(productSummary, product);
        }
        await pushProducts([product], 'product', sourceUrl.href);
    } else if (route === 'collection' || route === 'catalog') {
        const firstPage = parsePositiveInteger(sourceUrl.searchParams.get('page'), 1);
        for (let offset = 0; offset < maxPages && saved < resultsWanted; offset++) {
            const page = firstPage + offset;
            const apiUrl = route === 'collection' ? collectionApiUrl(sourceUrl, page) : catalogApiUrl(sourceUrl, page);
            const payload = await fetchJson(client, apiUrl, sourceUrl.href);
            const products = Array.isArray(payload.products) ? payload.products : [];
            pagesProcessed++;
            if (!products.length) break;
            await pushProducts(products, route, sourceUrl.href);
            if (products.length < MAX_COLLECTION_PAGE_SIZE) break;
        }
    } else {
        const suggestionPayload = await fetchJson(
            client,
            searchSuggestApiUrl(sourceUrl, searchKeyword),
            sourceUrl.href,
        );
        const suggestedProducts = suggestionPayload.resources?.results?.products;
        if (Array.isArray(suggestedProducts)) {
            const enrichedProducts = await enrichSearchProducts(client, suggestedProducts, sourceUrl);
            await pushProducts(enrichedProducts, 'search', sourceUrl.href);
        } else {
            log.warning('Search suggestion response did not contain products; continuing with catalog search.');
        }

        for (let page = 1; page <= maxPages && saved < resultsWanted; page++) {
            const apiUrl = catalogApiUrl(sourceUrl, page);
            const payload = await fetchJson(client, apiUrl, sourceUrl.href);
            const products = Array.isArray(payload.products) ? payload.products : [];
            pagesProcessed++;
            if (!products.length) break;
            await pushProducts(
                products.filter((product) => matchesKeyword(product, searchKeyword)),
                'keyword',
                sourceUrl.href,
            );
            if (products.length < MAX_COLLECTION_PAGE_SIZE) break;
        }
    }

    if (!saved) log.warning('No products matched the supplied input.');
    log.info(`Finished | saved=${saved} | pages=${pagesProcessed} | route=${route}`);
}

let exitCode = 0;
try {
    await main();
} catch (error) {
    exitCode = 1;
    log.error(`Actor failed: ${error.message}`);
} finally {
    await Actor.exit({ exitCode });
}
