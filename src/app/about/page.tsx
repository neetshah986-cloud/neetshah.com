import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: `About ${site.name}: free SEO tools and guides built by ${site.author}.`,
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <section className="container-x max-w-3xl pt-16">
      <h1 className="text-3xl font-bold tracking-tight">About {site.name}</h1>
      <div className="prose-post mt-6">
        <p>
          {site.name} is a free collection of SEO tools and guides for people who work in search,
          built by {site.author}.
        </p>
        <p>
          The goal is simple: give SEO professionals fast, honest checks for the technical issues
          that matter most, including page speed, structured data and how search engines see
          JavaScript-rendered pages.
        </p>
      </div>
    </section>
  );
}
