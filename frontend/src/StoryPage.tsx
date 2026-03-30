import { motion } from "framer-motion";

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5 } };

export default function StoryPage() {
  return (
    <section style={{ maxWidth: 800, margin: "0 auto", padding: "80px 20px 60px" }}>

      {/* Deepfake hook */}
      <motion.div {...fadeUp} style={{ textAlign: "center", marginBottom: 48 }}>
        <video
          src="/deepfake_hero.mp4"
          autoPlay muted loop playsInline
          style={{
            maxWidth: 240,
            width: "100%",
            borderRadius: 16,
            boxShadow: "0 0 60px rgba(0,212,170,0.15)",
            marginBottom: 16,
          }}
        />
        <p style={{ color: "#fff", fontSize: "1.25rem", fontWeight: 700, margin: "0 0 6px", lineHeight: 1.4 }}>
          That wasn't real. It took less than 60 seconds to make.
        </p>
        <p style={{ color: "#b0b0c0", fontSize: "1rem", margin: "0 0 32px", lineHeight: 1.6 }}>
          <span style={{ color: "#00d4aa", fontWeight: 600 }}>Chetana</span> detects deepfakes, scam links, and fraud — so you don't have to.
        </p>
        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "0 0 32px" }} />
        <p style={{ color: "#00d4aa", fontWeight: 600, fontSize: "0.875rem", letterSpacing: 2, textTransform: "uppercase", margin: "0 0 8px" }}>
          Our Story
        </p>
        <h1 style={{ color: "#fff", fontSize: "2.25rem", fontWeight: 700, margin: "0 0 16px", lineHeight: 1.2 }}>
          Built in Goa. For all of India.
        </h1>
        <p style={{ color: "#b0b0c0", fontSize: "1.125rem", lineHeight: 1.7, maxWidth: 600, margin: "0 auto" }}>
          Chetana was built by one person, on his own hardware, because nobody should need a tech degree to spot a scam.
        </p>
      </motion.div>

      {/* Video 1 — Deepfake awareness */}
      <motion.div {...fadeUp} style={{ marginBottom: 48 }}>
        <div style={{
          display: "flex",
          gap: 24,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "center",
        }}>
          <video
            src="/chetana_clip1.mp4"
            autoPlay muted loop playsInline
            style={{
              width: 220,
              borderRadius: 16,
              boxShadow: "0 0 40px rgba(0,212,170,0.12)",
            }}
          />
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ color: "#fff", fontSize: "1.25rem", fontWeight: 600, margin: "0 0 8px" }}>
              Deepfakes are here
            </h3>
            <p style={{ color: "#b0b0c0", fontSize: "1rem", lineHeight: 1.7, margin: 0 }}>
              Anyone's face can be cloned in seconds. Chetana scans videos, images, and voice recordings to detect manipulation before it causes harm.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Video 2 — Detection in action */}
      <motion.div {...fadeUp} style={{ marginBottom: 48 }}>
        <div style={{
          display: "flex",
          gap: 24,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "center",
          flexDirection: "row-reverse",
        }}>
          <video
            src="/chetana_clip2.mp4"
            autoPlay muted loop playsInline
            style={{
              width: 220,
              borderRadius: 16,
              boxShadow: "0 0 40px rgba(0,212,170,0.12)",
            }}
          />
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ color: "#fff", fontSize: "1.25rem", fontWeight: 600, margin: "0 0 8px" }}>
              Real-time detection
            </h3>
            <p style={{ color: "#b0b0c0", fontSize: "1rem", lineHeight: 1.7, margin: 0 }}>
              Upload any suspicious media. Chetana analyzes facial artifacts, audio patterns, and behavioral signals that human eyes miss.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Divider */}
      <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "48px 0" }} />

      {/* The Build — YouTube embed */}
      <motion.div {...fadeUp} style={{ marginBottom: 48, textAlign: "center" }}>
        <h2 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 700, margin: "0 0 8px" }}>
          The Build
        </h2>
        <p style={{ color: "#b0b0c0", fontSize: "1rem", lineHeight: 1.7, margin: "0 0 24px", maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
          Built on local hardware from Day 1. No cloud. Here's a walkthrough of the live sovereign system that powers Chetana.
        </p>
        <div style={{
          position: "relative",
          paddingBottom: "56.25%",
          height: 0,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 0 40px rgba(0,212,170,0.08)",
        }}>
          <iframe
            src="https://www.youtube.com/embed/CzwKEt_f78c"
            title="MirrorBrain — 5 Pane Walkthrough"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        </div>
      </motion.div>

      {/* Founder */}
      <motion.div {...fadeUp} style={{ textAlign: "center", padding: "32px 0" }}>
        <p style={{ color: "#00d4aa", fontWeight: 600, fontSize: "0.875rem", letterSpacing: 2, textTransform: "uppercase", margin: "0 0 12px" }}>
          The Founder
        </p>
        <p style={{ color: "#b0b0c0", fontSize: "1.0625rem", lineHeight: 1.8, maxWidth: 560, margin: "0 auto" }}>
          Paul Desai builds sovereign AI systems from Goa, India. Chetana is his answer to the scam epidemic — free, local-first, and built to protect the people who need it most.
        </p>
      </motion.div>

    </section>
  );
}
