import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
export declare const fetchRandomImageTool: DynamicStructuredTool<z.ZodObject<{
    input: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    input?: string | undefined;
}, {
    input?: string | undefined;
}>>;
export declare const fetchRandomImageURL: DynamicStructuredTool<z.ZodObject<{
    input: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    input?: string | undefined;
}, {
    input?: string | undefined;
}>>;
export declare const chartTool: DynamicStructuredTool<z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        value: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        label: string;
    }, {
        value: number;
        label: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    data: {
        value: number;
        label: string;
    }[];
}, {
    data: {
        value: number;
        label: string;
    }[];
}>>;
export declare const tavilyTool: TavilySearchResults;
