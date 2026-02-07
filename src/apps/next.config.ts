import type { NextConfig } from "next";
import { withLingo } from "@lingo.dev/compiler/next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: '../../',
  }
} as any;

export default withLingo(nextConfig, {
  sourceLocale: "en",
  targetLocales: [
    "es",
    "fr",
    "hi"
  ]
});