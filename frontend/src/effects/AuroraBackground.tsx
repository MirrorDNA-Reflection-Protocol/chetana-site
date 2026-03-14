import { motion } from "framer-motion";

/**
 * Aurora — animated gradient background with flowing color bands.
 * Replaces static orbs with a living, breathing aurora effect.
 */
export default function AuroraBackground() {
  return (
    <div className="aurora-wrap">
      <div className="aurora-layer">
        <motion.div
          className="aurora-band aurora-band-1"
          animate={{
            backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="aurora-band aurora-band-2"
          animate={{
            backgroundPosition: ["100% 50%", "0% 50%", "100% 50%"],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="aurora-band aurora-band-3"
          animate={{
            backgroundPosition: ["50% 0%", "50% 100%", "50% 0%"],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <div className="aurora-noise" />
    </div>
  );
}
