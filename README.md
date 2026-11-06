## What does Antonioli.eu Products Scraper do?

Antonioli.eu Products Scraper collects structured fashion product data from Antonioli.eu. Enter a public Antonioli.eu product, collection, catalog, or search URL, or leave the URL empty and use a keyword. The dataset includes product names, brands, categories, prices, availability, descriptions, images, variants, tags, and product links for catalog research, price monitoring, and product discovery.

## Why use Antonioli.eu Products Scraper?

- Collect men's, women's, sale, brand, category, and new-arrival products from one Actor.
- Search by brand or product term when you do not have a collection URL.
- Read one product, a full collection, or a keyword result set in the same dataset shape.
- Keep price, compare-at price, variant, image, tag, and availability data for each item.
- Schedule repeat runs to watch new arrivals, price changes, and stock updates.
- Export results as JSON, CSV, Excel, XML, or send them to another tool through Apify.

## What data can you extract from Antonioli.eu?

| Field                                                              | Description                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `id`                                                               | Antonioli product identifier                               |
| `title`                                                            | Product name                                               |
| `handle`                                                           | Product handle used in the Antonioli URL                   |
| `url`                                                              | Canonical product page                                     |
| `vendor`                                                           | Brand name                                                 |
| `product_type`                                                     | Product category, such as sneakers or knitwear             |
| `price`, `price_min`, `price_max`                                  | Current price or price range                               |
| `compare_at_price`, `compare_at_price_min`, `compare_at_price_max` | Compare-at price when published                            |
| `available`                                                        | Product availability                                       |
| `body_html`                                                        | Product description                                        |
| `tags`                                                             | Brand, gender, category, color, season, and supplier tags  |
| `image`                                                            | Primary image URL                                          |
| `featured_image`                                                   | Featured image URL                                         |
| `images`                                                           | Product image URLs                                         |
| `options`                                                          | Size or color options                                      |
| `variants`                                                         | Size, SKU, price, and availability records                 |
| `source_url`                                                       | URL or source used for the run                             |
| `source_type`                                                      | `product`, `collection`, `catalog`, `search`, or `keyword` |
| `search_keyword`                                                   | Keyword used for a keyword or search run                   |
| `scraped_at`                                                       | Time the record was saved                                  |

Blank, null, and empty nested values are left out of each record. Product fields vary by brand and item, so a missing optional field does not mean the run failed.

## How to use Antonioli.eu Products Scraper

1. Open the Actor in Apify Console.
2. Paste a product, collection, catalog, or search URL, or enter a keyword.
3. Set `results_wanted` and `max_pages`.
4. Run the Actor and open the dataset preview.
5. Download the dataset or connect it to your workflow.

A supplied URL takes priority over the keyword. The keyword field has a `Gucci` default so the Actor can run from the Console or Store test without extra input. Clear the URL field to use keyword mode.

## Input Parameters

| Parameter            | Type    | Required | Default                        | Description                                                     |
| -------------------- | ------- | -------- | ------------------------------ | --------------------------------------------------------------- |
| `url`                | String  | No       | -                              | Public Antonioli.eu product, collection, catalog, or search URL |
| `keyword`            | String  | No       | `Gucci`                        | Brand or product term used when `url` is empty                  |
| `results_wanted`     | Integer | No       | `20`                           | Maximum number of unique products to save                       |
| `max_pages`          | Integer | No       | `3`                            | Maximum result pages to request                                 |
| `proxyConfiguration` | Object  | No       | Apify Residential Proxy, Italy | Optional proxy settings for cloud runs                          |

At least one search mode must be usable. If both `url` and `keyword` are present, the URL is used.

Apify Proxy defaults to Italian residential IPs for this Actor. Other residential locations and custom proxies are supported. Blocked proxy sessions rotate automatically on retries.

## Output Data

| Field                                                              | Type             | Description                                       |
| ------------------------------------------------------------------ | ---------------- | ------------------------------------------------- |
| `id`                                                               | Number           | Antonioli product identifier                      |
| `title`                                                            | String           | Product name                                      |
| `handle`                                                           | String           | Product handle                                    |
| `url`                                                              | String           | Canonical product page                            |
| `vendor`                                                           | String           | Brand                                             |
| `product_type`                                                     | String           | Product category                                  |
| `price`, `price_min`, `price_max`                                  | Number           | Current price data                                |
| `compare_at_price`, `compare_at_price_min`, `compare_at_price_max` | Number           | Compare-at price data                             |
| `available`                                                        | Boolean          | Product availability                              |
| `body_html`                                                        | String           | Product description with HTML line breaks         |
| `tags`                                                             | Array of strings | Product tags                                      |
| `image`, `featured_image`                                          | String           | Image URLs                                        |
| `images`                                                           | Array of strings | Product image URLs                                |
| `options`                                                          | Array            | Size or color option definitions                  |
| `variants`                                                         | Array            | Variant records with SKU, price, and availability |
| `source_url`, `source_type`                                        | String           | Run source and source mode                        |
| `search_keyword`                                                   | String           | Keyword for a keyword or search run               |
| `scraped_at`                                                       | String           | ISO timestamp for the saved record                |

