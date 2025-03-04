import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { DynamicStructuredTool , tool } from '@langchain/core/tools';
import { z } from 'zod';
import { config } from 'dotenv';

config();

import fetch from 'node-fetch';
import { Constants } from '@/common';

const fetchImageSchema = z.object({ input: z.string().optional() });

export const fetchRandomImageTool = tool(
  async () => {
    try {
      // Lorem Picsum provides random images at any size
      const imageUrl = 'https://picsum.photos/200/300';

      const imageResponse = await fetch(imageUrl);
      // eslint-disable-next-line no-console
      console.log(imageResponse);
      const arrayBuffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const content = [{
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${base64}`,
        },
      }];

      const response = [
        {
          type: 'text',
          text: 'Random image from Lorem Picsum, taken at 800x600',
        },
      ];
      return [response, { content }];
    } catch (error) {
      return [`Error fetching image: ${(error as Error).message}`, undefined];
    }
  },
  {
    name: 'fetchRandomImage',
    description: 'Fetches a random image from Lorem Picsum',
    schema: fetchImageSchema,
    responseFormat: Constants.CONTENT_AND_ARTIFACT,
  }
);

export const fetchRandomImageURL = tool(
  async () => {
    try {
      const imageUrl = 'https://picsum.photos/200/300';

      const imageResponse = await fetch(imageUrl);
      const content = [{
        type: 'image_url',
        image_url: {
          url: imageResponse.url,
        },
      }];

      // eslint-disable-next-line no-console
      console.log('URL RESPONSE', imageResponse.url);

      const response = [
        {
          type: 'text',
          text: 'Random image from Lorem Picsum, taken at 800x600',
        },
      ];
      return [response, { content }];
    } catch (error) {
      return [`Error fetching image: ${(error as Error).message}`, undefined];
    }
  },
  {
    name: 'fetchRandomImage',
    description: 'Fetches a random image from Lorem Picsum',
    schema: fetchImageSchema,
    responseFormat: Constants.CONTENT_AND_ARTIFACT,
  }
);

export const chartTool = new DynamicStructuredTool({
  name: 'generate_bar_chart',
  description:
    'Generates a text-based bar chart from an array of data points and returns it as a string.',
  schema: z.object({
    data: z.array(
      z.object({
        label: z.string(),
        value: z.number(),
      })
    ),
  }),
  func: async ({ data }): Promise<string> => {
    const maxValue = Math.max(...data.map(d => d.value));
    const chartHeight = 20;
    const chartWidth = 50;

    let chart = '';

    // Generate Y-axis labels and bars
    for (let i = chartHeight; i >= 0; i--) {
      const row = data.map(d => {
        const barHeight = Math.round((d.value / maxValue) * chartHeight);
        return barHeight >= i ? '█' : ' ';
      });

      const yLabel = i === chartHeight ? maxValue.toString().padStart(4) :
        i === 0 ? '0'.padStart(4) :
          i % 5 === 0 ? Math.round((i / chartHeight) * maxValue).toString().padStart(4) : '    ';

      chart += `${yLabel} │${row.join(' ')} \n`;
    }

    // Generate X-axis
    chart += '     ├' + '─'.repeat(chartWidth) + '\n';

    // Generate X-axis labels
    const xLabels = data.map(d => d.label.padEnd(5).substring(0, 5)).join(' ');
    chart += `     ${xLabels}`;

    return chart;
  },
});

export const tavilyTool = new TavilySearchResults();
