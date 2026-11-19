// A product page's JSON-LD with the mistakes we see most often in audits.
export const EXAMPLE_CODE = `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Trail Runner Pro",
  "image": "https://example.com/images/trail-runner.jpg",
  "brand": "Acme",
  "price": "1299",
  "offers": {
    "@type": "Offer",
    "price": "₹1,299",
    "priceCurrency": "₹",
    "availability": "In stock",
    "priceValidUntil": "31/12/2026",
    "seller": { "@id": "#store" }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewcount": "36"
  },
  "Review": {
    "@type": "Review",
    "author": "Priya",
    "reviewRating": { "@type": "Rating", "ratingValue": "5" }
  }
}`;
