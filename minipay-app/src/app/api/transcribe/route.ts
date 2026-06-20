import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "Voice transcription is not configured." }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.set("file", audio, "voice-note.webm");
  upstream.set("model", process.env.GROQ_WHISPER_MODEL?.trim() || "whisper-large-v3-turbo");
  upstream.set("response_format", "json");

  const res = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: upstream,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Transcription failed (${res.status}): ${body.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { text?: string };
  return NextResponse.json({ text: data.text?.trim() ?? "" });
}
