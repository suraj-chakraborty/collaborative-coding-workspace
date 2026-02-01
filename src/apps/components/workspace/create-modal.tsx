"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { Octokit } from "octokit";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Github, GitBranch, Loader2, Link as LinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const CREATE_WORKSPACE = gql`
  mutation CreateWorkspace($name: String!, $description: String, $userId: String!, $repoUrl: String, $repoToken: String) {
    createWorkspace(name: $name, description: $description, userId: $userId, repoUrl: $repoUrl, repoToken: $repoToken) {
      id
      name
    }
  }
`;

export function CreateWorkspaceModal() {
    const { user } = useUser();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(1);
    const [source, setSource] = useState<"github" | "manual" | "bitbucket">("github");
    const [loading, setLoading] = useState(false);
    const [githubToken, setGithubToken] = useState<string | null>(null);
    const [bitbucketToken, setBitbucketToken] = useState<string | null>(null);
    const [repos, setRepos] = useState<any[]>([]);
    const [repoSearch, setRepoSearch] = useState("");
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [tokenMissing, setTokenMissing] = useState(false);
    const [refresh, setRefresh] = useState(0);

    // Form State
    const [selectedRepo, setSelectedRepo] = useState<any>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        repoUrl: "",
    });

    const [createWorkspace] = useMutation(CREATE_WORKSPACE);

    // Fetch OAuth Token when source changes
    useEffect(() => {
        if (open && (source === "github" || source === "bitbucket")) {
            const provider = source === "github" ? "github" : "bitbucket";
            const currentToken = source === "github" ? githubToken : bitbucketToken;

            if (!currentToken) {
                setLoadingRepos(true);
                setTokenMissing(false);
                fetch(`/api/auth/token?provider=${provider}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.token) {
                            if (source === "github") setGithubToken(data.token);
                            else setBitbucketToken(data.token);
                            fetchRepos(data.token, source);
                        } else {
                            setTokenMissing(true);
                            setLoadingRepos(false);
                        }
                    })
                    .catch(err => {
                        console.error(err);
                        setTokenMissing(true);
                        setLoadingRepos(false);
                    });
            } else {
                fetchRepos(currentToken, source);
            }
        }
    }, [open, source, refresh]);

    const fetchRepos = async (token: string, type: "github" | "bitbucket") => {
        setLoadingRepos(true);
        setTokenMissing(false);
        try {
            if (type === "github") {
                const octokit = new Octokit({ auth: token });
                const { data } = await octokit.rest.repos.listForAuthenticatedUser({
                    sort: "updated",
                    per_page: 50,
                });
                setRepos(data.map(repo => ({
                    id: repo.id,
                    name: repo.name,
                    full_name: repo.full_name,
                    clone_url: repo.clone_url,
                    private: repo.private,
                    source: "github"
                })));
            } else {
                // Bitbucket API
                const res = await fetch("https://api.bitbucket.org/2.0/repositories?role=owner", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.values) {
                    setRepos(data.values.map((repo: any) => ({
                        id: repo.uuid,
                        name: repo.name,
                        full_name: repo.full_name,
                        clone_url: repo.links.clone.find((c: any) => c.name === "https")?.href || repo.links.clone[0].href,
                        private: repo.is_private,
                        source: "bitbucket"
                    })));
                }
            }
        } catch (error) {
            console.error(`Failed to fetch ${type} repos`, error);
            toast.error(`Failed to fetch ${type} repositories`);
        } finally {
            setLoadingRepos(false);
        }
    };

    const handleCreate = async () => {
        if (!formData.name) {
            toast.error("Workspace name is required");
            return;
        }

        setLoading(true);
        try {
            const token = source === "github" ? githubToken : (source === "bitbucket" ? bitbucketToken : undefined);
            const { data } = await createWorkspace({
                variables: {
                    name: formData.name,
                    description: formData.description,
                    userId: user?.id,
                    repoUrl: (source === "github" || source === "bitbucket") ? selectedRepo?.clone_url : formData.repoUrl,
                    repoToken: token || undefined
                },
            }) as any;

            if (data?.createWorkspace?.id) {
                toast.success("Workspace created successfully!");
                setOpen(false);
                router.push(`/workspace/${data.createWorkspace.id}`);
            }
        } catch (error: any) {
            console.error("Creation failed", error);
            toast.error(`Failed to create workspace: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const filteredRepos = repos.filter(repo =>
        repo.full_name.toLowerCase().includes(repoSearch.toLowerCase())
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Workspace
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] bg-background/95 backdrop-blur-xl border-white/10">
                <DialogHeader>
                    <DialogTitle>Create New Workspace</DialogTitle>
                    <DialogDescription>
                        Deploy a new cloud development environment in seconds.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="github" value={source} onValueChange={(v) => {
                    setSource(v as any);
                    setStep(1);
                    setSelectedRepo(null);
                }} className="mt-4">
                    <TabsList className="grid w-full grid-cols-3 bg-white/5">
                        <TabsTrigger value="github">
                            <Github className="mr-2 h-4 w-4" /> GitHub
                        </TabsTrigger>
                        <TabsTrigger value="bitbucket">
                            <GitBranch className="mr-2 h-4 w-4" /> Bitbucket
                        </TabsTrigger>
                        <TabsTrigger value="manual">
                            <LinkIcon className="mr-2 h-4 w-4" /> Import URL
                        </TabsTrigger>
                    </TabsList>

                    {/* GitHub & Bitbucket Content */}
                    {(source === "github" || source === "bitbucket") && (
                        <TabsContent value={source} className="mt-4 space-y-4">
                            {step === 1 && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Input
                                            placeholder="Search repositories..."
                                            value={repoSearch}
                                            onChange={(e) => setRepoSearch(e.target.value)}
                                            className="bg-white/5 border-white/10"
                                        />
                                    </div>
                                    <div className="h-[300px] overflow-y-auto rounded-md border border-white/10 bg-white/5 p-2">
                                        {loadingRepos ? (
                                            <div className="flex h-full items-center justify-center">
                                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                            </div>
                                        ) : tokenMissing ? (
                                            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                                                <p className="text-sm text-muted-foreground">
                                                    Your {source} account is not linked.
                                                </p>
                                                <div className="flex flex-col gap-2">
                                                    <Button
                                                        variant="default"
                                                        className="bg-indigo-600 hover:bg-indigo-700"
                                                        onClick={() => window.open(`/profile`, '_blank')}
                                                    >
                                                        Link {source === "github" ? "GitHub" : "Bitbucket"}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            setGithubToken(null);
                                                            setBitbucketToken(null);
                                                            setRefresh(prev => prev + 1);
                                                        }}
                                                    >
                                                        Check Connection
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                {filteredRepos.map((repo) => (
                                                    <div
                                                        key={repo.id}
                                                        onClick={() => {
                                                            setSelectedRepo(repo);
                                                            setFormData(prev => ({ ...prev, name: repo.name }));
                                                            setStep(2);
                                                        }}
                                                        className="flex cursor-pointer items-center justify-between rounded-md p-3 transition-colors hover:bg-indigo-500/10 hover:text-indigo-400"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {source === "github" ? <Github className="h-4 w-4 opacity-50" /> : <GitBranch className="h-4 w-4 opacity-50" />}
                                                            <span className="font-medium">{repo.full_name}</span>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {repo.private ? "Private" : "Public"}
                                                        </div>
                                                    </div>
                                                ))}
                                                {filteredRepos.length === 0 && !loadingRepos && (
                                                    <div className="py-8 text-center text-sm text-muted-foreground">
                                                        No repositories found.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                    )}

                    {/* Manual Content */}
                    <TabsContent value="manual" className="mt-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Git Repository URL</Label>
                                <Input
                                    placeholder="https://github.com/username/repo.git"
                                    value={formData.repoUrl}
                                    onChange={(e) => setFormData(prev => ({ ...prev, repoUrl: e.target.value }))}
                                    className="bg-white/5 border-white/10"
                                />
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                {/* Configuration Step (Common) */}
                {(step === 2 || source === "manual") && (
                    <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                        <div className="space-y-2">
                            <Label>Workspace Name</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description <span className="text-muted-foreground">(Optional)</span></Label>
                            <Input
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                className="bg-white/5 border-white/10"
                            />
                        </div>
                    </div>
                )}

                <DialogFooter className="mt-6">
                    {(step === 2 || source === "manual") ? (
                        <div className="flex w-full justify-between">
                            {source === "github" && (
                                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                            )}
                            <Button
                                className="ml-auto bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"
                                onClick={handleCreate}
                                disabled={loading || !formData.name}
                            >
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Workspace
                            </Button>
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground">Select a repository to proceed</div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
