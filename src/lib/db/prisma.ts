import { PrismaClient } from "@prisma/client";
import "@/lib/env/server";
import { tenantExtension } from "./tenant-extension";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const isServer = typeof window === "undefined";

// D15-EN-03: Memoize PrismaClient to prevent connection leaks during HMR
const basePrisma = (isServer && (globalForPrisma.prisma || new PrismaClient())) as PrismaClient;

if (isServer && process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = basePrisma;
}

export const uncheckedPrisma = basePrisma;
export const prisma = isServer ? basePrisma.$extends(tenantExtension) : {} as any;

/**
 * Validates database connectivity on startup.
 * Throws a clear error if DATABASE_URL is misconfigured.
 */
export async function validateDatabaseConnection(): Promise<void> {
  try {
    // Simple query to test connectivity
    await basePrisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connection verified");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes("P1000") || errorMessage.includes("authentication")) {
      console.error("\n❌ Database Authentication Failed");
      console.error("   Check your DATABASE_URL in .env file");
      console.error("   Ensure the password matches your PostgreSQL configuration\n");
    } else if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("connect")) {
      console.error("\n❌ Database Connection Failed");
      console.error("   Ensure PostgreSQL is running on the specified host/port");
      console.error("   Check that the database exists\n");
    } else {
      console.error("\n❌ Database Error:", errorMessage);
    }
    
    throw error;
  }
}

