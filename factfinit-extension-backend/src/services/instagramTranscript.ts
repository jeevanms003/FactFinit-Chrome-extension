import { Supadata } from '@supadata/js';
import { TranscriptSegment } from '../interfaces/transcript';
import dotenv from 'dotenv';

dotenv.config();

const supadata = new Supadata({ apiKey: process.env.SUPADATA_API_KEY! });

export async function fetchInstagramTranscript(
  videoURL: string,
  languages: string[]
): Promise<Record<string, TranscriptSegment[] | string>> {
  const result: Record<string, TranscriptSegment[] | string> = {};

  const transcriptPromises = languages.map(async (lang) => {
    try {
      const transcriptRaw = await supadata.transcript({
        url: videoURL,
        lang,
        text: true,
        mode: 'auto',
      });

      // If transcriptRaw is an array of segments with text
      if (Array.isArray(transcriptRaw)) {
        return {
          lang,
          data: transcriptRaw.map((segment: any) => ({
            text: segment.text || segment,
            start: segment.start || 0,
            duration: segment.duration || undefined,
            lang,
          })),
        };
      }

      // If it's a single string response
      return {
        lang,
        data: [
          {
            text: typeof transcriptRaw === 'string' ? transcriptRaw : JSON.stringify(transcriptRaw),
            start: 0,
            duration: undefined,
            lang,
          },
        ],
      };
    } catch (error) {
      console.error(`Failed to fetch Instagram transcript for ${lang}:`, error);
      return { lang, data: `Transcript not available in ${lang}` };
    }
  });

  const results = await Promise.all(transcriptPromises);
  results.forEach(({ lang, data }) => {
    result[lang] = data;
  });

  return result;
}