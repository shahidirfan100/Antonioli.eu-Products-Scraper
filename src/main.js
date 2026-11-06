import { Actor, log } from 'apify';
import { Impit } from 'impit';

import {
    catalogApiUrl,
    collectionApiUrl,
    DEFAULT_COLLECTION_URL,
    ensureTargetUrl,
    getCollectionHandle,
    getLocalePrefix,
    getProductHandle,
    getRoute,
    isObject,
    mapGraphqlProduct,
    matchesKeyword,
    MAX_PAGE_SIZE,
    mergeProductRecords,
    normalizeProduct,
    parsePositiveInteger,
    parseStorefrontToken,
    productApiUrl,
    productSearchKeyword,
    searchSuggestApiUrl,
} from './lib.js';

const DEFAULT_SEARCH_KEYWORD = 'Gucci';
const DEFAULT_PROXY_COUNTRY = 'IT';
const STOREFRONT_STORE_NAME = 'antonioli-storefront';
const STOREFRONT_TOKEN_KEY = 'storefront-token';
const MAX_RETRIES = 4;
const RETRYABLE_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527]);
const PROFILE_ROTATION = ['chrome', 'ios18', 'firefox158'];
const GRAPHQL_VERSIONS = ['unstable', '2026-10'];

const PRODUCT_SELECTION = `
    id
    title
    handle
    descriptionHtml
    vendor
    productType
    tags
    availableForSale
    publishedAt
    createdAt
    updatedAt
    featuredImage {
        url
    }
    images(first: 20) {
        nodes {
            url
        }
    }
    priceRange {
        minVariantPrice {
            amount
            currencyCode
        }
        maxVariantPrice {
            amount
            currencyCode
        }
    }
    compareAtPriceRange {
        minVariantPrice {
            amount
            currencyCode
        }
        maxVariantPrice {
            amount
            currencyCode
        }
    }
    variants(first: 100) {
        nodes {
            id
            title
            sku
            availableForSale
            price {
                amount
                currencyCode
            }
            compareAtPrice {
                amount
                currencyCode
            }
            image {
                url
            }
            selectedOptions {
                name
                value
            }
        }
    }
`;

const COLLECTION_QUERY = `
    query Collection($handle: String!, $first: Int!, $after: String) {
        collection(handle: $handle) {
            products(first: $first, after: $after) {
                pageInfo {
                    hasNextPage
                    endCursor
                }
                nodes {
                    ${PRODUCT_SELECTION}
                }
            }
        }
    }
`;

const PRODUCT_QUERY = `
    query Product($handle: String!) {
        product(handle: $handle) {
            ${PRODUCT_SELECTION}
        }
    }
`;

const PRODUCTS_QUERY = `
    query Products($first: Int!, $after: String) {
        products(first: $first, after: $after) {
            pageInfo {
                hasNextPage
                endCursor
            }
            nodes {
                ${PRODUCT_SELECTION}
            }
        }
    }
`;

const SEARCH_QUERY = `
    query Search($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query) {
            pageInfo {
                hasNextPage
                endCursor
            }
            nodes {
                ${PRODUCT_SELECTION}
            }
        }
    }
`;

class HttpError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function shortError(error) {
    return String(error?.message || error).split('\n')[0];
}

function retryDelay(attempt, response) {
    const retryAfter = response?.headers?.get('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 15000);
        const date = Date.parse(retryAfter);
        if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 15000);
    }

    const base = Math.min(500 * 2 ** (attempt - 1), 4000);
    return base + Math.floor(Math.random() * 250);
}

