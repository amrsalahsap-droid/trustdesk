import Link from "next/link";
import { LoginForm } from "./login-form";
import { SparklesIcon, FileIcon, ShieldCheckIcon } from "@/components/icons";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import { BrandMark } from "@/components/app-shell/brand-mark";

export default async function LoginPage() {
  // AUTH-001: Clear session cookies on login page to ensure a clean state
  // and prevent BF-Cache from showing authenticated shells.
  const cookieStore = await cookies();
  if (cookieStore.has(SESSION_COOKIE_NAME)) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    cookieStore.delete("td_active_uid");
    cookieStore.delete("x-workspace-id");
  }

  return (
    <div className="flex min-h-screen bg-surface-base">
      {/* Left Panel: Value Proposition (Consistent with Signup) */}
      <div className="hidden lg:flex lg:w-[45%] flex-col relative overflow-hidden bg-[#0F172A] border-r border-surface-border">
        {/* Subtle background decoration */}
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[600px] h-[600px] bg-accent-primary/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative flex-1 flex flex-col justify-between p-12 lg:p-16">
          <div>
            <div className="mb-10">
              <BrandMark size="lg" theme="dark" href="/" />
            </div>

            <h2 className="text-3xl lg:text-4xl font-bold text-white leading-[1.15] mb-8 max-w-lg">
              Resume your security questionnaires with <span className="text-accent-primary">AI-backed precision.</span>
            </h2>

            <ul className="space-y-6 max-w-md mb-12">
              <li className="flex items-start gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/20 border border-accent-primary/30">
                  <ShieldCheckIcon className="h-3.5 w-3.5 text-accent-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">Answer Library</p>
                  <p className="text-sm text-slate-400 leading-relaxed">Access and manage your certified source of truth for security responses.</p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/20 border border-accent-primary/30">
                  <FileIcon className="h-3.5 w-3.5 text-accent-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">Document Repository</p>
                  <p className="text-sm text-slate-400 leading-relaxed">Your security policies and compliance evidence, always at your fingertips.</p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/20 border border-accent-primary/30">
                  <SparklesIcon className="h-3.5 w-3.5 text-accent-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">Smart Assistance</p>
                  <p className="text-sm text-slate-400 leading-relaxed">Pick up where you left off with high-fidelity, evidence-backed suggestions.</p>
                </div>
              </li>
            </ul>
          </div>

        </div>
      </div>

      {/* Right Panel: Form Area */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-20 bg-surface-base">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 text-center lg:text-left animate-in fade-in slide-in-from-top-4 duration-700">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">Welcome back</h1>
            <p className="mt-2 text-sm text-text-muted">Enter your credentials to access your TrustDesk workspace.</p>
          </div>

          <div className="rounded-2xl border border-surface-border bg-surface-panel p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
            <LoginForm />
          </div>

          <div className="mt-8 space-y-6">
            <p className="text-center text-sm text-text-muted">
              Need an account?{" "}
              <Link href="/signup" className="font-bold text-accent-primary hover:text-accent-primary-hover transition-colors">
                Sign up
              </Link>
            </p>

            <div className="flex items-center gap-4 text-[10px] font-bold text-text-muted uppercase tracking-widest justify-center">
              <span>Security first</span>
              <span className="h-1 w-1 rounded-full bg-surface-border" />
              <span>EU Hosted</span>
              <span className="h-1 w-1 rounded-full bg-surface-border" />
              <span>TLS 1.3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
