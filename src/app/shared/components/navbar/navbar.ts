import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { JobModalService } from '../../../core/services/job-modal.service';
import { CreateJobModalComponent } from '../create-job-modal/create-job-modal';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, CreateJobModalComponent],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly jobModal = inject(JobModalService);
  private readonly router = inject(Router);

  readonly isProfileMenuOpen = signal<boolean>(false);

  closeMobileMenu(): void {
    this.closeProfileMenu();
  }
toggleProfileMenu(): void {
    this.isProfileMenuOpen.update(v => !v);
  }

  closeProfileMenu(): void {
    this.isProfileMenuOpen.set(false);
  }

  openCreateJobModal(): void {
    this.closeProfileMenu();
    this.jobModal.open();
  }

  goToJobOfferMode(): void {
    this.closeProfileMenu();
    this.router.navigate(['/dashboard']);
  }

    goToServiceMode(): void {
    this.closeProfileMenu();
    this.router.navigate(['/service-mode']);
  }

  logout(): void {
    this.closeProfileMenu();
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
