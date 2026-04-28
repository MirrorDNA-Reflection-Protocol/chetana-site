import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ApkInfo, ChetanaNative } from "./native/ChetanaNative";

type Mode = "message" | "qr" | "call" | "job" | "apk" | "emergency";
type RiskLevel = "safe" | "caution" | "suspicious" | "dangerous" | "critical";
type EmergencyTrigger =
  | "apk_installed"
  | "clicked_link"
  | "paid_money"
  | "qr_paid"
  | "shared_otp"
  | "gave_remote_access"
  | "digital_arrest"
  | "job_travel"
  | "bank_account_draining";

type OfficialRail = {
  railId: string;
  name: string;
  channel: string;
  url: string;
  contact?: string | null;
  verifiedOn: string;
  useWhen: string[];
};

type AnalyzeResponse = {
  mode: Mode;
  riskLevel: RiskLevel;
  score: number;
  confidence: number;
  threatTypes: string[];
  evidence: string[];
  missingInfo: string[];
  doNotDo: string[];
  recommendedActions: string[];
  shareWarning: string;
  insufficientEvidence: boolean;
  officialRails: OfficialRail[];
};

type EmergencyResponse = {
  incidentType: string;
  severity: "priority" | "dangerous" | "critical";
  immediateSteps: string[];
  preserveEvidence: string[];
  doNotDo: string[];
  officialRails: OfficialRail[];
  escalationOrder: string[];
  handoffScript: string;
};

const DEFAULT_API_BASE = "http://127.0.0.1:8093/api";
const MODES: Array<{ id: Mode; label: string; helper: string }> = [
  { id: "message", label: "Message", helper: "Paste SMS, WhatsApp, email, or suspicious website text." },
  { id: "qr", label: "QR", helper: "Paste a decoded QR payload or URL before you open or pay." },
  { id: "call", label: "Call", helper: "Describe the call, pressure, and what they asked you to do." },
  { id: "job", label: "Job", helper: "Paste the offer, recruiter pitch, destination, and visa details." },
  { id: "apk", label: "APK", helper: "Paste the app pitch or load metadata from an APK URI." },
  { id: "emergency", label: "Emergency", helper: "Use this when money, OTP, or device access may already be compromised." },
];

const riskColor: Record<RiskLevel, string> = {
  safe: "#2F5D50",
  caution: "#A76800",
  suspicious: "#C95F19",
  dangerous: "#B94131",
  critical: "#831E18",
};

