import * as https from "node:https";
import * as http from "node:http";
import * as fs from "node:fs";
import { HttpsProxyAgent } from "https-proxy-agent";
import { serverEnv } from "@/lib/env/server";
import { aiConfig } from "@/lib/ai/ai-config-service";
import { logger } from "@/lib/logging/logger";

class MailService {
  private readonly apiKey: string | null = null;

  constructor() {
    this.apiKey = serverEnv.RESEND_API_KEY || null;
    if (!this.apiKey) {
      logger.warn("mail:resend-disabled:missing-api-key");
    }
  }

  /**
   * Performs a robust HTTPS request to the Resend API, supporting proxies and custom TLS.
   */
  private async robustResendRequest(endpoint: string, body: any): Promise<any> {
    if (!this.apiKey) throw new Error("EMAIL_PROVIDER_UNCONFIGURED");

    const url = `https://api.resend.com${endpoint}`;
    const parsedUrl = new URL(url);

    const agentOptions: https.AgentOptions = {
      rejectUnauthorized: !aiConfig.allowInsecureTls,
    };

    if (aiConfig.caBundlePath && fs.existsSync(aiConfig.caBundlePath)) {
      try {
        agentOptions.ca = fs.readFileSync(aiConfig.caBundlePath);
      } catch (err) {
        logger.error("mail:http:ca-load-failed", { error: String(err) });
      }
    }

    const options: https.RequestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      agent: aiConfig.proxyUrl 
        ? new HttpsProxyAgent(aiConfig.proxyUrl, agentOptions) 
        : new https.Agent(agentOptions),
    };

    return new Promise((resolve, reject) => {
      const req = (parsedUrl.protocol === "https:" ? https : http).request(url, options, (res) => {
        let responseData = "";
        res.on("data", (chunk) => { responseData += chunk; });
        res.on("end", () => {
          const isOk = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
          if (isOk) {
            try {
              resolve(JSON.parse(responseData));
            } catch {
              resolve({ id: "sent" }); // Fallback for success without JSON
            }
          } else {
            let errorMessage = `Status ${res.statusCode}`;
            try {
              const parsed = JSON.parse(responseData);
              errorMessage = parsed.error?.message || parsed.message || errorMessage;
            } catch { /* ignored */ }
            reject(new Error(`Resend API error: ${errorMessage}`));
          }
        });
      });

      req.on("error", (err) => {
        logger.error("mail:http:request-error", { error: err.message });
        reject(new Error(`Network error: ${err.message}`));
      });

      req.write(JSON.stringify(body));
      req.end();
    });
  }

  /**
   * Sends an invitation email to a new team member.
   */
  async sendInvitationEmail(params: {
    to: string;
    workspaceName: string;
    inviteUrl: string;
  }) {
    const { to, workspaceName, inviteUrl } = params;

    logger.info("mail:invite:sending-robust", { to, from: serverEnv.MAIL_FROM });

    try {
      const data = await this.robustResendRequest("/emails", {
        from: serverEnv.MAIL_FROM,
        to,
        subject: `Join ${workspaceName} on TrustDesk`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #111827;">You've been invited to TrustDesk</h2>
            <p style="color: #4b5563; line-height: 1.5;">
              You have been invited to join the <strong>${workspaceName}</strong> workspace on TrustDesk.
            </p>
            <div style="margin: 32px 0;">
              <a href="${inviteUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
              If you did not expect this invitation, you can safely ignore this email.
              This invitation will expire in 7 days.
            </p>
            <hr style="border: 0; border-top: 1px solid #f3f4f6; margin: 20px 0;" />
            <p style="color: #9ca3af; font-size: 12px;">
              If the button doesn't work, copy and paste this link into your browser:<br />
              <a href="${inviteUrl}" style="color: #3b82f6;">${inviteUrl}</a>
            </p>
          </div>
        `,
      });

      logger.info("mail:invite:send-succeeded", { to, id: data?.id });
      return data;
    } catch (err) {
      logger.error("mail:invite:send-failed", { 
        to, 
        error: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  }

  /**
   * Sends a password reset email.
   */
  async sendPasswordResetEmail(params: { to: string; token: string }) {
    const { to, token } = params;
    const resetUrl = `${serverEnv.APP_URL}/reset-password?token=${token}`;

    try {
      await this.robustResendRequest("/emails", {
        from: serverEnv.MAIL_FROM,
        to,
        subject: "Reset your TrustDesk password",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #111827;">Reset your password</h2>
            <p style="color: #4b5563; line-height: 1.5;">Click the button below to reset your password. This link will expire in 1 hour.</p>
            <div style="margin: 32px 0;">
              <a href="${resetUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px;">If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        `,
      });
    } catch (err) {
      logger.error("mail:send-reset-failed", { to, error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Sends an email verification link.
   */
  async sendVerificationEmail(params: { to: string; token: string }) {
    const { to, token } = params;
    const verifyUrl = `${serverEnv.APP_URL}/verify-email?token=${token}`;

    try {
      await this.robustResendRequest("/emails", {
        from: serverEnv.MAIL_FROM,
        to,
        subject: "Verify your TrustDesk email",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #111827;">Verify your email</h2>
            <p style="color: #4b5563; line-height: 1.5;">Click the button below to verify your email address and activate your account.</p>
            <div style="margin: 32px 0;">
              <a href="${verifyUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Verify Email
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px;">Welcome to TrustDesk!</p>
          </div>
        `,
      });
    } catch (err) {
      logger.error("mail:send-verify-failed", { to, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

export const mailService = new MailService();

