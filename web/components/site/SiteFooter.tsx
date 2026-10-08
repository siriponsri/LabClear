import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export async function SiteFooter({ version }: { version: string }) {
  const { t } = await getT();
  return (
    <footer className="site-footer">
      <div className="wrap footer-cols">
        <div className="footer-id">
          <Link className="brand" href="/">
            LabClear
          </Link>
          <p className="small muted">{t("Health checks you can compare, reports explained with their sources, and a team that confirms every appointment.")}</p>
        </div>
        <nav className="footer-col" aria-label={t("Health checks")}>
          <h2>{t("Health checks")}</h2>
          <Link href="/packages">{t("All health checks")}</Link>
          <Link href="/packages?segment=individual&review=excluded">{t("Core checks")}</Link>
          <Link href="/packages?segment=individual&review=only">{t("Follow-up tests")}</Link>
          <Link href="/packages?segment=organization">{t("For organizations")}</Link>
          <Link href="/compare">{t("Compare")}</Link>
        </nav>
        <nav className="footer-col" aria-label={t("AI Lab Report")}>
          <h2>{t("AI Lab Report")}</h2>
          <Link href="/lab-reports">{t("How it works")}</Link>
          <Link href="/app?view=labs">{t("Lab dashboard")}</Link>
          <Link href="/app?view=reports">{t("My reports")}</Link>
          <Link href="/app?view=plan">{t("Plans and Plus")}</Link>
        </nav>
        <nav className="footer-col" aria-label={t("Your account")}>
          <h2>{t("Your account")}</h2>
          <Link href="/app">{t("Conversation")}</Link>
          <Link href="/app?view=book">{t("Request a time")}</Link>
          <Link href="/app?view=bookings">{t("My appointments")}</Link>
          <Link href="/app?view=orgs">{t("My organization")}</Link>
        </nav>
        <nav className="footer-col" aria-label={t("Help")}>
          <h2>{t("Help")}</h2>
          <Link href="/help">{t("Help and policies")}</Link>
          <Link href="/help#simulation">{t("What is simulated")}</Link>
          <Link href="/privacy">{t("Privacy")}</Link>
          <Link href="/sources">{t("Medical sources")}</Link>
          <Link href="/centers">{t("Centers")}</Link>
        </nav>
        <nav className="footer-col" aria-label={t("Organizations")}>
          <h2>{t("Organizations")}</h2>
          <Link href="/organizations">{t("Request a quotation")}</Link>
          <Link href="/staff">{t("Staff sign-in")}</Link>
        </nav>
      </div>
      <div className="wrap footer-base tiny muted">
        <span>{t("LabClear, a coursework business simulation. Explanations cite public references and are not a diagnosis.")}</span>
        <span className="footer-base-links">
          <Link href="/privacy">{t("Privacy")}</Link>
          <Link href="/help">{t("Policies")}</Link>
          <Link href="/sources">{t("Sources")}</Link>
          <span>v{version}</span>
        </span>
      </div>
    </footer>
  );
}
