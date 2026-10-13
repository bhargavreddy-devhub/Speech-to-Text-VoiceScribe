import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function UserMenu() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!token) {
    return (
      <div className="user-box">
        <a href="#/login" className="btn btn-ghost btn-sm">
          Login
        </a>
        <a href="#/register" className="btn btn-primary btn-sm">
          Get Started
        </a>
      </div>
    );
  }

  return (
    <div className="user-box">
      <div className="user-menu" ref={menuRef}>
        <button
          className="btn btn-ghost btn-sm"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {user?.name || user?.email || ''}
        </button>
        <div className={`user-menu-dropdown${open ? '' : ' hidden'}`} role="menu">
          <a href="#/profile" role="menuitem">
            Profile &amp; Settings
          </a>
          {user?.is_admin && (
            <a href="#/admin" role="menuitem">
              Admin Dashboard
            </a>
          )}
          <button
            role="menuitem"
            onClick={() => {
              logout();
              navigate('/home');
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
