export interface ServiceDiscoveryRequest {
  query: string;
  userLatitude?: number;
  userLongitude?: number;
  preferredLocation?: string;
}

export interface ExtractedRequirements {
  rawQuery: string;
  detectedIntent: string;
  categoryId?: number;
  categoryName?: string;
  serviceId?: number;
  serviceName?: string;
  variantId?: number;
  variantName?: string;
  extractedTags: string[];
  location?: string;
  maxBudget?: number;
  urgencyOrDate?: string;
  confidenceScore: number;
  isCatalogMatched: boolean;
}

export interface MatchedProvider {
  providerServiceId: string;
  providerProfileId: string;
  businessOrProviderName: string;
  isVerified: boolean;
  ratingAverage: number;
  completedJobsCount: number;
  startingPrice: number;
  priceUnit: string;
  serviceVariantName: string;
  categoryName: string;
  coverageAreas: string[];
  supportsHomeVisit: boolean;
  matchScore: number;
  matchReason: string;
}

export interface ServiceDiscoveryResult {
  extractedRequirements: ExtractedRequirements;
  matchedProviders: MatchedProvider[];
  totalMatches: number;
  engineUsed: string;
  processedAt: string;
}