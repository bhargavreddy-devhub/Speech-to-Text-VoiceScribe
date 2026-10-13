import { MainNav } from './MainNav';
import { A11yControls } from './A11yControls';
import { UserMenu } from './UserMenu';

export function TopBar() {
  return (
    <header className="topbar">
      <a className="brand" href="#/home">
        🎙️ VoiceScribe
      </a>

      <MainNav />

      <div className="topbar-right">
        <A11yControls />
        <UserMenu />
      </div>
    </header>
  );
}
