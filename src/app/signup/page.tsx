import Link from "next/link";
import { SignUpForm } from "./sign-up-form";
import { CheckIcon, SparklesIcon, FileIcon, ShieldCheckIcon } from "@/components/icons";
import { BrandMark } from "@/components/app-shell/brand-mark";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen bg-surface-base">
      {/* Left Panel: Value Proposition */}
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
              Complete security questionnaires faster with <span className="text-accent-primary">approved answers.</span>
            </h2>

            <ul className="space-y-6 max-w-md mb-12">
              <li className="flex items-start gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/20 border border-accent-primary/30">
                  <FileIcon className="h-3.5 w-3.5 text-accent-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">Upload Policies & Evidence</p>
                  <p className="text-sm text-slate-400 leading-relaxed">Centralize your security policies and prior questionnaires in one secure place.</p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/20 border border-accent-primary/30">
                  <ShieldCheckIcon className="h-3.5 w-3.5 text-accent-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">Build an Approved Library</p>
                  <p className="text-sm text-slate-400 leading-relaxed">Create a certified source of truth for all security related responses.</p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary/20 border border-accent-primary/30">
                  <SparklesIcon className="h-3.5 w-3.5 text-accent-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1">Evidence-Backed Suggestions</p>
                  <p className="text-sm text-slate-400 leading-relaxed">Let AI suggest high-fidelity answers backed by your uploaded documentation.</p>
                </div>
              </li>
            </ul>
          </div>

        </div>
      </div>

      {/* Right Panel: Form Area */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-20 bg-surface-base">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 text-center lg:text-left">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">Create your workspace</h1>
            <p className="mt-2 text-sm text-text-muted">Join <span className="text-text-primary font-semibold">TrustDesk</span> to automate your security compliance workflow.</p>
          </div>

          <div className="rounded-2xl border border-surface-border bg-surface-panel p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
            <SignUpForm />
          </div>

          <div className="mt-8 space-y-6">
            <p className="text-center text-sm text-text-muted">
              Already have an account?{" "}
              <Link href="/login" className="font-bold text-accent-primary hover:text-accent-primary-hover transition-colors">
                Log in
              </Link>
            </p>

            <div className="rounded-xl bg-accent-primary/5 p-4 border border-accent-primary/10">
              <p className="text-[10px] font-bold text-accent-primary uppercase tracking-widest mb-3">What happens next?</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1.5">
                  <div className="h-1 w-full bg-accent-primary rounded-full" />
                  <p className="text-[10px] text-text-primary font-bold">1. Workspace</p>
                </div>
                <div className="flex flex-col gap-1.5 opacity-40">
                  <div className="h-1 w-full bg-slate-300 rounded-full" />
                  <p className="text-[10px] text-text-muted font-bold">2. Upload</p>
                </div>
                <div className="flex flex-col gap-1.5 opacity-40">
                  <div className="h-1 w-full bg-slate-300 rounded-full" />
                  <p className="text-[10px] text-text-muted font-bold">3. Review</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
