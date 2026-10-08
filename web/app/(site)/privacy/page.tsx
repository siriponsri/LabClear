import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getCommon } from "@/lib/site-data";
import { Crumbs } from "@/components/public/Crumbs";
import "@/app/styles/public.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t("Privacy"),
    description: t("How LabClear handles temporary guest chats, saved accounts, lab reports and organization documents in this coursework simulation."),
  };
}

export default async function PrivacyPage() {
  const [{ t }, c] = await Promise.all([getT(), getCommon()]);
  return (
    <>
      <div className="wrap page-head">
        <Crumbs label={t("Breadcrumb")} items={[<Link key="home" href="/">{t("Home")}</Link>]} current={t("Privacy")} />
        <h1>{t("Privacy")}</h1>
        <p className="muted">{t("Coursework privacy notice. It describes how this software behaves; it is not a legal compliance statement.")}</p>
      </div>
      <div className="wrap prose stack">
        <section className="card stack-sm">
          <h2 className="h3">{t("Use synthetic data only")}</h2>
          <p>{t(c.policies.privacy_policy)}</p>
        </section>
        <section className="card stack-sm" id="guest">
          <h2 className="h3">{t("Without signing in: a temporary chat")}</h2>
          <p>{t("A chat you start without signing in lives only in the open page and in temporary server memory. It is not saved in the application database, and nothing from it is written to cookies or browser storage.")}</p>
          <p>{t("Refreshing or closing the page deletes it: the page tells the server to forget it straight away, and if that message cannot be sent, the server deletes it after 20 minutes without activity.")}</p>
          <p>{t("To keep your history, sign in or create an account. Signing in or creating an account from a page with a temporary chat deletes that chat and its images; your account starts with a new chat.")}</p>
          <p>{t("AI providers still receive the content needed to answer or read a report, under their own retention settings.")}</p>
        </section>
        <section className="card stack-sm">
          <h2 className="h3">{t("What is stored for signed-in accounts")}</h2>
          <ul className="plain small">
            <li>{t("Account email and a salted password hash. Sessions use an HTTP-only cookie.")}</li>
            <li>{t("Conversations, reports you upload, appointments, quotations, test payments and notifications, encrypted in the application database.")}</li>
            <li>{t("An audit trail of actions such as confirmations and refunds, without message contents.")}</li>
          </ul>
        </section>
        <section className="card stack-sm">
          <h2 className="h3">{t("Who can see it")}</h2>
          <p>{t("Your reports and conversations are private to your account. Staff see a conversation when you ask for the team or when an organization request needs coordination. Organizations never receive individual results.")}</p>
          <p>{t("When an AI provider is connected, the minimum text needed for a reply is sent to that provider. Reports are never added to the shared knowledge base.")}</p>
        </section>
        <section className="card stack-sm" id="org-documents">
          <h2 className="h3">{t("Organization and hospital documents")}</h2>
          <p>{t("An organization editor can upload the organization's own reference documents as UTF-8 text. They are stored encrypted and visible only to members of the same organization.")}</p>
          <p>{t("Every version starts as a draft that an editor must approve. Revoking or deleting a document stops later answers from using it; deleting also removes its text.")}</p>
          <p>{t("Approved excerpts are sent to an AI provider only if the service owner turns on organization reference inference after reviewing the providers' data policies. Then, like any cited source, a matching excerpt is part of the text sent for that reply.")}</p>
        </section>
        <section className="card stack-sm">
          <h2 className="h3">{t("Your controls")}</h2>
          <p>{t("Delete a report from My reports; this also clears conversation history that may contain its values. Sign out from your account menu. Password-account email verification and account recovery are not available in this coursework release.")}</p>
        </section>
      </div>
    </>
  );
}
