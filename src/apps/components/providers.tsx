"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { dark } from "@clerk/themes";
import { LingoProvider } from "@lingo.dev/compiler/react";
import { ApolloProvider } from "@apollo/client/react";
import { ApolloClient, HttpLink, InMemoryCache, gql } from "@apollo/client";

import { useState, useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const client = new ApolloClient({
        link: new HttpLink({ uri: "http://localhost:3001/graphql" }),
        cache: new InMemoryCache(),
    });

    return (
        <ApolloProvider client={client}>
            <LingoProvider>
                <ClerkProvider
                    publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
                    appearance={{ baseTheme: dark }}
                >
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="dark"
                        enableSystem
                        disableTransitionOnChange
                    >
                        {!mounted ? (
                            <div style={{ visibility: "hidden" }}>{children}</div>
                        ) : (
                            children
                        )}
                    </ThemeProvider>
                </ClerkProvider>
            </LingoProvider>
        </ApolloProvider>
    );
}