function createHttpClient(initialProxyUrl, proxyState) {
    const clients = new Map();
    const stats = { requests: 0, retries: 0 };
    let proxyUrl = initialProxyUrl;

    function getClient(profile) {
        const key = `${profile}|${proxyUrl || ''}`;
        if (!clients.has(key)) {
            clients.set(
                key,
                new Impit({
                    browser: profile,
                    timeout: 30000,
                    ...(proxyUrl && { proxyUrl }),
                }),
            );
        }
        return clients.get(key);
    }

    async function rotateProxy(attempt) {
        if (!proxyState) return false;
        const nextUrl = await proxyState.newUrl(`retry_${attempt}_${Date.now().toString(36)}`);
        if (!nextUrl || nextUrl === proxyUrl) return false;
        proxyUrl = nextUrl;
        return true;
    }

    async function request(label, url, options = {}, retries = MAX_RETRIES) {
        const { headers: optionHeaders = {}, ...requestOptions } = options;
        let lastError;

        for (let attempt = 1; attempt <= retries; attempt++) {
            if (attempt > 1) {
                try {
                    if (await rotateProxy(attempt)) log.warning(`Rotating proxy session for ${label}.`);
                } catch (error) {
                    log.warning(`Proxy rotation failed: ${shortError(error)}`);
                }
            }
            const profile = PROFILE_ROTATION[(attempt - 1) % PROFILE_ROTATION.length];
            stats.requests++;

            try {
                const headers = {};
                for (const [name, value] of Object.entries(optionHeaders)) {
                    if (value !== undefined) headers[name] = value;
                }

                const response = await getClient(profile).fetch(url, { ...requestOptions, headers });
                if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
                    stats.retries++;
                    const waitMs = retryDelay(attempt, response);
                    log.warning(
                        `${label} returned HTTP ${response.status}; retrying in ${Math.ceil(waitMs / 1000)}s with profile=${PROFILE_ROTATION[attempt % PROFILE_ROTATION.length]}.`,
                    );
                    await sleep(waitMs);
                    continue;
                }
                return response;
            } catch (error) {
                lastError = error;
                if (attempt === retries) break;
                stats.retries++;
                const waitMs = retryDelay(attempt);
                log.warning(
                    `${label} failed: ${shortError(error)}; retrying in ${Math.ceil(waitMs / 1000)}s with profile=${PROFILE_ROTATION[attempt % PROFILE_ROTATION.length]}.`,
                );
                await sleep(waitMs);
            }
        }

        throw new Error(`${label} failed after ${retries} attempts: ${lastError?.message || 'unknown error'}`);
    }

    async function fetchText(label, url, options = {}, retries = MAX_RETRIES) {
        const response = await request(label, url, options, retries);
        if (!response.ok) throw new HttpError(`${label} returned HTTP ${response.status}`, response.status);

        const text = await response.text();
        if (!text?.trim()) throw new Error(`${label} returned an empty response`);
        return text;
    }

    async function fetchJson(label, url, options = {}, retries = MAX_RETRIES) {
        const response = await request(label, url, options, retries);
        if (!response.ok) throw new HttpError(`${label} returned HTTP ${response.status}`, response.status);

        const text = await response.text();
        if (!text?.trim()) throw new Error(`${label} returned an empty response`);

        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            throw new Error(`${label} returned a non-JSON response`);
        }
        if (!isObject(payload)) throw new Error(`${label} returned an unexpected JSON shape`);
        return payload;
    }

    return { fetchJson, fetchText, stats };
}

class StorefrontClient {
    constructor(http, sourceUrl) {
        this.http = http;
        this.sourceUrl = sourceUrl;
        this.token = undefined;
        this.cachedTokenLoaded = false;
        this.storePromise = undefined;
        this.ready = false;
    }

    getStore() {
        if (!this.storePromise) this.storePromise = Actor.openKeyValueStore(STOREFRONT_STORE_NAME);
        return this.storePromise;
    }

    async loadCachedToken() {
        if (this.cachedTokenLoaded) return;
        this.cachedTokenLoaded = true;

        try {
            const store = await this.getStore();
            const cached = await store.getValue(STOREFRONT_TOKEN_KEY);
            if (cached?.token) this.token = cached.token;
        } catch (error) {
            log.warning(`Stored Storefront token could not be read: ${shortError(error)}`);
        }
    }

    async saveToken(token) {
        try {
            const store = await this.getStore();
            await store.setValue(STOREFRONT_TOKEN_KEY, { token, savedAt: new Date().toISOString() });
        } catch (error) {
            log.warning(`Storefront token could not be cached: ${shortError(error)}`);
        }
    }

