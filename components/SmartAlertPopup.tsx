'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SPRING, SPRING_BOUNCY } from '@/lib/motion';

function fmt(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n); }

export default function SmartAlertPopup({ fineDue, daysUntilDue, nextEmiNo, nextEmiAmount, firstChargeDue }: {
  fineDue: number; daysUntilDue: number | null; nextEmiNo?: number; nextEmiAmount?: number; firstChargeDue: number;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);

  const alerts: { icon: string; title: string; msg: string; color: string }[] = [];
  if (daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 5)
    alerts.push({ icon: '🔔', title: daysUntilDue === 0 ? 'EMI Due Today!' : `EMI Due in ${daysUntilDue} Days`, msg: `EMI #${nextEmiNo || '—'} — ${fmt(nextEmiAmount || 0)}`, color: '#92400e' });
  if (fineDue > 0)
    alerts.push({ icon: '⚠️', title: 'Late Fine Due', msg: `Fine of ${fmt(fineDue)} pending. Grows ₹25/week.`, color: '#dc2626' });
  if (firstChargeDue > 0)
    alerts.push({ icon: '⭐', title: '1st EMI Charge Pending', msg: `One-time charge of ${fmt(firstChargeDue)} due.`, color: '#d97706' });

  useEffect(() => { if (alerts.length > 0 && !dismissed) setTimeout(() => setShow(true), 300); }, [alerts.length, dismissed]);

  const visible = alerts.length > 0 && show && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="smart-alert"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => setDismissed(true)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Blur is supplied statically via the CSS class — animating
              backdrop-filter inside an AnimatePresence exit can hang the exit
              and leave this full-screen overlay mounted, freezing the page. */}
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.85, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={SPRING}
          >
            <div className="px-6 py-5 text-center" style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)' }}>
              <motion.div
                className="text-4xl mb-2"
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ ...SPRING_BOUNCY, delay: 0.12 }}
              >
                {alerts[0].icon}
              </motion.div>
              <h2 className="font-bold text-lg text-amber-900">{alerts[0].title}</h2>
              <p className="text-sm text-amber-800 mt-1">{alerts[0].msg}</p>
            </div>
            {alerts.length > 1 && <div className="px-6 py-4 space-y-3">
              {alerts.slice(1).map((a, i) => (
                <motion.div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl bg-surface-2"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...SPRING, delay: 0.2 + i * 0.08 }}
                >
                  <span className="text-xl">{a.icon}</span>
                  <div><p className="text-sm font-semibold" style={{ color: a.color }}>{a.title}</p><p className="text-xs text-ink-muted mt-0.5">{a.msg}</p></div>
                </motion.div>
              ))}
            </div>}
            <div className="px-6 pb-5 pt-2">
              <motion.button
                onClick={() => setDismissed(true)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm"
              >
                Got it
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
