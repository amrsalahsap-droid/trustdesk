/**
 * Database connection validation script.
 * Run this before starting the dev server to ensure DATABASE_URL is correct.
 * 
 * Usage: npx tsx scripts/validate-db.ts
 */
import { validateDatabaseConnection } from "../src/lib/db/prisma";

async function main() {
  console.log("🔍 Validating database connection...\n");
  
  try {
    await validateDatabaseConnection();
    console.log("✅ Database is ready!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n💡 Fix: Update your .env file with the correct DATABASE_URL\n");
    process.exit(1);
  }
}

main();
