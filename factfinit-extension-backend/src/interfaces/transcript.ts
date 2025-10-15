export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number | undefined;
  lang: string;
}