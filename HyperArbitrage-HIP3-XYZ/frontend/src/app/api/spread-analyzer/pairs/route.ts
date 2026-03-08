import { readFileSync } from "fs";
import { resolve } from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LIVE_STATE_PATH = resolve(process.cwd(), "..", "..", "data", "live-state.json");

function readLiveState() {
  try {
    return JSON.parse(readFileSync(LIVE_STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const state = readLiveState();
  if (!state || !state.pairs) {
    return NextResponse.json(
      { error: "Collector not ready", pairs: [], total: 0 },
      { status: 503 }
    );
  }

  return NextResponse.json({
    pairs: state.pairs,
    total: state.pairs.length,
  });
}
