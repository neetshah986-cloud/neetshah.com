// Neet's own details. Deliberately no job titles anywhere on the site (his request).
export const person = {
  name: "Neet Shah",
  // Shown under his name instead of a job title. SEO career started March 2022.
  tagline: "4+ years in SEO, now at Jellyfish",
  photo: "/neet-shah.jpg",
  linkedin: "https://www.linkedin.com/in/neet-shah-424805231/",
  id: "https://neetshah.com/#neet-shah",
  employer: { name: "Jellyfish", url: "https://www.jellyfish.com" },
  knowsAbout: [
    "Search engine optimization",
    "Technical SEO",
    "International SEO",
    "Arabic SEO",
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
  image: `${site.url}${person.photo}`,
  sameAs: [person.linkedin],
  worksFor: { "@type": "Organization", name: person.employer.name, url: person.employer.url },
  alumniOf: { "@type": "CollegeOrUniversity", name: "University of Mumbai" },
  award: "Rising Star Award, Infidigit (2024)",
  knowsAbout: person.knowsAbout,
};
