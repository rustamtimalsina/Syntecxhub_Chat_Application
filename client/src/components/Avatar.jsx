export default function Avatar({ name = '?', color = '#8fa8d6', size = 32 }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}