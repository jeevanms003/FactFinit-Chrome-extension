export function extractYouTubeId(videoURL: string): string {
  const youtubeRegex = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/|live\/|watch\/|video\/)|youtu\.be\/|m\.youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/|live\/|watch\/|video\/))([a-zA-Z0-9_-]{11})/i;
  let cleanedURL = videoURL.trim();
  if (!cleanedURL.startsWith('http://') && !cleanedURL.startsWith('https://')) {
    cleanedURL = `https://${cleanedURL}`;
  }
  try {
    const url = new URL(cleanedURL);
    const match = cleanedURL.match(youtubeRegex);
    if (match && match[1]) {
      return match[1];
    }
    return '';
  } catch {
    return '';
  }
}