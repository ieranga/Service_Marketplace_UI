import { Component, inject, OnInit, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AiService } from '../../core/services/ai.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { AuthService } from '../../core/services/auth.service';
import { ServiceDiscoveryResult } from '../../core/models/ai.models';
import { ProviderServiceListing, UserJob, Category, ServiceVariant } from '../../core/models/marketplace.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  private readonly aiService = inject(AiService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly platformId = inject(PLATFORM_ID);
  readonly auth = inject(AuthService);

  // AI Search state
  aiQuery = signal<string>('I need someone to wash my car at my home in Negombo this weekend');
  aiLocation = signal<string>('Negombo');
  isAiSearching = signal<boolean>(false);
  aiResult = signal<ServiceDiscoveryResult | null>(null);
  aiError = signal<string | null>(null);

  // Marketplace Listings state
  activeTab = signal<'all' | 'services' | 'jobs'>('all');
  services = signal<ProviderServiceListing[]>([]);
  jobs = signal<UserJob[]>([]);
  categories = signal<Category[]>([]);
  availableVariants = signal<ServiceVariant[]>([]);
  isLoadingMarketplace = signal<boolean>(false);
  selectedCategory = signal<number | null>(null);
  locationFilter = signal<string>('');

  // Job Creation Modal state (Main User account)
  showCreateJobModal = signal<boolean>(false);
  isSubmittingJob = signal<boolean>(false);
  jobFeedbackMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  newJobTitle = signal<string>('');
  newJobVariantId = signal<number | null>(null);
  newJobBudget = signal<number>(5000);
  newJobUrgency = signal<string>('This Weekend');
  newJobCity = signal<string>('Negombo');
  newJobAddress = signal<string>('');
  newJobPaymentMethod = signal<string>('Cash');
  newJobDescription = signal<string>('');

  // Sample prompt chips
  readonly samplePrompts = [
    'Wash my car at home in Negombo this weekend',
    'Repair laptop blue screen crash near Negombo',
    'Deep clean my 3-bedroom house under Rs. 10000',
    'AC gas charging and servicing in Katunayake'
  ];

  // Computed filtered lists based on selected category chip
  readonly filteredServices = computed(() => {
    const cat = this.selectedCategory();
    const list = this.services();
    return cat ? list.filter(s => s.categoryId === cat) : list;
  });

  readonly filteredJobs = computed(() => {
    const cat = this.selectedCategory();
    const list = this.jobs();
    if (!cat) return list;
    const catObj = this.categories().find(c => c.id === cat);
    return catObj ? list.filter(j => j.categoryName?.toLowerCase() === catObj.name.toLowerCase()) : list;
  });

  readonly totalCreatedCount = computed(() => {
    return this.filteredServices().length + this.filteredJobs().length;
  });

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadMarketplaceData();
      this.loadCategories();
    }
  }

  runAiSearch(customQuery?: string): void {
    const query = customQuery || this.aiQuery().trim();
    if (!query) return;

    this.aiQuery.set(query);
    this.isAiSearching.set(true);
    this.aiError.set(null);

    this.aiService.discoverServices({
      query,
      preferredLocation: this.aiLocation().trim() || undefined
    }).subscribe({
      next: (res) => {
        this.isAiSearching.set(false);
        if (res.success && res.data) {
          this.aiResult.set(res.data);
        } else {
          this.aiError.set(res.message || 'No matches found.');
        }
      },
      error: (err) => {
        this.isAiSearching.set(false);
        this.aiError.set(err.error?.message || 'AI service discovery encountered an error.');
      }
    });
  }

  loadMarketplaceData(): void {
    this.isLoadingMarketplace.set(true);

    if (this.auth.isMarketplaceUser()) {
      // Role ID = 1: Load ONLY services and jobs created by the authenticated user
      this.marketplaceService.getMyServices().subscribe({
        next: (res) => {
          this.services.set(res.success && res.data ? res.data : []);
          this.isLoadingMarketplace.set(false);
        },
        error: () => {
          this.services.set([]);
          this.isLoadingMarketplace.set(false);
        }
      });

      this.marketplaceService.getMyJobs().subscribe({
        next: (res) => {
          this.jobs.set(res.success && res.data ? res.data : []);
        },
        error: () => {
          this.jobs.set([]);
        }
      });
    } else {
      // Guests / Admins: Load all public services and jobs with optional server filters
      const filter = {
        location: this.locationFilter().trim() || undefined,
        categoryId: this.selectedCategory() || undefined
      };

      this.marketplaceService.getServices(filter).subscribe({
        next: (res) => {
          this.services.set(res.success && res.data ? res.data : []);
          this.isLoadingMarketplace.set(false);
        },
        error: () => {
          this.services.set([]);
          this.isLoadingMarketplace.set(false);
        }
      });

      this.marketplaceService.getJobs(filter).subscribe({
        next: (res) => {
          this.jobs.set(res.success && res.data ? res.data : []);
        },
        error: () => {
          this.jobs.set([]);
        }
      });
    }
  }

  loadCategories(): void {
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
        }
      }
    });
  }

  setTab(tab: 'all' | 'services' | 'jobs'): void {
    this.activeTab.set(tab);
  }

  selectCategory(catId: number | null): void {
    this.selectedCategory.set(catId);
    if (!this.auth.isMarketplaceUser()) {
      this.loadMarketplaceData();
    }
  }

  onLocationFilterChange(): void {
    if (!this.auth.isMarketplaceUser()) {
      this.loadMarketplaceData();
    }
  }

  openCreateJobModal(initialTitle?: string): void {
    if (initialTitle) {
      this.newJobTitle.set(initialTitle);
    }
    this.jobFeedbackMessage.set(null);
    this.showCreateJobModal.set(true);
  }

  closeCreateJobModal(): void {
    this.showCreateJobModal.set(false);
  }

  submitNewJob(): void {
    if (!this.newJobTitle().trim()) {
      this.jobFeedbackMessage.set({ type: 'error', text: 'Please enter a job title.' });
      return;
    }

    this.isSubmittingJob.set(true);
    this.jobFeedbackMessage.set(null);

    this.marketplaceService.createJob({
      title: this.newJobTitle().trim(),
      serviceVariantId: this.newJobVariantId() || undefined,
      budget: this.newJobBudget(),
      urgencyOrPreferredDate: this.newJobUrgency(),
      paymentMethod: this.newJobPaymentMethod(),
      description: this.newJobDescription().trim() || undefined,
      tagIds: [],
      jobAreas: [
        {
          cityName: this.newJobCity().trim() || 'Negombo',
          address: this.newJobAddress().trim() || undefined
        }
      ]
    }).subscribe({
      next: (res) => {
        this.isSubmittingJob.set(false);
        if (res.success) {
          this.closeCreateJobModal();
          this.loadMarketplaceData();
        } else {
          this.jobFeedbackMessage.set({ type: 'error', text: res.message || 'Failed to post job.' });
        }
      },
      error: (err) => {
        this.isSubmittingJob.set(false);
        this.jobFeedbackMessage.set({ type: 'error', text: err.error?.message || 'Error posting job.' });
      }
    });
  }

  deleteJob(id: string): void {
    if (!confirm('Are you sure you want to cancel and remove this job request?')) return;

    this.marketplaceService.deleteJob(id).subscribe({
      next: (res) => {
        if (res.success) {
          this.jobs.update(list => list.filter(j => j.id !== id));
        } else {
          alert(res.message || 'Failed to delete job.');
        }
      },
      error: () => alert('Failed to delete job.')
    });
  }
}
