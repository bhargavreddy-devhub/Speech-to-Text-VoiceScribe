import { useA11yStore } from '../../store/a11yStore';

export function A11yControls() {
  const theme = useA11yStore((s) => s.theme);
  const contrast = useA11yStore((s) => s.contrast);
  const toggleTheme = useA11yStore((s) => s.toggleTheme);
  const toggleContrast = useA11yStore((s) => s.toggleContrast);
  const changeFontScale = useA11yStore((s) => s.changeFontScale);

  return (
    <div className="a11y-row">
      <button
        className="icon-btn"
        title="Toggle dark / light theme"
        aria-label="Toggle dark or light theme"
        aria-pressed={theme === 'dark'}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <button
        className={`icon-btn${contrast ? ' active' : ''}`}
        title="Toggle high contrast"
        aria-label="Toggle high contrast mode"
        onClick={toggleContrast}
      >
        ◐
      </button>
      <button
        className="icon-btn"
        title="Decrease font size"
        aria-label="Decrease font size"
        onClick={() => changeFontScale(-0.1)}
      >
        A−
      </button>
      <button
        className="icon-btn"
        title="Increase font size"
        aria-label="Increase font size"
        onClick={() => changeFontScale(0.1)}
      >
        A+
      </button>
    </div>
  );
}
