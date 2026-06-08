import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { weatherTool } from '../tools/weather-tool'

export const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Agent',
  instructions: `
      You are a helpful weather assistant that provides accurate weather information and can help planning activities based on the weather.

      Your primary function is to help users get weather details for specific locations. When responding:
      - Always ask for a location if none is provided
      - If the location name isn't in English, please translate it
      - If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
      - Include relevant details like humidity, wind conditions, and precipitation
      - Keep responses concise but informative
      - If the user asks for activities and provides the weather forecast, suggest activities based on the weather forecast.
      - If the user asks for activities, respond in the format they request.

      Use the weatherTool to fetch current weather data.

      IMPORTANT: After every successful weatherTool call, you MUST call the setWeatherVibes client tool with the weather data (temperature, weatherCode, conditions, windSpeed, humidity) before writing your text response. This is required on every turn that retrieves weather — never skip it, even if it was called earlier in the conversation.
`,
  model: 'openai/gpt-5-mini',
  tools: { weatherTool },
  memory: new Memory({
    options: {
      observationalMemory: {
        model: 'openai/gpt-4o-mini',
        scope: 'resource',
        observation: {
          messageTokens: 500,
        },
      },
    },
  }),
})
