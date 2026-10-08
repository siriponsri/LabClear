import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main id="main" className="wrap page-head" style={{ minHeight: "60vh" }}>
      <h1>{t("Page not found")}</h1>
      <p className="muted">{t("This page does not exist.")}</p>
      <p>
        <Link className="btn primary" href="/">
          {t("Home")}
        </Link>
      </p>
    </main>
  );
}
