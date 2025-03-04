// src/tools/global_analysis_tools.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fetch from 'node-fetch';

export const WeatherDataTool = new DynamicStructuredTool({
    name: 'get_weather_data',
    description: 'Fetches current weather data for a given city.',
    schema: z.object({
        city: z.string(),
    }),
    func: async ({ city }) => {
        try {
            // Try OpenMeteo API first (doesn't require API key)
            const url = 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current_weather=true';
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                throw new Error(data.reason);
            }

            return JSON.stringify(data);
        } catch (error) {
            console.error(`Error fetching weather data: ${(error as Error).message}`);
            // Implement fallback or return error message
            return JSON.stringify({ error: 'Unable to fetch weather data. Please try again later.' });
        }
    }
});

// Time Zone Tool
export const TimeZoneTool = new DynamicStructuredTool({
    name: 'get_time_zone_info',
    description: 'Fetches time zone information for a given location.',
    schema: z.object({
        latitude: z.number(),
        longitude: z.number(),
    }),
    func: async ({ latitude, longitude }) => {
        const url = `http://api.geonames.org/timezoneJSON?lat=${latitude}&lng=${longitude}&username=demo`;
        const response = await fetch(url);
        const data = await response.json();
        return JSON.stringify(data);
    }
});

// Currency Conversion Tool
export const CurrencyConversionTool = new DynamicStructuredTool({
    name: 'convert_currency',
    description: 'Converts an amount from one currency to another.',
    schema: z.object({
        from: z.string(),
        to: z.string(),
        amount: z.number(),
    }),
    func: async ({ from, to, amount }) => {
        const url = `https://api.exchangerate-api.com/v4/latest/${from}`;
        const response = await fetch(url);
        const data = await response.json();
        const rate = data.rates[to];
        const convertedAmount = amount * rate;
        return JSON.stringify({
            from,
            to,
            amount,
            convertedAmount,
            rate,
        });
    }
});

// IP Geolocation Tool
export const IPGeolocationTool = new DynamicStructuredTool({
    name: 'get_ip_geolocation',
    description: 'Fetches geolocation information for a given IP address.',
    schema: z.object({
        ip: z.string(),
    }),
    func: async ({ ip }) => {
        const url = `http://ip-api.com/json/${ip}`;
        const response = await fetch(url);
        const data = await response.json();
        return JSON.stringify(data);
    }
});
