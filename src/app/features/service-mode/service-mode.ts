import { Component, inject, OnInit, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { AuthService } from '../../core/services/auth.service';
import { 
  ProviderServiceListing, 
  UserJob, 
  Category, 
  ServiceVariant, 
  ServiceProfile,
  UpdateServiceProfileRequest 
} from '../../core/models/marketplace.models';

@Component({
  selector: 'app-service-mode',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './service-mode.html',
  styleUrl: './service-mode.css'
})
export class ServiceModeComponent implements OnInit {
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  // Data signals
  myServices = signal<ProviderServiceListing[]>([]);
  incomingJobs = signal<UserJob[]>([]);
  categories = signal<Category[]>([]);
  availableVariants = signal<ServiceVariant[]>([]);

  // State signals
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  isSavingProfile = signal<boolean>(false);
  showCreateModal = signal<boolean>(false);
  showProfileModal = signal<boolean>(false);
  hasServiceProfile = signal<boolean>(!!this.auth.currentUser()?.hasServiceProfile);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Service Profile Form Model
  profileBusinessName = signal<string>('');
  profileBio = signal<string>('');
  profileServiceAreas = signal<string>('Negombo, Katunayake, Colombo');

  // New Service Listing Form Model
  newServiceVariantId = signal<number | null>(null);
  newServicePrice = signal<number>(2500);
  newServiceUnit = signal<string>('Per Job');
  newServiceDescription = signal<string>('');
  newServiceHomeVisit = signal<boolean>(true);
  newServiceCities = signal<string>('Negombo, Katunayake');

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initProfileFields();
      this.loadData();
    }
  }

  private initProfileFields(): void {
    const user = this.auth.currentUser();
    if (user) {
      this.profileBusinessName.set(user.fullName + ' Services');
      this.profileBio.set('Professional service provider offering high quality and reliable services.');
    }
  }

  loadData(): void {
    this.isLoading.set(true);

    this.marketplaceService.getMyServices().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.myServices.set(res.data);
          if (res.data.length > 0) {
            this.hasServiceProfile.set(true);
            this.auth.updateCurrentUserProfileStatus(true);
            if (res.data[0].businessName) {
              this.profileBusinessName.set(res.data[0].businessName);
            }
          }
        }
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });

    this.marketplaceService.getJobs().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.incomingJobs.set(res.data);
        }
      }
    });

    this.marketplaceService.getCatalog().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.categories.set(res.data);
          const variants: ServiceVariant[] = [];
          res.data.forEach(c => {
            c.services?.forEach(s => {
              s.variants?.forEach(v => {
                variants.push({
                  ...v,
                  serviceName: s.name,
                  categoryName: c.name
                });
              });
            });
          });
          this.availableVariants.set(variants);
          if (variants.length > 0 && !this.newServiceVariantId()) {
            this.newServiceVariantId.set(variants[0].id);
          }
        }
      }
    });
  }

  openCreateModal(): void {
    if (!this.hasServiceProfile()) {
      this.feedbackMessage.set({ type: 'error', text: 'You must set up your Service Profile before offering services.' });
      this.openProfileModal();
      return;
    }
    this.feedbackMessage.set(null);
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  openProfileModal(): void {
    this.feedbackMessage.set(null);
    this.showProfileModal.set(true);
  }

  closeProfileModal(): void {
    this.showProfileModal.set(false);
  }

  saveProfile(): void {
    this.isSavingProfile.set(true);
    this.feedbackMessage.set(null);

    const areas = this.profileServiceAreas()
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    const businessName = this.profileBusinessName().trim() || undefined;
    const bio = this.profileBio().trim() || undefined;

    if (!this.hasServiceProfile()) {
      // 1. Create Service Profile
      this.marketplaceService.createServiceProfile({
        businessName,
        bio,
        serviceAreaCities: areas
      }).subscribe({
        next: (res) => {
          this.isSavingProfile.set(false);
          if (res.success) {
            this.hasServiceProfile.set(true);
            this.auth.updateCurrentUserProfileStatus(true);
            this.feedbackMessage.set({ type: 'success', text: 'Service Profile created! You can now offer new services.' });
            this.closeProfileModal();
            this.loadData();
          } else {
            this.feedbackMessage.set({ type: 'error', text: res.message || 'Failed to create service profile.' });
          }
        },
        error: (err) => {
          this.isSavingProfile.set(false);
          // If profile was already present on backend, update local status
          if (err?.error?.message?.includes('already exists')) {
            this.hasServiceProfile.set(true);
            this.auth.updateCurrentUserProfileStatus(true);
            this.saveProfile();
          } else {
            this.feedbackMessage.set({ type: 'error', text: err.error?.message || 'Error creating service profile.' });
          }
        }
      });
    } else {
      // 2. Update Service Profile
      this.marketplaceService.updateServiceProfile({
        businessName,
        bio,
        serviceAreaCities: areas
      }).subscribe({
        next: (res) => {
          this.isSavingProfile.set(false);
          if (res.success) {
            this.auth.updateCurrentUserProfileStatus(true);
            this.feedbackMessage.set({ type: 'success', text: 'Service Profile updated successfully!' });
            this.closeProfileModal();
          } else {
            this.feedbackMessage.set({ type: 'error', text: res.message || 'Failed to update service profile.' });
          }
        },
        error: (err) => {
          this.isSavingProfile.set(false);
          this.feedbackMessage.set({ type: 'error', text: err.error?.message || 'Error updating service profile.' });
        }
      });
    }
  }

  submitNewService(): void {
    const variantId = this.newServiceVariantId();
    if (!variantId) {
      this.feedbackMessage.set({ type: 'error', text: 'Please select a service variant.' });
      return;
    }

    this.isSubmitting.set(true);
    this.feedbackMessage.set(null);

    const cities = this.newServiceCities()
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    this.marketplaceService.createService({
      serviceVariantId: variantId,
      startingPrice: this.newServicePrice(),
      priceUnit: this.newServiceUnit(),
      description: this.newServiceDescription().trim() || undefined,
      supportsHomeVisit: this.newServiceHomeVisit(),
      serviceAreaCities: cities,
      tagIds: []
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        if (res.success) {
          this.auth.updateCurrentUserProfileStatus(true);
          this.feedbackMessage.set({ type: 'success', text: 'Service listing created successfully!' });
          this.closeCreateModal();
          this.loadData();
        } else {
          this.feedbackMessage.set({ type: 'error', text: res.message || 'Failed to create service.' });
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.feedbackMessage.set({ type: 'error', text: err.error?.message || 'Error creating service listing.' });
      }
    });
  }

  deleteService(id: string): void {
    if (!confirm('Are you sure you want to remove this service listing?')) return;

    this.marketplaceService.deleteService(id).subscribe({
      next: (res) => {
        if (res.success) {
          this.myServices.update(list => list.filter(s => s.id !== id));
        } else {
          alert(res.message || 'Failed to delete service.');
        }
      },
      error: () => alert('Failed to delete service.')
    });
  }

  exitServiceMode(): void {
    this.router.navigate(['/dashboard']);
  }
}
