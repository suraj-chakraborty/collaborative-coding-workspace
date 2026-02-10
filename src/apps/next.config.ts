import type { NextConfig } from "next";
import { withLingo } from "@lingo.dev/compiler/next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: '../../',
  }
}

export default withLingo(nextConfig, {
  sourceLocale: "en",
  targetLocales: ["en",
        "es",
        "fr",
        "hi"
      ]
});