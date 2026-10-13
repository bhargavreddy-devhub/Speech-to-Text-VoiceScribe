import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

export function MainNav() {
  const loggedIn = !!useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => !!(s.token && s.user?.is_admin));

  return (
    <nav className="main-nav" aria-label="Main navigation">
      <NavLink to="/home" className={navLinkClass}>
        Home
      </NavLink>
      {loggedIn && (
        <NavLink to="/dashboard" className={navLinkClass}>
          Dashboard
        </NavLink>
      )}
      {loggedIn && (
        <NavLink to="/workspace" className={navLinkClass}>
          Workspace
        </NavLink>
      )}
      {loggedIn && (
        <NavLink to="/history" className={navLinkClass}>
          History
        </NavLink>
      )}
      <NavLink to="/pricing" className={navLinkClass}>
        Pricing
      </NavLink>
      <NavLink to="/help" className={navLinkClass}>
        Help
      </NavLink>
      {isAdmin && (
        <NavLink to="/admin" className={navLinkClass}>
          Admin
        </NavLink>
      )}
    </nav>
  );
}
