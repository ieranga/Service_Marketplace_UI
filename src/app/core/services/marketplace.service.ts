import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { 
  Category, 
  Tag, 
  ProviderServiceListing, 
  CreateProviderServiceDto, 
  UserJob,
  ReceiverJob, 
  CreateReceiverJobDto,
  ServiceProfile,
  CreateServiceProfileRequest,
  UpdateServiceProfileRequest
} from '../models/marketplace.models';

@Injectable({
  providedIn: 'root'
})
export class MarketplaceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  // Catalog
  getCatalog(): Observable<ApiResponse<Category[]>> {
    return this.http.get<ApiResponse<Category[]>>(this.baseUrl + '/marketplace/catalog');
  }

  getCategories(): Observable<ApiResponse<Category[]>> {
    return this.http.get<ApiResponse<Category[]>>(this.baseUrl + '/marketplace/categories');
  }

  getTags(): Observable<ApiResponse<Tag[]>> {
    return this.http.get<ApiResponse<Tag[]>>(this.baseUrl + '/marketplace/tags');
  }

  // Service Profile (Service Mode)
  createServiceProfile(dto: CreateServiceProfileRequest): Observable<ApiResponse<ServiceProfile>> {
    return this.http.post<ApiResponse<ServiceProfile>>(this.baseUrl + '/auth/createServiceProfile', dto);
  }

  updateServiceProfile(dto: UpdateServiceProfileRequest): Observable<ApiResponse<ServiceProfile>> {
    return this.http.post<ApiResponse<ServiceProfile>>(this.baseUrl + '/auth/updateServiceProfile', dto);
  }

  // Provider Services (in Service Mode)
  getServices(filters?: { location?: string; searchTerm?: string; categoryId?: number; maxPrice?: number }): Observable<ApiResponse<ProviderServiceListing[]>> {
    let params = new HttpParams();
    if (filters?.location) params = params.set('location', filters.location);
    if (filters?.searchTerm) params = params.set('searchTerm', filters.searchTerm);
    if (filters?.categoryId) params = params.set('categoryId', filters.categoryId.toString());
    if (filters?.maxPrice) params = params.set('maxPrice', filters.maxPrice.toString());

    return this.http.get<ApiResponse<ProviderServiceListing[]>>(this.baseUrl + '/listings/services', { params });
  }

  getMyServices(): Observable<ApiResponse<ProviderServiceListing[]>> {
    return this.http.get<ApiResponse<ProviderServiceListing[]>>(this.baseUrl + '/listings/myServices');
  }

  createService(dto: CreateProviderServiceDto): Observable<ApiResponse<ProviderServiceListing>> {
    return this.http.post<ApiResponse<ProviderServiceListing>>(this.baseUrl + '/listings/createService', dto);
  }

  deleteService(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(this.baseUrl + '/listings/deleteService/' + id);
  }

  // User Jobs (Main User Account Jobs)
  getJobs(filters?: { location?: string; searchTerm?: string; categoryId?: number; maxBudget?: number }): Observable<ApiResponse<UserJob[]>> {
    let params = new HttpParams();
    if (filters?.location) params = params.set('location', filters.location);
    if (filters?.searchTerm) params = params.set('searchTerm', filters.searchTerm);
    if (filters?.categoryId) params = params.set('categoryId', filters.categoryId.toString());
    if (filters?.maxBudget) params = params.set('maxBudget', filters.maxBudget.toString());

    return this.http.get<ApiResponse<UserJob[]>>(this.baseUrl + '/listings/searchJobs', { params });
  }

  getMyJobs(): Observable<ApiResponse<UserJob[]>> {
    return this.http.get<ApiResponse<UserJob[]>>(this.baseUrl + '/listings/myJobs');
  }

  createJob(dto: CreateReceiverJobDto): Observable<ApiResponse<UserJob>> {
    return this.http.post<ApiResponse<UserJob>>(this.baseUrl + '/listings/createJob', dto);
  }

  deleteJob(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(this.baseUrl + '/listings/deleteJob/' + id);
  }
}
