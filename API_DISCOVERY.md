## Antonioli.eu API discovery

Target URL: `https://antonioli.eu/en-row/collections/man`

The target is a Shopify storefront. Direct JSON endpoints returned product records without browser rendering, authentication, cookies, or HTML parsing. The working requests were verified with ordinary browser-compatible HTTP headers (`User-Agent` and `Accept: application/json`). The production actor uses `impit` for the same direct requests.

## Selected endpoints

### Collection and catalog products

- Endpoint: `GET https://antonioli.eu/{locale}/collections/{handle}/products.json?limit=250&page=N`
- Method: GET
- Authentication: None observed
- Pagination: `page`, with `limit` up to 250
- Response: JSON object with a `products` array
- Product fields observed: `id`, `title`, `handle`, `body_html`, `created_at`, `published_at`, `updated_at`, `vendor`, `product_type`, `tags`, `options`, `variants`, and `images`
- Selection score: 100/100

This is the primary endpoint for collection URLs. The same `products.json` pattern is used for catalog pagination when keyword mode needs more than the search suggestion limit.

### Product detail

- Endpoint: `GET https://antonioli.eu/{locale}/products/{handle}.json`
- Method: GET
- Authentication: None observed
- Pagination: Not applicable
- Response: JSON object with a `product` object
- Product fields observed: `id`, `title`, `body_html`, `vendor`, `product_type`, `created_at`, `updated_at`, `published_at`, `tags`, `variants`, `images`, `options`, `image`, `published_scope`, and `template_suffix`
- Selection score: 85/100

This endpoint is used for direct product URLs and preserves the detailed variant and image data returned for the individual product.

### Search suggestions

- Endpoint: `GET https://antonioli.eu/{locale}/search/suggest.json?q={keyword}&resources[type]=product&resources[limit]=10`
- Method: GET
- Authentication: None observed
- Pagination: The endpoint returned a maximum of 10 product suggestions during testing
- Response: JSON object at `resources.results.products`
- Product fields observed: `available`, `body`, `compare_at_price_max`, `compare_at_price_min`, `featured_image`, `handle`, `id`, `image`, `price`, `price_max`, `price_min`, `tags`, `title`, `type`, `url`, `variants`, and `vendor`
- Selection score: 85/100

This endpoint is used first for keyword and search URL runs. The actor then scans paginated catalog JSON and filters products to fill larger requested result counts.

## Candidate matrix

| Candidate                              |                                                           Status and response |                                                      Fields | Pagination                                                   | Decision                                    |
| -------------------------------------- | ----------------------------------------------------------------------------: | ----------------------------------------------------------: | ------------------------------------------------------------ | ------------------------------------------- |
| Collection `products.json`             |                                         HTTP 200, JSON, 1.4 MB at `limit=250` | 14 top-level product fields plus nested variants and images | `page`, `limit`                                              | Selected for collection URLs                |
| Product `.json`                        |                                                                HTTP 200, JSON | 16 top-level product fields plus nested variants and images | None                                                         | Selected for product URLs                   |
| Search `suggest.json`                  |                                                                HTTP 200, JSON |                                           16 product fields | Fixed suggestion response, no usable page parameter observed | Selected as first keyword request           |
| Catalog `products.json`                |                                                                HTTP 200, JSON |              Same rich product shape as collection endpoint | `page`, `limit`                                              | Selected as keyword fallback                |
| Collection `?view=ajax`                |                                                                HTTP 200, HTML |                             Not counted as a structured API | Site-rendered page response                                  | Rejected because it requires HTML parsing   |
| `/search.json` and `/search?view=json` |                                                                HTTP 200, HTML |                                 Not a JSON product response | Not applicable                                               | Rejected                                    |
| URLScan domain search                  | 40 public scans found; result retrieval returned HTTP 403 in this environment |           Network detail unavailable from the selected scan | Unknown                                                      | Direct public JSON endpoints were preferred |
| Browser fallback                       |                                                                  Not required |   Direct HTTP already returned the complete product payload | Not applicable                                               | Not used                                    |

## Input and output decisions

- A user-provided `url` takes priority over `keyword`.
- Collection and catalog URLs are paginated until `results_wanted`, `max_pages`, or the endpoint returns fewer than 250 products.
- Product URLs make one detail request.
- Keyword mode uses the search suggestion endpoint, then paginated catalog JSON with case-insensitive matching across title, handle, brand, product type, description, and tags.
- Records are deduplicated by product ID or handle.
- Null, undefined, blank, and empty nested values are removed recursively before dataset writes.
- API batches are pushed as soon as each response is processed.

## Reliability notes

- No hardcoded authentication, CSRF token, or cookie was required.
- `impit` uses one shared Chrome client for connection reuse and consistent TLS and request fingerprinting.
- Retries cover HTTP 429, common 5xx responses, transport errors, and JSON parsing failures.
- Apify Proxy is optional and is skipped during local runs because local Apify Proxy credentials are not assumed.
