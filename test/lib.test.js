import { describe, expect, it } from 'vitest';

import {
    canonicalProductUrl,
    cleanValue,
    collectionApiUrl,
    ensureTargetUrl,
    getRoute,
    mapGraphqlProduct,
    matchesKeyword,
    normalizeProduct,
    parseStorefrontToken,
} from '../src/lib.js';

describe('URL handling', () => {
    it('routes product, collection, search, and catalog URLs', () => {
        expect(getRoute(new URL('https://antonioli.eu/en-row/products/coat-123'))).toBe('product');
        expect(getRoute(new URL('https://antonioli.eu/en-row/collections/man'))).toBe('collection');
        expect(getRoute(new URL('https://antonioli.eu/en-row/search?q=gucci'))).toBe('search');
        expect(getRoute(new URL('https://antonioli.eu/en-row/products'))).toBe('catalog');
    });

    it('rejects lookalike hosts', () => {
        expect(() => ensureTargetUrl('https://evilantonioli.eu/products/x')).toThrow();
        expect(() => ensureTargetUrl('https://antonioli.eu.evil.test/products/x')).toThrow();
        expect(ensureTargetUrl('https://antonioli.eu/en-row/collections/man').hostname).toBe('antonioli.eu');
    });

    it('builds a collection JSON URL without duplicating products.json', () => {
        const url = collectionApiUrl(
            new URL('https://antonioli.eu/en-row/collections/man/products.json?page=2&limit=50&view=grid'),
            3,
        );
        expect(url).toBe('https://antonioli.eu/en-row/collections/man/products.json?limit=250&page=3');
    });

    it('builds canonical product URLs from a handle', () => {
        expect(canonicalProductUrl(undefined, 'https://antonioli.eu/en-row/collections/man', 'man-gucci-bag-123')).toBe(
            'https://antonioli.eu/en-row/products/man-gucci-bag-123',
        );
    });
});

describe('storefront parsing', () => {
    it('reads the token from the Shopify features script', () => {
        const html =
            '<script id="shopify-features" type="application/json">{"accessToken":"c1b4ff82381e5120f49d05a678089b1e"}</script>';
        expect(parseStorefrontToken(html)).toBe('c1b4ff82381e5120f49d05a678089b1e');
        expect(parseStorefrontToken('"accessToken":"c1b4ff82381e5120f49d05a678089b1e"')).toBe(
            'c1b4ff82381e5120f49d05a678089b1e',
        );
    });

    it('maps a GraphQL product into the existing record shape', () => {
        const record = mapGraphqlProduct({
            id: 'gid://shopify/Product/11205347934550',
            title: 'US8-S GEL-SJ33 Sneakers',
            handle: 'man-asics-shoes-sneakers-1203b116-200',
            descriptionHtml: '<p>Runner</p>',
            vendor: 'ASICS',
            productType: 'SNEAKERS',
            tags: ['filter-brand_ASICS'],
            availableForSale: true,
            featuredImage: { url: 'https://cdn.example/1.jpg' },
            images: { nodes: [{ url: 'https://cdn.example/1.jpg' }, { url: 'https://cdn.example/2.jpg' }] },
            priceRange: {
                minVariantPrice: { amount: '165.0', currencyCode: 'EUR' },
                maxVariantPrice: { amount: '165.0', currencyCode: 'EUR' },
            },
            compareAtPriceRange: {
                minVariantPrice: { amount: '0.0', currencyCode: 'EUR' },
                maxVariantPrice: { amount: '0.0', currencyCode: 'EUR' },
            },
            variants: {
                nodes: [
                    {
                        id: 'gid://shopify/ProductVariant/55104014025046',
                        title: '6.5 US M',
                        sku: '2000012779497',
                        availableForSale: true,
                        price: { amount: '165.0', currencyCode: 'EUR' },
                        compareAtPrice: { amount: '0.0', currencyCode: 'EUR' },
                        selectedOptions: [{ name: 'Size', value: '6.5 US M' }],
                    },
                ],
            },
        });

        expect(record.id).toBe(11205347934550);
        expect(record.body_html).toBe('<p>Runner</p>');
        expect(record.price_min).toBe(165);
        expect(record.compare_at_price).toBe(0);
        expect(record.available).toBe(true);
        expect(record.options).toEqual([{ name: 'size', position: 1, values: ['6.5 US M'] }]);
        expect(record.variants[0]).toMatchObject({
            id: 55104014025046,
            sku: '2000012779497',
            available: true,
            option1: '6.5 US M',
            price: '165.00',
        });
    });

    it('normalizes the final dataset item and removes blank fields', () => {
        const item = normalizeProduct(
            {
                id: 1,
                handle: 'man-coat-1',
                title: 'Coat',
                price: '99.50',
                body_html: '   ',
                tags: ['man'],
            },
            'https://antonioli.eu/en-row/collections/man',
            'collection',
        );

        expect(item.price).toBe(99.5);
        expect(item.url).toBe('https://antonioli.eu/en-row/products/man-coat-1');
        expect(item.source_type).toBe('collection');
        expect(item.body_html).toBeUndefined();
        expect(item.scraped_at).toEqual(expect.any(String));
    });

    it('matches every keyword term against product text and tags', () => {
        const product = { title: 'Leather Jacket', vendor: 'Rick Owens', tags: ['filter-color_Black'] };
        expect(matchesKeyword(product, 'rick leather')).toBe(true);
        expect(matchesKeyword(product, 'gucci')).toBe(false);
    });

    it('drops empty values without dropping zero or false', () => {
        expect(cleanValue({ zero: 0, no: false, empty: '', nested: { blank: ' ' } })).toEqual({
            zero: 0,
            no: false,
        });
    });
});
