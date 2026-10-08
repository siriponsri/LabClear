import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { Crumbs } from "@/components/public/Crumbs";
import { PaySim } from "@/components/public/PaySim";
import "@/app/styles/public.css";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Test payment simulator"), description: t("Simulated payment page. No real money can be paid here.") };
}

/* The transaction loads in the browser with the payer's session; this page holds no payment data. */
export default async function PaySimPage({ params }: Props) {
  const [{ id }, { t }] = await Promise.all([params, getT()]);
  return (
    <>
      <div className="wrap page-head">
        <Crumbs label={t("Breadcrumb")} items={[<Link key="b" href="/app?view=bookings">{t("My appointments")}</Link>]} current={t("Test payment")} />
        <h1>{t("Test payment simulator")}</h1>
        <p className="callout warn">{t("This page simulates a payment provider for coursework. It cannot take real money. Never enter card numbers or bank details here.")}</p>
      </div>
      <div className="wrap pay-grid">
        <section className="card stack" aria-label={t("Test payment")}>
          <PaySim id={id.slice(0, 80)} />
        </section>
        <aside className="card stack-sm small">
          <h2 className="h3">{t("How the simulator works")}</h2>
          <p>{t("Each button sends a signed test event to LabClear, the same way a payment provider would notify a real shop. The server checks the signature, amount, currency and order before changing anything.")}</p>
          <p>{t("Failed, expired or cancelled payments leave the appointment unpaid, and you can start again or pay at the center.")}</p>
          <Link href="/help#payments">{t("Payment policy")}</Link>
        </aside>
      </div>
    </>
  );
}
