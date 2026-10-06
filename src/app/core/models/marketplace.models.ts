export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  services?: Service[];
}

export interface Service {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
  description?: string;
  variants?: ServiceVariant[];
}

export interface ServiceVariant {
  id: number;
  serviceId: number;
  serviceName?: string;
  categoryName?: string;
  name: string;
  slug: string;
  description?: string;
  suggestedStartingPrice?: number;
  tags?: string[];
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  tagGroup?: string;
}

export interface ProviderServiceListing {
  id: string;
  providerServiceProfileId?: string;
  providerProfileId?: string;
  providerName: string;
  businessName?: string;
  providerBio?: string;
  isVerified: boolean;
  ratingAverage: number;
  reviewCount: number;
  completedJobsCount: number;
  categoryId: number;
  categoryName: string;
  serviceId: number;
  serviceName: string;
  variantId: number;
  variantName: string;
  startingPrice: number;
  priceUnit: string;
  description?: string;
  supportsHomeVisit: boolean;
  serviceAreas: string[];
  tags: string[];
}

export interface CreateProviderServiceDto {
  serviceVariantId: number;
  startingPrice: number;
  priceUnit: string;
  description?: string;
  supportsHomeVisit: boolean;
  tagIds: number[];
  serviceAreaCities: string[];
}

export interface ServiceProfile {
  id: string;
  userId: string;
  userFullName: string;
  businessName?: string;
  businessRegistrationNumber?: string;
  bio?: string;
  isVerified: boolean;
  verificationStatus: string;
  ratingAverage: number;
  reviewCount: number;
  completedJobsCount: number;
  serviceAreas: string[];
  updatedAt: string;
}

export interface CreateServiceProfileRequest {
  businessName?: string;
  businessRegistrationNumber?: string;
  bio?: string;
  serviceAreaCities?: string[];
}

export interface UpdateServiceProfileRequest {
  businessName?: string;
  businessRegistrationNumber?: string;
  bio?: string;
  serviceAreaCities?: string[];
}

export interface UserJob {
  id: string;
  receiverProfileId?: string;
  userId: string;
  receiverName: string;
  receiverPhone?: string;
  serviceVariantId?: number;
  serviceVariantName?: string;
  serviceName?: string;
  categoryName?: string;
  title: string;
  description?: string;
  budget?: number;
  paymentMethod: string;
  status: string;
  urgencyOrPreferredDate?: string;
  expectedDate?: string;
  createdAt: string;
  updatedAt?: string;
  jobAreas: UserJobArea[];
  tags: string[];
}

export type ReceiverJob = UserJob;

export interface UserJobArea {
  id: string;
  cityName: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export type ReceiverJobArea = UserJobArea;

export interface CreateReceiverJobDto {
  serviceVariantId?: number;
  title: string;
  description?: string;
  budget?: number;
  paymentMethod?: string;
  urgencyOrPreferredDate?: string;
  expectedDate?: string;
  tagIds: number[];
  jobAreas: {
    cityName: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  }[];
}

export type CreateUserJobDto = CreateReceiverJobDto;