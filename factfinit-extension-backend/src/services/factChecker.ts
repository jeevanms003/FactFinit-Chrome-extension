import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import pRetry from 'p-retry';
import { TranscriptSegment } from '../interfaces/transcript';
import { FactCheckResult } from '../interfaces/factCheckResult';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:8001/query';

// Simple error logging
const logError = (message: string, data: any) => {
  const log = `[${new Date().toISOString()}] ${message}: ${JSON.stringify(data, null, 2)}\n`;
  fs.appendFileSync('fact_checker_errors.log', log);
};

async function runGeminiFactCheck(combinedText: string, context: string = ''): Promise<FactCheckResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  const prompt = `
You are a professional transcript normalizer and fact-checker. Your task is to process the provided transcript and return a structured JSON response with the following:

1. **Normalized Transcript**: Convert the transcript into a single, cohesive English paragraph. Follow these steps:
   - Translate non-English text to English, preserving meaning.
   - Fix grammatical errors and improve sentence structure.
   - Remove filler words (e.g., "uh", "um") and repetitive phrases unless they add meaning.
   - For songs or repetitive content, include all unique content in a natural paragraph.
   - If the input is empty, return a brief message indicating the issue.

2. **Financial Detection**: Analyze the transcript for financial content (e.g., stocks, investments, prices). Return a boolean for "isFinancial".

3. **Fact-Checking**:
   - If isFinancial is false, return factCheck as { claims: [], sources: [] }.
   - If isFinancial is true:
     - Identify up to 3 major claims.
     - For each claim, provide:
       - claim: Verbatim claim (e.g., "10gm gold was 3000 Rs in 2015").
       - isAccurate: Boolean indicating if the claim is correct.
       - explanation: A 100-200 word explanation of accuracy, including evidence, context, and caveats.
     - Provide up to 5 credible sources at the factCheck level with title, URL, and snippet.

Return only the JSON object.

Input: "${combinedText.replace(/"/g, '\\"')}"
Output format: {
  "normalizedTranscript": "string",
  "isFinancial": boolean,
  "isMisleading": boolean,
  "factCheck": {
    "claims": Array<{ "claim": string, "isAccurate": boolean, "explanation": string }>,
    "sources": Array<{ "title": string, "url": string, "snippet": string }>
  }
}
`;

  try {
    const result = await pRetry(
      () => model.generateContent(prompt, { timeout: 20000 }),
      { retries: 3, minTimeout: 1000, maxTimeout: 5000 }
    );
    const responseText = result.response
      .text()
      .replace(/```json\n|```/g, '')
      .replace(/\n\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    let parsedResult: FactCheckResult = JSON.parse(responseText);

    // Fix: Explicitly type the claim parameter
    parsedResult.factCheck.claims = parsedResult.factCheck.claims.map((claim: { claim: string; isAccurate: boolean; explanation: string }) => ({
      claim: claim.claim,
      isAccurate: claim.isAccurate,
      explanation: claim.explanation,
    }));
    parsedResult.isMisleading = parsedResult.factCheck.claims.some((claim: { claim: string; isAccurate: boolean; explanation: string }) => !claim.isAccurate);
    parsedResult.factCheck.sources = parsedResult.factCheck.sources || [];

    return parsedResult;
  } catch (error) {
    logError('Gemini fact-check failed', { error, transcript: combinedText });
    throw new Error('Failed to process transcript with Gemini');
  }
}

