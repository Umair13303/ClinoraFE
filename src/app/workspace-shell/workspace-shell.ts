import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './workspace-shell.html',
})
export class WorkspaceShell {
  private readonly router = inject(Router);

  protected signOut(): void {
    sessionStorage.removeItem('clinora.auth');
    void this.router.navigateByUrl('/login');
  }
}
