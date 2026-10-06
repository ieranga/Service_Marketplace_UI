import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  // Provider and Receiver routes are only accessible by users with Role ID = 1
  if (!authService.isMarketplaceUser()) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
