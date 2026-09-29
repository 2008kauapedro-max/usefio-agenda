const clean = (value: string) => value.replace(/\/+$/, "");

export const siteUrl = clean(
  import.meta.env.VITE_FIO_SITE_URL || "https://usefio.com.br",
);

const appUrl = clean(
  import.meta.env.VITE_FIO_APP_URL || "https://usefio.vercel.app",
);

export const publicInfo = {
  instagramHandle: "@usefio.oficial",
  effectiveDate: "29 de setembro de 2026",
};

export const links = {
  signup: `${appUrl}/login?audience=owner&mode=signup`,
  login: `${appUrl}/login?audience=owner`,
  instagram:
    import.meta.env.VITE_FIO_INSTAGRAM_URL ||
    "https://www.instagram.com/usefio.ofc/",
  contact:
    import.meta.env.VITE_FIO_CONTACT_URL ||
    "https://www.instagram.com/usefio.ofc/",
};
