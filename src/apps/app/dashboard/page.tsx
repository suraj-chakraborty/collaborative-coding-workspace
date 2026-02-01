"use client";

import { useState, useEffect } from "react";

import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { Plus, LayoutDashboard, Terminal, Settings, LogOut, Search, PlusCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LanguageToggle } from "@/components/language-toggle";
import { CreateWorkspaceModal } from "@/components/workspace/create-modal";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";

const MY_WORKSPACES = gql`
  query MyWorkspaces($email: String!) {
    myWorkspaces(email: $email) {
      id
      name
      description
      updatedAt
      members {
        role
      }
    }
  }
`;

export default function DashboardPage() {
    const { user, isLoaded } = useUser();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const { data, loading, error } = useQuery(MY_WORKSPACES, {
        variables: { email: user?.primaryEmailAddress?.emailAddress },
        skip: !user?.primaryEmailAddress?.emailAddress
    }) as any;

    const workspaces = data?.myWorkspaces || [];

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar omitted for brevity, keeping it as is */}
            <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-white/5 bg-background/50 backdrop-blur-xl">
                {/* ... existing sidebar content ... */}
                <div className="flex h-16 items-center border-b border-white/5 px-6">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                        <Terminal className="h-5 w-5 text-white" />
                    </div>
                    <span className="ml-3 text-lg font-bold">CCW</span>
                </div>

                <nav className="space-y-1 p-4">
                    {[
                        { label: "Dashboard", icon: LayoutDashboard, active: true },
                        { label: "Workspaces", icon: Terminal },
                        { label: "Settings", icon: Settings },
                    ].map((item, i) => (
                        <div
                            key={i}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-white/5 ${item.active ? "bg-white/5 text-indigo-400" : "text-muted-foreground"
                                }`}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </div>
                    ))}
                </nav>
            </aside>

            <main className="ml-64 w-full">
                <header className="flex h-16 items-center justify-between border-b border-white/5 bg-background/50 px-8 backdrop-blur-md">
                    <div className="relative w-96">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search workspaces..."
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

                {/* Dashboard Content */}
                <div className="p-8">
                    <div className="mb-8 flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Your Workspaces</h1>
                            <p className="mt-1 text-muted-foreground">Manage and launch your cloud development environments.</p>
                        </div>
                        <CreateWorkspaceModal />
                    </div>

                    {loading || !isLoaded ? (
                        <div className="flex h-64 items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                        </div>
                    ) : (
                        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                            {workspaces.map((ws: any) => (
                                <Card key={ws.id} className="group relative overflow-hidden border-white/10 bg-white/[0.02] transition-all hover:bg-white/[0.04] hover:shadow-2xl hover:shadow-indigo-500/10">
                                    <CardHeader className="pb-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 transition-colors group-hover:bg-indigo-500/20">
                                                <Terminal className="h-5 w-5" />
                                            </div>
                                            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wider text-emerald-500 uppercase">
                                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                READY
                                            </div>
                                        </div>
                                        <CardTitle className="mt-4 text-xl">{ws.name}</CardTitle>
                                        <CardDescription className="font-mono text-xs line-clamp-1">{ws.description || "No description"}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2">
                                            <Link href={`/workspace/${ws.id}`} className="flex-1">
                                                <Button className="w-full bg-white/5 hover:bg-white/10">
                                                    Launch IDE
                                                </Button>
                                            </Link>
                                            <Button size="icon" variant="ghost" className="hover:bg-red-500/10 hover:text-red-500">
                                                <Settings className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}

                            {/* Empty State */}
                            {workspaces.length === 0 && (
                                <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
                                    <PlusCircle className="h-12 w-12 text-muted-foreground/50" />
                                    <p className="mt-4 text-muted-foreground">No workspaces found. Create your first one to get started.</p>
                                    <div className="mt-4">
                                        <CreateWorkspaceModal />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
