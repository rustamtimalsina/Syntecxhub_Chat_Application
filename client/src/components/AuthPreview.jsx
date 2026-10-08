import { motion, useReducedMotion } from 'motion/react';

const EASE = [0.22, 1, 0.36, 1];

const MESSAGES = [
  { name: 'Aarav', initial: 'A', color: '#7bc4a8', text: 'Pushed the new login flow.', time: '10:24' },
  { name: 'Mina', initial: 'M', color: '#c792b8', text: 'Looks clean. Shipping today?', time: '10:25' },
  { name: 'You', text: 'Yes. Deploy is next.', time: '10:25', mine: true },
];

export default function AuthPreview() {
  const reduce = useReducedMotion();

  return (
    <div className="preview" aria-hidden="true">
      <div className="pv-head">
        <span className="pv-channel"><span className="mono">01</span> General</span>
        <span className="pv-online"><span className="pv-dot" /> 3 online</span>
      </div>

      <div className="pv-body">
        {MESSAGES.map((m, i) => (
          <motion.div
            key={i}
            className={`pv-msg ${m.mine ? 'mine' : ''}`}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: reduce ? 0 : 0.5 + i * 0.7, ease: EASE }}
          >
            {!m.mine && <span className="pv-avatar" style={{ background: m.color }}>{m.initial}</span>}
            <div className="pv-bubble">
              {!m.mine && <span className="pv-name">{m.name}</span>}
              <p>{m.text}</p>
              <span className="pv-time mono">{m.time}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="pv-typing"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 2.9, duration: 0.4 }}
      >
        <span className="wave">
          {[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}
        </span>
        Mina is typing
      </motion.div>
    </div>
  );
}