import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

const requiredProductionEnv = [
  "NEXT_PUBLIC_CONVEX_URL",
] as const;

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const missing = requiredProductionEnv.filter((name) => !process.env[name]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required production environment variables: ${missing.join(", ")}`,
      );
    }
  }

  return nextConfig;
}
