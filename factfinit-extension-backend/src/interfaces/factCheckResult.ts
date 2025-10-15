export interface FactCheckResult {
  normalizedTranscript: string;
  isFinancial: boolean;
  isMisleading: boolean;
  factCheck: {
    claims: Array<{ claim: string; isAccurate: boolean; explanation: string }>;
    sources?: Array<{ title: string; url: string; snippet: string }>;
  };
}