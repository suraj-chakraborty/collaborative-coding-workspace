"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, ArrowRight } from "lucide-react";

export function JoinWorkspaceModal() {
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState("");
    const router = useRouter();

    const handleJoin = () => {
        if (!code.trim()) return;
        setOpen(false);
        router.push(`/join/${code.trim()}`);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10 hover:text-white hover:border-white/20">
                    <Users className="mr-2 h-4 w-4" />
                    Join with Code
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-white/10">
                <DialogHeader>
                    <DialogTitle>Join Workspace</DialogTitle>
                    <DialogDescription>
                        Enter the invite code shared with you to access the workspace.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="code">Invite Code</Label>
                        <Input
                            id="code"
                            placeholder="e.g. 8f72a..."
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            className="bg-zinc-900 border-white/10 text-white"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleJoin();
                            }}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        onClick={handleJoin}
                        disabled={!code.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"
                    >
                        Review Invite
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
