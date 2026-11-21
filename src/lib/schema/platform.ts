// Which platform and SEO plugin made a page, and where to fix structured data on it.

export type SchemaPlatform = { id: "wordpress" | "shopify" | "wix" | "squarespace" | "webflow" | "nextjs"; name: string; seo?: "yoast" | "rankmath" | "aioseo"; woo?: boolean };

export function detectSchemaPlatform(html: string): SchemaPlatform | null {
  const seo: SchemaPlatform["seo"] = /yoast-schema-graph|This site is optimized with the Yoast SEO/i.test(html) ? "yoast" : /rank-math-schema|Rank Math (WordPress )?SEO/i.test(html) ? "rankmath" : /aioseo|All in One SEO/i.test(html) ? "aioseo" : undefined;
  if (/cdn\.shopify\.com|Shopify\.theme\b|\/cdn\/shop\//.test(html)) return { id: "shopify", name: "Shopify" };
  if (/\/wp-(content|includes)\//i.test(html) || seo) {
    const woo = /woocommerce/i.test(html);
    const parts = ["WordPress", seo === "yoast" ? "Yoast SEO" : seo === "rankmath" ? "Rank Math" : seo === "aioseo" ? "All in One SEO" : "", woo ? "WooCommerce" : ""].filter(Boolean);
    return { id: "wordpress", name: parts.join(" + "), seo, woo };
  }
  if (/static\.parastorage\.com|static\.wixstatic\.com/.test(html)) return { id: "wix", name: "Wix" };
  if (/static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT/.test(html)) return { id: "squarespace", name: "Squarespace" };
  if (/data-wf-page=|website-files\.com/.test(html)) return { id: "webflow", name: "Webflow" };
  if (/__NEXT_DATA__|\/_next\/static\//.test(html)) return { id: "nextjs", name: "Next.js" };
  return null;
}

type Group = "product" | "breadcrumb" | "organization" | "article" | "video" | "other";

export function groupOf(feature: string): Group {
  if (/Product|Merchant|Review|stars|Price|Shipping/i.test(feature)) return "product";
  if (/Breadcrumb/i.test(feature)) return "breadcrumb";
  if (/Organization|Site name|Local business/i.test(feature)) return "organization";
  if (/Article/i.test(feature)) return "article";
  if (/Video/i.test(feature)) return "video";
  return "other";
}

/** Steps for adding or fixing markup for a feature on the detected platform. */
export function schemaSteps(p: SchemaPlatform | null | undefined, feature: string, missing: string[] = []): { title: string; steps: string[] } | null {
  if (!p) return null;
  const g = groupOf(feature);
  const miss = missing.join(" ");
  const wantsRating = /aggregateRating|review|stars/i.test(miss + feature);
  const wantsShipping = /shipping|ReturnPolicy|Shipping/i.test(miss + feature);
  const wantsGtin = /gtin|mpn|sku/i.test(miss);
  const steps: string[] = [];

  if (p.id === "shopify") {
    if (g === "product") {
      if (wantsRating) steps.push("Stars come from your reviews app (Judge.me, Loox, Okendo, Yotpo and others). In the app's settings, turn on rich snippets or Google structured data, so it adds aggregateRating to the product markup.");
      if (wantsShipping) steps.push("Fill in Settings, Shipping and delivery, and Settings, Policies (return policy). The Google & YouTube app sends these to Google; for the page markup, add shippingDetails and hasMerchantReturnPolicy to the offer in your theme.");
      if (wantsGtin) steps.push("Add the barcode (GTIN) and SKU on each product, under Inventory in the product editor.");
      steps.push("The product markup comes from your theme. Go to Online Store, Themes, ⋯, Edit code, and open sections/main-product.liquid (or the snippet it renders). Most themes output it with {{ product | structured_data }}; to add fields, replace it with your own JSON-LD built from Liquid values such as {{ product.price | money_without_currency }}.");
      steps.push("Check the theme doesn't output a second Product block from an app as well: duplicates with different prices confuse Google.");
    } else if (g === "breadcrumb") steps.push("Add a breadcrumb snippet to the theme (Online Store, Themes, Edit code) that outputs BreadcrumbList JSON-LD from the collection and product, or use a schema app such as JSON-LD for SEO.");
    else if (g === "organization") steps.push("Add Organization (logo, name, social profiles) JSON-LD once in layout/theme.liquid, inside the <head>, so it's on every page.");
    else steps.push(`Add the ${feature} JSON-LD in the template that renders this page (Online Store, Themes, Edit code), or with a schema app.`);
    return { title: "On your Shopify store", steps };
  }

  if (p.id === "wordpress") {
    const title = `On your ${p.name} site`;
    if (g === "product") {
      if (p.woo) {
        steps.push("WooCommerce builds the product markup from the product itself. Fill in the regular price and stock status, and the SKU and GTIN (Inventory tab; WooCommerce 9.2 and later has a GTIN, UPC, EAN or ISBN field).");
        if (wantsRating) steps.push("For stars, turn on reviews: WooCommerce, Settings, Products, Enable product reviews and Enable star rating. aggregateRating appears once a product has an approved review.");
        if (wantsShipping) steps.push("WooCommerce doesn't add shipping or return details to the markup. Add them with your SEO plugin's WooCommerce add-on or a schema plugin, or in Google Merchant Center.");
      }
      if (p.seo === "yoast") steps.push("Yoast SEO and Yoast WooCommerce SEO merge the product into Yoast's schema graph. Check Yoast SEO, Settings, Content types, Products, Schema; GTIN fields come with Yoast WooCommerce SEO.");
      else if (p.seo === "rankmath") steps.push("In Rank Math, open the product, Schema tab, and edit or add the Product (or WooCommerce Product) schema; the default type is set in Rank Math, Titles & Meta, Products, Schema Type.");
      else if (!p.woo) steps.push("Add Product markup with your SEO plugin's schema settings or a schema plugin, and keep the price and rating the same as what the page shows.");
    } else if (g === "breadcrumb") {
      if (p.seo === "yoast") steps.push("Turn on breadcrumbs in Yoast SEO, Settings, Advanced, Breadcrumbs. Yoast then adds BreadcrumbList to its schema; show them on the page with your theme's breadcrumb option or the Yoast breadcrumb block.");
      else if (p.seo === "rankmath") steps.push("Turn on breadcrumbs in Rank Math, General Settings, Breadcrumbs, and show them on the page with the Rank Math breadcrumb block or shortcode.");
      else steps.push("Turn on breadcrumbs in your SEO plugin or theme; most add BreadcrumbList markup automatically once breadcrumbs are on.");
    } else if (g === "organization") {
      if (p.seo === "yoast") steps.push("Fill in Yoast SEO, Settings, Site representation: organization name, logo and social profiles. Site name is under Settings, Site basics.");
      else if (p.seo === "rankmath") steps.push("Fill in Rank Math, Titles & Meta, Local SEO: organization name, logo and social profiles (Social Meta).");
      else steps.push("Fill in the organization details (name, logo, social profiles) in your SEO plugin's settings.");
    } else if (g === "article") {
      if (p.seo === "yoast") steps.push("Yoast adds Article schema to posts. Check Yoast SEO, Settings, Content types, Posts, Schema: Article type. Each post needs a featured image and an author.");
      else if (p.seo === "rankmath") steps.push("Set Rank Math, Titles & Meta, Posts, Schema Type to Article (or Blog Post); each post needs a featured image.");
      else steps.push("Use your SEO plugin's Article schema for posts, and set a featured image and author on each post.");
    } else steps.push(`Add ${feature} markup with your SEO plugin's schema settings${p.seo === "rankmath" ? " (Rank Math, Schema Generator in the post editor)" : ""}, or a schema plugin.`);
    return { title, steps };
  }

  if (p.id === "wix") {
    steps.push(g === "product" ? "Wix adds Product markup to store product pages automatically from the product's details: fill in price, SKU, brand and images in the product editor." : `In the Wix editor, open the page's SEO settings (Marketing & SEO, SEO Settings, the page type, Edit), then Structured data markup, and add or edit the ${feature} JSON-LD there.`);
    if (wantsRating) steps.push("Stars need a reviews app that adds rating markup (Wix Reviews does on product pages).");
    return { title: "On your Wix site", steps };
  }
  if (p.id === "squarespace") return { title: "On your Squarespace site", steps: [`Squarespace adds only basic markup. Add the ${feature} JSON-LD in the page's Settings, Advanced, Page Header Code Injection (or site-wide in Settings, Advanced, Code Injection, Header).`] };
  if (p.id === "webflow") return { title: "On your Webflow site", steps: [`Add the ${feature} JSON-LD in Page settings, Custom code, Inside <head> tag. On CMS template pages, insert CMS fields into the JSON-LD so every item gets its own values.`] };
  if (p.id === "nextjs") return { title: "In your Next.js app", steps: [`Render the ${feature} JSON-LD in the page component on the server: <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />. Build it from the same data the page shows, so the values always match.`] };
  return null;
}
