import { Component, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ChatMessage {
  id: string;
  sender: 'sera' | 'user';
  text: string;
  time: string;
}

@Component({
  selector: 'app-sera-bot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sera-bot.html',
  styleUrl: './sera-bot.css'
})
export class SeraBotComponent implements AfterViewChecked {
  @ViewChild('chatScrollContainer') private chatScrollContainer?: ElementRef<HTMLDivElement>;

  // Speed-dial expansion state (controls showing option 1 and 3)
  isExpanded = signal<boolean>(false);

  // Active interface mode ('none' | 'chat' | 'voice')
  activeMode = signal<'none' | 'chat' | 'voice'>('none');

  // Chat conversation state
  chatMessages = signal<ChatMessage[]>([
    {
      id: '1',
      sender: 'sera',
      text: "Hello! I'm Sera, your AI marketplace assistant. ✨ You can ask me to find service providers, check pricing, or help you post a job request. How can I help you today?",
      time: this.formatCurrentTime()
    }
  ]);

  userInputText = signal<string>('');

  // Sample starter chips
  readonly quickPrompts: string[] = [
    'Find AC repair near Colombo',
    'Post an urgent plumbing job',
    'Best rated home cleaning services',
    'How does marketplace payment work?'
  ];

  // Voice bot demonstration state
  isVoiceListening = signal<boolean>(false);
  voiceTranscript = signal<string>('');
  voiceStatusText = signal<string>('Tap the microphone and speak to Sera');

  private shouldScrollChat = false;

  ngAfterViewChecked(): void {
    if (this.shouldScrollChat) {
      this.scrollToBottom();
      this.shouldScrollChat = false;
    }
  }

  // Toggles the speed-dial options (1 and 3)
  toggleMenu(): void {
    if (this.activeMode() !== 'none') {
      // If a window is open, clicking 2 closes the open window
      this.activeMode.set('none');
      this.isExpanded.set(false);
    } else {
      this.isExpanded.update(val => !val);
    }
  }

  // Opens 1 (Chatbot)
  openChat(): void {
    this.activeMode.set('chat');
    this.isExpanded.set(false);
    this.shouldScrollChat = true;
  }

  // Opens 3 (Voice Bot)
  openVoice(): void {
    this.activeMode.set('voice');
    this.isExpanded.set(false);
    this.isVoiceListening.set(false);
    this.voiceTranscript.set('');
    this.voiceStatusText.set('Tap the microphone and speak to Sera');
  }

  // Closes current active modal/window
  closeActiveWindow(): void {
    this.activeMode.set('none');
    this.isVoiceListening.set(false);
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

    // Simulated responsive reply from Sera (preview before full AI endpoint binding)
    setTimeout(() => {
      const seraReply: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'sera',
        text: `I've noted: "${text}". I am currently in UI preview mode. Once connected with the AI engine, I'll automatically discover top-rated providers or generate a verified job for you!`,
        time: this.formatCurrentTime()
      };
      this.chatMessages.update(msgs => [...msgs, seraReply]);
      this.shouldScrollChat = true;
    }, 600);
  }

  selectQuickPrompt(prompt: string): void {
    this.userInputText.set(prompt);
    this.sendMessage();
  }

  // Toggle voice listening simulation
  toggleVoice(): void {
    if (this.isVoiceListening()) {
      this.isVoiceListening.set(false);
      this.voiceStatusText.set('Processing speech...');
      setTimeout(() => {
        if (!this.voiceTranscript()) {
          this.voiceTranscript.set('“Find me a reliable electrician in Kandy under Rs. 6000”');
        }
        this.voiceStatusText.set('Heard your request! Tap to speak again.');
      }, 700);
    } else {
      this.isVoiceListening.set(true);
      this.voiceTranscript.set('');
      this.voiceStatusText.set('Listening to your voice... Speak now');
    }
  }

  private scrollToBottom(): void {
    if (this.chatScrollContainer) {
      this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
    }
  }

  private formatCurrentTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
