"use client";
/* View registry for /app: every customer workspace view except the chat. */
import type { ComponentType } from "react";
import "@/app/styles/views.css";
import type { ViewId } from "../context";
import { BookView } from "./Book";
import { BookingsView } from "./Bookings";
import { LabsView } from "./Labs";
import { NotificationsView } from "./Notifications";
import { OrgsView } from "./Orgs";
import { PackagesView } from "./Packages";
import { PlanView } from "./Plan";
import { ReportsView } from "./Reports";

export const VIEWS: Record<Exclude<ViewId, "chat">, ComponentType> = {
  packages: PackagesView,
  book: BookView,
  bookings: BookingsView,
  labs: LabsView,
  reports: ReportsView,
  plan: PlanView,
  notifications: NotificationsView,
  orgs: OrgsView,
};
