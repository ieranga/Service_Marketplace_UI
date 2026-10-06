export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  phoneNumber: string;
  password: string;
  nic?: string;
  city?: string;
  address?: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  role: string | number;
  roleId?: number;
  status: string | number;
  nic?: string;
  hasServiceProfile?: boolean;
}

export interface LoginResponse {
  token: string;
  userId?: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  role?: string | number;
  roleId?: number;
  status?: string | number;
  hasServiceProfile?: boolean;
  expiresAt?: string;
  user?: User;
}