Prices use the storefront currency, currently EUR.

## Usage Examples

### Collection URL

Collect products from the men's collection:

```json
{
    "url": "https://antonioli.eu/en-row/collections/man",
    "results_wanted": 50,
    "max_pages": 2
}
```

### Product URL

Collect one product with its variants and images:

```json
{
    "url": "https://antonioli.eu/en-row/products/man-asics-shoes-sneakers-1203b116-200",
    "results_wanted": 1
}
```

### Keyword search

Search for a brand when you do not have a collection URL:

```json
{
    "keyword": "Gucci",
    "results_wanted": 20,
    "max_pages": 3
}
```

### Search URL

Use a search page that already contains the query:

```json
{
    "url": "https://antonioli.eu/en-row/search?q=sneakers",
    "results_wanted": 20,
    "max_pages": 2
}
```

## Sample Output

```json
{
    "id": 7589899108530,
    "title": "1953 Horsebit loafers",
    "handle": "man-gucci-shoes-loafers-flats-307929blm00-1000",
    "url": "https://antonioli.eu/en-row/products/man-gucci-shoes-loafers-flats-307929blm00-1000",
    "vendor": "GUCCI",
    "product_type": "LOAFERS & FLATS",
    "price_min": 775,
    "price_max": 775,
    "available": true,
    "body_html": "black<br>smooth leather<br>front gold-metal horsebit<br>block heel<br>leather sole",
    "tags": ["filter-brand_GUCCI", "filter-gender_man", "dept_SHOES"],
    "variants": [
        {
            "title": "6 UK M",
            "sku": "2000009441666",
            "price": "775.0",
            "available": true
        }
    ],
    "source_type": "search",
    "search_keyword": "Gucci",
    "scraped_at": "2026-11-06T12:13:15.182Z"
}
```

## Tips for Best Results

- Use a complete public URL copied from Antonioli.eu.
- Start with 20 results to check the dataset shape before a larger run.
- Use a collection URL for broad catalog collection and a product URL for one item.
- Use a short keyword such as a brand or garment type for discovery.
- Keep the default Italian residential proxy for the lowest retry rate. Other residential proxies also work, with automatic session rotation.
- Raise `max_pages` when a collection has more products than the first page.
- Check several records before treating a missing field as a problem.
- Schedule repeat runs for price and availability monitoring.

## Integrations

- **Apify API** - Read the dataset from your own application.
- **Google Sheets** - Send product records to a spreadsheet.
- **Webhooks** - Start a downstream job after a run finishes.
- **Make or Zapier** - Connect records to a no-code workflow.
- **CSV, Excel, JSON, and XML** - Export the dataset for analysis or storage.

## Frequently Asked Questions

### Can I collect one Antonioli product?

Yes. Paste the product URL and set `results_wanted` to `1`.

### Can I collect a collection other than the men's collection?

Yes. Public Antonioli.eu collection, brand, category, sale, and new-arrival URLs are supported when they use the site's collection path.

### How does keyword mode work?

Keyword mode searches Antonioli.eu for the supplied term and fills the requested result count when matching products are available. It also checks catalog pages if the first search response is incomplete.

### What happens if I supply both a URL and a keyword?

The URL wins. Clear the URL field if you want to use the keyword.

### Can I export the data to CSV or Excel?

Yes. Apify datasets can be downloaded as CSV, Excel, JSON, XML, and other supported formats.

### Why is a field missing from one product?

Fields depend on what Antonioli.eu publishes for that item. A product may not have a sale price, multiple images, or variant inventory. Empty values are omitted from the record.

### Why is product availability sometimes missing?

Availability depends on what Antonioli.eu publishes for that item. When it is available, the Actor merges it into the product record. If it is not published, the field is left out instead of guessed.

### Do I need a proxy?

Apify Proxy is enabled by default with Italian residential IPs, which gave the fewest retries in testing. You can change the proxy country or supply a custom proxy if your workflow needs another location. Blocked sessions rotate automatically on retries.

### Can I run this Actor on a schedule?

Yes. Use an Apify schedule to collect repeat snapshots for new arrivals, price changes, or inventory monitoring.

### Is collecting Antonioli.eu data legal?

You are responsible for following Antonioli.eu terms, applicable laws, intellectual property rules, privacy requirements, and any restrictions on how the collected data is used.

## Related Actors

- [Zara Product Scraper](https://apify.com/shahidirfan/zara-product-scraper) - Collect fashion product, price, color, and category data from Zara.
- [Forever21 Product Scraper](https://apify.com/shahidirfan/forever21-product-scraper) - Collect apparel products, prices, variants, and stock data from Forever21.
- [Reebok Products Scraper](https://apify.com/shahidirfan/reebok-products-scraper) - Collect footwear and apparel catalog data from Reebok.

## Support

For issues or feature requests, use the Issues tab on the Actor page and include the input URL, run ID, and a short description of the result.

## Legal Notice

This Actor is intended for responsible collection of publicly available product information. Users are responsible for complying with Antonioli.eu terms, applicable laws, and any restrictions that apply to storing, analyzing, or redistributing the collected data.