    async invalidateToken() {
        this.token = undefined;
        try {
            const store = await this.getStore();
            await store.setValue(STOREFRONT_TOKEN_KEY, null);
        } catch (error) {
            log.warning(`Stored Storefront token could not be cleared: ${shortError(error)}`);
        }
    }

    async getToken() {
        await this.loadCachedToken();
        if (this.token) return this.token;

        const locale = getLocalePrefix(this.sourceUrl.pathname);
        const pages = [
            this.sourceUrl.href,
            `${this.sourceUrl.origin}${locale}/collections/man`,
            DEFAULT_COLLECTION_URL,
        ];

        for (const page of [...new Set(pages)]) {
            try {
                const html = await this.http.fetchText('Storefront page', page, {
                    headers: {
                        accept: 'text/html,application/xhtml+xml',
                    },
                });
                const token = parseStorefrontToken(html);
                if (!token) continue;
                this.token = token;
                await this.saveToken(token);
                return token;
            } catch (error) {
                log.warning(`Storefront token page failed: ${shortError(error)}`);
            }
        }

        throw new Error('Storefront access token was not present on any known page');
    }

    async query(query, variables) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const token = await this.getToken();
            try {
                const data = await this.post(token, query, variables);
                if (!this.ready) {
                    this.ready = true;
                    log.info('Storefront GraphQL session ready.');
                }
                return data;
            } catch (error) {
                if (attempt === 0 && error instanceof HttpError && [401, 403].includes(error.status)) {
                    await this.invalidateToken();
                    log.warning('Storefront token was rejected; refreshing it once.');
                    continue;
                }
                throw error;
            }
        }

        throw new Error('Storefront token could not be refreshed.');
    }

    async post(token, query, variables) {
        let lastError;

        for (const version of GRAPHQL_VERSIONS) {
            const url = `${this.sourceUrl.origin}/api/${version}/graphql.json`;
            try {
                const payload = await this.http.fetchJson(`Storefront ${version}`, url, {
                    method: 'POST',
                    headers: {
                        accept: 'application/json',
                        'content-type': 'application/json',
                        origin: this.sourceUrl.origin,
                        referer: this.sourceUrl.href,
                        'x-shopify-storefront-access-token': token,
                    },
                    body: JSON.stringify({ query, variables }),
                });

                if (Array.isArray(payload.errors) && payload.errors.length) {
                    const message = payload.errors
                        .map((error) => error?.message)
                        .filter(Boolean)
                        .join('; ');
                    throw new Error(message || 'GraphQL returned errors');
                }
                if (!isObject(payload.data)) throw new Error('GraphQL response did not include a data object');
                return payload.data;
            } catch (error) {
                lastError = error;
                if (error instanceof HttpError && [401, 403].includes(error.status)) throw error;
                log.warning(`Storefront ${version} request failed: ${shortError(error)}`);
            }
        }

        throw lastError;
    }

    async collection(handle, cursor, remaining) {
        const data = await this.query(COLLECTION_QUERY, {
            handle,
            first: this.pageSize(remaining),
            after: cursor || null,
        });
        const connection = data.collection?.products;
        if (!isObject(connection)) throw new Error(`Collection ${handle} was not present in the storefront response`);
        return this.mapConnection(connection);
    }

    async product(handle) {
        const data = await this.query(PRODUCT_QUERY, { handle });
        return data.product ? mapGraphqlProduct(data.product) : undefined;
    }

    async products(cursor, keyword, remaining) {
        const data = await this.query(keyword ? SEARCH_QUERY : PRODUCTS_QUERY, {
            first: this.pageSize(remaining),
            after: cursor || null,
            ...(keyword && { query: keyword }),
        });
        if (!isObject(data.products)) throw new Error('Storefront products response was missing');
        return this.mapConnection(data.products);
    }

    pageSize(remaining) {
        return Math.min(MAX_PAGE_SIZE, Math.max(Number(remaining) || MAX_PAGE_SIZE, 1));
    }

    mapConnection(connection) {
        const nodes = Array.isArray(connection.nodes) ? connection.nodes : [];
        return {
            products: nodes.map(mapGraphqlProduct).filter(Boolean),
            cursor: connection.pageInfo?.endCursor || undefined,
            hasNext: Boolean(connection.pageInfo?.hasNextPage),
        };
    }
}

