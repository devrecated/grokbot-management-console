"use client";

import { useEffect } from "react";
import HyperDX from "@hyperdx/browser";

let initialized = false;

/** Browser RUM for HyperDX (self-hosted). Init only when NEXT_PUBLIC_HYPERDX_API_KEY is set. */
export function HyperDXInit({ service, disableReplay = false }) {
  useEffect(() => {
    if (initialized || typeof window === "undefined") return;
    const key = (process.env.NEXT_PUBLIC_HYPERDX_API_KEY || "").trim();
    if (!key) {
      if (process.env.NODE_ENV === "production") {
        console.warn(
          "NEXT_PUBLIC_HYPERDX_API_KEY is not set; skipping HyperDX init",
        );
      }
      return;
    }
    initialized = true;
    HyperDX.init({
      apiKey: key,
      service,
      url:
        process.env.NEXT_PUBLIC_HYPERDX_URL ||
        "https://hyperdx.devrecated.com",
      consoleCapture: true,
      advancedNetworkCapture: false,
      disableReplay,
    });
  }, [service, disableReplay]);

  return null;
}
