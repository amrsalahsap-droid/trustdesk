import Link from "next/link";
import { headers } from "next/headers";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ClipboardIcon, PlusIcon } from "@/components/icons";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import { guardAnyPermission } from "@/lib/auth/guard";
import { redirect } from "next/navigation";

export default async function QuestionnairesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const status = params.status;

  const h = await headers();
  const cookie = h.get("cookie") ?? "";
  const request = new Request("http://localhost/app/questionnaires", {
    headers: cookie ? { cookie } : {},
  });

  let ctx;
  try {
    ctx = await buildAuthContext(request);
  } catch {
    redirect("/login");
  }

  // Guard: Questionnaires requires IMPORT_QUESTIONNAIRES or ASSIGN_ROWS
  guardAnyPermission(ctx, [Permission.IMPORT_QUESTIONNAIRES, Permission.ASSIGN_ROWS]);

  const list = await prisma.questionnaire.findMany({
    where: { 
      workspaceId: ctx.workspaceId,
      ...(status === "active" ? {
        items: {
          some: {
            reviewed: false,
          },
        },
      } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      sourceFileName: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Questionnaires"
        description="Import spreadsheets and review suggested answers before export."
        variant="emphasized"
        actions={
          ctx.permissions.includes(Permission.IMPORT_QUESTIONNAIRES) ? (
            <Link
              href="/app/questionnaires/import"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-accent-primary-hover hover:shadow-lg"
            >
              <PlusIcon className="h-4 w-4" />
              Import questionnaire
            </Link>
          ) : null
        }
      />

      <Card className="p-6">
        {list.length === 0 ? (
          <EmptyState
            icon={<ClipboardIcon className="h-12 w-12" />}
            title="No questionnaires yet"
            description="Import your first security questionnaire spreadsheet to get started with AI-powered answer suggestions."
            action={ctx.permissions.includes(Permission.IMPORT_QUESTIONNAIRES) ? {
              label: "Import your first XLSX or CSV",
              href: "/app/questionnaires/import"
            } : undefined}
            variant="guided"
          />
        ) : (
          <ul className="divide-y divide-surface-border">
            {list.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0">
                <div className="min-w-0">
                  <Link href={`/app/questionnaires/${q.id}/review`} className="font-medium text-text-primary hover:text-accent-primary">
                    {q.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {q._count.items} item{q._count.items === 1 ? "" : "s"}
                    {q.sourceFileName ? ` · ${q.sourceFileName}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/app/questionnaires/${q.id}/review`}
                    className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
                  >
                    Review
                  </Link>
                  <Link
                    href={`/app/questionnaires/${q.id}/export`}
                    className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-primary-hover"
                  >
                    Export
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
