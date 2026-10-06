import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isMenuOpen = signal<boolean>(false);
  readonly isProfileMenuOpen = signal<boolean>(false);

  toggleMobileMenu(): void {
    this.isMenuOpen.update(v => !v);
  }

  closeMobileMenu(): void {
    this.isMenuOpen.set(false);
  }

  toggleProfileMenu(): void {
    this.isProfileMenuOpen.update(v => !v);
  }

  closeProfileMenu(): void {
    this.isProfileMenuOpen.set(false);
  }

  goToServiceMode(): void {
    this.closeProfileMenu();
    this.closeMobileMenu();
    this.router.navigate(['/service-mode']);
  }

  logout(): void {
    this.closeProfileMenu();
    this.closeMobileMenu();
    this.auth.logout();
  }

  getUserInitials(): string {
    const user = this.auth.currentUser();
    if (!user || !user.fullName) return 'U';
    const parts = user.fullName.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.fullName.substring(0, 2).toUpperCase();
  }
}
