// src/tools/space_mission_tools.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fetch from 'node-fetch';
import { createHash } from 'crypto';

// NASA APOD (Astronomy Picture of the Day) Tool
export const NasaAPODTool = new DynamicStructuredTool({
    name: 'get_nasa_apod',
    description: 'Fetches NASA\'s Astronomy Picture of the Day.',
    schema: z.object({
        date: z.string().optional(),
    }),
    func: async ({ date }) => {
        const apiKey = process.env.NASA_API_KEY;
        const url = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}${date ? `&date=${date}` : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        return JSON.stringify(data);
    }
});

// ISS Location Tool
export const ISSLocationTool = new DynamicStructuredTool({
    name: 'get_iss_location',
    description: 'Fetches the current location of the International Space Station.',
    schema: z.object({}),
    func: async () => {
        const url = 'http://api.open-notify.org/iss-now.json';
        const response = await fetch(url);
        const data = await response.json();
        return JSON.stringify(data);
    }
});

// Space Launch Schedule Tool
export const LaunchScheduleTool = new DynamicStructuredTool({
    name: 'get_launch_schedule',
    description: 'Fetches upcoming space launches.',
    schema: z.object({
        limit: z.number().optional(),
    }),
    func: async ({ limit = 5 }) => {
        const url = `https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=${limit}`;
        const response = await fetch(url);
        const data = await response.json();
        return JSON.stringify(data);
    }
});

// Mission ID Generator Tool
export const MissionIDGenerator = new DynamicStructuredTool({
    name: 'generate_mission_id',
    description: 'Generates a unique ID for space missions.',
    schema: z.object({}),
    func: async () => {
        const uniqueID = createHash('sha256').update(Date.now().toString()).digest('hex');
        return `MISSION-${uniqueID.substring(0, 8)}`;
    }
});
