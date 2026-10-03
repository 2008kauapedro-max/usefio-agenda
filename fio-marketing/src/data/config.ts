const appUrl = (
  import.meta.env.VITE_FIO_APP_URL || "https://app.usefio.com.br"
).replace(/\/+$/, "");
export const links = {
  signup: `${appUrl}/login?audience=owner&mode=signup`,
  login: `${appUrl}/login?audience=owner`,
  instagram: import.meta.env.VITE_FIO_INSTAGRAM_URL || "",
  contact: import.meta.env.VITE_FIO_CONTACT_URL || "",
};
