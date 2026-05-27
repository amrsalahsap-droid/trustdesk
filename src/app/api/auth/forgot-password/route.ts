import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/modules/users/password-reset";
import { handleApiError } from "@/lib/api/error-handler";
import { mailService } from "@/lib/mail/mail-service";
import { z } from "zod";

const Schema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = Schema.parse(body);

    const result = await requestPasswordReset(email);

    // Only send email if we have a token (silent success for non-existent users)
    if (result.token) {
      await mailService.sendPasswordResetEmail({
        to: email,
        token: result.token,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
