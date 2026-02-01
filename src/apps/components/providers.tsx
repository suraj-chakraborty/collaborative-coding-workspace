"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { dark } from "@clerk/themes";
import { LingoProvider } from "@lingo.dev/compiler/react";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <LingoProvider>
            <ClerkProvider appearance={{ baseTheme: dark }}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem
                    disableTransitionOnChange
                >
                    {children}
                </ThemeProvider>
            </ClerkProvider>
        </LingoProvider>
    );
}
