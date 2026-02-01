import { UserProfile } from "@clerk/nextjs";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
    return (
        <div className="min-h-screen bg-background p-8">
            <div className="mx-auto max-w-4xl">
                <div className="mb-8 flex items-center justify-between">
                    <Link href="/dashboard">
                        <Button variant="ghost" className="gap-2">
                            <ChevronLeft className="h-4 w-4" />
                            Back to Dashboard
                        </Button>
                    </Link>
                </div>

                <div className="flex justify-center flex-col items-center">
                    <div className="text-center mb-8 bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-md max-w-2xl">
                        <h1 className="text-2xl font-bold mb-2">Social Account Linking</h1>
                        <p className="text-muted-foreground mb-4">
                            Connect your GitHub or Bitbucket accounts below to enable repository fetching.
                        </p>
                        <div className="text-sm text-amber-200/80 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-left">
                            <strong>Note:</strong> If you don&apos;t see GitHub or Bitbucket in &quot;Connected accounts&quot;, ensure they are
                            enabled in your <strong>Clerk Dashboard</strong> under
                            <em> Configure &rarr; User &amp; Authentication &rarr; Social Connections</em>.
                        </div>
                    </div>

                    <div className="w-full">
                        <UserProfile
                            path="/profile"
                            routing="path"
                            appearance={{
                                elements: {
                                    rootBox: "mx-auto w-full",
                                    card: "bg-white/[0.02] border-white/10 shadow-xl backdrop-blur-xl w-full mx-auto",
                                    navbar: "md:flex", // Ensure navbar is visible for navigation
                                    pageScrollBox: "p-4 md:p-8",
                                }
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
