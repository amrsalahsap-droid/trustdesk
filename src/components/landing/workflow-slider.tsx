"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { 
  ArrowRightIcon, 
  ShieldCheckIcon, 
  SparklesIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon,
  LogoIcon,
  ActivityIcon,
  LockIcon,
  CheckIcon
} from "@/components/icons";

const STEPS = [
  {
    id: "ingest",
    title: "1. Build your Answer Asset",
    description: "Upload your security policies, SOC2 reports, and prior questionnaires. TrustDesk automatically parses complex documents into a governed, reusable evidence library.",
    value: "Eliminate manual data entry",
    image: "/images/workflow-ingest.png",
    icon: LogoIcon,
    color: "bg-blue-600",
  },
  {
    id: "verify",
    title: "2. Certify your Trust Standard",
    description: "Map your internal evidence to framework controls. Establish a certified 'Source of Truth' that ensures every answer in your library is accurate and audit-ready.",
    value: "Guarantee 100% accuracy",
    image: "/images/workflow-library.png",
    icon: ShieldCheckIcon,
    color: "bg-indigo-600",
  },
  {
    id: "resolve",
    title: "3. Close with Confidence",
    description: "Complete new questionnaires in minutes with deterministic suggestions. Every response is deep-linked to its source evidence for total buyer transparency.",
    value: "Reduce response time by 90%",
    image: "/images/product-preview.png",
    icon: SparklesIcon,
    color: "bg-accent-primary",
  },
];

export function WorkflowSlider() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [isPaused]);

  return (
    <div className="flex flex-col gap-16" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
        {/* Left: Content */}
        <div className="lg:col-span-5 space-y-10">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-primary/5 border border-accent-primary/10">
              <ActivityIcon className="h-3 w-3 text-accent-primary" />
              <span className="text-[10px] font-black text-accent-primary uppercase tracking-widest">Workflow Operations</span>
            </div>
            <h3 className="text-4xl font-black tracking-tight text-text-primary leading-tight">
              The Engine of <br />
              <span className="text-accent-primary">Enterprise Trust</span>
            </h3>
            <p className="text-text-secondary text-lg font-medium">
              Transform your security posture from a cost center into a powerful sales accelerator.
            </p>
          </div>

          <div className="space-y-4">
            {STEPS.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setActiveStep(index)}
                className={cn(
                  "group w-full flex items-start gap-6 p-6 rounded-[2rem] border transition-all duration-500 text-left relative overflow-hidden",
                  activeStep === index 
                    ? "bg-white border-accent-primary shadow-xl shadow-accent-primary/5 ring-1 ring-accent-primary/20" 
                    : "bg-transparent border-transparent hover:bg-slate-50/80"
                )}
              >
                <div className={cn(
                  "mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all duration-500 shadow-sm",
                  activeStep === index ? step.color + " text-white shadow-lg shadow-blue-500/20" : "bg-slate-100 text-text-muted group-hover:bg-slate-200"
                )}>
                  <step.icon className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h4 className={cn(
                      "text-lg font-black transition-colors tracking-tight",
                      activeStep === index ? "text-text-primary" : "text-text-secondary"
                    )}>
                      {step.title}
                    </h4>
                    {activeStep === index && (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded border border-emerald-100">
                        {step.value}
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    "text-sm leading-relaxed transition-all duration-700 overflow-hidden font-medium",
                    activeStep === index ? "max-h-32 opacity-100" : "max-h-0 opacity-0 lg:max-h-none lg:opacity-0"
                  )}>
                    {step.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Visual */}
        <div className="lg:col-span-7 relative group">
          <div className="absolute -inset-10 bg-accent-primary/5 blur-[120px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
          
          <div className="relative rounded-[2.5rem] border border-surface-border bg-white p-3 shadow-2xl overflow-hidden aspect-[1.4] ring-1 ring-black/5">
            <div className="absolute inset-0 bg-slate-50" />
            
            {STEPS.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  "absolute inset-0 transition-all duration-1000 ease-in-out p-3",
                  activeStep === index ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-8"
                )}
              >
                <div className="w-full h-full bg-slate-100 rounded-[2rem] border border-slate-200 shadow-inner flex items-center justify-center relative group/media overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
                  <img
                    src={step.image}
                    alt={step.title}
                    className="w-full h-full object-cover rounded-[1.75rem] opacity-90 group-hover/media:scale-105 transition-transform duration-[20s] ease-linear"
                  />
                  
                  {/* Decorative Elements for "Premium" Feel */}
                  <div className="absolute top-8 left-8 flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur rounded-xl border border-white/20 shadow-lg animate-in fade-in slide-in-from-left-4 duration-1000">
                    <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[10px] font-black text-text-primary uppercase tracking-widest">Verified Evidence</span>
                  </div>
                  
                  <div className="absolute bottom-8 right-8 p-4 bg-white/90 backdrop-blur rounded-2xl border border-white/20 shadow-xl animate-in fade-in slide-in-from-right-4 duration-1000">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-12 bg-emerald-500/20 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-full animate-in slide-in-from-left duration-[2s]" />
                      </div>
                      <span className="text-[10px] font-black text-text-primary uppercase tracking-widest">Match: 100%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Navigation Overlays */}
            <div className="absolute top-6 right-6 flex items-center gap-3">
              <button 
                onClick={() => setActiveStep((prev) => (prev - 1 + STEPS.length) % STEPS.length)}
                className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/90 backdrop-blur shadow-lg border border-slate-200 hover:bg-accent-primary hover:text-white hover:border-accent-primary transition-all active:scale-95"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button 
                onClick={() => setActiveStep((prev) => (prev + 1) % STEPS.length)}
                className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/90 backdrop-blur shadow-lg border border-slate-200 hover:bg-accent-primary hover:text-white hover:border-accent-primary transition-all active:scale-95"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Progress Indicators */}
          <div className="mt-10 flex justify-center gap-3">
             {STEPS.map((_, index) => (
               <button 
                 key={index}
                 onClick={() => setActiveStep(index)}
                 className="group relative h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden"
               >
                 <div 
                   className={cn(
                     "absolute inset-0 bg-accent-primary transition-all duration-[8000ms] ease-linear",
                     activeStep === index ? "w-full" : "w-0 transition-none"
                   )} 
                 />
               </button>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}
