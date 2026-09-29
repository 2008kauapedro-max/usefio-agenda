import { useEffect } from "react";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Home } from "./pages/Home";
import { Information } from "./pages/Information";
import { siteUrl } from "./data/config";

export function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  useEffect(() => {
    if (path === "/") return;

    const titles: Record<string, string> = {
      "/termos": "Termos de uso",
      "/privacidade": "Política de privacidade",
      "/contato": "Contato",
    };
    const known = Boolean(titles[path]);
    document.title = `${titles[path] || "Página não encontrada"} — FIO`;

    document
      .querySelector('meta[name="robots"]')
      ?.setAttribute("content", known ? "noindex, follow" : "noindex, nofollow");
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute("href", `${siteUrl}${path}`);
    document
      .querySelector('meta[property="og:url"]')
      ?.setAttribute("content", `${siteUrl}${path}`);
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
        Pular para o conteúdo
      </a>
      <Header />
      {path === "/" ? <Home /> : <Information page={path} />}
      <Footer />
    </>
  );
}
