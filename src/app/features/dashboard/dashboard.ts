import { Component, inject, OnInit, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../core/services/ai.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { AuthService } from '../../core/services/auth.service';
import { JobModalService } from '../../core/services/job-modal.service';
import { ServiceDiscoveryResult } from '../../core/models/ai.models';
import { ProviderServiceListing, UserJob, Category, ServiceVariant } from '../../core/models/marketplace.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  private readonly aiService = inject(AiService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly jobModalService = inject(JobModalService);
  private readonly platformId = inject(PLATFORM_ID);
  readonly auth = inject(AuthService);

  // AI Search state
  aiQuery = signal<string>('give me computer repair near Rathnapura');
  aiLocation = signal<string>('');
  aiMaxBudget = signal<number | null>(null);
  isVoiceListening = signal<boolean>(false);
  private speechRecognition: any = null;
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
    if (this.auth.isMarketplaceUser()) {
      return this.jobs();
    }
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
      this.jobModalService.jobCreated$.subscribe(() => {
        this.loadMarketplaceData();
      });
    }
  }

  toggleVoiceFinder(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.isVoiceListening()) {
      if (this.speechRecognition) {
        try { this.speechRecognition.stop(); } catch {}
      }
      this.isVoiceListening.set(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.aiError.set('Voice recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Safari.');
      return;
    }

    try {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'en-US';
      this.speechRecognition.maxAlternatives = 1;

      let capturedTranscript = '';
      let hasSearched = false;

      this.speechRecognition.onstart = () => {
        this.isVoiceListening.set(true);
        this.aiError.set(null);
        capturedTranscript = '';
        hasSearched = false;
      };

      this.speechRecognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = 0; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        const currentText = (finalTranscript || interimTranscript).trim();
        if (currentText) {
          capturedTranscript = currentText;
          this.aiQuery.set(currentText);
        }
      };

      this.speechRecognition.onerror = (event: any) => {
        this.isVoiceListening.set(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.aiError.set('Microphone access was denied. Please allow microphone permission in your browser settings.');
        } else if (event.error === 'no-speech') {
          if (!capturedTranscript.trim()) {
            this.aiError.set('No speech was detected. Please try speaking your service request again.');
          }
        } else if (event.error !== 'aborted') {
          this.aiError.set('Voice recognition error: ' + (event.error || 'unknown'));
        }
      };

      this.speechRecognition.onend = () => {
        this.isVoiceListening.set(false);
        const finalQuery = capturedTranscript.trim() || this.aiQuery().trim();
        if (finalQuery && !hasSearched) {
          hasSearched = true;
          // Automatically fire AI search with the user's spoken request
          this.runAiSearch(finalQuery);
        }
      };

      this.speechRecognition.start();
    } catch (err: any) {
      this.isVoiceListening.set(false);
      this.aiError.set('Could not initialize microphone. Please check your browser audio settings.');
    }
  }

      clearAiSearch(): void {
    this.aiResult.set(null);
    this.aiError.set(null);
  }

  runAiSearch(customQuery?: string): void {
    let query = customQuery || this.aiQuery().trim();
    if (!query) return;

    const budget = this.aiMaxBudget();
    if (budget && !query.toLowerCase().includes('rs') && !query.toLowerCase().includes('lkr') && !query.toLowerCase().includes('budget')) {
      query += ` with budget Rs. ${budget}`;
    }

    this.aiQuery.set(query);
    this.isAiSearching.set(true);
    this.aiError.set(null);

    this.aiService.discoverServices({
      query,
      preferredLocation: this.aiLocation().trim() || undefined,
        maxBudget: this.aiMaxBudget() ? Number(this.aiMaxBudget()) : undefined
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

    const filter = {
      location: this.locationFilter().trim() || undefined,
      categoryId: this.selectedCategory() || undefined
    };

    // Load active provider services for "Service Provider Services"
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

    if (this.auth.isMarketplaceUser()) {
      // Role ID = 1: Load ongoing jobs created by the authenticated user
      this.marketplaceService.getMyJobs().subscribe({
        next: (res) => {
          this.jobs.set(res.success && res.data ? res.data : []);
        },
        error: () => {
          this.jobs.set([]);
        }
      });
    } else {
      // Guests / Admins: Load all public customer jobs with filter
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
    this.jobModalService.open();
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
