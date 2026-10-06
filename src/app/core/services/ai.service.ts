import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { ServiceDiscoveryRequest, ServiceDiscoveryResult } from '../models/ai.models';

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  discoverServices(request: ServiceDiscoveryRequest): Observable<ApiResponse<ServiceDiscoveryResult>> {
    return this.http.post<ApiResponse<ServiceDiscoveryResult>>(this.baseUrl + '/ai/service-discovery', request);
  }
}
