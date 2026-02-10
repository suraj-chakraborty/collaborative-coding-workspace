"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Key, Copy, Check, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

const GET_API_KEYS = gql`
  query GetApiKeys($email: String!) {
    me(email: $email) {
      id
      apiKeys {
        id
        name
        key
        createdAt
        lastUsedAt
      }
    }
  }
`;

const CREATE_API_KEY = gql`
  mutation CreateApiKey($userId: String!, $email: String!, $name: String) {
    createApiKey(userId: $userId, email: $email, name: $name) {
      id
      key
      name
      createdAt
    }
  }
`;

const REVOKE_API_KEY = gql`
  mutation RevokeApiKey($id: String!) {
    revokeApiKey(id: $id)
  }
`;

interface ApiKey {
    id: string;
    name: string;
    key: string;
    createdAt: string;
    lastUsedAt: string;
}

interface GetApiKeysData {
    me: {
        id: string;
        apiKeys: ApiKey[];
    };
}

interface GetApiKeysVars {
    email: string;
}

export default function SettingsPage() {
    const { user } = useUser();
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const email = user?.primaryEmailAddress?.emailAddress;
    const { data, loading, refetch } = useQuery<GetApiKeysData, GetApiKeysVars>(GET_API_KEYS, {
        variables: { email: email || "" },
        skip: !email
    });

    const [createApiKey] = useMutation(CREATE_API_KEY);
    const [revokeApiKey] = useMutation(REVOKE_API_KEY);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            await createApiKey({
                variables: {
                    userId: user?.id,
                    email: user?.primaryEmailAddress?.emailAddress,
                    name: newName
                }
            });
            setNewName("");
            toast.success("API Key created");
            refetch();
        } catch (error) {
            toast.error("Failed to create API Key");
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (id: string) => {
        if (!confirm("Are you sure you want to revoke this key? The agent using it will disconnect.")) return;
        try {
            await revokeApiKey({ variables: { id } });
            toast.success("API Key revoked");
            refetch();
        } catch (error) {
            toast.error("Failed to revoke API Key");
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(text);
        toast.success("Key copied to clipboard");
        setTimeout(() => setCopiedKey(null), 2000);
    };

    return (
        <DashboardLayout>
            <div className="container mx-auto max-w-5xl py-10 space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground">Manage your account settings and developer keys.</p>
                </div>

                <Card className="border-white/10 bg-black/20 backdrop-blur-xl">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Key className="h-5 w-5 text-indigo-400" />
                                    API Keys
                                </CardTitle>
                                <CardDescription>
                                    Manage API keys for the Local Agent.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex gap-4 items-end bg-white/5 p-4 rounded-lg border border-white/10">
                            <div className="grid gap-2 flex-1">
                                <label className="text-sm font-medium">New Key Name</label>
                                <Input
                                    placeholder="e.g. MacBook Pro Agent"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="bg-black/20 border-white/10"
                                />
                            </div>
                            <Button
                                onClick={handleCreate}
                                disabled={creating || !newName.trim()}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                {creating ? "Generating..." : <><Plus className="mr-2 h-4 w-4" /> Generate Key</>}
                            </Button>
                        </div>

                        <div className="rounded-md border border-white/10">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-white/10 hover:bg-white/5">
                                        <TableHead>Name</TableHead>
                                        <TableHead>Key</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">Loading...</TableCell>
                                        </TableRow>
                                    ) : data?.me?.apiKeys?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                                No API keys found. Create one to get started.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        data?.me?.apiKeys?.map((key) => (
                                            <TableRow key={key.id} className="border-white/10 hover:bg-white/5">
                                                <TableCell className="font-medium">{key.name || "Untitled"}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <code className="rounded bg-black/40 px-2 py-1 font-mono text-xs text-indigo-300">
                                                            {key.key.substring(0, 8)}...{key.key.substring(key.key.length - 4)}
                                                        </code>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(key.key)}>
                                                            {copiedKey === key.key ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{format(new Date(parseInt(key.createdAt)), "MMM d, yyyy")}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={() => handleRevoke(key.id)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
