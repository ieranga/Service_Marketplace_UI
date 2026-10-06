import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class JobModalService {
  readonly isOpen = signal<boolean>(false);
  private readonly jobCreatedSubject = new Subject<void>();
  readonly jobCreated$ = this.jobCreatedSubject.asObservable();

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  notifyJobCreated(): void {
    this.jobCreatedSubject.next();
  }
}
