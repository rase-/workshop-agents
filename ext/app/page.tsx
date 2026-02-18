"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { Thread } from "./thread";
import { useEffect } from "react";

function getWeatherGradient(weatherCode: number, temperature: number): string {
  const warmth = Math.max(0, Math.min(1, (temperature + 10) / 50));
  let colors: [string, string];

  if (weatherCode <= 1) {
    colors =
      warmth > 0.5
        ? ["#f6d365", "#fda085"]
        : ["#a1c4fd", "#c2e9fb"];
  } else if (weatherCode === 2) {
    colors = ["#89b4cf", "#b8c6db"];
  } else if (weatherCode === 3) {
    colors = ["#8e9eab", "#a8b5c2"];
  } else if (weatherCode <= 48) {
    colors = ["#757f9a", "#d7dde8"];
  } else if (weatherCode <= 57) {
    colors = ["#616d86", "#96a0b5"];
  } else if (weatherCode <= 67 || (weatherCode >= 80 && weatherCode <= 82)) {
    colors = ["#3a4f7a", "#1a2a4a"];
  } else if (weatherCode <= 77 || (weatherCode >= 85 && weatherCode <= 86)) {
    colors = ["#ccd5e0", "#8fa3b8"];
  } else if (weatherCode >= 95) {
    colors = ["#1a1a2e", "#3d2c5e"];
  } else {
    colors = ["#667eea", "#764ba2"];
  }

  if (temperature > 30) {
    colors[0] = blendColor(colors[0], "#e8834a", 0.3);
    colors[1] = blendColor(colors[1], "#c0392b", 0.2);
  } else if (temperature < 0) {
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

function weatherEmoji(code: number): string {
  if (code <= 1) return "☀️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌧️";
  if (code <= 67 || (code >= 80 && code <= 82)) return "🌧️";
  if (code <= 77 || (code >= 85 && code <= 86)) return "❄️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}

interface WeatherResult {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGust: number;
  conditions: string;
  location: string;
}

const WeatherToolUI = makeAssistantToolUI<Record<string, string>, WeatherResult>({
  toolName: "weatherTool",
  render: ({ args, result, status }) => {
    useEffect(() => {
      if (result && typeof result === "object" && "temperature" in result) {
        const weatherCode = wmoCodeFromConditions(result.conditions);
        const gradient = getWeatherGradient(weatherCode, result.temperature);
        document.body.style.background = gradient;
      }
    }, [result]);

    if (status.type === "running") {
      return (
        <div className="weather-card loading">
          <div className="weather-card-shimmer">Checking weather for {args.location || "..."}...</div>
        </div>
      );
    }

    if (status.type === "incomplete") {
      return <div className="weather-card error">Failed to get weather data.</div>;
    }

    if (status.type === "complete" && result) {
      const weatherCode = wmoCodeFromConditions(result.conditions);
      return (
        <div className="weather-card">
          <div className="weather-card-header">
            <span className="weather-emoji">{weatherEmoji(weatherCode)}</span>
            <span className="weather-location">{result.location}</span>
          </div>
          <div className="weather-card-temp">{result.temperature}°C</div>
          <div className="weather-card-conditions">{result.conditions}</div>
          <div className="weather-card-details">
            <span>Feels like {result.feelsLike}°C</span>
            <span>💧 {result.humidity}%</span>
            <span>💨 {result.windSpeed} km/h</span>
          </div>
        </div>
      );
    }

    return null;
  },
});

function wmoCodeFromConditions(conditions: string): number {
  const c = conditions.toLowerCase();
  if (c.includes("thunder")) return 95;
  if (c.includes("snow") || c.includes("flurr")) return 71;
  if (c.includes("heavy rain") || c.includes("shower")) return 80;
  if (c.includes("rain")) return 61;
  if (c.includes("drizzle")) return 51;
  if (c.includes("fog") || c.includes("mist")) return 45;
  if (c.includes("overcast")) return 3;
  if (c.includes("partly") || c.includes("mostly")) return 2;
  if (c.includes("clear") || c.includes("sunny")) return 0;
  return 2;
}

export default function Home() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "http://localhost:4111/chat/weatherAgent",
    }),
  });

  return (
    <div className="app">
      <div className="header">
        <h1>Weather Vibes</h1>
        <p>Ask about the weather anywhere</p>
      </div>
      <AssistantRuntimeProvider runtime={runtime}>
        <WeatherToolUI />
        <Thread />
      </AssistantRuntimeProvider>
    </div>
  );
}
