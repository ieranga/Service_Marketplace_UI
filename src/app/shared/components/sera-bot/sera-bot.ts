import {
  Component,
  signal,
  inject,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  ElementRef,
  AfterViewChecked
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
  address?: string;
}

@Component({
  selector: 'app-sera-bot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sera-bot.html',
  styleUrl: './sera-bot.css'
})
export class SeraBotComponent implements OnInit, OnDestroy, AfterViewChecked {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly jobModalService = inject(JobModalService);
  readonly auth = inject(AuthService);

  @ViewChild('chatScrollContainer') private chatScrollContainer?: ElementRef<HTMLDivElement>;

  // Speed-dial expansion state (controls showing option 1 and 3)
  isExpanded = signal<boolean>(false);

  // Roll-in state: "Asked from Sera" text hides after 5 seconds
  isLabelHidden = signal<boolean>(false);

  // Active interface mode ('none' | 'chat' | 'voice')
  activeMode = signal<'none' | 'chat' | 'voice'>('none');

  // Conversational Job Draft (Memorized parameters)
  currentJobDraft = signal<JobDraft>({ isActive: false });
  isSubmittingJob = signal<boolean>(false);

  // Chat conversation state
  chatMessages = signal<ChatMessage[]>([
    {
      id: '1',
      sender: 'sera',
      text: "Hi, I am Sera, your work assistant! 🤖 I can help you find verified service providers, answer questions, or create and post job requests for you. How can I help you today?",
      time: this.formatCurrentTime()
    }
  ]);

  userInputText = signal<string>('');

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

  // Toggles the speed-dial options (1 and 3)
  toggleMenu(): void {
    if (this.activeMode() !== 'none') {
      this.closeActiveWindow();
    } else {
      this.isExpanded.update(val => !val);
    }
  }

