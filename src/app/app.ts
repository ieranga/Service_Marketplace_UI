import { SeraBotComponent } from './shared/components/sera-bot/sera-bot';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, SeraBotComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
