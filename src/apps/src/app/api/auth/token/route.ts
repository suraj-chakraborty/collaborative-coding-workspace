import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
    const { userId } = await auth();

    if (!userId) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let provider = searchParams.get("provider") || "github";

    // Clerk deprecation: Remove "oauth_" prefix if present
    const cleanProvider = provider.startsWith("oauth_") ? provider.replace("oauth_", "") : provider;

    try {
        const client = await clerkClient();
        const response = await client.users.getUserOauthAccessToken(userId, cleanProvider as any);

        if (response.data.length > 0) {
            return NextResponse.json({ token: response.data[0].token });
        }

        return NextResponse.json({ token: null }, { status: 404 });
    } catch (error) {
        console.error("[OAUTH_TOKEN_ERROR]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
