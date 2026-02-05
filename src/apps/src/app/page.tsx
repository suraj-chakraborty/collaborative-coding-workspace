import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Terminal, Shield, Zap, Globe, Github, Cpu } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-indigo-500/30">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-background/60 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-500/20">
              <Terminal className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">CCW</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <Link href="/sign-in">
              <Button variant="ghost" className="hover:bg-white/5">Login</Button>
            </Link>
            <Link href="/sign-up">
              <Button className="bg-indigo-600 shadow-lg shadow-indigo-500/20 hover:bg-indigo-700">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative flex flex-col items-center justify-center overflow-hidden py-32 lg:py-48">
          <div className="absolute top-0 -z-10 h-full w-full bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.1),transparent_50%)]" />

          <div className="container px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-400">
              <Zap className="h-4 w-4" />
              <span>Next-Gen Cloud IDE Now in Beta</span>
            </div>

            <h1 className="mt-8 text-5xl font-extrabold tracking-tight sm:text-7xl">
              Code Together, <br />
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Scale Anywhere.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
              Collaborative Cloud Workspace (CCW) provides instant, isolated development environments on any device.
              Code, build, and deploy with your team in real-time.
            </p>

            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link href="/sign-up">
                <Button size="lg" className="h-12 px-8 bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-500/30">
                  Launch Your Workspace
                </Button>
              </Link>
              <Link href="https://github.com" target="_blank">
                <Button size="lg" variant="outline" className="h-12 px-8 border-white/10 hover:bg-white/5">
                  <Github className="mr-2 h-5 w-5" />
                  Star on GitHub
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-white/[0.02]">
          <div className="container px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight">Everything you need to build faster.</h2>
              <p className="mt-4 text-muted-foreground">High-performance tools for modern development teams.</p>
            </div>

            <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Instant Environments",
                  desc: "One-click Docker containers with pre-installed code-server. No 'it works on my machine'.",
                  icon: Cpu,
                },
                {
                  title: "Real-time Collaboration",
                  desc: "Multiplayer editing, integrated terminal sharing, and live previews with your team.",
                  icon: Globe,
                },
                {
                  title: "Enterprise Security",
                  desc: "Isolated workspaces with resource limits, encrypted sessions, and robust access control.",
                  icon: Shield,
                },
              ].map((feature, i) => (
                <div key={i} className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-8 transition-all hover:bg-white/[0.05]">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 transition-colors group-hover:bg-indigo-500/20">
                    <feature.icon className="h-6 w-6 text-indigo-500" />
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="mt-3 text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-12">
        <div className="container px-6 text-center text-sm text-muted-foreground">
          <p>© 2026 Collaborative Cloud Workspace. Built with passion for developers.</p>
        </div>
      </footer>
    </div>
  );
}
