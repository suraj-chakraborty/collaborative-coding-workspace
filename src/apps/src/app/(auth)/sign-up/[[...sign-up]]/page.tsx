import { SignUp } from "@clerk/nextjs";

export default function Page() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="relative">
                {/* Decorative elements */}
                <div className="absolute -top-12 -right-12 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
                <div className="absolute -bottom-12 -left-12 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />

                <SignUp
                    appearance={{
                        elements: {
                            rootBox: "shadow-2xl",
                            card: "bg-background/80 backdrop-blur-xl border border-white/10",
                            headerTitle: "text-foreground font-bold",
                            headerSubtitle: "text-muted-foreground",
                            formButtonPrimary: "bg-indigo-600 hover:bg-indigo-700 transition-all",
                            footerActionLink: "text-indigo-400 hover:text-indigo-300",
                        },
                    }}
                />
            </div>
        </div>
    );
}
