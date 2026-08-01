## What does Antonioli.eu Products Scraper do?

Antonioli.eu Products Scraper collects structured fashion product data from Antonioli.eu. Enter one public product, collection, catalog, or search URL, or use a keyword without a URL. The dataset includes product names, brands, categories, prices, availability, descriptions, images, variants, tags, and canonical product links for research, price monitoring, catalog analysis, and product discovery.

## Why use Antonioli.eu Products Scraper?

- **Product catalog collection** - Gather current Antonioli.eu products from men’s, women’s, sale, brand, category, and other collection pages.
- **Keyword discovery** - Search for brands, garment types, materials, and other product terms when a specific page is not available.
- **Rich product records** - Keep pricing, descriptions, variants, images, tags, availability, and source metadata in the dataset.
- **URL flexibility** - Run the same Actor on a collection URL, a single product URL, a search URL, or a catalog URL.
- **Automation-ready output** - Export the dataset as JSON, CSV, Excel, XML, or connect it to downstream workflows with Apify integrations.
- **Repeatable monitoring** - Schedule runs to track new arrivals, product availability, price changes, or catalog updates.

## What data can you extract from Antonioli.eu?

| Field                             | Description                                                       |
| --------------------------------- | ----------------------------------------------------------------- |
| `id`                              | Antonioli product identifier                                      |
| `title`                           | Product name                                                      |
| `handle`                          | Product handle used in the source URL                             |
| `url`                             | Canonical product URL                                             |
| `vendor`                          | Brand or vendor                                                   |
| `product_type`                    | Product category or type                                          |
| `price`, `price_min`, `price_max` | Current product or variant pricing when available                 |
| `compare_at_price`                | Original or comparison price when available                       |
| `available`                       | Product availability status                                       |
| `body_html`                       | Product description                                               |
| `tags`                            | Product tags, gender, category, color, season, and related labels |
| `image`                           | Primary product image URL                                         |
| `featured_image`                  | Featured product image URL                                        |
| `images`                          | Deduplicated product image URLs without image metadata            |
| `variants`                        | Size, SKU, price, inventory, and other variant records            |
| `source_url`                      | URL or source used for the run                                    |
| `source_type`                     | `product`, `collection`, `catalog`, `search`, or `keyword`        |
| `search_keyword`                  | Keyword used for a keyword or search run                          |
| `scraped_at`                      | ISO timestamp for the saved record                                |

Null, undefined, blank, and empty nested values are omitted from saved records so the dataset stays easy to use.

## How to use Antonioli.eu Products Scraper

1. Open the Actor in Apify Console.
2. Provide either `url` or `keyword`.
3. Set `results_wanted` and `max_pages` for the size of the run.
4. Run the Actor and open the dataset preview.
5. Download the results or connect the dataset to your workflow.

If both `url` and `keyword` are supplied, the URL takes priority. For keyword mode, leave `url` empty.

## Input Parameters

| Parameter            | Type    | Required | Default                                          | Description                                                            |
| -------------------- | ------- | -------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `url`                | String  | No       | Antonioli men’s collection URL in the QA prefill | Public Antonioli.eu product, collection, catalog, or search URL        |
| `keyword`            | String  | No       | -                                                | Product, brand, category, or material keyword used when `url` is empty |
| `results_wanted`     | Integer | No       | `20`                                             | Maximum number of unique products to save                              |
| `max_pages`          | Integer | No       | `3`                                              | Maximum collection or catalog pages to request                         |
| `proxyConfiguration` | Object  | No       | Apify Proxy enabled                              | Optional Apify Proxy configuration                                     |

At least one of `url` or `keyword` should be provided. The schema leaves both fields optional so the Actor can support either workflow.

## Output Data

Each dataset item represents one Antonioli.eu product. Keyword results are completed with available product details, so the initial search matches and later catalog matches use the same practical output shape.

| Field                                                              | Type             | Description                                                           |
| ------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------- |
| `price`, `price_min`, `price_max`                                  | Number           | Current product price summary derived from the available product data |
| `compare_at_price`, `compare_at_price_min`, `compare_at_price_max` | Number           | Comparison price summary when published                               |
| `available`                                                        | Boolean          | Product availability when published by Antonioli.eu                   |
| `image`                                                            | String           | Primary image URL                                                     |
| `featured_image`                                                   | String           | Featured image URL                                                    |
| `images`                                                           | Array of strings | Deduplicated image URLs only, with no image metadata objects          |
| `variants`                                                         | Array            | Available size, SKU, price, and inventory-related variant data        |
| `options`                                                          | Array            | Product option definitions, such as size or color                     |
| `source_url`, `source_type`                                        | String           | Input source and collection mode that produced the record             |

