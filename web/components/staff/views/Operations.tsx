"use client";
/* Appointments: confirm or decline requests, record center payments and approve refunds. */
import { useState } from "react";
import { api } from "@/lib/api/client";
import { Empty, Intro } from "@/components/workspace/ui";
import { useStaff } from "../context";
import { BookingRow, Chip, Loaded, RefreshButton, useLoad, type Booking } from "../parts";

type Filter = "requested" | "confirmed" | "closed" | "all";
const memory = { filter: "requested" as Filter };
const isFilter = (v: string | undefined): v is Filter => !!v && ["requested", "confirmed", "closed", "all"].includes(v);

export function Operations() {
  const { t, tf, params } = useStaff();
  const [filter, setFilter] = useState<Filter>(isFilter(params.filter) ? params.filter : memory.filter);
  const state = useLoad(() => api.get<{ bookings: Booking[] }>("/staff/operations"), []);
  const match = (b: Booking, f: Filter) => f === "all" || (f === "closed" ? ["declined", "cancelled"].includes(b.state) : b.state === f);
  const labels: [Filter, string][] = [
    ["requested", t("Awaiting confirmation")],
    ["confirmed", t("Confirmed")],
    ["closed", t("Declined or cancelled")],
    ["all", t("All")],
  ];
  return (
    <div>
      <Intro title={t("Appointments")}>{t("Confirm or decline requests, record center payments and approve refunds. Capacity and prices are checked on the server.")}</Intro>
      <Loaded state={state}>
        {(d) => {
          const rows = d.bookings.filter((b) => match(b, filter)).sort((a, b) => (a.data.date + a.data.time).localeCompare(b.data.date + b.data.time));
          return (
            <>
              <div className="toolbar" role="group" aria-label={t("Show appointments")}>
                {labels.map(([v, label]) => (
                  <Chip key={v} pressed={filter === v} onClick={() => ((memory.filter = v), setFilter(v))}>
                    {tf("{label} ({n})", { label, n: d.bookings.filter((b) => match(b, v)).length })}
                  </Chip>
                ))}
                <RefreshButton run={state.reload} />
              </div>
              {rows.length ? (
                <div className="record-list">
                  {rows.map((b) => (
                    <BookingRow key={b.id} b={b} after={state.reload} />
                  ))}
                </div>
              ) : (
                <Empty title={t("Nothing here")}>{filter === "requested" ? t("No requests are waiting for confirmation.") : t("No appointments in this group.")}</Empty>
              )}
            </>
          );
        }}
      </Loaded>
    </div>
  );
}
