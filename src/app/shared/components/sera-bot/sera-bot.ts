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

  // Window & Trigger state
  activeMode = signal<'none' | 'chat'>('none');
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
  isThinking = signal<boolean>(false);
  isSeraSpeaking = signal<boolean>(false);

  // Quick suggestion chips
  readonly quickPrompts: string[] = [
    'Create a new job request',
    'Find AC repair near Colombo',
    'Register me as a service provider',
    'How does payment work?'
  ];

  // Voice recognition state
  isVoiceListening = signal<boolean>(false);
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

  // Toggles the unified Sera Chat box
  toggleChat(): void {
    if (this.activeMode() === 'chat') {
      this.closeActiveWindow();
    } else {
      this.openChat();
    }
  }

  // Opens Chat Box
  openChat(): void {
    this.activeMode.set('chat');
    this.shouldScrollChat = true;

    // Self-Introduction in chat if only welcome message
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

  // Closes current active modal/window
  closeActiveWindow(): void {
    this.activeMode.set('none');
    this.stopVoiceRecognition();
    if (isPlatformBrowser(this.platformId) && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isSeraSpeaking.set(false);
    }
  }

  // Send a text chat message
  sendMessage(): void {
    const rawText = this.userInputText().trim();
    if (!rawText) return;

    if (this.isVoiceListening()) {
      this.stopVoiceRecognition();
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: rawText,
      time: this.formatCurrentTime()
    };

    this.chatMessages.update(msgs => [...msgs, userMsg]);
    this.userInputText.set('');
    this.isThinking.set(true);
    this.shouldScrollChat = true;

    // Process reply
    setTimeout(() => {
      this.isThinking.set(false);
      this.processAgentConversation(rawText, 'chat');
    }, 400);
  }

  // Send voice-transcribed message in real-time
  private sendVoiceMessage(spokenText: string): void {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: spokenText,
      time: this.formatCurrentTime()
    };

    this.chatMessages.update(msgs => [...msgs, userMsg]);
    this.userInputText.set('');
    this.isThinking.set(true);
    this.shouldScrollChat = true;

    setTimeout(() => {
      this.isThinking.set(false);
      // Process with channel='voice' so Sera responds in chat and speaks her reply out loud
      this.processAgentConversation(spokenText, 'voice');
    }, 400);
  }

  selectQuickPrompt(prompt: string): void {
    this.userInputText.set(prompt);
    this.sendMessage();
  }

  // Normalize speech-to-text input to fix common browser voice recognition phonetics
  private normalizeUserInput(input: string): string {
    let text = input.trim();
    text = text.replace(/\b(object|opt|chop|jop|java|jobb|drop)\s*(request|req)\b/gi, 'job request');
    text = text.replace(/\b(create|post|new|need|want|open|make)\s+(an?\s+)?(object|opt|chop|jop|java)\b/gi, '$1 $2job');
    text = text.replace(/\b(object|opt|chop|jop)\s+request\b/gi, 'job request');
    text = text.replace(/\b(seraph|sarah|cera|sarra|serra)\b/gi, 'sera');
    return text;
  }

  // =========================================================================
  // SERA CONVERSATIONAL AGENT ENGINE
  // =========================================================================
  private processAgentConversation(userText: string, channel: 'chat' | 'voice'): void {
    const normalizedText = this.normalizeUserInput(userText);
    const textLower = normalizedText.toLowerCase().trim();

    // -----------------------------------------------------------------------
    // RULE 1: GUARDRAIL - Sera CANNOT create user accounts or provider profiles
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
      /\b(service\s*request)\b/i.test(textLower) ||
      /\b(service\s*offering)\b/i.test(textLower) ||
      /\b(offer|provide)\s+(a\s+)?service\b/i.test(textLower) ||
      /\b(create|post|add|publish)\s+(a\s+)?(new\s+)?(service\s*request|service\s*offering|service\b)/i.test(textLower) ||
      /\b(add|post|create)\s+my\s+services?\b/i.test(textLower);

    if (isServiceRequestIntent) {
      // 1. Condition: Must be logged in
      if (!this.auth.isAuthenticated()) {
        const notLoggedInMsg = "Sera cannot create a job request or service request until you log in to the system. Please log in to your account first to continue.";
        this.sendAgentActionReply(notLoggedInMsg, 'nav_login', channel);
        return;
      }

      // 2. Condition: User is logged in, check if service profile exists
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

    // Check if user is confirming an already memorized pending draft
    if (draft.isActive && draft.title && (
      textLower === 'confirm' || textLower === 'yes' || textLower === 'post it' ||
      textLower === 'create it' || textLower === 'publish' || textLower === 'yes please' ||
      textLower === 'confirm and post' || textLower === 'confirm and create'
    )) {
      this.executeJobCreation();
      return;
    }

    // Check if user wants to cancel a draft
    if (draft.isActive && (textLower === 'cancel' || textLower === 'abort' || textLower === 'stop' || textLower === 'clear')) {
      this.currentJobDraft.set({ isActive: false });
      const cancelReply = "Understood. I have cleared the job request draft. What else can I assist you with?";
      this.sendAgentReply(cancelReply, channel);
      return;
    }

    // Comprehensive detection of job request intent
    const hasJobKeyword =
      /\bjob\s*request\b/i.test(textLower) ||
      /\b(new|create|post|make|publish|open)\s+(a\s+)?(job)\b/i.test(textLower) ||
      /\b(need|want)\s+(to\s+)?(create|post|make|publish)\s+(a\s+)?(new\s+)?(job|work)\b/i.test(textLower) ||
      /\b(hire|find)\s+(a\s+)?(worker|pro|technician|plumber|electrician|mechanic|carpenter|painter|cleaner)\b/i.test(textLower) ||
      /\b(fix|repair|clean|paint|wash|install)\s+(my\s+)?(ac|air\s*con|pipe|leak|tap|sink|roof|car|bike|wiring|house|wall)\b/i.test(textLower);

    const isAffirmative = /^(yes|yeah|sure|ok|okay|please|go ahead|proceed|yep|i do)(\s+.*)?$/i.test(textLower);
    const lastMsgAskedAboutJob = this.chatMessages().slice(-1)[0]?.text?.toLowerCase().includes('job request');

    const isJobIntent = draft.isActive || hasJobKeyword || (isAffirmative && (draft.isActive || lastMsgAskedAboutJob));

    if (isJobIntent) {
      // Condition 1: User must be logged in
      if (!this.auth.isAuthenticated()) {
        const notLoggedInMsg = "Sera cannot create a job request or service request until you log in to the system. Please log in to your account first to continue.";
        this.sendAgentActionReply(notLoggedInMsg, 'nav_login', channel);
        return;
      }

      // Condition 2: User is logged in -> proceed with dialogue
      this.handleJobCreationDialogue(normalizedText, channel);
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
      this.sendAgentReply("I'm Sera, your dedicated marketplace AI work assistant! Here is what I can do for you:\n- Create and post verified job demands with customized budgets and locations\n- Help you find top-rated service pros across Sri Lanka\n- Guide you on payments, ratings, and marketplace features.\n(Note: User accounts and service profiles must be created manually).", channel);
      return;
    }

    if (/(payment|how\s+to\s+pay|cash|transfer)/i.test(textLower)) {
      this.sendAgentReply("Our marketplace supports Cash on delivery/completion, direct Bank Transfer, and secure Online Payment. You can choose your preferred payment method when booking a service or creating a job request!", channel);
      return;
    }

    if (/(thank|thanks|great|cool|awesome|perfect)/i.test(textLower)) {
      this.sendAgentReply("You're very welcome! Let me know whenever you need to post a job or find a verified service provider.", channel);
      return;
    }

    // Friendly, helpful default fallback
    this.sendAgentReply("I'm here to help you get work done! Would you like me to help you create a job request, check prices, or find verified professionals in your area?", channel);
  }

  // Handle step-by-step job creation dialogue & parameter memorization
  private handleJobCreationDialogue(userText: string, channel: 'chat' | 'voice'): void {
    if (!this.auth.isAuthenticated()) {
      const notLoggedInMsg = "Sera cannot create a job request or service request until you log in to the system. Please log in to your account first to continue.";
      this.sendAgentActionReply(notLoggedInMsg, 'nav_login', channel);
      return;
    }

    const textLower = userText.toLowerCase().trim();
    const current = { ...this.currentJobDraft(), isActive: true };

    // Check if the input is purely a trigger command without actual work/trade details
    const cleanedTriggerWords = textLower
      .replace(/\b(yes|yeah|sure|please|ok|okay|i|need|to|want|can|you|create|post|publish|make|open|a|an|new|job|request|work|service|task|start|do)\b/gi, '')
      .replace(/[.,!?"']/g, '')
      .trim();

    // If no title yet and the user only said the trigger phrase, ask for the requirement
    if (!current.title && cleanedTriggerWords.length === 0) {
      this.currentJobDraft.set(current);
      const askForJobReply = "Sure! I can help you create a new job request. What service or repair work do you need done? (For example: Plumbing, AC Repair, Electrical, Painting, Cleaning)";
      this.sendAgentReply(askForJobReply, channel);
      return;
    }

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

    // 5. Extract Title / Requirement if not set yet
    if (!current.title && cleanedTriggerWords.length > 0) {
      let cleaned = userText
        .replace(/\b(?:yes|yeah|sure|please|ok|okay)\b/gi, '')
        .replace(/\b(?:i\s+need\s+to|i\s+want\s+to|can\s+you|please)?\s*(?:create|post|publish|make|open)\s+(?:a\s+)?(?:new\s+)?(?:job\s*request|job|work|request)\s*(?:for|to|about)?\b/gi, '')
        .replace(/\b(?:in|near|at)\s+(?:colombo|rathnapura|ratnapura|kandy|galle|negombo|matara|gampaha|kurunegala|kalutara|jaffna|batticaloa|anuradhapura|badulla|trincomalee|puttalam|nuwara eliya|kegalle|polonnaruwa|hambantota)\b/gi, '')
        .replace(/(?:rs\.?|lkr|budget|cost|price)?\s*[:=]?\s*[0-9,]{3,10}\s*(?:rs\.?|lkr|rupees)?/gi, '')
        .replace(/\b(?:urgent|today|tomorrow|this weekend|next week|flexible)\b/gi, '')
        .replace(/\b(?:cash|bank transfer|card|online payment)\b/gi, '')
        .replace(/^(?:for|to|with|about|a|an)\s+/gi, '')
        .trim();

      if (cleaned.length >= 3) {
        current.title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      } else if (cleanedTriggerWords.length >= 3) {
        current.title = cleanedTriggerWords.charAt(0).toUpperCase() + cleanedTriggerWords.slice(1);
      }
    }

    this.currentJobDraft.set(current);

    // Check what parameters are still missing
    const missing: string[] = [];
    if (!current.title) missing.push('what job/service you need (e.g. Plumbing, AC Repair, Electrical)');
    if (!current.city) missing.push('your city/location (e.g. Colombo, Kandy, Rathnapura)');
    if (!current.budget) missing.push('your estimated budget in Rs. (e.g. Rs. 5000)');
    if (!current.urgency) missing.push('your preferred timeline (e.g. Today, This Weekend, Flexible)');

    // If parameters are missing, ask for the next one while acknowledging what was memorized
    if (missing.length > 0) {
      let reply = `Got it! I am preparing your job request`;
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

      reply += `To continue, please tell me: ${missing[0]}.`;
      this.sendAgentReply(reply, channel);
      return;
    }

    // All parameters memorized! Present confirmation card
    if (!current.paymentMethod) current.paymentMethod = 'Cash';
    this.currentJobDraft.set(current);

    const summaryText = `All parameters are set for your job request!\n\n` +
      `Requirement: ${current.title}\n` +
      `Location: ${current.city}\n` +
      `Budget: Rs. ${current.budget?.toLocaleString()}\n` +
      `Timeline: ${current.urgency}\n` +
      `Payment: ${current.paymentMethod}\n\n` +
      `Would you like me to post this job to the marketplace now?`;

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

    if (channel === 'voice') {
      this.speakOutLoud(`I have memorized all parameters for ${current.title} in ${current.city} with budget Rs. ${current.budget}. Tap Confirm and Post Job to publish your job.`);
    }
  }

  // Execute actual job creation in marketplace
  executeJobCreation(): void {
    const draft = this.currentJobDraft();
    if (!draft.title) return;

    if (!this.auth.isAuthenticated()) {
      const authErr = "Sera cannot create a job request or service request until you log in to the system. Please log in first.";
      this.sendAgentActionReply(authErr, 'nav_login', 'chat');
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

          this.chatMessages.update(msgs => [...msgs, {
            id: Date.now().toString(),
            sender: 'sera',
            text: successMsg,
            time: this.formatCurrentTime()
          }]);
          this.shouldScrollChat = true;
          this.speakOutLoud(`Your job for ${draft.title} has been successfully created and posted to the marketplace!`);
        } else {
          this.sendAgentReply(`Failed to create job: ${res.message || 'Unknown error'}`, 'chat');
        }
      },
      error: (err) => {
        this.isSubmittingJob.set(false);
        this.sendAgentReply(`Error posting job request: ${err.error?.message || 'Could not connect to server.'}`, 'chat');
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
  // INTEGRATED VOICE RECOGNITION & FEMALE SPEECH SYNTHESIS ENGINE
  // =========================================================================
  toggleVoiceInput(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.isVoiceListening()) {
      this.stopVoiceRecognition();
    } else {
      this.startVoiceRecognition();
    }
  }

  startVoiceRecognition(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    try {
      if (this.speechRecognition) {
        try { this.speechRecognition.abort(); } catch {}
      }

      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.lang = 'en-US';
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = true;

      this.speechRecognition.onstart = () => {
        this.isVoiceListening.set(true);
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          this.isSeraSpeaking.set(false);
        }
      };

      this.speechRecognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          this.userInputText.set(transcript);
        }
      };

      this.speechRecognition.onerror = () => {
        this.isVoiceListening.set(false);
      };

      this.speechRecognition.onend = () => {
        this.isVoiceListening.set(false);
        const spoken = this.userInputText().trim();
        if (spoken) {
          this.sendVoiceMessage(spoken);
        }
      };

      this.speechRecognition.start();
    } catch {
      this.isVoiceListening.set(false);
    }
  }

  stopVoiceRecognition(): void {
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

      const isNamedFemale = femaleVoice && [
        'zira', 'jenny', 'aria', 'sonia', 'samantha', 'victoria',
        'karen', 'hazel', 'susan', 'heera', 'neerja', 'serena', 'female'
      ].some(n => femaleVoice.name.toLowerCase().includes(n));

      utterance.pitch = isNamedFemale ? 1.12 : 1.25;

      utterance.onstart = () => this.isSeraSpeaking.set(true);
      utterance.onend = () => this.isSeraSpeaking.set(false);
      utterance.onerror = () => this.isSeraSpeaking.set(false);

      window.speechSynthesis.speak(utterance);
    } catch {
      this.isSeraSpeaking.set(false);
    }
  }

  private sendAgentReply(text: string, channel: 'chat' | 'voice'): void {
    const replyMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'sera',
      text: text,
      time: this.formatCurrentTime()
    };
    this.chatMessages.update(msgs => [...msgs, replyMsg]);
    this.shouldScrollChat = true;

    if (channel === 'voice') {
      this.speakOutLoud(text);
    }
  }

  private sendAgentActionReply(
    text: string,
    actionType: 'nav_login' | 'nav_service_mode' | 'nav_register',
    channel: 'chat' | 'voice'
  ): void {
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

    if (channel === 'voice') {
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