async function getRuntimeInput() {
    const input = await Actor.getInput();
    return isObject(input) ? input : {};
}

async function createProxyState(input) {
    const { proxyConfiguration } = input;
    if (!isObject(proxyConfiguration)) return undefined;

    const customProxyUrls = Array.isArray(proxyConfiguration.proxyUrls)
        ? proxyConfiguration.proxyUrls.filter(Boolean)
        : [];
    const wantsApifyProxy = Boolean(proxyConfiguration.useApifyProxy);
    if (!wantsApifyProxy && !customProxyUrls.length) return undefined;

    if (wantsApifyProxy && !Actor.isAtHome() && !customProxyUrls.length) {
        log.info('Local run detected; skipping Apify Proxy.');
        return undefined;
    }

    const effectiveConfiguration =
        wantsApifyProxy && !proxyConfiguration.apifyProxyCountry
            ? { ...proxyConfiguration, apifyProxyCountry: DEFAULT_PROXY_COUNTRY }
            : proxyConfiguration;
    const proxy = await Actor.createProxyConfiguration(effectiveConfiguration);
    if (!proxy) return undefined;
    return { newUrl: (sessionId) => proxy.newUrl(sessionId) };
}

async function fetchCollectionJson(http, sourceUrl, page) {
    const payload = await http.fetchJson('Collection products', collectionApiUrl(sourceUrl, page), {
        headers: { referer: sourceUrl.href },
    });
    if (!Array.isArray(payload.products)) throw new Error('Collection response did not include a products array');
    return {
        products: payload.products.filter(isObject),
        hasMore: payload.products.length === MAX_PAGE_SIZE,
    };
}

async function fetchCatalogJson(http, sourceUrl, page) {
    const payload = await http.fetchJson('Catalog products', catalogApiUrl(sourceUrl, page), {
        headers: { referer: sourceUrl.href },
    });
    if (!Array.isArray(payload.products)) throw new Error('Catalog response did not include a products array');
    return {
        products: payload.products.filter(isObject),
        hasMore: payload.products.length === MAX_PAGE_SIZE,
    };
}

async function findProductSuggestion(http, sourceUrl) {
    const { handle } = getProductHandle(sourceUrl);
    const keyword = productSearchKeyword(sourceUrl);
    if (!keyword) return undefined;

    const payload = await http.fetchJson('Product suggestions', searchSuggestApiUrl(sourceUrl, keyword), {
        headers: { referer: sourceUrl.href },
    });
    const products = payload.resources?.results?.products;
    return Array.isArray(products) ? products.find((product) => product.handle === handle) : undefined;
}

async function findProductInCatalog(http, sourceUrl, maxPages) {
    const { handle } = getProductHandle(sourceUrl);
    for (let page = 1; page <= maxPages; page++) {
        const payload = await http.fetchJson('Catalog lookup', catalogApiUrl(sourceUrl, page), {
            headers: { referer: sourceUrl.href },
        });
        const products = Array.isArray(payload.products) ? payload.products.filter(isObject) : [];
        const matchedProduct = products.find((product) => product.handle === handle);
        if (matchedProduct) return matchedProduct;
        if (products.length < MAX_PAGE_SIZE) break;
    }
    return undefined;
}

async function loadProduct(http, storefront, sourceUrl, maxPages) {
    const { handle } = getProductHandle(sourceUrl);

    for (const extension of ['.json', '.js']) {
        try {
            const payload = await http.fetchJson(`Product ${extension}`, productApiUrl(sourceUrl, extension), {
                headers: { referer: sourceUrl.href },
            });
            const product = payload.product || payload;
            if (isObject(product) && product.handle) return product;
        } catch (error) {
            log.warning(`Product ${extension} request failed: ${shortError(error)}`);
        }
    }

    try {
        const product = await storefront.product(handle);
        if (product) return product;
    } catch (error) {
        log.warning(`Storefront product request failed: ${shortError(error)}`);
    }

    try {
        const product = await findProductSuggestion(http, sourceUrl);
        if (product) return product;
    } catch (error) {
        log.warning(`Product suggestion lookup failed: ${shortError(error)}`);
    }

    try {
        const product = await findProductInCatalog(http, sourceUrl, maxPages);
        if (product) return product;
    } catch (error) {
        log.warning(`Product catalog lookup failed: ${shortError(error)}`);
    }

    return undefined;
}