Some optional values depend on what Antonioli.eu publishes for an individual product. Empty, null, and blank values are not included in the dataset.

## Usage Examples

### Collection URL

Collect products from the men’s collection:

```json
{
    "url": "https://antonioli.eu/en-row/collections/man",
    "results_wanted": 50,
    "max_pages": 2
}
```

### Product URL

Collect a single product record with its available product details:

```json
{
    "url": "https://antonioli.eu/en-row/products/woman-gucci-bags-tote-bags-874745faf79-8547",
    "results_wanted": 1
}
```

### Keyword search

Search the catalog for products matching a brand or product term. Leave `url` empty in the Apify input form:

```json
{
    "keyword": "Gucci",
    "results_wanted": 20,
    "max_pages": 3
}
```

### Search URL

Use a search URL when the source page already contains the desired query:

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
    "id": 10799588540758,
    "title": "Gucci Tribeca Large Tote Bag",
    "handle": "woman-gucci-bags-tote-bags-874745faf79-8547",
    "url": "https://antonioli.eu/en-row/products/woman-gucci-bags-tote-bags-874745faf79-8547",
    "vendor": "GUCCI",
    "product_type": "TOTE BAGS",
    "price": 1520,
    "price_min": 1520,
    "price_max": 1520,
    "available": true,
    "body_html": "Product description supplied by Antonioli.",
    "tags": ["filter-brand_GUCCI", "filter-gender_woman"],
    "variants": [
        {
            "title": "UNI",
            "sku": "2000012391767",
            "price": "1520.00",
            "available": true
        }
    ],
    "source_type": "product",
    "scraped_at": "2026-08-01T15:20:00.000Z"
}
```

## Tips for Best Results

- Use a complete public URL copied from Antonioli.eu.
- Start with `results_wanted: 20` when testing a new category or filter.
- Use a collection URL for broad catalog collection and a product URL for one detailed item.
- Use a short keyword such as `Gucci`, `sneakers`, or `leather jacket` for catalog discovery.
- Increase `max_pages` when a collection has more products than the first page.
- Check several records before treating a missing field as a problem. Product data varies by brand and item.
- Use schedules and dataset exports for recurring price or availability monitoring.

## Integrations

- **Apify API** - Read the dataset from your application or data pipeline.
- **Google Sheets** - Send product records for merchandising and price analysis.
- **Webhooks** - Trigger downstream processing after a run finishes.
- **Make or Zapier** - Connect product records to no-code workflows.
- **CSV, Excel, JSON, and XML** - Export data for analysis, storage, or import into another system.

## Frequently Asked Questions

### Can I collect a single Antonioli product?

Yes. Provide the public product URL and set `results_wanted` to `1`.

### Can I use a collection URL other than the men’s collection?

Yes. Public Antonioli.eu collection, category, brand, sale, and new-arrival URLs are supported when they use the site’s collection structure.

### How does keyword mode work?

Keyword mode first uses Antonioli.eu search results and then checks paginated catalog data to fill the requested result limit when matching products are available.

### Can I export Antonioli.eu product data to CSV or Excel?

Yes. Apify datasets can be downloaded as CSV, Excel, JSON, XML, and other supported formats.

### Why is a field missing from one product?

Fields depend on the information published for that item. A product may not have a sale price, image set, variant inventory, or another optional value. Empty values are omitted from the record.

### Can I run this Actor on a schedule?

Yes. Use Apify schedules to collect repeat snapshots for product availability, price monitoring, or catalog changes.

### Why do image fields contain only URLs?

The Actor returns `image`, `featured_image`, and `images` as direct image URLs. This keeps the dataset compact and makes image export, download, and downstream processing simpler.

### Is collecting Antonioli.eu data legal?

You are responsible for following Antonioli.eu terms, applicable laws, intellectual property rules, privacy requirements, and any restrictions on how collected data is used.

## Related Actors

- [Clutch.co Scraper](https://apify.com/shahidirfan/Clutch-co-Scraper) - Collect company and agency data for supplier and competitor research that can complement fashion market analysis.
- [Epicurious Recipes Scraper](https://apify.com/shahidirfan/Epicurious-Scraper) - Build structured category datasets for content and catalog research workflows.

## Support

For issues or feature requests, use the Issues tab on the Actor page and include the input URL, run ID, and a short description of the result.

## Legal Notice

This Actor is intended for responsible collection of publicly available product information. Users are responsible for complying with Antonioli.eu terms, applicable laws, and any restrictions that apply to storing, analyzing, or redistributing collected data.
