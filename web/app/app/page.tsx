import { Suspense } from "react";
import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/Workspace";

export const metadata: Metadata = { title: "แชตและบัญชีของฉัน" };

export default function AppPage() {
  return (
    <Suspense fallback={<div className="ws-root workspace customer" aria-busy="true" />}>
      <Workspace />
    </Suspense>
  );
}
