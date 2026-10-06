import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketplaceService } from '../../../core/services/marketplace.service';
import { JobModalService } from '../../../core/services/job-modal.service';
import { AuthService } from '../../../core/services/auth.service';
import { Category, ServiceVariant } from '../../../core/models/marketplace.models';

@Component({
  selector: 'app-create-job-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-job-modal.html',
  styleUrl: './create-job-modal.css'
})
export class CreateJobModalComponent implements OnInit {
  readonly modalService = inject(JobModalService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  categories = signal<Category[]>([]);
  availableVariants = signal<ServiceVariant[]>([]);

  title = signal<string>('');
  selectedCategoryId = signal<number | null>(null);
  selectedVariantId = signal<number | null>(null);
  budget = signal<number>(5000);
  urgency = signal<string>('This Weekend');
  paymentMethod = signal<string>('Cash');
  city = signal<string>('Negombo');
  address = signal<string>('');
  description = signal<string>('');

  isSubmitting = signal<boolean>(false);
  feedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  ngOnInit(): void {
    this.loadCatalog();
    const userCity = this.auth.currentUser()?.city;
    if (userCity) {
      this.city.set(userCity);
    }
  }

  loadCatalog(): void {
    this.marketplaceService.getCatalog().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.categories.set(res.data);
        }
      },
      error: () => {
        // Fallback to getCategories if getCatalog is unavailable
        this.marketplaceService.getCategories().subscribe({
          next: (r) => {
            if (r.success && r.data) {
              this.categories.set(r.data);
            }
          }
        });
      }
    });
  }

  onCategoryChange(catId: number | null): void {
    this.selectedCategoryId.set(catId);
    this.selectedVariantId.set(null);

    if (catId === null) {
      this.availableVariants.set([]);
      return;
    }

    const cat = this.categories().find(c => c.id === catId);
    if (cat && cat.services) {
      const variants: ServiceVariant[] = [];
      for (const s of cat.services) {
        if (s.variants) {
          for (const v of s.variants) {
            variants.push({
              ...v,
              serviceName: s.name,
              categoryName: cat.name
            });
          }
        }
      }
      this.availableVariants.set(variants);
    } else {
      this.availableVariants.set([]);
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close(): void {
    this.feedbackMessage.set(null);
    this.modalService.close();
  }

  submitJob(): void {
    if (!this.title().trim()) {
      this.feedbackMessage.set({ type: 'error', text: 'Please enter a title for your job request.' });
      return;
    }

    if (!this.city().trim()) {
      this.feedbackMessage.set({ type: 'error', text: 'Please specify the city/location for the job.' });
      return;
    }

    this.isSubmitting.set(true);
    this.feedbackMessage.set(null);

    this.marketplaceService.createJob({
      title: this.title().trim(),
      serviceVariantId: this.selectedVariantId() || undefined,
      budget: this.budget() > 0 ? this.budget() : undefined,
      urgencyOrPreferredDate: this.urgency(),
      paymentMethod: this.paymentMethod(),
      description: this.description().trim() || undefined,
      tagIds: [],
      jobAreas: [
        {
          cityName: this.city().trim(),
          address: this.address().trim() || undefined
        }
      ]
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        if (res.success) {
          this.feedbackMessage.set({ type: 'success', text: 'Job request posted successfully!' });
          // Reset fields
          this.title.set('');
          this.description.set('');
          this.selectedCategoryId.set(null);
          this.selectedVariantId.set(null);

          // Notify dashboard listeners to refresh listings
          this.modalService.notifyJobCreated();

          setTimeout(() => {
            this.close();
            // Navigate to dashboard if not already there
            this.router.navigate(['/dashboard']);
          }, 900);
        } else {
          this.feedbackMessage.set({ type: 'error', text: res.message || 'Failed to create job.' });
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        const errMsg = err?.error?.message || 'Server error while creating job. Please try again.';
        this.feedbackMessage.set({ type: 'error', text: errMsg });
      }
    });
  }
}
