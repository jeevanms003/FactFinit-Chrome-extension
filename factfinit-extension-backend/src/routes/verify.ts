import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { VerifyRequest } from '../interfaces/verifyRequest';
import { TranscriptSegment } from '../interfaces/transcript';
import { FactCheckResult } from '../interfaces/factCheckResult';
import { detectPlatform } from '../utils/platformDetector';
import { extractYouTubeId } from '../utils/youtubeIdExtractor';
import { extractInstagramId } from '../utils/instagramIdExtractor';
import { fetchYouTubeTranscript } from '../services/youtubeTranscript';
import { fetchInstagramTranscript } from '../services/instagramTranscript';
import { normalizeTranscript } from '../services/factChecker';
import { TranscriptModel } from '../models/transcriptModel';

const router = Router();

router.post(
  '/',
  [
    body('videoURL').isURL().withMessage('Valid video URL is required'),
    body('platform').optional().isIn(['YouTube', 'Instagram']).withMessage('Invalid platform'),
    body('language').optional().isIn(['en', 'hi', 'ta', 'bn', 'mr']).withMessage('Unsupported language'),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { videoURL, platform: providedPlatform, language }: VerifyRequest = req.body;

      let cleanedURL = videoURL.trim();
      if (!cleanedURL.startsWith('http://') && !cleanedURL.startsWith('https://')) {
        cleanedURL = `https://${cleanedURL}`;
      }
      try {
        cleanedURL = new URL(cleanedURL).toString();
      } catch {
        throw new Error('Invalid video URL format');
      }

      const normalizedPlatform = providedPlatform
        ? providedPlatform.toLowerCase() === 'youtube'
          ? 'YouTube'
          : providedPlatform.toLowerCase() === 'instagram'
          ? 'Instagram'
          : providedPlatform
        : detectPlatform(cleanedURL);

      if (normalizedPlatform === 'Unknown') {
        throw new Error('Unsupported platform');
      }

      const cachedTranscript = await TranscriptModel.findOne({ videoURL: cleanedURL }).lean();
      if (cachedTranscript) {
        return res.status(200).json({
          message: 'Verification results retrieved from cache',
          data: {
            videoURL: cleanedURL,
            platform: normalizedPlatform,
            normalizedTranscript: cachedTranscript.normalizedTranscript,
            isFinancial: cachedTranscript.isFinancial,
            isMisleading: cachedTranscript.isMisleading,
            factCheck: cachedTranscript.factCheck,
          },
        });
      }

      const desiredLanguages = ['en', 'hi', 'ta', 'bn', 'mr'];
      if (language && !desiredLanguages.includes(language)) {
        desiredLanguages.push(language);
      }

      let transcript: Record<string, TranscriptSegment[] | string>;
      if (normalizedPlatform === 'YouTube') {
        const videoId = extractYouTubeId(cleanedURL);
        if (!videoId) {
          throw new Error('Could not extract YouTube video ID');
        }
        transcript = await fetchYouTubeTranscript(videoId, desiredLanguages);
      } else if (normalizedPlatform === 'Instagram') {
        const videoId = extractInstagramId(cleanedURL);
        if (!videoId) {
          throw new Error('Could not extract Instagram video ID');
        }
        transcript = await fetchInstagramTranscript(cleanedURL, desiredLanguages);
      } else {
        throw new Error('Platform not supported');
      }

      if (!transcript || Object.keys(transcript).length === 0) {
        return res.status(404).json({
          message: 'Transcript not found for this video.',
        });
      }

      const factCheckResult: FactCheckResult = await normalizeTranscript(transcript);
      const isMisleading = factCheckResult.factCheck.claims.some(claim => !claim.isAccurate);

      await TranscriptModel.create({
        videoURL: cleanedURL,
        platform: normalizedPlatform,
        transcript,
        normalizedTranscript: factCheckResult.normalizedTranscript,
        isFinancial: factCheckResult.isFinancial,
        isMisleading,
        factCheck: factCheckResult.factCheck,
      });

      res.status(200).json({
        message: 'Video verified successfully',
        data: {
          videoURL: cleanedURL,
          platform: normalizedPlatform,
          normalizedTranscript: factCheckResult.normalizedTranscript,
          isFinancial: factCheckResult.isFinancial,
          isMisleading,
          factCheck: factCheckResult.factCheck,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;