async function runRAGFactCheck(combinedText: string): Promise<FactCheckResult> {
  try {
    const ragResponse = await pRetry(
      () => axios.post(RAG_API_URL, { query: combinedText }, { timeout: 15000 }),
      { retries: 3, minTimeout: 1000, maxTimeout: 5000 }
    );
    const { answer, passages } = ragResponse.data;
    const normalizedTranscript = answer === 'OUT OF CONTEXT'
      ? combinedText
      : passages.length > 0
        ? passages.map((p: any) => p.snippet).join(' ')
        : combinedText;
    const isFinancial = answer !== 'OUT OF CONTEXT' && passages.length > 0;

    // Fix: Explicitly type the passage parameter
    const claims = answer === 'OUT OF CONTEXT' ? [] : passages.map((p: { title: string; url: string; snippet: string }) => ({
      claim: p.title,
      isAccurate: true,
      explanation: `Based on recent financial news: ${p.snippet} (Source: ${p.url})`,
    }));

    return {
      normalizedTranscript,
      isFinancial,
      isMisleading: claims.some((claim: { claim: string; isAccurate: boolean; explanation: string }) => !claim.isAccurate),
      factCheck: {
        claims,
        sources: passages.map((p: { title: string; url: string; snippet: string }) => ({
          title: p.title,
          url: p.url,
          snippet: p.snippet,
        })),
      },
    };
  } catch (error) {
    logError('RAG fact-check failed', { error, transcript: combinedText });
    return {
      normalizedTranscript: combinedText,
      isFinancial: false,
      isMisleading: false,
      factCheck: { claims: [], sources: [] },
    };
  }
}

async function mergeResults(
  geminiResult: FactCheckResult,
  ragResult: FactCheckResult,
  combinedText: string
): Promise<FactCheckResult> {
  if (ragResult.isFinancial && ragResult.factCheck.claims.length > 0) {
    return {
      normalizedTranscript: geminiResult.normalizedTranscript,
      isFinancial: true,
      isMisleading: ragResult.factCheck.claims.some((claim: { claim: string; isAccurate: boolean; explanation: string }) => !claim.isAccurate),
      factCheck: {
        claims: ragResult.factCheck.claims,
        sources: ragResult.factCheck.sources || [],
      },
    };
  }
  return {
    normalizedTranscript: geminiResult.normalizedTranscript,
    isFinancial: geminiResult.isFinancial,
    isMisleading: geminiResult.factCheck.claims.some((claim: { claim: string; isAccurate: boolean; explanation: string }) => !claim.isAccurate),
    factCheck: {
      claims: geminiResult.factCheck.claims,
      sources: geminiResult.factCheck.sources || [],
    },
  };
}

export async function normalizeTranscript(
  transcript: Record<string, TranscriptSegment[] | string>,
  additionalContext: string = ''
): Promise<FactCheckResult> {
  const allSegments: TranscriptSegment[] = [];
  const languages = ['en', 'hi', 'ta', 'bn', 'mr'];

  if (transcript['en'] && Array.isArray(transcript['en'])) {
    allSegments.push(...(transcript['en'] as TranscriptSegment[]));
  } else {
    for (const lang of languages) {
      if (transcript[lang] && Array.isArray(transcript[lang])) {
        allSegments.push(...(transcript[lang] as TranscriptSegment[]));
      }
    }
  }

  if (allSegments.length === 0) {
    console.warn('No valid transcript segments found:', transcript);
    return {
      normalizedTranscript: 'No translatable transcript available',
      isFinancial: false,
      isMisleading: false,
      factCheck: { claims: [], sources: [] },
    };
  }

  const combinedText = allSegments.map(t => t.text).join(' ').slice(0, 5000).trim();
  if (!combinedText) {
    console.warn('Combined transcript is empty');
    return {
      normalizedTranscript: 'No translatable transcript available',
      isFinancial: false,
      isMisleading: false,
      factCheck: { claims: [], sources: [] },
    };
  }

  const staticFacts = {
    'gold_2015': 'Average gold price in 2015 was Rs 26,400 per 10g (Rs 2,640/g). Source: https://www.bankbazaar.com/gold-rate/gold-rate-trend-in-india.html',
  };
  const context = combinedText.includes('gold') && combinedText.includes('2015') ? staticFacts['gold_2015'] : additionalContext;

  try {
    const [geminiResult, ragResult] = await Promise.all([
      runGeminiFactCheck(combinedText, context),
      runRAGFactCheck(combinedText),
    ]);
    return mergeResults(geminiResult, ragResult, combinedText);
  } catch (error) {
    logError('Fact-checking failure', { error, transcript: combinedText });
    return {
      normalizedTranscript: combinedText,
      isFinancial: false,
      isMisleading: false,
      factCheck: { claims: [], sources: [] },
    };
  }
}