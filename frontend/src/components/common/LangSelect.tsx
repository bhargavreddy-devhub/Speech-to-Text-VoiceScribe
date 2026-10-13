import { LANGUAGES } from '../../constants/languages';

interface LangSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  leadingOptionLabel: string;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

export function LangSelect({
  id,
  value,
  onChange,
  leadingOptionLabel,
  className,
  style,
  ...rest
}: LangSelectProps) {
  return (
    <select
      id={id}
      className={className}
      style={style}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      <option value="">{leadingOptionLabel}</option>
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
