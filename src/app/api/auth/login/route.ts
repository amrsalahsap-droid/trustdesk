import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { loginUser } from "@/modules/users/login";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { handleApiError } from "@/lib/api/error-handler";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = await loginUser(body, request);

    const res = NextResponse.json(
      {
        user: result.user,
        next: result.next,
      },
      { status: 200 },
    );
    try {
      setSessionCookie(res, result.user.id);
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "SESSION_ERROR",
            message: "Login succeeded but session could not be established. Try again.",
          },
        },
        { status: 500 },
      );
    }
    return res;
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            issues: error.flatten(),
          },
        },
        { status: 400 },
      );
    }
    return handleApiError(error);
  }
}
