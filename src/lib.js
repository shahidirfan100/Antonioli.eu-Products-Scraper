export const DEFAULT_COLLECTION_URL = 'https://antonioli.eu/en-row/collections/man';
export const MAX_PAGE_SIZE = 250;
export const SEARCH_SUGGESTION_LIMIT = 10;

export function parsePositiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

export function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function cleanValue(value) {
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

export function getLocalePrefix(pathname) {
    const segments = pathname.split('/').filter(Boolean);
    const markerIndex = segments.findIndex((segment) => {
        const marker = segment.toLowerCase().replace(/\.(?:json|js)$/i, '');
        return ['collections', 'products', 'search'].includes(marker);
    });
    return markerIndex > 0 ? `/${segments.slice(0, markerIndex).join('/')}` : '';
}

export function ensureTargetUrl(rawUrl) {
    const candidate = new URL(rawUrl || DEFAULT_COLLECTION_URL);
    const isAntonioli = candidate.hostname === 'antonioli.eu' || candidate.hostname.endsWith('.antonioli.eu');
    if (!['http:', 'https:'].includes(candidate.protocol) || !isAntonioli) {
        throw new Error('The URL must point to antonioli.eu.');
    }
    return candidate;
}

export function getRoute(targetUrl) {
    const pathname = targetUrl.pathname.replace(/\/+$/, '');
    if (/\/products\/[^/]+(?:\.(?:json|js))?$/i.test(pathname)) return 'product';
    if (/\/search(?:\/|$)/i.test(pathname) || targetUrl.searchParams.has('q')) return 'search';
    if (/\/collections\//i.test(pathname) || /\/products\.json$/i.test(pathname)) return 'collection';
    return 'catalog';
}

export function getCollectionHandle(collectionUrl) {
    const segments = collectionUrl.pathname.split('/').filter(Boolean);
    const collectionIndex = segments.findIndex((segment) => segment.toLowerCase() === 'collections');
    const handle = segments[collectionIndex + 1]?.replace(/\.(?:json|js)$/i, '');
    if (!handle) throw new Error(`Could not find a collection handle in ${collectionUrl.href}`);
    return handle;
}

export function getProductHandle(productUrl) {
    const segments = productUrl.pathname.split('/').filter(Boolean);
    const productIndex = segments.findIndex((segment) => segment.toLowerCase() === 'products');
    const handle = segments[productIndex + 1]?.replace(/\.(?:json|js)$/i, '');
    if (!handle) throw new Error(`Could not find a product handle in ${productUrl.href}`);
    return { handle, productIndex, segments };
}

export function productApiUrl(productUrl, extension = '.json') {
    const { handle, productIndex, segments } = getProductHandle(productUrl);
    const prefix = productIndex > 0 ? `/${segments.slice(0, productIndex).join('/')}` : '';
    return new URL(`${prefix}/products/${encodeURIComponent(handle)}${extension}`, productUrl.origin).href;
}

export function collectionApiUrl(collectionUrl, page) {
    const segments = collectionUrl.pathname.split('/').filter(Boolean);
    const collectionIndex = segments.findIndex((segment) => segment.toLowerCase() === 'collections');
    const collectionSegments =
        collectionIndex >= 0
            ? segments.slice(0, collectionIndex + 2).filter((segment) => !/\.(?:json|js)$/i.test(segment))
            : segments.filter((segment) => !/\.(?:json|js)$/i.test(segment));
    const apiUrl = new URL(`/${collectionSegments.join('/')}/products.json`, collectionUrl.origin);
    const preservedParams = new URLSearchParams(collectionUrl.search);
    preservedParams.delete('page');
    preservedParams.delete('limit');
    preservedParams.delete('view');
    apiUrl.search = preservedParams.toString();
    apiUrl.searchParams.set('limit', String(MAX_PAGE_SIZE));
    apiUrl.searchParams.set('page', String(page));
    return apiUrl.href;
}

export function catalogApiUrl(sourceUrl, page) {
    const prefix = getLocalePrefix(sourceUrl.pathname);
    const apiUrl = new URL(`${prefix}/products.json`, sourceUrl.origin);
    apiUrl.searchParams.set('limit', String(MAX_PAGE_SIZE));
    apiUrl.searchParams.set('page', String(page));
    return apiUrl.href;
}

export function searchSuggestApiUrl(sourceUrl, keyword) {
    const prefix = getLocalePrefix(sourceUrl.pathname);
    const apiUrl = new URL(`${prefix}/search/suggest.json`, sourceUrl.origin);
    apiUrl.searchParams.set('q', keyword);
    apiUrl.searchParams.set('resources[type]', 'product');
    apiUrl.searchParams.set('resources[limit]', String(SEARCH_SUGGESTION_LIMIT));
    return apiUrl.href;
}

export function productSearchKeyword(productUrl) {
    const { handle } = getProductHandle(productUrl);
    return handle
        .split('-')
        .filter((part) => part.length >= 3 && !['man', 'woman'].includes(part.toLowerCase()) && !/\d/.test(part))
        .slice(0, 6)
        .join(' ');
}

export function canonicalProductUrl(rawUrl, baseUrl, handle) {
    const base = new URL(baseUrl);
    const localePrefix = getLocalePrefix(base.pathname);
    const fallback = handle ? `${localePrefix}/products/${handle}` : undefined;
    if (!rawUrl && !fallback) return undefined;
    const url = new URL(rawUrl || fallback, base.origin);
    url.search = '';
    return url.href;
}

export function toFiniteNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
}

export function getImageUrl(image) {
    if (typeof image === 'string') return image;
    if (!isObject(image)) return undefined;
    return image.src || image.url || image.originalSrc;
}

export function enrichProductSummary(product) {
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

export function mergeProductRecords(summaryProduct, detailProduct) {
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

export function normalizeProduct(product, sourceUrl, sourceType, keyword) {
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

export function matchesKeyword(product, keyword) {
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

export function parseStorefrontToken(html) {
    if (typeof html !== 'string') return undefined;

    const scriptMatch = html.match(/<script[^>]*\bid=["']shopify-features["'][^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
        try {
            const { accessToken } = JSON.parse(scriptMatch[1]);
            if (typeof accessToken === 'string' && accessToken.trim()) return accessToken.trim();
        } catch {
            // Fall through to the raw token patterns below.
        }
    }

    const jsonToken = html.match(/"accessToken"\s*:\s*"([a-f0-9]{32})"/i);
    if (jsonToken) return jsonToken[1];

    const metaToken = html.match(/name=["']shopify-storefront-access-token["'][^>]*content=["']([a-f0-9]{32})["']/i);
    return metaToken?.[1];
}

function numericId(value) {
    if (typeof value === 'number') return value;
    const match = String(value).match(/(\d+)$/);
    return match ? Number(match[1]) : value;
}

function moneyString(value) {
    const amount = toFiniteNumber(value);
    return amount === undefined ? undefined : amount.toFixed(2);
}

function graphqlOptions(variants) {
    const options = new Map();
    for (const variant of variants) {
        for (const option of variant.selectedOptions || []) {
            if (!option?.name || !option?.value) continue;
            if (!options.has(option.name)) options.set(option.name, []);
            const values = options.get(option.name);
            if (!values.includes(option.value)) values.push(option.value);
        }
    }

    return [...options].map(([name, values], index) => ({
        name: name.toLowerCase(),
        position: index + 1,
        values,
    }));
}

export function mapGraphqlProduct(product) {
    if (!isObject(product)) return undefined;

    const variants = Array.isArray(product.variants?.nodes) ? product.variants.nodes.filter(isObject) : [];
    const images = Array.isArray(product.images?.nodes) ? product.images.nodes.filter(isObject) : [];
    const priceMin = toFiniteNumber(product.priceRange?.minVariantPrice?.amount);
    const priceMax = toFiniteNumber(product.priceRange?.maxVariantPrice?.amount);
    const compareAtMin = toFiniteNumber(product.compareAtPriceRange?.minVariantPrice?.amount);
    const compareAtMax = toFiniteNumber(product.compareAtPriceRange?.maxVariantPrice?.amount);

    const record = {
        id: numericId(product.id),
        title: product.title,
        handle: product.handle,
        body_html: product.descriptionHtml,
        vendor: product.vendor,
        product_type: product.productType,
        tags: product.tags,
        available: product.availableForSale,
        published_at: product.publishedAt,
        created_at: product.createdAt,
        updated_at: product.updatedAt,
        price: priceMin,
        price_min: priceMin,
        price_max: priceMax,
        compare_at_price: compareAtMin,
        compare_at_price_min: compareAtMin,
        compare_at_price_max: compareAtMax,
        featured_image: product.featuredImage?.url,
        images: images.map((image) => ({ src: image.url })),
        options: graphqlOptions(variants),
        variants: variants.map((variant) => {
            const selectedOptions = Array.isArray(variant.selectedOptions) ? variant.selectedOptions : [];
            return {
                id: numericId(variant.id),
                title: variant.title,
                option1: selectedOptions[0]?.value,
                option2: selectedOptions[1]?.value,
                option3: selectedOptions[2]?.value,
                sku: variant.sku,
                available: variant.availableForSale,
                price: moneyString(variant.price?.amount),
                compare_at_price: moneyString(variant.compareAtPrice?.amount),
                featured_image: variant.image?.url,
            };
        }),
    };

    return record;
}
