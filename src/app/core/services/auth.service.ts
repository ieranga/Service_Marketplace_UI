import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { LoginRequest, LoginResponse, RegisterRequest, User } from '../models/auth.models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly TOKEN_KEY = 'sm_auth_token';
  private readonly USER_KEY = 'sm_auth_user';

  readonly currentUser = signal<User | null>(this.getStoredUser());
  readonly isAuthenticated = computed(() => !!this.currentUser());

  /**
   * Only Role ID = 1 (User) can access Service Mode and create services/jobs.
   * Admins (Role ID = 2) and SuperAdmins (Role ID = 3) are not marketplace users.
   */
  readonly isMarketplaceUser = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    const roleId = user.roleId !== undefined && user.roleId !== null ? Number(user.roleId) : undefined;
    if (roleId !== undefined && !isNaN(roleId)) {
      return roleId === 1;
    }
    const roleStr = String(user.role || '').toLowerCase();
    return roleStr === 'user' || roleStr === '1';
  });

  readonly isSuperAdmin = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    const roleId = user.roleId !== undefined && user.roleId !== null ? Number(user.roleId) : undefined;
    if (roleId !== undefined && !isNaN(roleId)) {
      return roleId === 3;
    }
    return String(user.role || '').toLowerCase() === 'superadmin';
  });

  readonly isAdmin = computed(() => {
    const user = this.currentUser();
    if (!user) return false;
    const roleId = user.roleId !== undefined && user.roleId !== null ? Number(user.roleId) : undefined;
    if (roleId !== undefined && !isNaN(roleId)) {
      return roleId === 2;
    }
    return String(user.role || '').toLowerCase() === 'admin';
  });

  login(credentials: LoginRequest): Observable<ApiResponse<LoginResponse>> {
    return this.http.post<ApiResponse<LoginResponse>>(environment.apiUrl + '/auth/login', credentials).pipe(
      tap(res => {
        if (res.success && res.data) {
          const roleId = res.data.roleId !== undefined 
            ? Number(res.data.roleId) 
            : (typeof res.data.role === 'number' 
                ? res.data.role 
                : (res.data.role === 'User' ? 1 : res.data.role === 'Admin' ? 2 : res.data.role === 'SuperAdmin' ? 3 : 1));

          const u: User = res.data.user || {
            id: res.data.userId || '',
            fullName: res.data.fullName || '',
            email: res.data.email || credentials.email,
            phoneNumber: res.data.phoneNumber || '',
            role: res.data.role || (roleId === 1 ? 'User' : roleId === 2 ? 'Admin' : 'SuperAdmin'),
            roleId: roleId,
            status: res.data.status || 'Active',
            hasServiceProfile: res.data.hasServiceProfile ?? false
          };
          this.saveAuth(res.data.token, u);
        }
      })
    );
  }

  register(data: RegisterRequest): Observable<ApiResponse<User>> {
    return this.http.post<ApiResponse<User>>(environment.apiUrl + '/auth/register', data);
  }

  logout(): void {
    if (this.isBrowser) {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    }
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  updateCurrentUserProfileStatus(hasServiceProfile: boolean): void {
    const current = this.currentUser();
    if (current) {
      const updated = { ...current, hasServiceProfile };
      this.currentUser.set(updated);
      if (this.isBrowser) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(updated));
      }
    }
  }

  getToken(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private saveAuth(token: string, user: User): void {
    if (this.isBrowser) {
      localStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    }
    this.currentUser.set(user);
  }

  private getStoredUser(): User | null {
    if (!this.isBrowser) return null;
    try {
      const data = localStorage.getItem(this.USER_KEY);
      if (!data) return null;
      return JSON.parse(data) as User;
    } catch {
      return null;
    }
  }
}
