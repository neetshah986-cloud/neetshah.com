export const person = {
  name: "Neet Shah",
  role: "SEO Specialist",
  linkedin: "https://www.linkedin.com/in/neet-shah-424805231/",
  id: "https://neetshah.com/#neet-shah",
  knowsAbout: [
    "Search engine optimization",
    "Technical SEO",
    "Core Web Vitals",
    "Structured data",
    "JavaScript SEO",
  ],
};

export const site = {
  // The brand is the person: this is what Google shows as the site name.
  name: person.name,
  hub: "SEO People Hub",
  url: "https://neetshah.com",
  homeTitle: "Neet Shah: Free Technical SEO Tools and Guides",
  description:
    "Free technical SEO tools by Neet Shah for page speed, structured data and JavaScript rendering, with guides that explain every result.",
  author: person.name,
};

export const nav: { href: string; label: string; short?: string }[] = [
  { href: "/tools", label: "Tools" },
  { href: "/blog", label: "Guides" },
  { href: "/about", label: "About Neet", short: "About" },
];

// One Person entity, referenced by @id from every page's structured data.
export const personJsonLd = {
  "@type": "Person",
  "@id": person.id,
  name: person.name,
  url: `${site.url}/about`,
  jobTitle: person.role,
  sameAs: [person.linkedin],
  knowsAbout: person.knowsAbout,
};