function inferEmergencyTrigger(
  mode: Mode,
  flags: {
    alreadyInstalled: boolean;
    alreadyPaid: boolean;
    alreadySharedOtp: boolean;
    alreadyGaveRemoteAccess: boolean;
  },
): EmergencyTrigger {
  if (flags.alreadyGaveRemoteAccess) return "gave_remote_access";
  if (flags.alreadyInstalled) return "apk_installed";
  if (flags.alreadySharedOtp) return "shared_otp";
  if (flags.alreadyPaid && mode === "qr") return "qr_paid";
  if (flags.alreadyPaid) return "paid_money";
  if (mode === "call") return "digital_arrest";
  if (mode === "job") return "job_travel";
  return "clicked_link";
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item, index) => (
        <Text key={`${title}-${index}`} style={styles.bullet}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

function RailList({ rails }: { rails: OfficialRail[] }) {
  if (!rails.length) return null;
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>Official rails</Text>
      {rails.map((rail) => (
        <View key={rail.railId} style={styles.railCard}>
          <Text style={styles.railTitle}>{rail.name}</Text>
          <Text style={styles.railMeta}>
            {rail.channel.toUpperCase()}
            {rail.contact ? ` • ${rail.contact}` : ""}
          </Text>
          <Text style={styles.railUrl}>{rail.url}</Text>
        </View>
      ))}
    </View>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("message");
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [text, setText] = useState("");
  const [secondaryHint, setSecondaryHint] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("");
  const [apkUri, setApkUri] = useState("");
  const [apkInfo, setApkInfo] = useState<ApkInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingApk, setLoadingApk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [emergency, setEmergency] = useState<EmergencyResponse | null>(null);

  const [userSaysReceivingMoney, setUserSaysReceivingMoney] = useState(false);
  const [physicalQrLooksTampered, setPhysicalQrLooksTampered] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [alreadySharedOtp, setAlreadySharedOtp] = useState(false);
  const [alreadyGaveRemoteAccess, setAlreadyGaveRemoteAccess] = useState(false);
  const [passportRequested, setPassportRequested] = useState(false);

  const helper = useMemo(() => MODES.find((item) => item.id === mode)?.helper || "", [mode]);
  const analyzeLabel = useMemo(() => (mode === "emergency" ? "Stabilize incident" : "Check before you act"), [mode]);

  async function onLoadApkMetadata() {
    if (!apkUri.trim()) {
      setError("Paste a content:// or file:// APK URI first.");
      return;
    }
    setLoadingApk(true);
    setError(null);
    try {
      const info = await ChetanaNative.getApkInfoFromUri(apkUri.trim());
      setApkInfo(info);
      if (info.packageName && !secondaryHint) {
        setSecondaryHint(info.packageName);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown APK read failure";
      setError(`${message}. Make sure the app has permission to read the shared APK URI.`);
      setApkInfo(null);
    } finally {
      setLoadingApk(false);
    }
  }

  async function onOpenNotificationSettings() {
    try {
      await ChetanaNative.openNotificationListenerSettings();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Settings handoff failed";
      setError(message);
    }
  }

  async function onAnalyze() {
    setLoading(true);
    setError(null);
    setEmergency(null);

    const payload = {
      mode,
      text,
      qrPayload: mode === "qr" ? text : undefined,
      expectedMerchant: mode === "qr" ? secondaryHint : undefined,
      expectedSender: mode === "message" || mode === "call" ? secondaryHint : undefined,
      destinationCountry: mode === "job" ? destinationCountry : undefined,
      visaType: mode === "job" ? secondaryHint : undefined,
      recruiterChannel: mode === "job" ? "whatsapp" : undefined,
      userSaysReceivingMoney,
      physicalQrLooksTampered,
      alreadyInstalled,
      alreadyPaid,
      alreadySharedOtp,
      alreadyGaveRemoteAccess,
      passportRequested,
      sourceChannel: mode === "message" ? "whatsapp" : mode === "qr" ? "qr" : "unknown",
      apkFileName: mode === "apk" ? secondaryHint || apkInfo?.packageName || undefined : undefined,
      apkPermissions: mode === "apk" ? apkInfo?.permissions || [] : [],
    };

    try {
      const analyzeResp = await fetch(`${apiBase}/v1/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!analyzeResp.ok) {
        throw new Error(`Analyze request failed: ${analyzeResp.status}`);
      }
      const analyzeData = (await analyzeResp.json()) as AnalyzeResponse;
      setResult(analyzeData);

      const shouldFetchEmergency =
        mode === "emergency" || alreadyInstalled || alreadyPaid || alreadySharedOtp || alreadyGaveRemoteAccess;

      if (shouldFetchEmergency) {
        const emergencyResp = await fetch(`${apiBase}/v1/emergency`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger: inferEmergencyTrigger(mode, {
              alreadyInstalled,
              alreadyPaid,
              alreadySharedOtp,
              alreadyGaveRemoteAccess,
            }),
            threatTypes: analyzeData.threatTypes,
            notes: text,
          }),
        });
        if (emergencyResp.ok) {
          setEmergency((await emergencyResp.json()) as EmergencyResponse);
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown API error";
      setError(`${message}. Point API base to the FastAPI host, for example ${DEFAULT_API_BASE}.`);
      setResult(null);
      setEmergency(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Chetana Android</Text>
        <Text style={styles.title}>Check before you act.</Text>
        <Text style={styles.subtitle}>
          Backend-first interception plus Android-native APK and notification hooks.
        </Text>

        <View style={styles.apiCard}>
          <Text style={styles.label}>API base</Text>
          <TextInput
            style={styles.apiInput}
            value={apiBase}
            onChangeText={setApiBase}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_API_BASE}
          />
        </View>

        <View style={styles.modeGrid}>
          {MODES.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => setMode(item.id)}
              style={[styles.modeChip, mode === item.id && styles.modeChipActive]}
            >
              <Text style={[styles.modeChipLabel, mode === item.id && styles.modeChipLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{helper}</Text>
          <TextInput
            style={styles.input}
            multiline
            value={text}
            onChangeText={setText}
            placeholder={
              mode === "qr"
                ? "Paste the decoded QR payload, URL, or upi://pay string..."
                : "Paste the message, call summary, offer text, or incident notes..."
            }
          />

          {(mode === "message" || mode === "call") && (
            <>
              <Text style={styles.label}>Expected sender or institution</Text>
              <TextInput
                style={styles.smallInput}
                value={secondaryHint}
                onChangeText={setSecondaryHint}
                placeholder="e.g. SBI, Tata Power, courier company"
              />
            </>
          )}

          {mode === "qr" && (
            <>
              <Text style={styles.label}>Expected merchant or recipient</Text>
              <TextInput
                style={styles.smallInput}
                value={secondaryHint}
                onChangeText={setSecondaryHint}
                placeholder="e.g. Store name or trusted recipient"
              />
            </>
          )}

          {mode === "job" && (
            <>
              <Text style={styles.label}>Destination country</Text>
              <TextInput
                style={styles.smallInput}
                value={destinationCountry}
                onChangeText={setDestinationCountry}
                placeholder="e.g. Cambodia"
              />
              <Text style={styles.label}>Visa type or recruiter note</Text>
              <TextInput
                style={styles.smallInput}
                value={secondaryHint}
                onChangeText={setSecondaryHint}
                placeholder="e.g. tourist visa, WhatsApp recruiter"
              />
            </>
          )}

          {mode === "apk" && (
            <>
              <Text style={styles.label}>APK filename or package hint</Text>
              <TextInput
                style={styles.smallInput}
                value={secondaryHint}
                onChangeText={setSecondaryHint}
                placeholder="e.g. KYCUpdate.apk"
              />
              <Text style={styles.label}>APK URI</Text>
              <TextInput
                style={styles.smallInput}
                value={apkUri}
                onChangeText={setApkUri}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="content://... or file://..."
              />
              <View style={styles.inlineActions}>
                <TouchableOpacity style={styles.secondaryCta} onPress={onLoadApkMetadata} disabled={loadingApk}>
                  <Text style={styles.secondaryCtaLabel}>{loadingApk ? "Reading APK..." : "Read APK metadata"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryGhost} onPress={onOpenNotificationSettings}>
                  <Text style={styles.secondaryGhostLabel}>Notification listener</Text>
                </TouchableOpacity>
              </View>
              {loadingApk ? <ActivityIndicator color="#B94131" /> : null}
              {apkInfo ? (
                <View style={styles.apkInfoCard}>
                  <Text style={styles.apkInfoLine}>Package: {apkInfo.packageName || "unknown"}</Text>
                  <Text style={styles.apkInfoLine}>Version: {apkInfo.versionName || "unknown"}</Text>
                  <Text style={styles.apkInfoLine}>SHA-256: {apkInfo.sha256 || "unknown"}</Text>
                  <Text style={styles.apkInfoLine}>
                    Permissions: {apkInfo.permissions?.length ? apkInfo.permissions.join(", ") : "not available"}
                  </Text>
                  {apkInfo.error ? <Text style={styles.error}>{apkInfo.error}</Text> : null}
                </View>
              ) : null}
            </>
          )}

          <View style={styles.switchRow}>
            {(mode === "qr" || mode === "message") && (
              <View style={styles.switchItem}>
                <Text style={styles.switchLabel}>They say you will receive money/refund</Text>
                <Switch value={userSaysReceivingMoney} onValueChange={setUserSaysReceivingMoney} />
              </View>
            )}
            {mode === "qr" && (
              <View style={styles.switchItem}>
                <Text style={styles.switchLabel}>Physical QR looks tampered</Text>
                <Switch value={physicalQrLooksTampered} onValueChange={setPhysicalQrLooksTampered} />
              </View>
            )}
            {mode === "job" && (
              <View style={styles.switchItem}>
                <Text style={styles.switchLabel}>Passport requested</Text>
                <Switch value={passportRequested} onValueChange={setPassportRequested} />
              </View>
            )}
            <View style={styles.switchItem}>
              <Text style={styles.switchLabel}>Already installed suspicious app</Text>
              <Switch value={alreadyInstalled} onValueChange={setAlreadyInstalled} />
            </View>
            <View style={styles.switchItem}>
              <Text style={styles.switchLabel}>Money may already be lost</Text>
              <Switch value={alreadyPaid} onValueChange={setAlreadyPaid} />
            </View>
            <View style={styles.switchItem}>
              <Text style={styles.switchLabel}>OTP / PIN may already be shared</Text>
              <Switch value={alreadySharedOtp} onValueChange={setAlreadySharedOtp} />
            </View>
            <View style={styles.switchItem}>
              <Text style={styles.switchLabel}>Remote access may already be granted</Text>
              <Switch value={alreadyGaveRemoteAccess} onValueChange={setAlreadyGaveRemoteAccess} />
            </View>
          </View>

          <TouchableOpacity style={styles.cta} onPress={onAnalyze} disabled={loading}>
            <Text style={styles.ctaLabel}>{loading ? "Checking..." : analyzeLabel}</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {result ? (
          <View style={[styles.resultCard, { borderColor: riskColor[result.riskLevel] }]}>
            <Text style={[styles.resultRisk, { color: riskColor[result.riskLevel] }]}>{result.riskLevel.toUpperCase()}</Text>
            <Text style={styles.resultMeta}>
              Score {result.score}/100 • Confidence {Math.round(result.confidence * 100)}%
            </Text>
            <Text style={styles.shareWarning}>{result.shareWarning}</Text>
            {result.insufficientEvidence ? (
              <Text style={styles.insufficientFlag}>Thin evidence: Chetana is refusing to clear this as safe.</Text>
            ) : null}
            <Section title="Why it fired" items={result.evidence} />
            <Section title="Missing info" items={result.missingInfo} />
            <Section title="Do not do" items={result.doNotDo} />
            <Section title="Recommended actions" items={result.recommendedActions} />
            <RailList rails={result.officialRails} />
          </View>
        ) : null}

        {emergency ? (
          <View style={styles.emergencyCard}>
            <Text style={styles.emergencyTitle}>Emergency recovery</Text>
            <Text style={styles.emergencyMeta}>
              {emergency.incidentType.replace(/_/g, " ")} • {emergency.severity.toUpperCase()}
            </Text>
            <Section title="Immediate steps" items={emergency.immediateSteps} />
            <Section title="Preserve evidence" items={emergency.preserveEvidence} />
            <Section title="Do not do" items={emergency.doNotDo} />
            <RailList rails={emergency.officialRails} />
            <Section title="Escalation order" items={emergency.escalationOrder} />
            <View style={styles.scriptBox}>
              <Text style={styles.sectionTitle}>Handoff script</Text>
              <Text style={styles.scriptText}>{emergency.handoffScript}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F0E8",
  },
  container: {
    padding: 20,
    gap: 14,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: "#7C4C30",
    textTransform: "uppercase",
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: "#1D1A17",
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: "#544A42",
  },
  apiCard: {
    borderWidth: 1,
    borderColor: "#D9C6B8",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#FFF9F4",
  },
  apiInput: {
    borderWidth: 1,
    borderColor: "#C9B29F",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    backgroundColor: "#FFF",
  },
  modeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#C9B29F",
    backgroundColor: "#FFF5ED",
  },
  modeChipActive: {
    backgroundColor: "#1D1A17",
    borderColor: "#1D1A17",
  },
  modeChipLabel: {
    color: "#3C322B",
    fontWeight: "700",
  },
  modeChipLabelActive: {
    color: "#FFF8F3",
  },
  panel: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D9C6B8",
    backgroundColor: "#FFFDF9",
    gap: 10,
  },
  panelTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: "#4F453D",
  },
  input: {
    minHeight: 170,
    borderWidth: 1,
    borderColor: "#C9B29F",
    borderRadius: 14,
    padding: 12,
    textAlignVertical: "top",
    backgroundColor: "#FFF",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6A5647",
  },
  smallInput: {
    borderWidth: 1,
    borderColor: "#C9B29F",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFF",
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  secondaryCta: {
    backgroundColor: "#E7D1C0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  secondaryCtaLabel: {
    color: "#382F28",
    fontWeight: "800",
  },
  secondaryGhost: {
    borderWidth: 1,
    borderColor: "#C9B29F",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFF7F1",
  },
  secondaryGhostLabel: {
    color: "#5E4C40",
    fontWeight: "700",
  },
  apkInfoCard: {
    borderWidth: 1,
    borderColor: "#E2D2C6",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FFF7F1",
    gap: 6,
  },
  apkInfoLine: {
    color: "#3E3630",
    lineHeight: 20,
  },
  switchRow: {
    gap: 10,
  },
  switchItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    paddingVertical: 4,
  },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#453A32",
  },
  cta: {
    marginTop: 8,
    backgroundColor: "#B94131",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaLabel: {
    color: "#FFF8F3",
    fontSize: 16,
    fontWeight: "800",
  },
  error: {
    color: "#8C1D18",
    lineHeight: 20,
  },
  resultCard: {
    borderWidth: 2,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#FFFDF9",
    gap: 8,
  },
  resultRisk: {
    fontSize: 28,
    fontWeight: "900",
  },
  resultMeta: {
    color: "#6B5A4E",
  },
  shareWarning: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#231F1B",
  },
  insufficientFlag: {
    color: "#7D4A14",
    fontWeight: "700",
  },
  sectionBlock: {
    gap: 6,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#231F1B",
  },
  bullet: {
    fontSize: 15,
    lineHeight: 22,
    color: "#3E3630",
  },
  railCard: {
    borderWidth: 1,
    borderColor: "#E2D2C6",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#FFF7F1",
  },
  railTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#241E1A",
  },
  railMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#7C4C30",
  },
  railUrl: {
    marginTop: 4,
    color: "#675347",
    lineHeight: 18,
  },
  emergencyCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D7A190",
    backgroundColor: "#FFF3EE",
    gap: 8,
  },
  emergencyTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#8A231C",
  },
  emergencyMeta: {
    color: "#6A4038",
    fontWeight: "700",
  },
  scriptBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFF8F3",
  },
  scriptText: {
    marginTop: 6,
    color: "#312822",
    lineHeight: 21,
  },
});
