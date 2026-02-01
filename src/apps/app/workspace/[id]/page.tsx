import { Button } from "@/components/ui/button";
import { Terminal, Send, Users, ChevronLeft, Layout, Share2, Play, Square, RefreshCcw, Settings } from "lucide-react";
import Link from "next/link";

export default function WorkspacePage({ params }: { params: { id: string } }) {
    return (
        <div className="flex h-screen flex-col bg-background overflow-hidden">
            {/* IDE Header */}
            <header className="flex h-12 items-center justify-between border-b border-white/5 bg-zinc-900/50 px-4 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard">
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-white/5">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-indigo-400" />
                        <span className="text-sm font-medium">Portfolio Project</span>
                    </div>
                    <div className="h-4 w-[1px] bg-white/10 mx-2" />
                    <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Live</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-8 gap-2 text-xs text-zinc-400 hover:bg-white/5">
                        <Share2 className="h-3.5 w-3.5" />
                        Share
                    </Button>
                    <div className="h-4 w-[1px] bg-white/10 mx-1" />
                    <Button size="sm" className="h-8 gap-2 text-xs bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Restart Container
                    </Button>
                </div>
            </header>

            {/* Main Workspace Area */}
            <main className="flex flex-1 overflow-hidden">
                {/* Left Sidebar Tools */}
                <aside className="w-12 flex flex-col items-center py-4 gap-4 border-r border-white/5 bg-zinc-950/50">
                    <Layout className="h-5 w-5 text-indigo-400 cursor-pointer" />
                    <Users className="h-5 w-5 text-zinc-500 hover:text-white cursor-pointer transition-colors" />
                    <Settings className="h-5 w-5 text-zinc-500 hover:text-white cursor-pointer transition-colors" />
                </aside>

                {/* IDE Iframe Placeholder */}
                <div className="relative flex-1 bg-zinc-950">
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.05),transparent_50%)]">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10 animate-pulse">
                            <Terminal className="h-8 w-8 text-indigo-500" />
                        </div>
                        <h2 className="mt-4 text-xl font-semibold text-zinc-300">Initializing Workspace...</h2>
                        <p className="mt-2 text-sm text-zinc-500">Connecting to your isolated Docker container.</p>
                    </div>

                    {/* Real iframe will be injected here pointing to /ws/:id */}
                    {/* <iframe src={`/ws/${params.id}`} className="w-full h-full border-none" /> */}
                </div>

                {/* Right Sidebar - Active Collaborators / Chat */}
                <aside className="w-72 border-l border-white/5 bg-zinc-950/50 flex flex-col">
                    <div className="p-4 border-b border-white/5">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                            <Users className="h-3 w-3" />
                            Collaborators
                        </h3>
                        <div className="mt-4 flex -space-x-2">
                            {[1, 2].map((i) => (
                                <div key={i} className="h-8 w-8 rounded-full border-2 border-zinc-950 bg-indigo-600 flex items-center justify-center text-[10px] font-bold">
                                    JD
                                </div>
                            ))}
                            <div className="h-8 w-8 rounded-full border-2 border-zinc-950 bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 font-bold">
                                +3
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 p-4 flex flex-col justify-end gap-4 overflow-hidden">
                        <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-indigo-400">Suraj</span>
                                <p className="text-xs text-zinc-400 bg-white/5 p-2 rounded-lg rounded-tl-none">
                                    Just finished setting up the Docker worker! 🚀
                                </p>
                            </div>
                        </div>

                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Type a message..."
                                className="w-full h-10 bg-white/5 border border-white/5 rounded-lg px-3 text-xs focus:outline-none focus:border-indigo-500/50"
                            />
                            <Button size="icon" className="absolute right-1 top-1 h-8 w-8 bg-transparent hover:bg-indigo-500/10 text-indigo-400">
                                <Send className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
}