async function addProductAvailability(http, storefront, product, sourceUrl, maxPages) {
    if (product.available !== undefined && product.available !== null) return product;

    const { handle } = getProductHandle(sourceUrl);
    try {
        const detail = await storefront.product(handle);
        if (detail && typeof detail.available === 'boolean') {
            return { ...product, available: detail.available };
        }
    } catch (error) {
        log.warning(`Product availability request failed: ${shortError(error)}`);
    }

    let summary;
    try {
        summary = await findProductSuggestion(http, sourceUrl);
    } catch (error) {
        log.warning(`Product availability lookup failed: ${shortError(error)}`);
    }
    if (!summary) {
        try {
            summary = await findProductInCatalog(http, sourceUrl, maxPages);
        } catch (error) {
            log.warning(`Product availability catalog lookup failed: ${shortError(error)}`);
        }
    }

    return summary ? mergeProductRecords(summary, product) : product;
}

async function main() {
    const input = await getRuntimeInput();
    const requestedUrl = typeof input.url === 'string' ? input.url.trim() : '';
    let keyword = typeof input.keyword === 'string' ? input.keyword.trim() : '';
    const resultsWanted = parsePositiveInteger(input.results_wanted, 20);
    const maxPages = parsePositiveInteger(input.max_pages, 3);

    if (!requestedUrl && !keyword) keyword = DEFAULT_SEARCH_KEYWORD;

    const sourceUrl = ensureTargetUrl(requestedUrl || DEFAULT_COLLECTION_URL);
    const route = requestedUrl ? getRoute(sourceUrl) : 'search';
    const searchKeyword = route === 'search' ? sourceUrl.searchParams.get('q')?.trim() || keyword : '';
    if (route === 'search' && !searchKeyword) {
        throw new Error('A search URL must include a q parameter or a keyword must be supplied.');
    }

    const proxyState = await createProxyState(input);
    const initialProxyUrl = proxyState ? await proxyState.newUrl('main') : undefined;
    const http = createHttpClient(initialProxyUrl, proxyState);
    const storefront = new StorefrontClient(http, sourceUrl);
    const seen = new Set();
    let saved = 0;
    let pagesProcessed = 0;

    async function pushProducts(products, sourceType, activeKeyword) {
        const batch = [];
        for (const product of products) {
            if (!product || saved + batch.length >= resultsWanted) break;
            const key = String(product.id || product.handle || product.url || '');
            if (!key || seen.has(key)) continue;
            seen.add(key);

            const item = normalizeProduct(product, sourceUrl.href, sourceType, activeKeyword);
            if (item) batch.push(item);
        }

        if (!batch.length) return;
        await Actor.pushData(batch);
        saved += batch.length;
        log.info(`Saved ${batch.length} products. Total: ${saved}/${resultsWanted}`);
    }

    async function searchFallback(sourceType) {
        let pages = 0;

        try {
            const payload = await http.fetchJson('Search suggestions', searchSuggestApiUrl(sourceUrl, searchKeyword), {
                headers: { referer: sourceUrl.href },
            });
            const products = payload.resources?.results?.products;
            if (Array.isArray(products) && products.length) {
                await pushProducts(products, sourceType, searchKeyword);
            }
        } catch (error) {
            log.warning(`Search suggestion fallback failed: ${shortError(error)}`);
        }

        for (let page = 1; page <= maxPages && saved < resultsWanted; page++) {
            try {
                const batch = await fetchCatalogJson(http, sourceUrl, page);
                pages++;
                if (!batch.products.length) break;
                await pushProducts(
                    batch.products.filter((product) => matchesKeyword(product, searchKeyword)),
                    sourceType,
                    searchKeyword,
                );
                if (!batch.hasMore) break;
            } catch (error) {
                log.warning(`Search catalog fallback failed on page ${page}: ${shortError(error)}`);
                break;
            }
        }

        return pages;
    }

    log.info(
        `Starting Antonioli product run | route=${route} | target=${resultsWanted} | max_pages=${maxPages} | source=${sourceUrl.href}`,
    );

    if (route === 'product') {
        let product = await loadProduct(http, storefront, sourceUrl, maxPages);
        if (!product) {
            throw new Error('The product URL was valid, but the product could not be found in available results.');
        }
        product = await addProductAvailability(http, storefront, product, sourceUrl, maxPages);
        await pushProducts([product], 'product');
    } else if (route === 'collection') {
        const handle = getCollectionHandle(sourceUrl);
        const firstPage = parsePositiveInteger(sourceUrl.searchParams.get('page'), 1);
        let cursor;
        let useJson = firstPage > 1;

        for (let offset = 0; offset < maxPages && saved < resultsWanted; offset++) {
            const page = firstPage + offset;
            let batch;

            if (!useJson) {
                try {
                    batch = await storefront.collection(handle, cursor, resultsWanted - saved);
                } catch (error) {
                    log.warning(`Storefront collection request failed: ${shortError(error)}. Using products.json.`);
                    useJson = true;
                }
            }

            if (useJson) batch = await fetchCollectionJson(http, sourceUrl, page);

            pagesProcessed++;
            if (!batch.products.length) break;
            await pushProducts(batch.products, 'collection');
            if (useJson ? !batch.hasMore : !batch.hasNext) break;
            cursor = batch.cursor;
        }
    } else if (route === 'catalog') {
        const firstPage = parsePositiveInteger(sourceUrl.searchParams.get('page'), 1);
        let cursor;
        let useJson = firstPage > 1;

        for (let offset = 0; offset < maxPages && saved < resultsWanted; offset++) {
            const page = firstPage + offset;
            let batch;

            if (!useJson) {
                try {
                    batch = await storefront.products(cursor, undefined, resultsWanted - saved);
                } catch (error) {
                    log.warning(`Storefront catalog request failed: ${shortError(error)}. Using products.json.`);
                    useJson = true;
                }
            }

            if (useJson) batch = await fetchCatalogJson(http, sourceUrl, page);

            pagesProcessed++;
            if (!batch.products.length) break;
            await pushProducts(batch.products, 'catalog');
            if (useJson ? !batch.hasMore : !batch.hasNext) break;
            cursor = batch.cursor;
        }
    } else {
        const sourceType = route === 'search' ? 'search' : 'keyword';
        let cursor;
        let storefrontFailed = false;

        for (let page = 1; page <= maxPages && saved < resultsWanted; page++) {
            let batch;
            try {
                batch = await storefront.products(cursor, searchKeyword, resultsWanted - saved);
            } catch (error) {
                storefrontFailed = true;
                log.warning(
                    `Storefront search failed: ${shortError(error)}. Using search suggestions and catalog data.`,
                );
                break;
            }

            pagesProcessed++;
            if (!batch.products.length) break;
            await pushProducts(batch.products, sourceType, searchKeyword);
            if (!batch.hasNext || saved >= resultsWanted) break;
            cursor = batch.cursor;
        }

        if (storefrontFailed) pagesProcessed += await searchFallback(sourceType);
    }

    if (!saved) {
        log.warning('No products matched the supplied input.');
    } else if (saved < resultsWanted) {
        log.warning(`Saved ${saved} of ${resultsWanted} requested products; the source returned no more usable data.`);
    }
    log.info(
        `Finished | saved=${saved} | pages=${pagesProcessed} | route=${route} | requests=${http.stats.requests} | retries=${http.stats.retries}`,
    );
}

await Actor.init();

let exitCode = 0;
try {
    await main();
} catch (error) {
    exitCode = 1;
    log.error(`Actor failed: ${shortError(error)}`);
} finally {
    await Actor.exit({ exitCode });
}
