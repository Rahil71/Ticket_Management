/**
 * Seed Script — Team 3
 * Run: npm run seed
 *
 * Creates representative documents for every collection so that Thunder Client
 * tests have real IDs to work with.
 * Prints the seeded IDs at the end — copy them into your Thunder Client env.
 */

import "dotenv/config";
import mongoose, { Types } from "mongoose";
import connectDB from "../config/db";
import { TicketModel } from "../models/Ticket";
import { ServiceCatalogItemModel } from "../models/ServiceCatalogItem";
import { RequestFormSchemaModel } from "../models/RequestFormSchema";

// ─── Fixed dev IDs (match .env) ──────────────────────────────────────────────
const TENANT_ID = new Types.ObjectId(
  process.env.DEV_TENANT_ID ?? "665f1a2b3c4d5e6f7a8b9c0d",
);
const USER_ID = new Types.ObjectId(
  process.env.DEV_USER_ID ?? "665f1a2b3c4d5e6f7a8b9c0e",
);
const CUSTOMER_ID = new Types.ObjectId(
  process.env.DEV_CUSTOMER_ID ?? "665f1a2b3c4d5e6f7a8b9c0f",
);

async function seed() {
  await connectDB();
  console.log("[SEED] Connected. Dropping existing Team-3 dev data...");

  await TicketModel.deleteMany({ tenantId: TENANT_ID });
  await ServiceCatalogItemModel.deleteMany({ tenantId: TENANT_ID });
  await RequestFormSchemaModel.deleteMany({ tenantId: TENANT_ID });

  // ─── 1. Form Schemas ───────────────────────────────────────────────────────
  const hardwareFormSchema = await RequestFormSchemaModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    name: "Hardware Request Form",
    code: "HARDWARE_REQUEST_V1",
    version: 1,
    status: "PUBLISHED",
    publishedAt: new Date(),
    fields: [
      {
        key: "asset_type",
        label: "Asset Type",
        type: "SELECT",
        required: true,
        options: ["Laptop", "Monitor", "Keyboard", "Mouse", "Docking Station"],
        displayOrder: 1,
      },
      {
        key: "justification",
        label: "Business Justification",
        type: "TEXTAREA",
        required: true,
        displayOrder: 2,
      },
      {
        key: "required_by",
        label: "Required By Date",
        type: "DATE",
        required: false,
        displayOrder: 3,
      },
    ],
  });

  const softwareFormSchema = await RequestFormSchemaModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    name: "Software Access Request Form",
    code: "SOFTWARE_ACCESS_V1",
    version: 1,
    status: "PUBLISHED",
    publishedAt: new Date(),
    fields: [
      {
        key: "software_name",
        label: "Software Name",
        type: "TEXT",
        required: true,
        displayOrder: 1,
      },
      {
        key: "access_level",
        label: "Access Level",
        type: "SELECT",
        required: true,
        options: ["Read Only", "Standard", "Admin"],
        displayOrder: 2,
      },
      {
        key: "license_required",
        label: "License Required?",
        type: "CHECKBOX",
        required: false,
        displayOrder: 3,
      },
    ],
  });

  const generalFormSchema = await RequestFormSchemaModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    name: "General Support Form",
    code: "GENERAL_SUPPORT_V1",
    version: 1,
    status: "DRAFT",
    fields: [
      {
        key: "description",
        label: "Describe your issue",
        type: "TEXTAREA",
        required: true,
        displayOrder: 1,
      },
    ],
  });

  console.log("[SEED] Form schemas created:");
  console.log("  Hardware Form ID:", hardwareFormSchema._id.toString());
  console.log("  Software Form ID:", softwareFormSchema._id.toString());
  console.log("  General Form ID :", generalFormSchema._id.toString());

  // ─── 2. Service Catalogue Items ───────────────────────────────────────────
  const laptopService = await ServiceCatalogItemModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    name: "Laptop Request",
    code: "SVC-LAPTOP",
    description:
      "Request a new or replacement laptop. Standard build takes 3-5 business days.",
    requestFormSchemaId: hardwareFormSchema._id,
    displayOrder: 1,
    status: "ACTIVE",
  });

  const softwareService = await ServiceCatalogItemModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    name: "Software Access",
    code: "SVC-SOFTWARE",
    description:
      "Request access to a software application or system. SLA: 2 business days.",
    requestFormSchemaId: softwareFormSchema._id,
    displayOrder: 2,
    status: "ACTIVE",
  });

  const passwordService = await ServiceCatalogItemModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    name: "Password Reset",
    code: "SVC-PWD-RESET",
    description: "Reset your account password. Fulfilled within 1 hour.",
    displayOrder: 3,
    status: "ACTIVE",
  });

  const networkService = await ServiceCatalogItemModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    name: "Network Access Issue",
    code: "SVC-NETWORK",
    description: "Report a VPN, Wi-Fi, or network connectivity problem.",
    displayOrder: 4,
    status: "DRAFT",
  });

  console.log("\n[SEED] Service catalogue items created:");
  console.log("  Laptop Request    :", laptopService._id.toString());
  console.log("  Software Access   :", softwareService._id.toString());
  console.log("  Password Reset    :", passwordService._id.toString());
  console.log("  Network Access    :", networkService._id.toString());

  // ─── 3. Tickets ───────────────────────────────────────────────────────────
  const ticket1 = await TicketModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    ticketNumber: `TKT-9C0D-${Date.now()}`,
    requesterId: CUSTOMER_ID,
    source: "PORTAL",
    subject: "Cannot connect to VPN from home",
    description:
      "I have been unable to connect to the corporate VPN since Monday. I have tried restarting my laptop and reinstalling the VPN client but the issue persists.",
    ticketType: "INCIDENT",
    status: "OPEN",
    priority: "HIGH",
    impact: "HIGH",
    urgency: "HIGH",
    tags: ["vpn", "remote-work"],
    serviceCatalogItemId: networkService._id,
  });

  const ticket2 = await TicketModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    ticketNumber: `TKT-9C0D-${Date.now() + 1}`,
    requesterId: CUSTOMER_ID,
    source: "PORTAL",
    subject: "Request new MacBook Pro for development",
    description:
      "My current laptop is 4 years old and struggling to run the new development tools. Requesting a MacBook Pro 14-inch M3.",
    ticketType: "SERVICE_REQUEST",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    impact: "MEDIUM",
    urgency: "LOW",
    tags: ["hardware", "laptop"],
    serviceCatalogItemId: laptopService._id,
    submittedFields: new Map([
      ["asset_type", "Laptop"],
      ["justification", "Development tooling requires more RAM and CPU"],
    ]),
  });

  const ticket3 = await TicketModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    ticketNumber: `TKT-9C0D-${Date.now() + 2}`,
    requesterId: CUSTOMER_ID,
    source: "AGENT",
    subject: "Email not syncing on mobile",
    description:
      "Customer called to report that their corporate email is not syncing on their iPhone. Last sync was 3 days ago.",
    ticketType: "INCIDENT",
    status: "NEW",
    priority: "MEDIUM",
    impact: "MEDIUM",
    urgency: "MEDIUM",
    tags: ["email", "mobile"],
  });

  const ticket4 = await TicketModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    ticketNumber: `TKT-9C0D-${Date.now() + 3}`,
    requesterId: CUSTOMER_ID,
    source: "PORTAL",
    subject: "Access to Jira project DEVOPS-123",
    description:
      "I need read access to the DEVOPS-123 Jira project to review sprint planning boards.",
    ticketType: "SERVICE_REQUEST",
    status: "RESOLVED",
    priority: "LOW",
    impact: "LOW",
    urgency: "LOW",
    tags: ["access", "jira"],
    resolvedAt: new Date(),
    serviceCatalogItemId: softwareService._id,
  });

  const ticket5 = await TicketModel.create({
    tenantId: TENANT_ID,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    ticketNumber: `TKT-9C0D-${Date.now() + 4}`,
    requesterId: CUSTOMER_ID,
    source: "EMAIL",
    subject: "Printer on Floor 3 showing error E-014",
    description:
      "The shared HP printer on Floor 3, near the kitchen, is showing error code E-014 and will not print.",
    ticketType: "INCIDENT",
    status: "PENDING_VENDOR",
    priority: "LOW",
    impact: "LOW",
    urgency: "MEDIUM",
    tags: ["printer", "hardware"],
  });

  console.log("\n[SEED] Tickets created:");
  console.log("  TKT-001 (OPEN/HIGH)        :", ticket1._id.toString());
  console.log("  TKT-002 (IN_PROGRESS/MED)  :", ticket2._id.toString());
  console.log("  TKT-003 (NEW/MED)          :", ticket3._id.toString());
  console.log("  TKT-004 (RESOLVED/LOW)     :", ticket4._id.toString());
  console.log("  TKT-005 (PENDING_VENDOR)   :", ticket5._id.toString());

  console.log("\n─────────────────────────────────────────────────");
  console.log("THUNDER CLIENT ENV VARIABLES:");
  console.log("─────────────────────────────────────────────────");
  console.log(`baseUrl       = http://127.0.0.1:5000/api/v1`);
  console.log(`tenantId      = ${TENANT_ID.toString()}`);
  console.log(`userId        = ${USER_ID.toString()}`);
  console.log(`customerId    = ${CUSTOMER_ID.toString()}`);
  console.log(`ticketId      = ${ticket1._id.toString()}`);
  console.log(`resolvedTicketId = ${ticket4._id.toString()}`);
  console.log(`catalogItemId = ${laptopService._id.toString()}`);
  console.log(`formSchemaId  = ${hardwareFormSchema._id.toString()}`);
  console.log("─────────────────────────────────────────────────\n");

  await mongoose.disconnect();
  console.log("[SEED] Done.");
}

seed().catch((err) => {
  console.error("[SEED] Error:", err);
  process.exit(1);
});
