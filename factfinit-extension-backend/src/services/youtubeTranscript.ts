import { TranscriptSegment } from '../interfaces/transcript';

export async function fetchYouTubeTranscript(
  videoId: string,
  languages: string[]
): Promise<Record<string, TranscriptSegment[] | string>> {
  const result: Record<string, TranscriptSegment[] | string> = {};
  const { fetchTranscript } = await import('youtube-transcript-plus');

  const transcriptPromises = languages.map(async (lang) => {
    try {
      const transcriptRaw = await fetchTranscript(videoId, { lang });
      return {
        lang,
        data: transcriptRaw.map(segment => ({
          text: segment.text,
          start: segment.offset / 1000,
          duration: segment.duration ? segment.duration / 1000 : undefined,
          lang,
        })),
      };
    } catch (error) {
      console.error(`Failed to fetch YouTube transcript for ${lang}:`, error);
      return { lang, data: `Transcript not available in ${lang}` };
    }
  });

  const results = await Promise.all(transcriptPromises);
  results.forEach(({ lang, data }) => {
    result[lang] = data;
  });

  return result;
}