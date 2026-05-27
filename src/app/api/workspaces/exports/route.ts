import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { authorizePermission } from "@/lib/auth/authorize-role";
import { Permission } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  try {
    const auth = await buildAuthContext(request);
    authorizePermission(auth, Permission.EXPORT_DATA);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "25");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");
    const format = searchParams.get("format");
    const questionnaireId = searchParams.get("questionnaireId");
    const exportedById = searchParams.get("exportedById");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = { workspaceId: auth.workspaceId };
    
    if (search) {
      where.OR = [
        { fileName: { contains: search, mode: "insensitive" } },
        { questionnaire: { title: { contains: search, mode: "insensitive" } } },
        { exportedBy: { name: { contains: search, mode: "insensitive" } } },
        { exportedBy: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (status) where.status = status;
    if (format) where.format = format;
    if (questionnaireId) where.questionnaireId = questionnaireId;
    if (exportedById) where.exportedById = exportedById;
    
    if (dateFrom || dateTo) {
      where.exportedAt = {};
      if (dateFrom) where.exportedAt.gte = new Date(dateFrom);
      if (dateTo) where.exportedAt.lte = new Date(dateTo);
    }

    const [exports, total] = await Promise.all([
      prisma.exportJob.findMany({
        where,
        orderBy: { exportedAt: "desc" },
        skip,
        take: limit,
        include: {
          questionnaire: {
            select: { id: true, title: true, sourceFileName: true }
          },
          exportedBy: {
            select: { id: true, name: true, email: true }
          }
        }
      }),
      prisma.exportJob.count({ where })
    ]);

    return NextResponse.json({
      exports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
