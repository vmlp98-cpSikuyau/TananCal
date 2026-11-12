import { initial } from '../lib/utils';

interface AvatarProps {
  name: string;
  emoji?: string | null;
  url?: string | null;
  size?: number;
}

/** Photo, else emoji, else a blue monogram of the first letter of the name. */
export function Avatar({ name, emoji, url, size = 36 }: AvatarProps) {
  const style = { width: size, height: size, fontSize: size * 0.46 };
  if (url) return <img className="avatar" style={style} src={url} alt="" />;
  if (emoji) return <span className="avatar avatar-emoji" style={{ ...style, fontSize: size * 0.56 }} aria-hidden="true">{emoji}</span>;
  return <span className="avatar avatar-mono" style={style} aria-hidden="true">{initial(name)}</span>;
}
