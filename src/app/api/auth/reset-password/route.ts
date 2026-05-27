import { NextResponse } from "next/server";
import { resetPassword } from "@/modules/users/password-reset";
import { handleApiError } from "@/lib/api/error-handler";
import { z } from "zod";

const Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password } = Schema.parse(body);

    await resetPassword(token, password);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_OR_EXPIRED_TOKEN") {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }
    return handleApiError(error);
  }
}
