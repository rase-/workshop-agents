import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'

const forecastSchema = z.object({
  date: z.string(),
  maxTemp: z.number(),
  minTemp: z.number(),
  precipitationChance: z.number(),
  condition: z.string(),
  location: z.string(),
})

const focusSchema = z.enum(['indoor', 'outdoor'])
const focusedForecastSchema = forecastSchema.extend({ focus: focusSchema })

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    95: 'Thunderstorm',
  }
  return conditions[code] || 'Unknown'
}

const fetchWeather = createStep({
  id: 'fetch-weather',
  description: 'Fetches weather forecast for a given city',
  inputSchema: z.object({
    city: z.string().describe('The city to get the weather for'),
  }),
  outputSchema: forecastSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found')
    }

    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      inputData.city
    )}&count=1`
    const geocodingResponse = await fetch(geocodingUrl)
    const geocodingData = (await geocodingResponse.json()) as {
      results: { latitude: number; longitude: number; name: string }[]
    }

    if (!geocodingData.results?.[0]) {
      throw new Error(`Location '${inputData.city}' not found`)
    }

    const { latitude, longitude, name } = geocodingData.results[0]

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,weathercode&timezone=auto,&hourly=precipitation_probability,temperature_2m`
    const response = await fetch(weatherUrl)
    const data = (await response.json()) as {
      current: {
        time: string
        precipitation: number
        weathercode: number
      }
      hourly: {
        precipitation_probability: number[]
        temperature_2m: number[]
      }
    }

    const forecast = {
      date: new Date().toISOString(),
      maxTemp: Math.max(...data.hourly.temperature_2m),
      minTemp: Math.min(...data.hourly.temperature_2m),
      condition: getWeatherCondition(data.current.weathercode),
      precipitationChance: data.hourly.precipitation_probability.reduce(
        (acc, curr) => Math.max(acc, curr),
        0
      ),
      location: name,
    }

    return forecast
  },
})

const awaitActivityFocus = createStep({
  id: 'await-activity-focus',
  description:
    'Pauses to let the user pick a main focus (indoor vs outdoor) for the activity plan',
  inputSchema: forecastSchema,
  outputSchema: focusedForecastSchema,
  suspendSchema: z.object({
    forecast: forecastSchema,
    question: z.string(),
  }),
  resumeSchema: z.object({
    focus: focusSchema,
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!resumeData?.focus) {
      return await suspend({
        forecast: inputData,
        question:
          `Weather in ${inputData.location}: ${inputData.condition}, ` +
          `${inputData.minTemp}–${inputData.maxTemp}°C, ` +
          `${inputData.precipitationChance}% precipitation. ` +
          `Which should I focus on — indoor or outdoor activities?`,
      })
    }
    return { ...inputData, focus: resumeData.focus }
  },
})

const planActivities = createStep({
  id: 'plan-activities',
  description:
    'Suggests activities based on weather conditions and the user-selected focus',
  inputSchema: focusedForecastSchema,
  outputSchema: z.object({
    activities: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const forecast = inputData

    if (!forecast) {
      throw new Error('Forecast data not found')
    }

    const agent = mastra?.getAgent('weatherAgent')
    if (!agent) {
      throw new Error('Weather agent not found')
    }

    const mainFocus = forecast.focus
    const alternative = mainFocus === 'outdoor' ? 'indoor' : 'outdoor'
    const mainLabel = mainFocus.toUpperCase()
    const altLabel = alternative.toUpperCase()

    const prompt = `Based on the following weather forecast for ${
      forecast.location
    }, suggest appropriate activities. The user has chosen ${mainLabel} as the MAIN FOCUS for this plan — lead with ${mainFocus} activities, but DO NOT exclude ${alternative} options; include a smaller "alternatives" section at the end.

      ${JSON.stringify(forecast, null, 2)}

      Structure your response exactly as follows:

      📅 [Day, Month Date, Year]
      ═══════════════════════════

      🌡️ WEATHER SUMMARY
      • Conditions: [brief description]
      • Temperature: [X°C/Y°F to A°C/B°F]
      • Precipitation: [X% chance]

      ⭐ MAIN FOCUS: ${mainLabel}

      🌅 MORNING
      • [Activity Name] - [Brief description including specific location/venue]
        Best timing: [specific time range]
        Note: [relevant weather consideration]

      🌞 AFTERNOON
      • [Activity Name] - [Brief description including specific location/venue]
        Best timing: [specific time range]
        Note: [relevant weather consideration]

      🔁 ${altLabel} ALTERNATIVES
      • [1-2 ${alternative} options - shorter, just to round out the plan]

      ⚠️ SPECIAL CONSIDERATIONS
      • [Any relevant weather warnings, UV index, wind conditions, etc.]

      Guidelines:
      - Suggest 2-3 time-specific ${mainFocus} activities (morning + afternoon)
      - Include 1-2 ${alternative} alternatives at the end (keep brief)
      - All activities must be specific to the location
      - Include specific venues, trails, or addresses where possible
      - Consider activity intensity based on temperature
      - Keep descriptions concise but informative

      Maintain this exact formatting, using the emoji and section headers as shown.`

    const response = await agent.stream([
      {
        role: 'user',
        content: prompt,
      },
    ])

    let activitiesText = ''
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk)
      activitiesText += chunk
    }

    return {
      activities: activitiesText,
    }
  },
})

const planningWorkflow = createWorkflow({
  id: 'planning-workflow',
  description:
    'Plans activities for a city based on its current weather forecast, with a human-in-the-loop step to choose an indoor or outdoor focus.',
  inputSchema: z.object({
    city: z.string().describe('The city to plan activities for'),
  }),
  outputSchema: z.object({
    activities: z.string(),
  }),
})
  .then(fetchWeather)
  .then(awaitActivityFocus)
  .then(planActivities)

planningWorkflow.commit()

export { planningWorkflow }
