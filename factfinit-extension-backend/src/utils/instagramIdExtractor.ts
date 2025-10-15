export function extractInstagramId(videoURL: string): string {
  const instagramRegex = /instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/i;
  let cleanedURL = videoURL.trim();
  if (!cleanedURL.startsWith('http://') && !cleanedURL.startsWith('https://')) {
    cleanedURL = `https://${cleanedURL}`;
  }
  try {
    const url = new URL(cleanedURL);
    const match = cleanedURL.match(instagramRegex);
    if (match && match[1]) {
      return match[1];
    }
    return '';
  } catch {
    return '';
  }
}