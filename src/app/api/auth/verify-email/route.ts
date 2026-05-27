import { NextResponse } from "next/server";
import { verifyEmail } from "@/modules/users/email-verification";
import { handleApiError } from "@/lib/api/error-handler";
import { z } from "zod";

const Schema = z.object({
  token: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token } = Schema.parse(body);

    await verifyEmail(token);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_TOKEN") {
      return NextResponse.json({ error: "Invalid or expired verification token" }, { status: 400 });
    }
    return handleApiError(error);
  }
}
