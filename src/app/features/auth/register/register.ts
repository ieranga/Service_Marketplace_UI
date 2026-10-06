import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  fullName = signal<string>('');
  email = signal<string>('');
  phoneNumber = signal<string>('+94');
  nic = signal<string>('');
  city = signal<string>('Negombo');
  address = signal<string>('');
  password = signal<string>('');
  confirmPassword = signal<string>('');
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  toggleShowPassword(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (!this.fullName() || !this.email() || !this.phoneNumber() || !this.password()) {
      this.errorMessage.set('Please fill in all required fields.');
      return;
    }

    if (this.password() !== this.confirmPassword()) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    if (this.password().length < 6) {
      this.errorMessage.set('Password must be at least 6 characters long.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const payload = {
      fullName: this.fullName().trim(),
      email: this.email().trim(),
      phoneNumber: this.phoneNumber().trim(),
      nic: this.nic().trim() || undefined,
      city: this.city().trim() || undefined,
      address: this.address().trim() || undefined,
      password: this.password()
    };

    this.auth.register(payload).subscribe({
      next: (res) => {
        if (res.success) {
          // Auto login after registration
          this.auth.login({ email: payload.email, password: payload.password }).subscribe({
            next: () => {
              this.isLoading.set(false);
              this.router.navigate(['/dashboard']);
            },
            error: () => {
              this.isLoading.set(false);
              this.router.navigate(['/login']);
            }
          });
        } else {
          this.isLoading.set(false);
          this.errorMessage.set(res.message || 'Registration failed.');
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        const errorDetail = err.error?.message || err.error?.errors?.[0] || 'Registration failed. Email or phone may already exist.';
        this.errorMessage.set(errorDetail);
      }
    });
  }
}
