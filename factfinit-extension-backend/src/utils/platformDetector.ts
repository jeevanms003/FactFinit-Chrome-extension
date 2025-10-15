export function detectPlatform(videoURL: string): 'YouTube' | 'Instagram' | 'Unknown' {
  if (/youtube\.com|youtu\.be/.test(videoURL)) return 'YouTube';
  if (/instagram\.com/.test(videoURL)) return 'Instagram';
  return 'Unknown';
}