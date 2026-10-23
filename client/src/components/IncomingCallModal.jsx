import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import Avatar from './Avatar.jsx';

export default function IncomingCallModal({ callInfo, onAccept, onReject }) {
  if (!callInfo) return null;
  const isVideo = callInfo.isVideo;
  const caller = callInfo.caller || { name: 'Someone', color: '#ffb547' };

  return (
    <AnimatePresence>
      <div className="incoming-call-overlay">
        <motion.div
          className="incoming-call-card"
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        >
          <div className="incoming-avatar-wrap">
            <span className="incoming-pulse" />
            <Avatar name={caller.name} color={caller.color} size={56} />
          </div>

          <div className="incoming-info">
            <h4>{caller.name}</h4>
            <p>{isVideo ? 'Incoming video call...' : 'Incoming audio call...'}</p>
          </div>

          <div className="incoming-actions">
            <button
              type="button"
              className="call-btn reject"
              onClick={onReject}
              aria-label="Decline call"
              title="Decline"
            >
              <PhoneOff size={22} />
            </button>
            <button
              type="button"
              className="call-btn accept"
              onClick={onAccept}
              aria-label="Accept call"
              title="Accept"
            >
              {isVideo ? <Video size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
