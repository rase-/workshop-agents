"use client";

import { useState, useRef, useEffect } from "react";
import { MastraClient } from "@mastra/client-js";

const client = new MastraClient({
  baseUrl: "http://localhost:4111",
});

function getWeatherGradient(weatherCode: number, temperature: number): string {
  // Temperature warmth factor: -10C → 0, 15C → 0.5, 40C → 1
  const warmth = Math.max(0, Math.min(1, (temperature + 10) / 50));

  // Base gradients by weather code
  let colors: [string, string];

  if (weatherCode <= 1) {
    // Clear sky
    colors = warmth > 0.5
      ? ["#f6d365", "#fda085"] // warm golden
      : ["#a1c4fd", "#c2e9fb"]; // cool blue sky
  } else if (weatherCode === 2) {
    // Partly cloudy
    colors = ["#89b4cf", "#b8c6db"];
  } else if (weatherCode === 3) {
    // Overcast
    colors = ["#8e9eab", "#a8b5c2"];
  } else if (weatherCode <= 48) {
    // Fog
    colors = ["#757f9a", "#d7dde8"];
  } else if (weatherCode <= 57) {
    // Drizzle
    colors = ["#616d86", "#96a0b5"];
  } else if (weatherCode <= 67 || (weatherCode >= 80 && weatherCode <= 82)) {
    // Rain
    colors = ["#3a4f7a", "#1a2a4a"];
  } else if (weatherCode <= 77 || (weatherCode >= 85 && weatherCode <= 86)) {
    // Snow
    colors = ["#ccd5e0", "#8fa3b8"];
  } else if (weatherCode >= 95) {
    // Thunderstorm
    colors = ["#1a1a2e", "#3d2c5e"];
  } else {
    colors = ["#667eea", "#764ba2"];
  }

  // Blend warmth into the gradient for temperature feel
  if (temperature > 30) {
    // Hot: push toward orange
    colors[0] = blendColor(colors[0], "#e8834a", 0.3);
    colors[1] = blendColor(colors[1], "#c0392b", 0.2);
  } else if (temperature < 0) {
    // Freezing: push toward icy blue
    colors[0] = blendColor(colors[0], "#74b9ff", 0.3);
    colors[1] = blendColor(colors[1], "#0984e3", 0.2);
  }

  return `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
}

function blendColor(hex1: string, hex2: string, factor: number): string {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const setWeatherVibes = {
  id: "setWeatherVibes",
  description:
    "After retrieving weather data, call this tool to update the page atmosphere to match the current weather conditions. Always call this tool when you have weather data.",
  parameters: {
    type: "object" as const,
    properties: {
      temperature: { type: "number" as const, description: "Current temperature in Celsius" },
      weatherCode: { type: "number" as const, description: "WMO weather code (0-99)" },
      conditions: { type: "string" as const, description: "Human-readable weather condition" },
      windSpeed: { type: "number" as const, description: "Wind speed in km/h" },
      humidity: { type: "number" as const, description: "Relative humidity percentage" },
    },
    required: ["temperature", "weatherCode", "conditions", "windSpeed", "humidity"],
    additionalProperties: false,
  },
  execute: async (args: {
    temperature: number;
    weatherCode: number;
    conditions: string;
    windSpeed: number;
    humidity: number;
  }) => {
    const gradient = getWeatherGradient(args.weatherCode, args.temperature);
    document.body.style.background = gradient;
    return {
      success: true,
      effect: `${args.conditions}, ${args.temperature}°C`,
    };
  },
};

const clientTools = { setWeatherVibes };

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
}

interface PendingApproval {
  runId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
}

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [effect, setEffect] = useState("");
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const turnStateRef = useRef<{ assistantText: string; assistantIndex: number }>({
    assistantText: "",
    assistantIndex: -1,
  });
  const handledApprovalsRef = useRef<Set<string>>(new Set());
  const idsRef = useRef<{ resourceId: string; threadId: string } | null>(null);
  if (!idsRef.current) {
    idsRef.current = { resourceId: newId("user"), threadId: newId("thread") };
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const { resourceId, threadId } = idsRef.current!;
    const agent = client.getAgent("weather-agent");
    let cancelled = false;
    let subscription: Awaited<ReturnType<typeof agent.subscribeToThread>> | null = null;

    (async () => {
      try {
        subscription = await agent.subscribeToThread({ resourceId, threadId });
        if (cancelled) {
          subscription.unsubscribe?.();
          return;
        }
        // Fire-and-forget: this resolves only when the subscription is closed.
        void subscription.processDataStream({
          reconnect: true,
          onChunk: async (chunk) => {
            if (chunk.type === "tool-call" || chunk.type === "tool-call-approval") {
              console.log("[chunk]", chunk.type, (chunk.payload as { toolName?: string; args?: unknown })?.toolName, (chunk.payload as { args?: unknown })?.args);
            } else if (chunk.type === "tool-result") {
              const p = chunk.payload as { toolName?: string; toolCallId?: string; result?: unknown };
              console.log("[chunk]", chunk.type, p?.toolName, p?.toolCallId, p?.result);
            } else {
              console.log("[chunk]", chunk.type);
            }
            if (chunk.type === "text-delta") {
              turnStateRef.current.assistantText += chunk.payload.text;
              const text = turnStateRef.current.assistantText;
              setMessages((prev) => {
                const updated = [...prev];
                if (turnStateRef.current.assistantIndex === -1) {
                  turnStateRef.current.assistantIndex = updated.length;
                  updated.push({ role: "assistant", content: text });
                } else {
                  updated[turnStateRef.current.assistantIndex] = {
                    role: "assistant",
                    content: text,
                  };
                }
                return updated;
              });
            } else if (chunk.type === "tool-result") {
              const result = chunk.payload.result as {
                success?: boolean;
                effect?: string;
              };
              if (result?.effect) {
                setEffect(result.effect);
                setMessages((prev) => [
                  ...prev,
                  { role: "tool", content: `Atmosphere set: ${result.effect}` },
                ]);
              }
            } else if (chunk.type === "tool-call-approval") {
              const payload = chunk.payload as {
                toolCallId: string;
                toolName: string;
                args: unknown;
              };
              const runId = (chunk as { runId?: string }).runId;
              if (runId) {
                // Dedupe: ignore if we've already shown approval for this toolCallId
                // (defends against server replay or duplicate chunks).
                setPendingApproval((prev) => {
                  if (prev?.toolCallId === payload.toolCallId) {
                    console.warn("[approval] duplicate tool-call-approval ignored:", payload.toolCallId);
                    return prev;
                  }
                  if (handledApprovalsRef.current.has(payload.toolCallId)) {
                    console.warn("[approval] tool-call-approval re-arrived after handling:", payload.toolCallId);
                    return prev;
                  }
                  return {
                    runId,
                    toolCallId: payload.toolCallId,
                    toolName: payload.toolName,
                    args: payload.args,
                  };
                });
                setLoading(false);
              }
            } else if (chunk.type === "finish") {
              const reason = (chunk.payload as { stepResult?: { reason?: string } })?.stepResult?.reason;
              if (reason !== "tool-calls") {
                setLoading(false);
              }
            }
          },
        });
      } catch (err) {
        if (!cancelled) {
          console.error("Subscription error:", err);
        }
      }
    })();

    return () => {
      cancelled = true;
      subscription?.unsubscribe?.();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || pendingApproval) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    turnStateRef.current = { assistantText: "", assistantIndex: -1 };

    try {
      const agent = client.getAgent("weather-agent");
      const { resourceId, threadId } = idsRef.current!;
      console.log("[sendMessage]", text);
      const result = await agent.sendMessage({
        message: text,
        resourceId,
        threadId,
        ifIdle: {
          behavior: "wake",
          streamOptions: { clientTools },
        },
      });
      console.log("[sendMessage] response", result);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
      setLoading(false);
    }
  }

  async function handleApproval(approved: boolean) {
    if (!pendingApproval) return;
    const { toolCallId } = pendingApproval;
    handledApprovalsRef.current.add(toolCallId);
    setPendingApproval(null);
    setLoading(true);
    try {
      const agent = client.getAgent("weather-agent");
      const { resourceId, threadId } = idsRef.current!;
      console.log("[approval] sending", { approved, toolCallId });
      const result = await agent.sendToolApproval({
        resourceId,
        threadId,
        toolCallId,
        approved,
        streamOptions: { clientTools },
      });
      console.log("[approval] response", result);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <div className="header">
        <h1>Weather Vibes</h1>
        <p>Ask about the weather anywhere</p>
      </div>

      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {loading && !pendingApproval && messages[messages.length - 1]?.role === "user" && (
          <div className="message assistant">Thinking...</div>
        )}
        {pendingApproval && (
          <div className="approval-card">
            <div className="approval-title">
              Approve <code>{pendingApproval.toolName}</code>?
            </div>
            <pre className="approval-args">
              {JSON.stringify(pendingApproval.args, null, 2)}
            </pre>
            <div className="approval-actions">
              <button onClick={() => handleApproval(true)}>Approve</button>
              <button onClick={() => handleApproval(false)} className="decline">
                Decline
              </button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="input-bar" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What's the weather in Tokyo?"
          disabled={loading || !!pendingApproval}
        />
        <button type="submit" disabled={loading || !!pendingApproval}>
          Send
        </button>
      </form>

      {effect && <div className="effect-label">{effect}</div>}
    </div>
  );
}
