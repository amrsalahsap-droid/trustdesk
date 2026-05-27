import { NextResponse } from "next/server";
import { getDownloadUrl } from "@/modules/workspaces/source-documents/download-document";
import { handleApiError } from "@/lib/api/error-handler";

type Props = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, props: Props) {
  try {
    const { id } = await props.params;

    const result = await getDownloadUrl({
      request,
      documentId: id,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
