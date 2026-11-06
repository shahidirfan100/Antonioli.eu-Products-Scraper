## Antonioli.eu API discovery

Target URL: `https://antonioli.eu/en-row/collections/man`

Last verified: 2026-11-06.

Antonioli.eu runs on Shopify and serves its storefront through Cloudflare. The site exposes two useful public data paths:

1. A Shopify Storefront GraphQL endpoint that the site itself uses.
2. Shopify JSON endpoints for products, collections, and search suggestions.

The actor prefers GraphQL because it returns collection and keyword results without cookies and works with every tested Impit browser profile. JSON endpoints remain as fallbacks when GraphQL is unavailable, rate limited, or returns a schema error.

## Selected API

### Storefront GraphQL

- Endpoint: `POST https://antonioli.eu/api/unstable/graphql.json`
- Version fallback: `POST https://antonioli.eu/api/2026-10/graphql.json`
- Authentication: public Storefront access token from the page HTML
- Token source: `<script id="shopify-features" type="application/json">{"accessToken":"..."}</script>`
- Pagination: `first` plus `after` cursor from `pageInfo.endCursor`
- Maximum page size tested: 250 products
- Collection query: `collection(handle: String!)`
- Product query: `product(handle: String!)`
- Catalog query: `products(first, after)`
- Keyword query: `products(first, after, query)`
- Fields: id, title, handle, descriptionHtml, vendor, productType, tags, availableForSale, publishedAt, createdAt, updatedAt, featuredImage, images, priceRange, compareAtPriceRange, variants with SKU, price, compareAtPrice, availability, image, and selected options
- Selection score: 100/100

The token is public storefront configuration, not a private credential. It is read from the live page when the cache is empty, cached in a named key-value store, and never logged.

### Collection JSON fallback

- Endpoint: `GET https://antonioli.eu/{locale}/collections/{handle}/products.json?limit=250&page=N`
- Authentication: none
- Pagination: `page`, hard cap of 250 records
- Response marker: top-level `products` array
- Selection score: 90/100

### Catalog JSON fallback

- Endpoint: `GET https://antonioli.eu/{locale}/products.json?limit=250&page=N`
- Authentication: none
- Pagination: `page`, hard cap of 250 records
- Response marker: top-level `products` array
- Selection score: 85/100

### Product JSON fallback

- Endpoint: `GET https://antonioli.eu/{locale}/products/{handle}.json`
- Alternate: `GET https://antonioli.eu/{locale}/products/{handle}.js`
- Authentication: none
- Pagination: not applicable
- Response marker: `product` object for `.json`; product object for `.js`
- Selection score: 85/100

This response currently omits product-level availability. When `available` is missing, the actor reads availability from GraphQL, then from search suggestions or a catalog page, and merges it into the detail record.

### Search suggestion fallback

- Endpoint: `GET https://antonioli.eu/{locale}/search/suggest.json?q={keyword}&resources[type]=product&resources[limit]=10`
- Authentication: none
- Pagination: fixed suggestion response, maximum 10 products
- Response marker: `resources.results.products`
- Selection score: 75/100

## Impit profile matrix

Impit 0.14.8 supports 24 browser profiles: 13 Chrome, 6 Firefox, 4 OkHttp, and iOS 18.

| Profile group                                     | GraphQL | Collection JSON | Catalog JSON |       Product JSON | Search suggest |
| ------------------------------------------------- | ------: | --------------: | -----------: | -----------------: | -------------: |
| Chrome (`chrome`, `chrome100` to `chrome151`)     |     200 |             200 |          200 |                200 |            200 |
| Firefox (`firefox`, `firefox128` to `firefox158`) |     200 |           mixed |        mixed |              mixed |            200 |
| OkHttp (`okhttp`, `okhttp3` to `okhttp5`)         |     200 |             200 |          200 | 200, one 429 retry |            200 |
| iOS (`ios18`)                                     |     200 |             200 |          200 |                200 |            200 |

GraphQL returned the expected payload with all 24 profiles. The JSON fallback is less consistent: `firefox128`, `firefox133`, `firefox135`, and `firefox144` returned HTTP 403 on one or more JSON endpoints. `firefox158` returned 200 across the matrix. `okhttp3` returned one HTTP 429 on product JSON.

The actor starts with `chrome`, then rotates to `ios18` and `firefox158` only after a retryable failure. A retry also requests a new Apify Proxy session, because a blocked residential IP returns 403 regardless of the browser profile. No mobile app endpoint was required. The same GraphQL endpoint works with the mobile profiles, so there is no evidence for a separate iOS or Android host.

## Candidate matrix

| Candidate                  | Status                                                  | Fields                                                 | Pagination           | Decision         |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------ | -------------------- | ---------------- |
| Storefront GraphQL         | HTTP 200, JSON, all profiles                            | Rich product, variant, price, image, and option fields | Cursor               | Primary          |
| Collection `products.json` | HTTP 200 with Chrome, 403 with several Firefox versions | Shopify product objects                                | `page`, `limit`      | Fallback         |
| Catalog `products.json`    | HTTP 200 with Chrome and most profiles                  | Shopify product objects                                | `page`, `limit`      | Fallback         |
| Product `.json` / `.js`    | HTTP 200, JSON                                          | Rich product detail, no product-level availability     | None                 | Product fallback |
| Search `suggest.json`      | HTTP 200, JSON                                          | Availability, pricing, images, variants                | Fixed 10 suggestions | Keyword fallback |
| Collection `?view=ajax`    | HTTP 200, HTML                                          | No structured product array                            | Unknown              | Rejected         |
| Hardcoded Storefront token | Works until the token changes                           | Same as GraphQL                                        | Cursor               | Rejected         |
| Separate mobile API        | No evidence found                                       | None                                                   | Unknown              | Rejected         |
| Browser rendering          | Not required                                            | Same data as JSON                                      | Not applicable       | Rejected         |

