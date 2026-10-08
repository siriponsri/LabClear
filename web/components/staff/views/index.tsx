"use client";
/* View registry for /staff. */
import type { ComponentType } from "react";
import type { ViewId } from "../context";
import { Overview } from "./Overview";
import { Inbox } from "./Inbox";
import { Operations } from "./Operations";
import { Customers } from "./Customers";
import { Payments } from "./Payments";
import { Notifications } from "./Notifications";
import { Audit, CatalogAdmin, Centers, Roles } from "./Manage";
import { AiProviders } from "./AiProviders";
import { Channels } from "./Channels";
import { Organizations } from "./Organizations";

export const VIEWS: Record<ViewId, ComponentType> = {
  overview: Overview,
  staff: Inbox,
  operations: Operations,
  customers: Customers,
  payments: Payments,
  notifications: Notifications,
  "catalog-admin": CatalogAdmin,
  centers: Centers,
  roles: Roles,
  ai: AiProviders,
  channels: Channels,
  audit: Audit,
  organizations: Organizations,
};
