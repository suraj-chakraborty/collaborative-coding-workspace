"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { LayoutDashboard, Terminal, Settings, Search } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { useState, useEffect } from "react";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const navItems = [
        { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
        // { label: "Workspaces", icon: Terminal, href: "/workspaces" },
        { label: "Settings", icon: Settings, href: "/settings" },
    ];

    return (
        <div className="flex min-h-screen bg-background">
            <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-white/5 bg-background/50 backdrop-blur-xl">
                <div className="flex h-16 items-center border-b border-white/5 px-6">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                        <Terminal className="h-5 w-5 text-white" />
                    </div>
                    <span className="ml-3 text-lg font-bold">CCW</span>
                </div>

                <nav className="space-y-1 p-4">
                    {navItems.map((item, i) => {
                        const active = pathname === item.href;
                        return (
                            <Link
                                key={i}
                                href={item.href}
                                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-white/5 ${active ? "bg-white/5 text-indigo-400" : "text-muted-foreground"
                                    }`}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </aside>

            <main className="ml-64 w-full flex flex-col h-screen">
                <header className="flex h-16 items-center justify-between border-b border-white/5 bg-background/50 px-8 backdrop-blur-md flex-shrink-0">
                    <div className="relative w-96">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search..."
                            className="h-10 w-full rounded-full border border-white/5 bg-white/5 pl-10 pr-4 text-sm focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                        />
                    </div>
                    {mounted && (
                        <div className="flex items-center gap-4">
                            <LanguageToggle />
                            <UserButton afterSignOutUrl="/" />
                        </div>
                    )}
                </header>

                <div className="p-8 overflow-y-auto flex-1">
                    {children}
                </div>
            </main>
        </div>
    );
}
