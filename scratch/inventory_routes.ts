
import { prisma } from "./src/lib/db/prisma";

const ROUTES = [
  "/",
  "/login",
  "/signup",
  "/onboarding",
  "/workspace-selection",
  "/app",
  "/app/questionnaires",
  "/app/library",
  "/app/governance",
  "/app/settings",
  "/app/audit",
  "/app/exports",
  "/api/health"
];

const BASE_URL = "http://localhost:3000";

async function inventoryRoutes(token?: string) {
  console.log(`--- Route Inventory ${token ? "(Authenticated)" : "(Anonymous)"} ---`);
  
  const headers: Record<string, string> = {};
  if (token) {
    headers["Cookie"] = `td_session=${token}`;
  }

  for (const route of ROUTES) {
    try {
      const res = await fetch(`${BASE_URL}${route}`, {
        method: 'GET',
        redirect: 'manual',
        headers
      });
      console.log(`${route.padEnd(25)} | Status: ${res.status} | Type: ${res.headers.get('content-type')} | Location: ${res.headers.get('location')}`);
    } catch (err) {
      console.log(`${route.padEnd(25)} | FAILED: ${err.message}`);
    }
  }
}

const token = process.env.TEST_TOKEN;
inventoryRoutes(token);
