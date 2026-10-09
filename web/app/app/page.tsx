import { Suspense } from "react";
import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { Workspace } from "@/components/workspace/Workspace";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Chat and my account") };
}

export default function AppPage() {
  return (
    <Suspense fallback={<div className="ws-root workspace customer" aria-busy="true" />}>
      <Workspace />
    </Suspense>
  );
}
