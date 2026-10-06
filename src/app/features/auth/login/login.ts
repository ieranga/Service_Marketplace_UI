import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = signal<string>('');
  password = signal<string>('');
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  toggleShowPassword(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (!this.email() || !this.password()) {
      this.errorMessage.set('Please provide both email and password.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.auth.login({
      email: this.email().trim(),
      password: this.password()
    }).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          this.router.navigate(['/dashboard']);
        } else {
          this.errorMessage.set(res.message || 'Login failed.');
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        console.error('Login error:', err);
        const errorDetail = err.error?.message || err.error?.errors?.[0] || err.message || 'Invalid email or password.';
        this.errorMessage.set(errorDetail);
      }
    });
  }
}
