import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff } from 'lucide-react';

/**
 * Floating offline banner — shown when the browser loses network connectivity.
 * Automatically hides when back online.
 */
export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed left-0 right-0 top-0 z-[9999] flex items-center justify-center gap-2 bg-amber-600 px-4 py-2 text-xs font-medium text-white shadow-lg"
          role="alert"
        >
          <WifiOff size={14} />
          You&rsquo;re offline — some features may not work
        </motion.div>
      )}
    </AnimatePresence>
  );
}
