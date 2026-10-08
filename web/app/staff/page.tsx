import { Suspense } from "react";
import type { Metadata } from "next";
import { StaffDesk } from "@/components/staff/StaffDesk";

export const metadata: Metadata = { title: "Service desk" };

export default function StaffPage() {
  return (
    <Suspense fallback={<div className="ws-root workspace staff" aria-busy="true" />}>
      <StaffDesk />
    </Suspense>
  );
}