URLScan was not needed. Direct requests returned the expected JSON from this environment, and the site's own page exposes the GraphQL token.

## Runtime request flow

### Collection URL

1. Read the collection handle from the path.
2. Request the collection through GraphQL with a 250-product page.
3. Follow `pageInfo.endCursor` until `max_pages`, `results_wanted`, or the last page.
4. If GraphQL fails, request the collection `products.json` page for the same page number.
5. If the URL contains `page=2` or later, start with JSON because GraphQL pagination is cursor based.

### Product URL

1. Request the product `.json` endpoint.
2. If that fails, request the `.js` endpoint.
3. If both fail, request the product through GraphQL.
4. If the product still cannot be read, use search suggestions, then catalog pages.
5. If availability is missing, merge it from GraphQL, then search suggestions or catalog data.

### Catalog URL

1. Request global products through GraphQL.
2. Follow the cursor up to `max_pages` and `results_wanted`.
3. Fall back to global `products.json` if GraphQL fails.

### Keyword or search URL

1. Read the keyword from `q` for search URLs, otherwise use the supplied keyword.
2. Request matching products through GraphQL with `products(query)`.
3. Follow the cursor up to `max_pages` and `results_wanted`.
4. If GraphQL fails, read up to 10 suggestions, then scan catalog pages and filter by the keyword.

## Failure playbook

Read this file before changing request code. Then use the run log to identify the branch that failed.

| Log message                               | Meaning                                       | Action                                                                |
| ----------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `Storefront token page failed`            | The page did not load or returned no token    | Check the HTTP status, Cloudflare response, and proxy country         |
| `Storefront access token was not present` | The page loaded without `shopify-features`    | Verify the theme still exposes the token, then use JSON fallbacks     |
| `Storefront unstable request failed`      | The unstable schema failed on this request    | The actor automatically tries `2026-10`; inspect the first error line |
| `Storefront token was rejected`           | The token rotated or was invalid              | The actor refreshes it once; if it repeats, inspect token discovery   |
| `Using products.json`                     | GraphQL failed and JSON fallback started      | Check whether the JSON endpoint returned 200 and a `products` array   |
| `Product .json request failed`            | Product detail request failed                 | The actor tries `.js`, GraphQL, suggestions, then catalog             |
| `No products matched`                     | Valid responses contained no matching records | Verify the collection, keyword, locale, and result limit              |
| `retries=` greater than zero              | Temporary errors were retried                 | Check 429, 5xx, timeouts, and proxy stability                         |

If every source fails, confirm that `https://antonioli.eu/en-row/collections/man` still loads in a browser, that the page still contains `shopify-features`, and that the collection still exists. Do not add a guessed endpoint or a hardcoded token.

## Input and output decisions

- A supplied URL takes priority over the keyword.
- If no URL and no keyword are supplied, the actor uses the documented `Gucci` keyword default.
- Collection and catalog runs paginate until `results_wanted`, `max_pages`, or the last page.
- Product runs use one detail request plus an availability lookup when needed.
- Keyword runs use GraphQL search first, then suggestions and catalog data.
- Records are deduplicated by product ID or handle.
- Null, undefined, blank, and empty nested values are removed recursively before dataset writes.
- Batches are pushed as soon as each page is processed.

## Reliability notes

- The Storefront token is discovered at runtime, cached in the named `antonioli-storefront` store, and refreshed when Shopify rejects it. A token change does not require a code change.
- `origin` and `referer` are built from the input URL on each run.
- HTTP retries cover 403, 408, 425, 429, standard 5xx responses, Cloudflare 520 to 527 responses, and transport errors.
- Apify Proxy defaults to Italian residential IPs because that gave the fewest retries. Any residential location or custom proxy remains supported.
- A 403 rotates both the Impit profile and the proxy session. Changing only the profile is not enough when the IP itself is blocked.
- Generic residential test without a country: 19 of 19 search runs saved 20 of 20 products. Most runs needed one proxy session retry.
- Named token cache test: 10 of 10 search runs saved 20 of 20 products. The first run rebuilt the token after one 403 retry, then the remaining runs used the cache with one GraphQL request and zero retries.
- Cloud verification on 2026-11-06 before the proxy fix: one search run saved only 10 of 20 products because the token page and catalog JSON both returned 403 across all browser profiles.
- Cloud verification with the default Italian proxy: 10 of 10 search runs saved 20 of 20 products with zero retries, and 12 mixed collection, product, keyword, and search runs saved their full requested counts.
- Cloud product verification on 2026-11-06: product JSON returned 403 on Chrome, the actor retried with `ios18`, then read availability through GraphQL, and saved the product.
- Retry delays use `Retry-After` when present and bounded exponential backoff with jitter otherwise.
- Browser profiles rotate only after a retryable failure. Successful runs stay on one profile.
- GraphQL versions fall back from `unstable` to `2026-10`.
- JSON fallbacks cover GraphQL schema or availability failures.
- Availability is merged into product detail records because the current product JSON response omits it.
- No cookies, private credentials, or authentication headers are required.
