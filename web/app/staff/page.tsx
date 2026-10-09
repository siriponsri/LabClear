import { Suspense } from "react";
import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { StaffDesk } from "@/components/staff/StaffDesk";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Service desk") };
}

export default function StaffPage() {
  return (
    <Suspense fallback={<div className="ws-root workspace staff" aria-busy="true" />}>
      <StaffDesk />
    </Suspense>
  );
}
