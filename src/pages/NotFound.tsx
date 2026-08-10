import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "@/i18n";

const NotFound = () => {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    }
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">{t("notFound.title")}</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("notFound.body")}</p>
        <a href="/" className="text-primary underline hover:text-primary/90 min-h-[48px] inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          {t("notFound.returnHome")}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
