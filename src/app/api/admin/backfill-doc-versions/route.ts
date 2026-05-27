import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAdminAuthContext } from "@/lib/auth/admin-guard";
import { handleApiError } from "@/lib/api/error-handler";

export async function GET(request: Request) {
  try {
    const context = await buildAdminAuthContext(request);
    
    console.log(`--- Starting Source Document Versioning Backfill (API) by user ${context.userId} ---`);

    const documents = await prisma.sourceDocument.findMany({
      where: {
        groupId: null,
      },
    });

    console.log(`Found ${documents.length} documents requiring groupId initialization.`);

    let count = 0;
    for (const doc of documents) {
      await prisma.sourceDocument.update({
        where: { id: doc.id },
        data: {
          groupId: doc.id,
          version: 1,
          isLatest: true,
        },
      });
      console.log(`Initialized group for: ${doc.id} (${doc.originalName})`);
      count++;
    }

    console.log(`Successfully backfilled ${count} documents.`);
    
    return NextResponse.json({ 
      success: true, 
      count,
      message: `Backfilled ${count} documents.` 
    });
  } catch (err) {
    console.error("Backfill FAILED:", err);
    return handleApiError(err);
  }
}