  // Opens [1] Chatbot
  openChat(): void {
    this.activeMode.set('chat');
    this.isExpanded.set(false);
    this.shouldScrollChat = true;

    // Self-introduction if conversation is empty
    if (this.chatMessages().length === 0) {
      this.chatMessages.set([
        {
          id: Date.now().toString(),
          sender: 'sera',
          text: "Hi, I am Sera, your work assistant! 🤖 Tell me what service you need or a job you'd like to create.",
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
    this.voiceStatusText.set("Hi, I am Sera, your work assistant! I'm listening. Speak your request.");

    // Voice Self-Introduction via SpeechSynthesis
    this.speakOutLoud("Hi, I am Sera, your work assistant. What would you like to do today?");
  }

  // Closes current active modal/window
  closeActiveWindow(): void {
    this.activeMode.set('none');
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

    // Process through Sera's Conversational Agent Brain
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
    // RULE 3: GUARDRAIL - Sera CANNOT create user profiles or provider profiles
    // -----------------------------------------------------------------------
    if (
      /(create|make|register|setup|open|add)\s+(my\s+)?(user\s+)?(account|profile|user\s+profile|provider\s+profile|service\s+profile)/i.test(textLower) ||
      /(register|sign\s*up)\s+me\s+(as\s+a\s+)?(provider|worker|pro|seller|user)?/i.test(textLower) ||
      /(add|create)\s+(my\s+)?services?\s+to\s+my\s+profile/i.test(textLower)
    ) {
      const refusalReply = "I cannot create user profiles or provider service profiles directly. User accounts and provider profiles contain private personal details and verified credentials that must be registered manually. You can easily create an account on the Register page, or go to Service Provider Mode to manage your services.";

      if (channel === 'chat') {
        const msg: ChatMessage = {
          id: Date.now().toString(),
          sender: 'sera',
          text: refusalReply,
          time: this.formatCurrentTime(),
          isAction: true,
          actionType: 'nav_register'
        };
        this.chatMessages.update(m => [...m, msg]);
        this.shouldScrollChat = true;
      } else {
        this.seraVoiceReply.set(refusalReply);
        this.voiceStatusText.set("Profile creation must be done manually.");
        this.speakOutLoud(refusalReply);
      }
      return;
    }

    // -----------------------------------------------------------------------
    // RULE 2: JOB CREATION / SERVICE REQUEST CONVERSATIONAL FLOW
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
      /(create|post|publish|need|find|hire|want)\s+(a\s+)?(job|service\s*request|work|repair|clean|plumb|technician|electrician|mechanic|carpenter)/i.test(textLower) ||
      /(fix|wash|install|service|paint|clean)/i.test(textLower);

    if (isJobIntent) {
      this.handleJobCreationDialogue(userText, channel);
      return;
    }

    // -----------------------------------------------------------------------
    // RULE 1: GENERAL CONVERSATIONAL RESPONSES
    // -----------------------------------------------------------------------
    if (/(hi|hello|hey|good\s*(morning|afternoon|evening))/i.test(textLower)) {
      this.sendAgentReply("Hi! I'm Sera, your work assistant. I can help you discover verified services, check prices, or create and post a job request for you. What would you like to get done?", channel);
      return;
    }

    if (/(who\s+are\s+you|what\s+can\s+you\s+do|capabilities|help\s+me)/i.test(textLower)) {
      this.sendAgentReply("I'm Sera, your dedicated marketplace AI work assistant! Here is what I can do for you:\n- Create and post verified job demands with customized budgets and locations\n- Help you find top-rated service pros across Sri Lanka\n- Guide you on payments, ratings, and marketplace features.\n(Note: user accounts and provider profiles must be created manually).", channel);
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
    } else if (/(week|next week|few days)/i.test(textLower)) {
      current.urgency = 'Within a Week';
    } else if (/(flexible|anytime)/i.test(textLower)) {
      current.urgency = 'Flexible';
    }

    // 4. Memorize Payment method
    if (/(online|card|bank|transfer)/i.test(textLower)) {
      current.paymentMethod = textLower.includes('transfer') ? 'Bank Transfer' : 'Online Payment';
    }

    // 5. Memorize Title / Requirement if not set yet
    if (!current.title) {
      let clean = userText
        .replace(/(i need|i want to|create a job for|create a job|post a job for|post a job|service request for|can you)/gi, '')
        .replace(/(in|near)\s+(colombo|kandy|galle|negombo|rathnapura|matara)/gi, '')
        .replace(/(rs\.?|lkr)\s*[0-9]+/gi, '')
        .replace(/today|this weekend|within a week|tomorrow/gi, '')
        .trim();

      if (clean.length > 2) {
        current.title = clean.charAt(0).toUpperCase() + clean.slice(1);
      }
    }

    // Save updated draft state
    this.currentJobDraft.set(current);

    // Determine what required parameter is still missing
    if (!current.title || current.title.length < 3) {
      this.sendAgentReply("What service or repair do you need done? (e.g., Plumbing leak, AC repair, House cleaning)", channel);
      return;
    }

    if (!current.city) {
      this.sendAgentReply("Understood! Which city or area is this job for? (e.g. Colombo, Kandy, Negombo)", channel);
      return;
    }

    if (!current.budget) {
      this.sendAgentReply(`Great, a job for "${current.title}" in ${current.city}. What is your target budget in LKR? (Or say "default" for Rs. 5,000)`, channel);
      return;
    }

    if (!current.urgency) {
      this.sendAgentReply("How soon do you need this done? (Options: Urgent Today, This Weekend, or Flexible)", channel);
      return;
    }

    // All parameters are collected! Present confirmation summary
    if (!current.paymentMethod) current.paymentMethod = 'Cash';

    const summaryText = `All parameters collected! Here is your job request summary:
- Title: ${current.title}
- City: ${current.city}
- Budget: Rs. ${current.budget.toLocaleString()}
- Timeline: ${current.urgency}
- Payment: ${current.paymentMethod}

Would you like me to post this job to the marketplace now? Say or type "Confirm", or click the button below.`;

    if (channel === 'chat') {
      const confirmMsg: ChatMessage = {
        id: Date.now().toString(),
        sender: 'sera',
        text: summaryText,
        time: this.formatCurrentTime(),
        isAction: true,
        actionType: 'confirm_job',
        draftSummary: {
          title: current.title,
          city: current.city,
          budget: current.budget,
          urgency: current.urgency,
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
      const authErr = "You need to be logged into your account before I can post this job for you. Please log in first.";
      if (channel === 'chat') {
        this.chatMessages.update(msgs => [...msgs, {
          id: Date.now().toString(),
          sender: 'sera',
          text: authErr,
          time: this.formatCurrentTime(),
          isAction: true,
          actionType: 'nav_login'
        }]);
      } else {
        this.seraVoiceReply.set(authErr);
        this.speakOutLoud(authErr);
      }
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
          this.jobModalService.notifyJobCreated();

          const successMsg = `Awesome! Your job request for "${draft.title}" in ${draft.city || 'Colombo'} has been published to the marketplace! Verified service providers can now view and apply.`;

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

  // Voice Interaction & Web Speech Recognition
  toggleVoice(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.isVoiceListening()) {
      this.stopVoiceRecognition();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.voiceStatusText.set('Speech recognition is not supported in this browser.');
      return;
    }

    try {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'en-US';

      let capturedText = '';

      this.speechRecognition.onstart = () => {
        this.isVoiceListening.set(true);
        this.voiceStatusText.set("Listening to your voice... Speak now.");
      };

      this.speechRecognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const current = (final || interim).trim();
        if (current) {
          capturedText = current;
          this.voiceTranscript.set(current);
        }
      };

      this.speechRecognition.onerror = (event: any) => {
        this.isVoiceListening.set(false);
        this.voiceStatusText.set(`Voice error: ${event.error || 'could not capture speech'}`);
      };

      this.speechRecognition.onend = () => {
        this.isVoiceListening.set(false);
        const finalSpoken = capturedText.trim() || this.voiceTranscript().trim();
        if (finalSpoken) {
          this.voiceStatusText.set("Processing what you said...");
          this.processAgentConversation(finalSpoken, 'voice');
        } else {
          this.voiceStatusText.set("No speech detected. Tap microphone to speak.");
        }
      };

      this.speechRecognition.start();
    } catch (err: any) {
      this.isVoiceListening.set(false);
      this.voiceStatusText.set('Could not initialize microphone.');
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
      this.voiceStatusText.set("Sera replied. Tap mic to answer.");
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
