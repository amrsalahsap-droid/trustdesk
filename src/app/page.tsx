import Link from "next/link";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { WorkflowSlider } from "@/components/landing/workflow-slider";
import { Button } from "@/components/ui/button";
import { 
  ArrowRightIcon, 
  SparklesIcon, 
  ShieldCheckIcon, 
  GridIcon, 
  BookIcon, 
  ClipboardIcon,
  LogoIcon,
  CheckIcon,
  LockIcon,
  GlobeIcon,
  ActivityIcon
} from "@/components/icons";

export default async function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-base selection:bg-accent-primary/20">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-surface-border bg-surface-base/80 backdrop-blur-xl">
        <div className="inner-container flex h-20 items-center justify-between">
          <BrandMark size="lg" href="/" />

          <nav className="hidden md:flex items-center gap-8 lg:gap-10">
            {[
              { label: "The Problem", href: "#problem" },
              { label: "How it Works", href: "#workflow" },
              { label: "Platform", href: "#pillars" },
              { label: "Security", href: "#security" }
            ].map((item) => (
              <Link 
                key={item.label}
                href={item.href} 
                className="text-[10px] font-black uppercase tracking-[0.2em] text-text-secondary hover:text-accent-primary transition-colors whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-6 lg:gap-8 shrink-0">
            <Link href="/login" className="text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap">
              Log in
            </Link>
            <Button size="sm" className="hidden sm:flex font-black px-6 h-10 rounded-lg shadow-premium-lg bg-accent-primary hover:bg-accent-primary-hover text-[10px] uppercase tracking-widest" asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {/* 1. Hero Section */}
        <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden">
          {/* Subtle Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
          
          <div className="inner-container relative">
            <div className="flex flex-col items-center gap-8 max-w-5xl mx-auto">
              <div className="flex flex-col items-center gap-4 animate-fade-up">
                <h1 className="text-display-xl text-center">
                  Close enterprise deals <br />
                  <span className="text-accent-primary">in days, not months.</span>
                </h1>
                <p className="text-lg md:text-xl text-text-secondary max-w-2xl text-center font-medium leading-relaxed">
                  Replace manual security questionnaires with a high-fidelity trust engine. Deterministic matching. 100% citation-backed accuracy.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6 pt-2 animate-fade-up [animation-delay:200ms]">
                <Button size="xl" className="group h-18 px-12 text-xl font-black tracking-tight rounded-2xl bg-accent-primary hover:bg-accent-primary-hover shadow-premium-2xl" asChild>
                  <Link href="/signup">
                    Get Started for Free
                    <ArrowRightIcon className="ml-3 h-6 w-6 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                <Link href="#" className="group flex items-center gap-4 text-lg font-black tracking-tight text-text-secondary hover:text-text-primary transition-all">
                  <div className="h-12 w-12 rounded-xl bg-white border border-surface-border flex items-center justify-center group-hover:border-accent-primary/30 transition-all shadow-premium-sm">
                    <ActivityIcon className="h-5 w-5 text-accent-primary" />
                  </div>
                  <span>Book a Technical Demo</span>
                </Link>
              </div>
              
              <div className="flex items-center gap-6 pt-2 animate-fade-up [animation-delay:400ms]">
                {[
                  "No credit card",
                  "SOC2 Type II Ready",
                  "Setup in < 5 minutes"
                ].map((text, i) => (
                  <div key={text} className="flex items-center gap-3">
                    {i > 0 && <div className="h-1 w-1 rounded-full bg-surface-border" />}
                    <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em]">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Social Proof Strip */}
        <section className="py-12 border-y border-surface-border bg-white overflow-hidden">
          <div className="inner-container">
            <p className="text-center text-[10px] font-black text-text-muted uppercase tracking-[0.4em] mb-10">Trusted by high-compliance teams at</p>
            <div className="flex flex-wrap justify-center items-center gap-x-20 gap-y-8 opacity-30 grayscale contrast-[1.2] hover:grayscale-0 hover:opacity-100 transition-all duration-700">
              <div className="flex items-center gap-3 font-display font-black text-2xl tracking-tighter"><GlobeIcon className="h-7 w-7" /> GLOBALTECH</div>
              <div className="flex items-center gap-3 font-display font-black text-2xl tracking-tighter"><ShieldCheckIcon className="h-7 w-7" /> SECURECORE</div>
              <div className="flex items-center gap-3 font-display font-black text-2xl tracking-tighter"><LockIcon className="h-7 w-7" /> FINVAULT</div>
              <div className="flex items-center gap-3 font-display font-black text-2xl tracking-tighter"><ActivityIcon className="h-7 w-7" /> PULSE DATA</div>
              <div className="flex items-center gap-3 font-display font-black text-2xl tracking-tighter"><GridIcon className="h-7 w-7" /> CLOUDSCALE</div>
            </div>
          </div>
        </section>

        {/* 3. The Differentiator: Why generic AI fails */}
        <section id="problem" className="section-padding bg-surface-base relative overflow-hidden">
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_70%_50%,rgba(37,99,235,0.03),transparent_60%)] pointer-events-none" />
          <div className="inner-container relative">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-6 animate-fade-up">
              <div className="h-1.5 w-16 bg-accent-primary/20 mx-auto rounded-full" />
              <h2 className="text-display-md">
                Compliance is not a <br />
                <span className="text-red-500 underline decoration-red-500/10 decoration-8 underline-offset-8">Chat Experiment.</span>
              </h2>
              <p className="text-xl text-text-secondary font-medium leading-relaxed">
                In high-stakes enterprise sales, &quot;close enough&quot; is a liability. TrustDesk replaces AI guesswork with a deterministic verification engine.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-stretch animate-fade-up [animation-delay:200ms]">
              {/* Left: The Risk */}
              <div className="glass-card p-10 rounded-[2.5rem] bg-white border-red-100/50 space-y-10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500/20" />
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                      <ActivityIcon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-black text-red-600 uppercase tracking-[0.2em]">The Generic AI Risk</span>
                  </div>
                  <h3 className="text-display-sm tracking-tight italic">&quot;Just Draft an Answer&quot;</h3>
                </div>

                <div className="space-y-6">
                  {[
                    { label: "Drafting Method", value: "Probabilistic Guessing", risk: "High" },
                    { label: "Evidence Link", value: "None / Hallucinated", risk: "Critical" },
                    { label: "Governance", value: "Ungoverned Chat History", risk: "High" },
                    { label: "Audit Readiness", value: "Manual Review Required", risk: "High" }
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between group/row">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{row.label}</p>
                        <p className="text-sm font-black text-red-700/60">{row.value}</p>
                      </div>
                      <span className="text-[9px] font-black bg-red-50 text-red-600 px-3 py-1 rounded-full border border-red-100">{row.risk}</span>
                    </div>
                  ))}
                </div>

                <div className="p-8 rounded-2xl bg-red-50/50 border border-red-100 text-red-800 text-sm font-bold leading-relaxed relative">
                  &quot;I believe our encryption standard is AES-256, though I cannot find the specific policy document to confirm the implementation details...&quot;
                  <div className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow-premium-lg animate-bounce">
                    <span className="text-lg font-black font-mono">!</span>
                  </div>
                </div>
              </div>

              {/* Right: The Trust Standard */}
              <div className="glass-card p-10 rounded-[2.5rem] border-accent-primary/20 space-y-10 relative overflow-hidden shadow-premium-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-accent-primary shadow-[0_0_20px_rgba(37,99,235,0.4)]" />
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-accent-primary flex items-center justify-center text-white shadow-premium-lg">
                      <LogoIcon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-black text-accent-primary uppercase tracking-[0.2em]">The Trust Standard</span>
                  </div>
                  <h3 className="text-display-sm tracking-tight">Evidence-Backed Verification</h3>
                </div>

                <div className="space-y-6">
                  {[
                    { label: "Matching Method", value: "Deterministic Evidence Mapping", status: "Verified" },
                    { label: "Citation Quality", value: "Deep-Link to Policy Source", status: "Verified" },
                    { label: "Governance", value: "Certified Answer Library", status: "Governed" },
                    { label: "Audit Readiness", value: "One-Click Export Ready", status: "Ready" }
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{row.label}</p>
                        <p className="text-sm font-black text-text-primary">{row.value}</p>
                      </div>
                      <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-premium-md">
                        <CheckIcon className="h-3.5 w-3.5 text-white" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-8 rounded-2xl bg-white border border-accent-primary/10 text-text-primary text-sm font-bold leading-relaxed shadow-premium-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-accent-primary/[0.03] translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  <p className="relative z-10">&quot;Encryption is implemented using AES-256-GCM for all data at rest, as specified in **Infra Policy v2.4, Section 4.1**.&quot;</p>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
                    <div className="px-2 py-1 bg-emerald-50 text-[9px] text-emerald-600 rounded-lg border border-emerald-100 font-black tracking-widest">MATCH: 100%</div>
                    <div className="px-2 py-1 bg-slate-50 text-[9px] text-text-muted rounded-lg border border-slate-100 font-black tracking-widest font-mono uppercase">Source: Infra_Pol_v2.pdf</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom 5 sharp points */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mt-20 animate-fade-up [animation-delay:400ms]">
              {[
                { title: "Deterministic Matching", icon: GridIcon },
                { title: "Citation-Backed", icon: BookIcon },
                { title: "Governed Library", icon: LockIcon },
                { title: "Full Audit Trail", icon: ActivityIcon },
                { title: "Export-Ready", icon: ClipboardIcon }
              ].map((point) => (
                <div key={point.title} className="text-center space-y-3 group">
                  <div className="h-14 w-14 mx-auto rounded-xl bg-white shadow-premium-sm border border-surface-border flex items-center justify-center text-text-muted group-hover:text-accent-primary group-hover:border-accent-primary/30 group-hover:shadow-premium-md transition-all duration-300">
                    <point.icon className="h-6 w-6" />
                  </div>
                  <p className="text-[10px] font-black text-text-primary uppercase tracking-[0.2em] leading-tight">{point.title}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. The Solution Section */}
        <section id="workflow" className="section-padding bg-white relative overflow-hidden">
          <div className="inner-container">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-6 animate-fade-up">
              <div className="h-1 w-12 bg-accent-primary/30 mx-auto rounded-full" />
              <h2 className="text-display-md">The <span className="text-accent-primary">Trust Engine</span></h2>
              <p className="text-xl text-text-secondary font-medium">A clinical, high-fidelity verification workflow designed for absolute reliability.</p>
            </div>
            <div className="animate-fade-up [animation-delay:200ms]">
              <WorkflowSlider />
            </div>
          </div>
        </section>

        {/* 5. Core Platform Pillars */}
        <section id="pillars" className="section-padding bg-surface-base">
          <div className="inner-container">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {[
                {
                  title: "Deterministic Matching",
                  desc: "Our engine prioritizes exact evidence matches from your certified Answer Library before utilizing AI expansion.",
                  icon: GridIcon
                },
                {
                  title: "Posture Mapping",
                  desc: "Centralize your entire security posture. TrustDesk maps policies to framework controls (SOC2, ISO, HIPAA) automatically.",
                  icon: BookIcon
                },
                {
                  title: "Complete Audit Trail",
                  desc: "Every answer contains a deep-link to the source document, page, and paragraph used for justification.",
                  icon: ClipboardIcon
                }
              ].map((pillar) => (
                <div key={pillar.title} className="glass-card p-10 rounded-[2.5rem] space-y-8 hover:-translate-y-4 transition-all duration-500 group shadow-premium-lg hover:shadow-premium-xl">
                  <div className="h-16 w-16 bg-accent-primary/5 rounded-[1.25rem] flex items-center justify-center border border-accent-primary/10 group-hover:bg-accent-primary group-hover:text-white transition-all duration-500">
                    <pillar.icon className="h-8 w-8 text-accent-primary group-hover:text-white transition-colors" />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-display-sm">{pillar.title}</h3>
                    <p className="text-lg text-text-secondary leading-relaxed font-medium">
                      {pillar.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Security-First Trust Center: Deep Proof */}
        <section id="security" className="section-padding bg-surface-dark text-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_20%,rgba(37,99,235,0.1),transparent_50%)] pointer-events-none" />
          <div className="inner-container relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
              <div className="space-y-10 animate-fade-up">
                <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white/5 border border-white/10">
                  <ShieldCheckIcon className="h-4 w-4 text-accent-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-primary">Enterprise Security Pulse</span>
                </div>
                <h2 className="text-display-md text-white">Your Security Posture, <br /><span className="text-accent-primary">Always Verification-Ready.</span></h2>
                <p className="text-xl text-slate-400 leading-relaxed font-medium">
                  We don&apos;t just answer questions; we maintain your entire trust posture. Continuous monitoring, certified evidence, and CISO-grade governance.
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  {[
                    { label: "Data Privacy", value: "Zero Training on Customer Data", icon: LockIcon },
                    { label: "Encryption", value: "AES-256-GCM / TLS 1.3", icon: ShieldCheckIcon },
                    { label: "Compliance", value: "SOC2 Type II / ISO 27001 Ready", icon: CheckIcon },
                    { label: "Residency", value: "Multi-Region Cloud Options", icon: GlobeIcon }
                  ].map((item) => (
                    <div key={item.label} className="space-y-3 group">
                      <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-accent-primary group-hover:bg-accent-primary group-hover:text-white transition-all">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.label}</p>
                        <p className="text-sm font-bold text-white">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security Pulse Dashboard Visual */}
              <div className="relative animate-fade-up [animation-delay:200ms]">
                <div className="absolute -inset-10 bg-accent-primary/20 blur-[100px] rounded-full opacity-20 animate-pulse" />
                <div className="glass-card-dark p-1 rounded-[3rem] shadow-2xl relative">
                  <div className="bg-[#0b1222] rounded-[2.85rem] p-10 space-y-10 border border-white/5">
                    <div className="flex items-center justify-between border-b border-white/5 pb-8">
                      <div className="flex items-center gap-4">
                        <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                        <div className="space-y-1">
                          <span className="text-xs font-black uppercase tracking-[0.3em] block text-white">Security Pulse</span>
                          <span className="text-[10px] text-emerald-500/80 font-bold uppercase tracking-widest block">Active</span>
                        </div>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                        <ActivityIcon className="h-5 w-5 text-accent-primary" />
                      </div>
                    </div>

                    <div className="space-y-8">
                      {[
                        { label: "Data Isolation", value: "TENANT-LEVEL", progress: 100 },
                        { label: "Encryption", value: "AES-256-GCM", progress: 100 },
                        { label: "Vulnerability Scan", value: "REAL-TIME", progress: 98 }
                      ].map((stat) => (
                        <div key={stat.label} className="space-y-3">
                          <div className="flex justify-between items-end">
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">{stat.label}</span>
                            <span className="text-[10px] font-black font-mono text-accent-primary">{stat.value}</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-accent-primary rounded-full shadow-[0_0_10px_rgba(37,99,235,0.4)]" style={{ width: `${stat.progress}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                      <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em]">Latest Audit: 48h ago</p>
                      <Link href="#" className="text-[10px] font-black uppercase tracking-widest text-accent-primary hover:text-white transition-colors underline underline-offset-4">Security Center</Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Framework Posture Strip */}
            <div className="mt-24 pt-16 border-t border-white/5 animate-fade-up [animation-delay:400ms]">
              <p className="text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-10">Helping you win audits across</p>
              <div className="flex flex-wrap justify-center items-center gap-x-16 gap-y-8 opacity-40">
                {["SOC2 Type II", "ISO 27001", "GDPR", "HIPAA", "NIST", "PCI DSS"].map((framework) => (
                  <span key={framework} className="text-lg font-black tracking-widest uppercase text-white/80">{framework}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 7. Proof Layer: Testimonials */}
        <section className="section-padding bg-white relative overflow-hidden">
          <div className="inner-container">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-1 space-y-6 animate-fade-up">
                <div className="h-1.5 w-16 bg-accent-primary/20 rounded-full" />
                <h2 className="text-display-md">What Trust <br /><span className="text-accent-primary">Enables.</span></h2>
                <p className="text-xl text-text-secondary leading-relaxed font-medium">
                  Speed is the ultimate byproduct of trust. Here is how enterprise leaders are winning with TrustDesk.
                </p>
                <div className="pt-6">
                  <div className="flex -space-x-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-14 w-14 rounded-2xl border-4 border-white bg-slate-100 shadow-premium-sm" />
                    ))}
                    <div className="h-14 w-14 rounded-2xl border-4 border-white bg-accent-primary flex items-center justify-center text-white text-xs font-black shadow-premium-lg">
                      +100
                    </div>
                  </div>
                  <p className="mt-6 text-sm font-bold text-text-secondary">Join 500+ security and sales leaders</p>
                </div>
              </div>

              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-up [animation-delay:200ms]">
                {[
                  {
                    quote: "TrustDesk turned our 3-week security review cycle into a 2-day workflow. It's the most high-fidelity tool we've added to our stack.",
                    author: "Sarah Chen",
                    role: "Head of Security, GlobalTech",
                    metric: "90% Reduction in Cycle Time"
                  },
                  {
                    quote: "The ability to deep-link every answer to our actual policy documents is a game changer for audit readiness.",
                    author: "Marcus Thorne",
                    role: "CISO, FinVault",
                    metric: "100% Audit Readiness"
                  }
                ].map((testimonial) => (
                  <div key={testimonial.author} className="glass-card p-10 rounded-[2.5rem] flex flex-col justify-between space-y-8 group hover:-translate-y-2 transition-all duration-500 shadow-premium-lg hover:shadow-premium-xl">
                    <p className="text-lg font-medium text-text-primary leading-relaxed italic">&quot;{testimonial.quote}&quot;</p>
                    <div className="space-y-4 pt-6 border-t border-surface-border">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-accent-primary/5" />
                        <div>
                          <p className="font-display font-black text-text-primary tracking-tight">{testimonial.author}</p>
                          <p className="text-xs font-bold text-text-muted uppercase tracking-widest">{testimonial.role}</p>
                        </div>
                      </div>
                      <div className="px-4 py-2 bg-emerald-50 text-[10px] text-emerald-600 rounded-lg border border-emerald-100 font-black tracking-widest inline-block uppercase">
                        Metric: {testimonial.metric}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 8. Bottom CTA: The Close */}
        <section className="py-32 bg-surface-dark text-white text-center relative overflow-hidden">
          {/* Dramatic Background Elements */}
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,rgba(37,99,235,0.2),transparent_70%)] pointer-events-none" />
          <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent-primary/10 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="inner-container relative space-y-12">
            <div className="space-y-6 animate-fade-up">
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white/5 border border-white/10 mx-auto">
                <LogoIcon className="h-4 w-4 text-accent-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-primary">Trust Answers. Close Faster.</span>
              </div>
              <h2 className="text-display-lg leading-[1.05]">
                Turn Trust into your <br />
                <span className="text-accent-primary">Unfair Advantage.</span>
              </h2>
              <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed">
                Join the enterprise teams closing deals 5x faster by replacing manual friction with automated verification.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 pt-2 animate-fade-up [animation-delay:200ms]">
              <div className="space-y-4">
                <Button size="xl" className="group h-20 px-14 text-2xl font-black tracking-tight rounded-[2rem] bg-accent-primary hover:bg-accent-primary-hover shadow-[0_20px_50px_rgba(37,99,235,0.4)] border-0" asChild>
                  <Link href="/signup">Start Your Asset Library</Link>
                </Button>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em]">No credit card required • SOC2 Ready</p>
              </div>
              
              <Link href="#" className="group flex items-center gap-5 text-xl font-black tracking-tight hover:text-accent-primary transition-all">
                <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-accent-primary/50 transition-all shadow-premium-lg">
                  <ActivityIcon className="h-6 w-6" />
                </div>
                <span>Book a Technical Demo</span>
              </Link>
            </div>

            <div className="pt-20 grid grid-cols-2 md:grid-cols-4 gap-10 opacity-30 grayscale max-w-4xl mx-auto border-t border-white/10 animate-fade-up [animation-delay:400ms]">
               {[
                 { label: "AES-256", icon: ShieldCheckIcon },
                 { label: "Private Data", icon: LockIcon },
                 { label: "Audit Ready", icon: CheckIcon },
                 { label: "Certified", icon: LogoIcon }
               ].map((signal) => (
                 <div key={signal.label} className="flex items-center gap-3 justify-center">
                   <signal.icon className="h-5 w-5" />
                   <span className="text-[10px] font-black uppercase tracking-[0.4em]">{signal.label}</span>
                 </div>
               ))}
            </div>
          </div>
        </section>
      </main>

      {/* 9. Production-Ready Footer */}
      <footer className="bg-surface-panel pt-24 pb-12 border-t border-surface-border">
        <div className="inner-container">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-16 pb-20">
            {/* Brand Column */}
            <div className="col-span-2 space-y-10">
              <BrandMark size="lg" href="/" />
              <p className="text-sm text-text-secondary leading-relaxed font-medium max-w-xs">
                The high-fidelity Trust Engine for enterprise vendors. <br />
                <span className="text-accent-primary font-black uppercase tracking-[0.3em] text-[10px] mt-2 block">Trust Answers. Close Faster.</span>
              </p>
              <div className="flex gap-4">
                {[GlobeIcon, LockIcon, ActivityIcon].map((Icon, i) => (
                  <button key={i} className="h-11 w-11 flex items-center justify-center rounded-xl bg-white border border-surface-border text-text-muted hover:text-accent-primary hover:border-accent-primary/30 transition-all shadow-premium-sm">
                    <Icon className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </div>

            {/* Product Column */}
            <div>
              <h5 className="text-[10px] font-black text-text-primary mb-8 uppercase tracking-[0.3em]">Product</h5>
              <ul className="space-y-5 text-sm text-text-secondary font-bold">
                <li><Link href="#problem" className="hover:text-accent-primary transition-colors">Platform Overview</Link></li>
                <li><Link href="#workflow" className="hover:text-accent-primary transition-colors">The Trust Engine</Link></li>
                <li><Link href="#security" className="hover:text-accent-primary transition-colors">Security Center</Link></li>
                <li><Link href="#" className="hover:text-accent-primary transition-colors">Pricing</Link></li>
              </ul>
            </div>

            {/* Company Column */}
            <div>
              <h5 className="text-[10px] font-black text-text-primary mb-8 uppercase tracking-[0.3em]">Company</h5>
              <ul className="space-y-5 text-sm text-text-secondary font-bold">
                <li><Link href="#" className="hover:text-accent-primary transition-colors">About Us</Link></li>
                <li><Link href="#" className="hover:text-accent-primary transition-colors">Customer Stories</Link></li>
                <li><Link href="#" className="hover:text-accent-primary transition-colors">Careers</Link></li>
              </ul>
            </div>

            {/* Resources Column */}
            <div>
              <h5 className="text-[10px] font-black text-text-primary mb-8 uppercase tracking-[0.3em]">Resources</h5>
              <ul className="space-y-5 text-sm text-text-secondary font-bold">
                <li><Link href="#" className="hover:text-accent-primary transition-colors">Documentation</Link></li>
                <li><Link href="#" className="hover:text-accent-primary transition-colors">Security FAQ</Link></li>
                <li><Link href="#" className="hover:text-accent-primary transition-colors">Status Page</Link></li>
              </ul>
            </div>

            {/* Legal Column */}
            <div>
              <h5 className="text-[10px] font-black text-text-primary mb-8 uppercase tracking-[0.3em]">Legal</h5>
              <ul className="space-y-5 text-sm text-text-secondary font-bold">
                <li><Link href="#" className="hover:text-accent-primary transition-colors">Privacy Policy</Link></li>
                <li><Link href="#" className="hover:text-accent-primary transition-colors">Terms of Service</Link></li>
                <li><Link href="#" className="hover:text-accent-primary transition-colors">Cookies Policy</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom Strip */}
          <div className="pt-10 border-t border-surface-border flex flex-col md:flex-row justify-between items-center gap-10">
            <div className="flex flex-col md:flex-row items-center gap-10">
              <p className="text-xs text-text-muted font-bold tracking-tight">© 2026 TrustDesk Inc. All rights reserved.</p>
              <div className="flex items-center gap-8">
                <span className="flex items-center gap-2.5 text-[10px] text-emerald-600 font-black uppercase tracking-[0.3em]">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  All Systems Operational
                </span>
                <span className="text-[10px] font-black text-text-primary bg-white px-4 py-2 rounded-xl border border-surface-border tracking-[0.2em] uppercase shadow-premium-sm">
                  SOC2 Type II Compliant
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em]">Global Presence</span>
              <div className="flex -space-x-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 w-8 rounded-full border-2 border-white bg-surface-base overflow-hidden shadow-premium-sm">
                    <div className="h-full w-full bg-accent-primary/[0.08] flex items-center justify-center">
                      <GlobeIcon className="h-4 w-4 text-accent-primary" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
