# neetshah.com: SEO People Hub

Free SEO tools and guides for SEO professionals: page speed testing, schema validation, SSR vs CSR checks and more.

Built with Next.js (App Router, TypeScript, Tailwind CSS). Hosted on Hostinger as a Node.js app, auto-deployed from `main`.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm start       # serve the production build
```

## Structure

| Path | What it is |
| --- | --- |
| `src/lib/site.ts` | Site name, URL, description, nav |
| `src/lib/tools.ts` | Tool registry: add a tool here and it appears on the homepage, `/tools`, its own page and the sitemap |
| `src/app/tools/[slug]/` | Tool pages |
| `content/blog/*.md` | Blog posts (front matter: `title`, `description`, `date`, `tags`) |
| `src/app/sitemap.ts`, `src/app/robots.ts` | Generated `sitemap.xml` and `robots.txt` |

## Add a blog post

Create `content/blog/my-post-slug.md`:

```md
---
title: "Post title"
description: "One-sentence summary for search results."
date: "2026-11-16"
tags: ["technical-seo"]
---

Post body in Markdown.
```

Push to `main` and it deploys automatically.
