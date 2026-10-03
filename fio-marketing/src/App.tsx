import { useEffect } from "react";
import { useMarketingI18n } from "./i18n";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { Information } from "./pages/Information";

export function App() {
  const { t } = useMarketingI18n();
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  useEffect(() => {
    if (path === "/") return;
    const titles: Record<string, string> = {
      "/termos": "Termos de uso",
      "/privacidade": "Privacidade",
      "/contato": "Contato",
    };
    document.title = `${titles[path] || "Página não encontrada"} — FIO`;
    document
      .querySelector('meta[name="robots"]')
      ?.setAttribute("content", "noindex, follow");
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute("href", `https://usefio.com.br${path}`);
    document
      .querySelector('meta[property="og:url"]')
      ?.setAttribute("content", `https://usefio.com.br${path}`);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute("content", document.title);
    document
      .querySelector('meta[name="twitter:title"]')
      ?.setAttribute("content", document.title);
    document.querySelector('script[type="application/ld+json"]')?.remove();
  }, [path]);
  return (
    <>
      <a href="#conteudo" className="skip-link">
        {t("skip")}
      </a>
      <Header />
      {path === "/" ? <Home /> : <Information page={path} />}
      <Footer />
    </>
  );
}
