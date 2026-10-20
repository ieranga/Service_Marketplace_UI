import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewChecked,
  ElementRef,
  ViewChild,
  signal,
  inject,
  PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MarketplaceService } from '../../../core/services/marketplace.service';
import { AuthService } from '../../../core/services/auth.service';
import { JobModalService } from '../../../core/services/job-modal.service';

export interface ChatMessage {
  id: string;
  sender: 'sera' | 'user';
  text: string;
  time: string;
  isAction?: boolean;
  actionType?: 'confirm_job' | 'nav_register' | 'nav_service_mode' | 'nav_login';
  draftSummary?: {
    title: string;
    city: string;
    budget: number;
    urgency: string;
    paymentMethod: string;
  };
}

export interface JobDraft {
  isActive: boolean;
  title?: string;
  city?: string;
  budget?: number;
  urgency?: string;
  paymentMethod?: string;
}

@Component({
  selector: 'app-sera-bot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sera-bot.html',
  styleUrl: './sera-bot.css'
})
export class SeraBotComponent implements OnInit, OnDestroy, AfterViewChecked {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly jobModalService = inject(JobModalService);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('chatScrollContainer') private chatScrollContainer?: ElementRef<HTMLDivElement>;

  // Speed-dial trigger state
  isExpanded = signal<boolean>(false);
  activeMode = signal<'none' | 'chat' | 'voice'>('none');
  isLabelHidden = signal<boolean>(false);

  // Chat bot state
  userInputText = signal<string>('');
  chatMessages = signal<ChatMessage[]>([
    {
      id: '1',
      sender: 'sera',
      text: 'Hi, I am Sera, your work assistant! How can I help you today?',
      time: this.formatCurrentTime()
    }
  ]);

  // Conversational Job Memory
  currentJobDraft = signal<JobDraft>({ isActive: false });
  isSubmittingJob = signal<boolean>(false);

  // Quick suggestion chips
  readonly quickPrompts: string[] = [
    'Create a new job request',
    'Find AC repair near Colombo',
    'Register me as a service provider',
    'How does payment work?'
  ];

  // Voice bot state
  isVoiceListening = signal<boolean>(false);
  voiceTranscript = signal<string>('');
  voiceStatusText = signal<string>("Hi, I am Sera, your work assistant! Tap the microphone to speak.");
  seraVoiceReply = signal<string>('');
  voiceActionType = signal<'none' | 'nav_login' | 'nav_service_mode' | 'nav_register'>('none');

  private speechRecognition: any = null;
  private shouldScrollChat = false;
  private rollTimer: any = null;
  private cachedVoices: SpeechSynthesisVoice[] = [];

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Roll "Asked from Sera" text into avatar after 5 seconds
      this.rollTimer = setTimeout(() => {
        this.isLabelHidden.set(true);
      }, 5000);

      // Pre-warm SpeechSynthesis voices so female voice is ready immediately
      if ('speechSynthesis' in window) {
        this.cachedVoices = window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          this.cachedVoices = window.speechSynthesis.getVoices();
        };
      }

      // Sync user service profile status in background if logged in
      if (this.auth.isAuthenticated() && !this.auth.currentUser()?.hasServiceProfile) {
        this.marketplaceService.getMyServices().subscribe({
          next: (res) => {
            if (res.success && res.data && res.data.length > 0) {
              this.auth.updateCurrentUserProfileStatus(true);
            }
          },
          error: () => {}
        });
      }
    }
  }

  ngOnDestroy(): void {
    if (this.rollTimer) clearTimeout(this.rollTimer);
    this.stopVoiceRecognition();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollChat) {
      this.scrollToBottom();
      this.shouldScrollChat = false;
    }
  }

  // Toggles speed-dial sub-options
  toggleSpeedDial(): void {
    this.isExpanded.update(v => !v);
  }

  toggleMenu(): void {
    this.toggleSpeedDial();
  }

  // Opens [1] Chat Bot
  openChat(): void {
    this.activeMode.set('chat');
    this.isExpanded.set(false);
    this.shouldScrollChat = true;

    // Self-Introduction in chat if only welcome message or empty
    if (this.chatMessages().length <= 1) {
      this.chatMessages.set([
        {
          id: Date.now().toString(),
          sender: 'sera',
          text: 'Hi, I am Sera, your work assistant! I can help you find services, answer marketplace questions, or create and post a job request for you.',
          time: this.formatCurrentTime()
        }
      ]);
    }
  }

  // Opens [3] Voice Bot
  openVoice(): void {
    this.activeMode.set('voice');
    this.isExpanded.set(false);
    this.voiceTranscript.set('');
    this.seraVoiceReply.set('');
    this.voiceActionType.set('none');
    this.voiceStatusText.set("Hi, I am Sera, your work assistant! I'm listening. Speak your request.");

    // Voice Self-Introduction via SpeechSynthesis (female voice)
    this.speakOutLoud("Hi, I am Sera, your work assistant. What would you like to do today?");
  }

  // Closes current active modal/window
  closeActiveWindow(): void {
    this.activeMode.set('none');
    this.voiceActionType.set('none');
    this.stopVoiceRecognition();
    if (isPlatformBrowser(this.platformId) && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // Send a chat message
  sendMessage(): void {
    const text = this.userInputText().trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: text,
      time: this.formatCurrentTime()
    };

    this.chatMessages.update(msgs => [...msgs, userMsg]);
    this.userInputText.set('');
    this.shouldScrollChat = true;

    // Conversational Agent processing
    setTimeout(() => {
      this.processAgentConversation(text, 'chat');
    }, 400);
  }

  selectQuickPrompt(prompt: string): void {
    this.userInputText.set(prompt);
    this.sendMessage();
  }

  // =========================================================================
  // SERA CONVERSATIONAL AGENT ENGINE
  // =========================================================================
  private processAgentConversation(userText: string, channel: 'chat' | 'voice'): void {
    const textLower = userText.toLowerCase().trim();

    // -----------------------------------------------------------------------
    // RULE 1: GUARDRAIL - Sera CANNOT create user profiles or provider profiles
    // -----------------------------------------------------------------------
    if (
      /(create|make|register|setup|open|add)\s+(my\s+)?(user\s+)?(account|profile|user\s+profile|provider\s+profile)/i.test(textLower) ||
      /(create|make|register|setup)\s+(my\s+)?service\s+profile/i.test(textLower) ||
      /(register|sign\s*up)\s+me\s+(as\s+a\s+)?(provider|worker|pro|seller|user)?/i.test(textLower)
    ) {
      const refusalReply = "I cannot create user profiles or provider service profiles directly. User accounts and provider profiles contain private personal details and verified credentials that must be registered manually. You can easily create an account on the Register page, or go to Service Provider Mode to manage your services.";
      this.sendAgentActionReply(refusalReply, 'nav_register', channel);
      return;
    }

    // -----------------------------------------------------------------------
    // RULE 2: SERVICE REQUEST INTENT
    // "Whether the user logs in, Sera cannot create a service request if user not create his service profile."
    // -----------------------------------------------------------------------
    const isServiceRequestIntent =
      /(service\s*request)/i.test(textLower) ||
      /(create|post|add|offer|publish|provide|new)\s+(a\s+)?(service\s*request|service\s*offering|service\b)/i.test(textLower) ||
      /(offer|provide)\s+(a\s+)?service\b/i.test(textLower) ||
      /(add|post|create)\s+my\s+services?/i.test(textLower);

    if (isServiceRequestIntent) {
      // 1. Must be logged in
      if (!this.auth.isAuthenticated()) {
        const notLoggedInMsg = "Sera cannot create a job request or service request until you log in to the system. Please log in to your account first to continue.";
        this.sendAgentActionReply(notLoggedInMsg, 'nav_login', channel);
        return;
      }

      // 2. User is logged in: Check if service profile exists
      const hasProfile = !!this.auth.currentUser()?.hasServiceProfile;
      if (!hasProfile) {
        const noProfileMsg = "You cannot create a service request because you have not created your Service Profile yet. Please visit Service Mode to create your Service Profile first.";
        this.sendAgentActionReply(noProfileMsg, 'nav_service_mode', channel);
        return;
      }

      // 3. User is logged in and has an active service profile
      const activeProfileMsg = "Your Service Profile is active! To configure and publish a new service listing with categories, pricing, and images, please use Service Provider Mode.";
      this.sendAgentActionReply(activeProfileMsg, 'nav_service_mode', channel);
      return;
    }

    // -----------------------------------------------------------------------
    // RULE 3: JOB CREATION / JOB REQUEST INTENT
    // "Sera cannot create a job request or service request until the user logs in to the system."
    // -----------------------------------------------------------------------
    const draft = this.currentJobDraft();

    // Check if user is confirming a pending job draft
    if (draft.isActive && (textLower === 'confirm' || textLower === 'yes' || textLower === 'post it' || textLower === 'create it' || textLower === 'publish')) {
      this.executeJobCreation(channel);
      return;
    }

    // Check if user wants to cancel a draft
    if (draft.isActive && (textLower === 'cancel' || textLower === 'abort' || textLower === 'stop')) {
      this.currentJobDraft.set({ isActive: false });
      const cancelReply = "Understood. I have cleared the job request draft. What else can I assist you with?";
      this.sendAgentReply(cancelReply, channel);
      return;
    }

    // Detect if this message initiates or continues a job creation request
    const isJobIntent = draft.isActive ||
      /(create|post|publish|need|find|hire|want)\s+(a\s+)?(job\s*request|job|work|repair|clean|plumb|technician|electrician|mechanic|carpenter)/i.test(textLower) ||
      /(fix|wash|install|service|paint|clean)\b/i.test(textLower);

    if (isJobIntent) {
      // Must be logged in: Sera cannot create a job request until user logs in
      if (!this.auth.isAuthenticated()) {
        const notLoggedInMsg = "Sera cannot create a job request or service request until you log in to the system. Please log in to your account first to continue.";
        this.sendAgentActionReply(notLoggedInMsg, 'nav_login', channel);
        return;
      }

      this.handleJobCreationDialogue(userText, channel);
      return;
    }

    // -----------------------------------------------------------------------
    // RULE 4: GENERAL CONVERSATIONAL RESPONSES
    // -----------------------------------------------------------------------
    if (/(hi|hello|hey|good\s*(morning|afternoon|evening))/i.test(textLower)) {
      this.sendAgentReply("Hi! I'm Sera, your work assistant. I can help you discover verified services, check prices, or create and post a job request for you. What would you like to get done?", channel);
      return;
    }

    if (/(who\s+are\s+you|what\s+can\s+you\s+do|capabilities|help\s+me)/i.test(textLower)) {
      this.sendAgentReply("I'm Sera, your dedicated marketplace AI work assistant! Here is what I can do for you:\n- Create and post verified job requests with customized budgets and locations (requires login)\n- Help you find top-rated service pros across Sri Lanka\n- Guide you on payments, ratings, and marketplace features.\n(Note: User accounts and service profiles must be created manually).", channel);
      return;
    }

    if (/(payment|how\s+to\s+pay|cash|transfer)/i.test(textLower)) {
      this.sendAgentReply("Our marketplace supports Cash on delivery/completion, direct Bank Transfer, and secure Online Payment. You can choose your preferred payment method when booking a service or creating a job request!", channel);
      return;
    }

    // Default conversational reply
    this.sendAgentReply(`I understand you're asking about "${userText}". Would you like me to create a job request for this, or help you find verified service providers in your area?`, channel);
  }

  // Handle step-by-step job creation dialogue & memorization
  private handleJobCreationDialogue(userText: string, channel: 'chat' | 'voice'): void {
    if (!this.auth.isAuthenticated()) {
      const notLoggedInMsg = "Sera cannot create a job request or service request until you log in to the system. Please log in to your account first to continue.";
      this.sendAgentActionReply(notLoggedInMsg, 'nav_login', channel);
      return;
    }

    const textLower = userText.toLowerCase();
    const current = { ...this.currentJobDraft(), isActive: true };

    // 1. Memorize Budget if mentioned
    const budgetMatch = userText.match(/(?:rs\.?|lkr|budget|cost|price)?\s*[:=]?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,7})\s*(?:rs\.?|lkr|rupees)?/i) ||
                        userText.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,7})\s*(?:rs\.?|lkr|rupees)/i);
    if (budgetMatch && budgetMatch[1]) {
      const parsed = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) {
        current.budget = parsed;
      }
    } else if (textLower.includes('default budget') || (current.title && textLower.includes('default'))) {
      if (!current.budget) current.budget = 5000;
    }

    // 2. Memorize City if mentioned
    const sriLankanCities = [
      'Colombo', 'Rathnapura', 'Ratnapura', 'Kandy', 'Galle', 'Negombo', 'Matara', 'Gampaha',
      'Kurunegala', 'Kalutara', 'Jaffna', 'Batticaloa', 'Anuradhapura', 'Badulla',
      'Trincomalee', 'Puttalam', 'Nuwara Eliya', 'Kegalle', 'Polonnaruwa', 'Hambantota'
    ];
    for (const city of sriLankanCities) {
      if (new RegExp(`\\b${city.toLowerCase()}\\b`, 'i').test(textLower)) {
        current.city = city.toLowerCase() === 'ratnapura' ? 'Rathnapura' : city;
        break;
      }
    }

    // 3. Memorize Urgency / Timeline if mentioned
    if (/(today|urgent|immediate|emergency|now|tomorrow)/i.test(textLower)) {
      current.urgency = 'Urgent - Today';
    } else if (/(weekend|saturday|sunday)/i.test(textLower)) {
      current.urgency = 'This Weekend';
    } else if (/(next\s+week|within\s+a\s+week|this\s+week)/i.test(textLower)) {
      current.urgency = 'Within a Week';
    } else if (/(flexible|anytime|whenever)/i.test(textLower)) {
      current.urgency = 'Flexible';
    }

    // 4. Memorize Payment Method if mentioned
    if (/(bank\s*transfer|bank|transfer)/i.test(textLower)) {
      current.paymentMethod = 'Bank Transfer';
    } else if (/(card|online|credit|debit)/i.test(textLower)) {
      current.paymentMethod = 'Online Payment';
    } else if (/(cash|cash\s*on\s*delivery|cod)/i.test(textLower)) {
      current.paymentMethod = 'Cash';
    }

    // 5. Memorize Title / Requirement if not set yet
    if (!current.title) {
      let cleaned = userText
        .replace(/(?:create|post|publish|need|find|hire|want)\s+(?:a\s+)?(?:job|service\s*request|work)?/gi, '')
        .replace(/(?:in|near|at)\s+(?:colombo|rathnapura|ratnapura|kandy|galle|negombo|matara|gampaha|kurunegala|kalutara|jaffna)/gi, '')
        .replace(/(?:rs\.?|lkr|budget|cost|price)?\s*[:=]?\s*[0-9,]{3,10}\s*(?:rs\.?|lkr|rupees)?/gi, '')
        .replace(/(?:urgent|today|tomorrow|this weekend|flexible)/gi, '')
        .replace(/^(?:for|to|with|please)\s+/gi, '')
        .trim();

      if (cleaned.length >= 3) {
        current.title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      } else if (userText.trim().length > 3) {
        current.title = userText.trim();
      }
    }

    this.currentJobDraft.set(current);

    // Check what parameters are still missing
    const missing: string[] = [];
    if (!current.title) missing.push('what job/service you need');
    if (!current.city) missing.push('your city/location (e.g. Colombo, Kandy, Rathnapura)');
    if (!current.budget) missing.push('your estimated budget (in Rs.)');
    if (!current.urgency) missing.push('your preferred timeline (e.g. Today, This Weekend, Flexible)');

    // If parameters are missing, ask for the next one while confirming what was memorized
    if (missing.length > 0) {
      let reply = `Got it! I have memorized your job requirement`;
      const details: string[] = [];
      if (current.title) details.push(`Requirement: "${current.title}"`);
      if (current.city) details.push(`Location: ${current.city}`);
      if (current.budget) details.push(`Budget: Rs. ${current.budget.toLocaleString()}`);
      if (current.urgency) details.push(`Timeline: ${current.urgency}`);

      if (details.length > 0) {
        reply += ` (${details.join(', ')}).\n\n`;
      } else {
        reply += `.\n\n`;
      }

      reply += `To finalize your request, please tell me: ${missing[0]}.`;
      this.sendAgentReply(reply, channel);
      return;
    }

    // All parameters memorized! Present confirmation card to the user
    if (!current.paymentMethod) current.paymentMethod = 'Cash';
    this.currentJobDraft.set(current);

    const summaryText = `All parameters are set for your job request!\n\n` +
      `Requirement: ${current.title}\n` +
      `Location: ${current.city}\n` +
      `Budget: Rs. ${current.budget?.toLocaleString()}\n` +
      `Timeline: ${current.urgency}\n` +
      `Payment: ${current.paymentMethod}\n\n` +
      `Would you like me to post this job to the marketplace now?`;

    if (channel === 'chat') {
      const confirmMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: 'sera',
        text: summaryText,
        time: this.formatCurrentTime(),
        isAction: true,
        actionType: 'confirm_job',
        draftSummary: {
          title: current.title!,
          city: current.city!,
          budget: current.budget!,
          urgency: current.urgency!,
          paymentMethod: current.paymentMethod
        }
      };
      this.chatMessages.update(msgs => [...msgs, confirmMsg]);
      this.shouldScrollChat = true;
    } else {
      this.seraVoiceReply.set(summaryText);
      this.voiceStatusText.set("Job ready! Say 'Confirm' to post.");
      this.speakOutLoud(`I have memorized all parameters for ${current.title} in ${current.city} with budget Rs. ${current.budget}. Say Confirm to publish your job.`);
    }
  }

  // Execute actual job creation in marketplace
  executeJobCreation(channel: 'chat' | 'voice'): void {
    const draft = this.currentJobDraft();
    if (!draft.title) return;

    if (!this.auth.isAuthenticated()) {
      const authErr = "Sera cannot create a job request or service request until you log in to the system. Please log in first.";
      this.sendAgentActionReply(authErr, 'nav_login', channel);
      return;
    }

    this.isSubmittingJob.set(true);

    this.marketplaceService.createJob({
      title: draft.title,
      budget: draft.budget || 5000,
      urgencyOrPreferredDate: draft.urgency || 'This Weekend',
      paymentMethod: draft.paymentMethod || 'Cash',
      description: `Created via Sera AI Assistant for ${draft.title}.`,
      tagIds: [],
      jobAreas: [
        {
          cityName: draft.city || 'Colombo',
          address: 'Client Location'
        }
      ]
    }).subscribe({
      next: (res) => {
        this.isSubmittingJob.set(false);
        if (res.success) {
          this.currentJobDraft.set({ isActive: false });
          const successMsg = `Success! Your job "${draft.title}" in ${draft.city || 'Colombo'} has been published to the marketplace. Verified providers in your area will be notified to send proposals.`;

          if (channel === 'chat') {
            this.chatMessages.update(msgs => [...msgs, {
              id: Date.now().toString(),
              sender: 'sera',
              text: successMsg,
              time: this.formatCurrentTime()
            }]);
            this.shouldScrollChat = true;
          } else {
            this.seraVoiceReply.set(successMsg);
            this.voiceActionType.set('none');
            this.voiceStatusText.set("Job created successfully!");
            this.speakOutLoud(`Your job for ${draft.title} has been successfully created and posted to the marketplace!`);
          }
        } else {
          this.sendAgentReply(`Failed to create job: ${res.message || 'Unknown error'}`, channel);
        }
      },
      error: (err) => {
        this.isSubmittingJob.set(false);
        this.sendAgentReply(`Error posting job request: ${err.error?.message || 'Could not connect to server.'}`, channel);
      }
    });
  }

  // Navigation action handlers
  navigateTo(destination: 'register' | 'service-mode' | 'login'): void {
    this.closeActiveWindow();
    if (destination === 'register') this.router.navigate(['/register']);
    if (destination === 'service-mode') this.router.navigate(['/service-mode']);
    if (destination === 'login') this.router.navigate(['/login']);
  }

  // =========================================================================
  // VOICE & SPEECH SYNTHESIS ENGINE
  // =========================================================================
  toggleVoice(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.isVoiceListening()) {
      this.stopVoiceRecognition();
    } else {
      this.startVoiceRecognition();
    }
  }

  private startVoiceRecognition(): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.voiceStatusText.set("Speech recognition not supported in this browser. Please use Google Chrome or Edge.");
      return;
    }

    try {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.lang = 'en-US';
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = true;

      this.speechRecognition.onstart = () => {
        this.isVoiceListening.set(true);
        this.voiceActionType.set('none');
        this.voiceStatusText.set("Listening... speak your request to Sera.");
      };

      this.speechRecognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        this.voiceTranscript.set(transcript);
      };

      this.speechRecognition.onerror = (event: any) => {
        this.isVoiceListening.set(false);
        this.voiceStatusText.set(`Voice error: ${event.error || 'Could not hear you. Tap mic to retry.'}`);
      };

      this.speechRecognition.onend = () => {
        this.isVoiceListening.set(false);
        const spoken = this.voiceTranscript().trim();
        if (spoken) {
          this.voiceStatusText.set("Thinking...");
          this.processAgentConversation(spoken, 'voice');
        } else {
          this.voiceStatusText.set("No speech detected. Tap microphone to speak.");
        }
      };

      this.speechRecognition.start();
    } catch {
      this.isVoiceListening.set(false);
      this.voiceStatusText.set("Could not access microphone.");
    }
  }

  private stopVoiceRecognition(): void {
    if (this.speechRecognition) {
      try { this.speechRecognition.stop(); } catch {}
    }
    this.isVoiceListening.set(false);
  }

  private getFemaleVoice(): SpeechSynthesisVoice | null {
    if (!isPlatformBrowser(this.platformId) || !('speechSynthesis' in window)) return null;
    const voices = (this.cachedVoices && this.cachedVoices.length > 0)
      ? this.cachedVoices
      : window.speechSynthesis.getVoices();

    if (!voices || voices.length === 0) return null;

    // Prioritized list of known female voice names (case-insensitive)
    const femaleKeywords = [
      'zira', 'jenny', 'aria', 'sonia', 'samantha', 'victoria',
      'karen', 'hazel', 'susan', 'heera', 'neerja', 'serena',
      'fiona', 'stephanie', 'moira', 'ava', 'allison', 'olivia',
      'clara', 'catherine', 'alice', 'linda', 'eva', 'female', 'woman'
    ];

    // 1. High priority: English voice matching female names
    for (const keyword of femaleKeywords) {
      const match = voices.find(v =>
        v.lang.toLowerCase().startsWith('en') &&
        v.name.toLowerCase().includes(keyword)
      );
      if (match) return match;
    }

    // 2. Google US English (default female voice on Chrome/Android) or UK English Female
    const googleVoice = voices.find(v =>
      v.lang.toLowerCase().startsWith('en') &&
      (v.name.includes('Female') || v.name.includes('Google US English'))
    );
    if (googleVoice) return googleVoice;

    // 3. Any language voice with female keyword
    for (const keyword of femaleKeywords) {
      const match = voices.find(v => v.name.toLowerCase().includes(keyword));
      if (match) return match;
    }

    // 4. Fallback to any English voice
    const fallbackEn = voices.find(v => v.lang.toLowerCase().startsWith('en'));
    return fallbackEn || voices[0] || null;
  }

  private speakOutLoud(text: string): void {
    if (!isPlatformBrowser(this.platformId) || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*#_~`]/g, '');
      const utterance = new SpeechSynthesisUtterance(clean);

      const femaleVoice = this.getFemaleVoice();
      if (femaleVoice) {
        utterance.voice = femaleVoice;
        utterance.lang = femaleVoice.lang || 'en-US';
      } else {
        utterance.lang = 'en-US';
      }

      utterance.rate = 1.0;

      // Adjust pitch to ensure a natural, pleasant female tone
      const isNamedFemale = femaleVoice && [
        'zira', 'jenny', 'aria', 'sonia', 'samantha', 'victoria',
        'karen', 'hazel', 'susan', 'heera', 'neerja', 'serena', 'female'
      ].some(n => femaleVoice.name.toLowerCase().includes(n));

      utterance.pitch = isNamedFemale ? 1.12 : 1.25;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }

  private sendAgentReply(text: string, channel: 'chat' | 'voice'): void {
    if (channel === 'chat') {
      const replyMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: 'sera',
        text: text,
        time: this.formatCurrentTime()
      };
      this.chatMessages.update(msgs => [...msgs, replyMsg]);
      this.shouldScrollChat = true;
    } else {
      this.seraVoiceReply.set(text);
      this.voiceActionType.set('none');
      this.voiceStatusText.set("Sera replied. Tap mic to answer.");
      this.speakOutLoud(text);
    }
  }

  private sendAgentActionReply(
    text: string,
    actionType: 'nav_login' | 'nav_service_mode' | 'nav_register',
    channel: 'chat' | 'voice'
  ): void {
    if (channel === 'chat') {
      const replyMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: 'sera',
        text: text,
        time: this.formatCurrentTime(),
        isAction: true,
        actionType: actionType
      };
      this.chatMessages.update(msgs => [...msgs, replyMsg]);
      this.shouldScrollChat = true;
    } else {
      this.seraVoiceReply.set(text);
      this.voiceActionType.set(actionType);
      const statusText = actionType === 'nav_login'
        ? "Login required."
        : (actionType === 'nav_service_mode' ? "Service Profile required." : "Profile action required.");
      this.voiceStatusText.set(statusText);
      this.speakOutLoud(text);
    }
  }

  private scrollToBottom(): void {
    if (this.chatScrollContainer) {
      this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
    }
  }

  private formatCurrentTime(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
