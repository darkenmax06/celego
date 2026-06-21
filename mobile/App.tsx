import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  NativeModules,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Application from "expo-application";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as ScreenCapture from "expo-screen-capture";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { encryptEvidenceFile, verifyCedulaToken } from "./src/security/evidenceCrypto";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  messengerId: string | null;
};

type CedulaVerification = {
  algorithm: "SHA-256-SALTED";
  salt: string;
  hash: string;
  last4: string;
};

type AssignmentItem = {
  cardId: string;
  routeId?: string;
  routeItemId?: string;
  sequence?: number;
  status: string;
  recipientName: string;
  addressLine?: string;
  province?: string;
  zone?: string;
  reference?: string;
  cedulaVerification: CedulaVerification;
  updatedAt: string;
};

type AssignmentsResponse = {
  deviceId: string;
  messengerId: string;
  generatedAt: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  assignments: AssignmentItem[];
};

type EvidenceKind = "ACUSE" | "CEDULA";

type QueuedEvidence = {
  queueId: string;
  status: "pending" | "syncing" | "synced" | "failed";
  attempts: number;
  lastError?: string;
  encryptedBlobBase64: string;
  manifest: {
    deliveryId: string;
    deviceId: string;
    objectId: string;
    evidenceKind: EvidenceKind;
    cardId: string;
    routeItemId?: string;
    capturedAt: string;
    expiresAt: string;
    gps?: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
    };
    encryption: {
      algorithm: "AES-256-GCM";
      keyEncryptionAlgorithm: "RSA-OAEP-SHA256";
      encryptedKey: string;
      nonce: string;
      authTag: string;
    };
    blob: {
      sha256: string;
      byteSize: number;
      mimeType: "application/octet-stream";
    };
    markAs?: "ACUSE_RECIBIDO" | "DEVUELTA_TIENDA" | "EN_RUTA";
    note?: string;
  };
  localPreviewUri?: string;
  createdAt: string;
};

type QueuedIncident = {
  incidentId: string;
  status: "pending" | "synced" | "failed";
  cardId?: string;
  routeItemId?: string;
  title: string;
  description?: string;
  createdAt: string;
  lastError?: string;
};

type PersistedState = {
  baseUrl: string;
  relayUrl: string;
  deviceId: string;
  publicKeyPem: string;
  token: string;
  user: AuthUser | null;
  email: string;
  messengerId?: string;
  assignments: AssignmentItem[];
  selectedAssignmentId?: string;
  lastAssignmentsSyncAt?: string;
  queue: QueuedEvidence[];
  incidents: QueuedIncident[];
};

const STORAGE_KEY = "celego_secure_mobile_v1";
const DEFAULT_PUBLIC_KEY = "";
const CORE_API_PORT = 3800;
const RELAY_API_PORT = 3900;

function getExpoDevelopmentHost() {
  const sourceCode = NativeModules.SourceCode as { scriptURL?: string } | undefined;
  const scriptUrl = sourceCode?.scriptURL;
  const match = scriptUrl?.match(/^[a-z]+:\/\/([^/:]+)/i);
  return match?.[1];
}

function isDeviceOnlyLoopbackHost(host: string) {
  return host === "10.0.2.2" || host === "127.0.0.1" || host === "localhost";
}

function isLanHost(host: string | undefined) {
  return Boolean(host && !isDeviceOnlyLoopbackHost(host));
}

const EXPO_DEVELOPMENT_HOST = getExpoDevelopmentHost();
const DEFAULT_LOCAL_HOST = isLanHost(EXPO_DEVELOPMENT_HOST)
  ? EXPO_DEVELOPMENT_HOST
  : Platform.OS === "android"
    ? "10.0.2.2"
    : "localhost";

function buildLocalUrl(port: number) {
  return `http://${DEFAULT_LOCAL_HOST}:${port}`;
}

function extractHost(value: string | undefined) {
  return value?.match(/^[a-z]+:\/\/([^/:]+)/i)?.[1];
}

function normalizeDevelopmentUrl(value: string | undefined, port: number) {
  const savedHost = extractHost(value);
  if (!value || (isLanHost(EXPO_DEVELOPMENT_HOST) && savedHost && isDeviceOnlyLoopbackHost(savedHost))) {
    return buildLocalUrl(port);
  }
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function evidenceExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 72);
  return expiresAt.toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

function toRelayManifest(item: QueuedEvidence) {
  return {
    deliveryId: item.manifest.deliveryId,
    deviceId: item.manifest.deviceId,
    objectId: item.manifest.objectId,
    evidenceKind: item.manifest.evidenceKind,
    capturedAt: item.manifest.capturedAt,
    expiresAt: item.manifest.expiresAt,
    gps: item.manifest.gps,
    encryption: item.manifest.encryption,
    blob: item.manifest.blob,
  };
}

export default function App() {
  const [baseUrl, setBaseUrl] = useState(() => buildLocalUrl(CORE_API_PORT));
  const [relayUrl, setRelayUrl] = useState(() => buildLocalUrl(RELAY_API_PORT));
  const [publicKeyPem, setPublicKeyPem] = useState(DEFAULT_PUBLIC_KEY);
  const [deviceId, setDeviceId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [messengerId, setMessengerId] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [lastAssignmentsSyncAt, setLastAssignmentsSyncAt] = useState("");
  const [cedulaInput, setCedulaInput] = useState("");
  const [cedulaVerified, setCedulaVerified] = useState(false);
  const [queue, setQueue] = useState<QueuedEvidence[]>([]);
  const [incidents, setIncidents] = useState<QueuedIncident[]>([]);
  const [incidentNote, setIncidentNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    void ScreenCapture.preventScreenCaptureAsync();
    void (async () => {
      const androidId = Application.getAndroidId?.();
      if (androidId) setDeviceId(`DEV-${androidId.slice(-10).toUpperCase()}`);

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as PersistedState;
        setBaseUrl(normalizeDevelopmentUrl(parsed.baseUrl, CORE_API_PORT));
        setRelayUrl(normalizeDevelopmentUrl(parsed.relayUrl, RELAY_API_PORT));
        setDeviceId(parsed.deviceId);
        setPublicKeyPem(parsed.publicKeyPem);
        setToken(parsed.token);
        setUser(parsed.user);
        setEmail(parsed.email);
        setMessengerId(parsed.messengerId ?? "");
        setAssignments(parsed.assignments ?? []);
        setSelectedAssignmentId(parsed.selectedAssignmentId ?? "");
        setLastAssignmentsSyncAt(parsed.lastAssignmentsSyncAt ?? "");
        setQueue(parsed.queue ?? []);
        setIncidents(parsed.incidents ?? []);
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    })();

    return () => {
      void ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);

  useEffect(() => {
    const state: PersistedState = {
      baseUrl,
      relayUrl,
      deviceId,
      publicKeyPem,
      token,
      user,
      email,
      messengerId,
      assignments,
      selectedAssignmentId,
      lastAssignmentsSyncAt,
      queue,
      incidents,
    };
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [baseUrl, relayUrl, deviceId, publicKeyPem, token, user, email, messengerId, assignments, selectedAssignmentId, lastAssignmentsSyncAt, queue, incidents]);

  const activeItem = useMemo(() => {
    if (!assignments.length) return null;
    return assignments.find((item) => item.cardId === selectedAssignmentId) ?? assignments[0] ?? null;
  }, [assignments, selectedAssignmentId]);

  const filteredAssignments = useMemo(() => {
    const term = assignmentSearch.trim().toLowerCase();
    if (!term) return assignments;
    return assignments.filter((item) => {
      return [
        item.recipientName,
        item.addressLine,
        item.province,
        item.zone,
        item.reference,
        item.status,
        item.cedulaVerification.last4,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [assignments, assignmentSearch]);

  const queueSummary = useMemo(() => {
    const pending = queue.filter((item) => item.status === "pending" || item.status === "failed").length;
    const synced = queue.filter((item) => item.status === "synced").length;
    return { pending, synced, total: queue.length };
  }, [queue]);

  async function login() {
    if (!baseUrl || !email || !password) {
      Alert.alert("Datos requeridos", "Base URL, email y password son obligatorios.");
      return;
    }
    setLoading(true);
    setStatusMessage("");
    try {
      const res = await fetch(`${baseUrl}/api/mobile/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          messengerId: messengerId.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo iniciar sesion");
      setToken(json.token);
      setUser(json.user);
      setStatusMessage("Sesion iniciada. Registra/valida el dispositivo.");
      await syncAssignments(json.token, deviceId, true);
    } catch (error) {
      Alert.alert("Login", error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function registerDevice() {
    if (!token || !deviceId) return;
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/mobile/devices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId,
          label: `Celego Entregas ${deviceId}`,
          platform: "ANDROID",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo registrar dispositivo");
      setStatusMessage(`Dispositivo ${json.device.status}. Si esta PENDING, TI debe activarlo.`);
      if (json.device.status === "ACTIVE") {
        await syncAssignments(token, deviceId, true);
      }
    } catch (error) {
      Alert.alert("Dispositivo", error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const syncAssignments = useCallback(async (authToken = token, targetDeviceId = deviceId, silent = false) => {
    if (!authToken || !targetDeviceId) return;
    setLoading(true);
    try {
      const allAssignments: AssignmentItem[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const params = new URLSearchParams({
          deviceId: targetDeviceId,
          page: String(page),
          pageSize: "100",
        });
        const res = await fetch(`${baseUrl}/api/mobile/assignments?${params.toString()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const json = (await res.json()) as AssignmentsResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "No se pudieron sincronizar asignaciones");
        allAssignments.push(...(json.assignments ?? []));
        totalPages = json.totalPages ?? 1;
        page += 1;
      } while (page <= totalPages);

      setAssignments(allAssignments);
      setSelectedAssignmentId((current) =>
        allAssignments.some((item) => item.cardId === current)
          ? current
          : allAssignments[0]?.cardId ?? "",
      );
      setCedulaVerified(false);
      setLastAssignmentsSyncAt(nowIso());
      setStatusMessage(`${allAssignments.length} tarjetas asignadas sincronizadas`);
    } catch (error) {
      if (!silent) {
        Alert.alert("Asignaciones", error instanceof Error ? error.message : "Error desconocido");
      } else {
        setStatusMessage(error instanceof Error ? error.message : "No se pudieron sincronizar asignaciones");
      }
    } finally {
      setLoading(false);
    }
  }, [baseUrl, deviceId, token]);

  useEffect(() => {
    if (!token || !user || !deviceId) return;
    void syncAssignments(token, deviceId, true);
  }, [deviceId, syncAssignments, token, user]);

  function verifyCedula() {
    if (!activeItem) return;
    const ok = verifyCedulaToken(cedulaInput, activeItem.cedulaVerification);
    setCedulaVerified(ok);
    setStatusMessage(ok ? "Cedula verificada localmente" : "Cedula no coincide");
  }

  async function captureEvidence(evidenceKind: EvidenceKind) {
    if (!activeItem || !token) return;
    if (!publicKeyPem.trim()) {
      Alert.alert("Llave publica requerida", "Pega la llave publica de Celego para cifrar en el telefono.");
      return;
    }
    if (!cedulaVerified) {
      Alert.alert("Verificacion requerida", "Valida la cedula antes de capturar evidencia.");
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso requerido", "Debes habilitar acceso a la camara.");
      return;
    }

    const capture = await ImagePicker.launchCameraAsync({
      quality: 0.75,
      allowsEditing: false,
      mediaTypes: ["images"],
    });
    if (capture.canceled || !capture.assets.length) return;

    setLoading(true);
    try {
      const locationPermission = await Location.requestForegroundPermissionsAsync();
      const location = locationPermission.granted
        ? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        : null;
      const asset = capture.assets[0];
      const encrypted = await encryptEvidenceFile({
        uri: asset.uri,
        serverPublicKeyPem: publicKeyPem,
      });
      const capturedAt = nowIso();
      const objectId = makeId(`OBJ-${evidenceKind}`);
      const expiresAt = evidenceExpiresAt();
      const queued: QueuedEvidence = {
        queueId: makeId("Q"),
        status: "pending",
        attempts: 0,
        encryptedBlobBase64: encrypted.encryptedBlobBase64,
        localPreviewUri: asset.uri,
        createdAt: capturedAt,
        manifest: {
          deliveryId: makeId("DLV"),
          deviceId,
          objectId,
          evidenceKind,
          cardId: activeItem.cardId,
          routeItemId: activeItem.routeItemId,
          capturedAt,
          expiresAt,
          gps: location
            ? {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracyMeters: location.coords.accuracy ?? undefined,
              }
            : undefined,
          encryption: encrypted.encryption,
          blob: {
            sha256: encrypted.sha256,
            byteSize: encrypted.byteSize,
            mimeType: "application/octet-stream",
          },
          markAs: evidenceKind === "ACUSE" ? "ACUSE_RECIBIDO" : undefined,
          note: `Captura ${evidenceKind} desde app segura`,
        },
      };
      setQueue((current) => [queued, ...current]);
      setStatusMessage(`${evidenceKind} cifrada y agregada a cola`);
    } catch (error) {
      Alert.alert("Evidencia", error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function syncQueue() {
    if (!token) return;
    const pendingItems = queue.filter((item) => item.status === "pending" || item.status === "failed");
    if (!pendingItems.length && !incidents.some((item) => item.status !== "synced")) {
      await refreshSyncStatus();
      setStatusMessage("No hay pendientes en cola");
      return;
    }

    for (const item of pendingItems) {
      setQueue((current) =>
        current.map((row) => row.queueId === item.queueId ? { ...row, status: "syncing" } : row),
      );
      try {
        const relayRes = await fetch(`${relayUrl}/evidence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifest: toRelayManifest(item),
            encryptedBlobBase64: item.encryptedBlobBase64,
          }),
        });
        const relayJson = await relayRes.json();
        if (!relayRes.ok) throw new Error(relayJson.error ?? "Relay rechazo evidencia");

        const coreRes = await fetch(`${baseUrl}/api/mobile/evidencias/cifradas`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(item.manifest),
        });
        const coreJson = await coreRes.json();
        if (!coreRes.ok) throw new Error(coreJson.error ?? "Core rechazo manifiesto");

        setQueue((current) =>
          current.map((row) => row.queueId === item.queueId ? { ...row, status: "synced", lastError: undefined } : row),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido";
        setQueue((current) =>
          current.map((row) =>
            row.queueId === item.queueId
              ? { ...row, status: "failed", attempts: row.attempts + 1, lastError: message }
              : row,
          ),
        );
      }
    }

    await syncIncidents();
    await refreshSyncStatus();
  }

  async function syncIncidents() {
    if (!token) return;
    const pending = incidents.filter((item) => item.status !== "synced");
    for (const incident of pending) {
      try {
        const res = await fetch(`${baseUrl}/api/mobile/incidents`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            incidentId: incident.incidentId,
            deviceId,
            cardId: incident.cardId,
            routeItemId: incident.routeItemId,
            type: "OTHER",
            severity: "MEDIUM",
            title: incident.title,
            description: incident.description,
            reportedAt: incident.createdAt,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "No se pudo sincronizar incidencia");
        setIncidents((current) =>
          current.map((row) => row.incidentId === incident.incidentId ? { ...row, status: "synced" } : row),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido";
        setIncidents((current) =>
          current.map((row) =>
            row.incidentId === incident.incidentId ? { ...row, status: "failed", lastError: message } : row,
          ),
        );
      }
    }
  }

  async function refreshSyncStatus() {
    if (!token || !deviceId) return;
    try {
      const res = await fetch(`${baseUrl}/api/mobile/sync/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId,
          evidenceObjectIds: queue.map((item) => item.manifest.objectId),
          packageIds: [],
          incidentIds: incidents.map((item) => item.incidentId),
          clientQueueDepth: queue.filter((item) => item.status !== "synced").length,
          lastClientSyncAt: nowIso(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo refrescar sync");
      setStatusMessage(`Sync: ${json.evidences?.length ?? 0} evidencias rastreadas | servidor ${json.serverTime}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "No se pudo consultar sync");
    }
  }

  function queueIncident() {
    if (!activeItem || !incidentNote.trim()) {
      Alert.alert("Incidencia", "Selecciona una entrega y escribe una nota breve.");
      return;
    }
    setIncidents((current) => [
      {
        incidentId: makeId("INC"),
        status: "pending",
        cardId: activeItem.cardId,
        routeItemId: activeItem.routeItemId,
        title: "Incidencia de entrega",
        description: incidentNote.trim(),
        createdAt: nowIso(),
      },
      ...current,
    ]);
    setIncidentNote("");
  }

  async function logout() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setToken("");
    setUser(null);
    setAssignments([]);
    setSelectedAssignmentId("");
    setQueue([]);
    setIncidents([]);
    setPassword("");
  }

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>Celego Entregas</Text>
            <Text style={styles.heroTitle}>Cartera segura, evidencia cifrada</Text>
            <Text style={styles.heroText}>Inicia sesion, valida tu equipo y sincroniza tus tarjetas asignadas.</Text>
          </View>
          <TextInput style={styles.input} value={baseUrl} onChangeText={setBaseUrl} placeholder="Core API URL" autoCapitalize="none" />
          <TextInput style={styles.input} value={relayUrl} onChangeText={setRelayUrl} placeholder="Relay URL" autoCapitalize="none" />
          {isLanHost(EXPO_DEVELOPMENT_HOST) ? (
            <View style={styles.connectionHint}>
              <Text style={styles.hintText}>
                Expo Go detecto esta PC como {EXPO_DEVELOPMENT_HOST}. En telefono fisico usa {buildLocalUrl(CORE_API_PORT)}.
              </Text>
              <Pressable
                style={styles.hintButton}
                onPress={() => {
                  setBaseUrl(buildLocalUrl(CORE_API_PORT));
                  setRelayUrl(buildLocalUrl(RELAY_API_PORT));
                }}
              >
                <Text style={styles.hintButtonText}>Usar IP de esta PC</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
          <TextInput style={styles.input} value={messengerId} onChangeText={setMessengerId} placeholder="Messenger ID si aplica" autoCapitalize="none" />
          <Pressable style={styles.primaryBtn} onPress={() => void login()} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Entrar</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>Turno seguro</Text>
          <Text style={styles.headerTitle}>{user.name}</Text>
        </View>
        <Pressable style={styles.outlineBtn} onPress={() => void logout()}>
          <Text style={styles.outlineText}>Salir</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.custodyCard}>
          <Text style={styles.cardTitle}>Barra de custodia</Text>
          <View style={styles.custodyRail}>
            <Text style={styles.custodyStep}>Dispositivo</Text>
            <Text style={styles.custodyStep}>Asignadas</Text>
            <Text style={styles.custodyStep}>Cedula</Text>
            <Text style={styles.custodyStep}>Evidencia</Text>
            <Text style={styles.custodyStep}>Sync</Text>
          </View>
          <Text style={styles.statusLine}>{statusMessage || "Listo para operar offline."}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Dispositivo y llaves</Text>
          <TextInput style={styles.input} value={deviceId} onChangeText={setDeviceId} placeholder="Device ID" autoCapitalize="none" />
          <TextInput
            style={[styles.input, styles.multiline]}
            value={publicKeyPem}
            onChangeText={setPublicKeyPem}
            placeholder="Llave publica RSA de Celego"
            multiline
          />
          <Pressable style={styles.primaryBtn} onPress={() => void registerDevice()} disabled={loading}>
            <Text style={styles.btnText}>Registrar / latido de dispositivo</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>2. Mis tarjetas asignadas</Text>
          <View style={styles.syncStats}>
            <Text style={styles.stat}>{assignments.length} activas</Text>
            <Text style={styles.stat}>{filteredAssignments.length} visibles</Text>
          </View>
          <TextInput
            style={styles.input}
            value={assignmentSearch}
            onChangeText={setAssignmentSearch}
            placeholder="Buscar nombre, zona, referencia o ultimos 4"
            autoCapitalize="none"
          />
          <Pressable style={styles.primaryBtn} onPress={() => void syncAssignments()} disabled={loading}>
            <Text style={styles.btnText}>Sincronizar asignadas</Text>
          </Pressable>
          {lastAssignmentsSyncAt ? (
            <Text style={styles.muted}>Ultima sync: {new Date(lastAssignmentsSyncAt).toLocaleString()}</Text>
          ) : null}
          {!assignments.length ? (
            <Text style={styles.muted}>No hay tarjetas abiertas asignadas a este mensajero.</Text>
          ) : null}
        </View>

        {assignments.length ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>3. Tarjeta activa</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deliveryPills}>
              {filteredAssignments.map((item, index) => (
                <Pressable
                  key={item.cardId}
                  style={[styles.deliveryPill, activeItem?.cardId === item.cardId && styles.deliveryPillActive]}
                  onPress={() => {
                    setSelectedAssignmentId(item.cardId);
                    setCedulaVerified(false);
                  }}
                >
                  <Text style={activeItem?.cardId === item.cardId ? styles.deliveryPillTextActive : styles.deliveryPillText}>
                    #{item.sequence ?? index + 1} {item.cedulaVerification.last4}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {activeItem ? (
              <View style={styles.activeBox}>
                <Text style={styles.itemMain}>{activeItem.recipientName}</Text>
                <Text style={styles.muted}>{activeItem.addressLine ?? "Sin direccion"} | {activeItem.zone ?? "Zona"}</Text>
                <Text style={styles.muted}>{activeItem.status} | {activeItem.reference ?? "Sin referencia"}</Text>
                <TextInput style={styles.input} value={cedulaInput} onChangeText={setCedulaInput} placeholder={`Cedula termina en ${activeItem.cedulaVerification.last4}`} keyboardType="number-pad" />
                <Pressable style={cedulaVerified ? styles.successBtn : styles.secondaryBtn} onPress={verifyCedula}>
                  <Text style={styles.btnText}>{cedulaVerified ? "Cedula verificada" : "Verificar cedula local"}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {activeItem ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>4. Evidencias cifradas</Text>
            <View style={styles.row}>
              <Pressable style={styles.primaryBtn} onPress={() => void captureEvidence("ACUSE")} disabled={loading}>
                <Text style={styles.btnText}>Foto acuse</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => void captureEvidence("CEDULA")} disabled={loading}>
                <Text style={styles.btnText}>Foto cedula</Text>
              </Pressable>
            </View>
            <Text style={styles.muted}>Las fotos se cifran antes de entrar a la cola. No se sube evidencia legible.</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>5. Cola y sincronizacion</Text>
          <View style={styles.syncStats}>
            <Text style={styles.stat}>{queueSummary.pending} pendientes</Text>
            <Text style={styles.stat}>{queueSummary.synced} sincronizadas</Text>
            <Text style={styles.stat}>{incidents.filter((item) => item.status !== "synced").length} incidencias</Text>
          </View>
          <Pressable style={styles.primaryBtn} onPress={() => void syncQueue()} disabled={loading}>
            <Text style={styles.btnText}>Sincronizar ahora</Text>
          </Pressable>
          {queue.slice(0, 4).map((item) => (
            <View key={item.queueId} style={styles.queueRow}>
              {item.localPreviewUri ? (
                <Image
                  source={{ uri: item.localPreviewUri }}
                  alt="Vista previa local cifrada"
                  style={styles.preview}
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemMain}>{item.manifest.evidenceKind} | {item.status}</Text>
                <Text style={styles.muted}>{item.manifest.objectId}</Text>
                {item.lastError ? <Text style={styles.errorText}>{item.lastError}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        {activeItem ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>6. Incidencia</Text>
            <TextInput style={[styles.input, styles.multiline]} value={incidentNote} onChangeText={setIncidentNote} placeholder="Nota corta sin cedula ni tarjeta" multiline />
            <Pressable style={styles.warningBtn} onPress={queueIncident}>
              <Text style={styles.btnText}>Guardar incidencia offline</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.integrityNote}>
          Integridad: screenshot bloqueado por app. Root/MDM/certificate pinning requieren build nativo y politica corporativa de Fase 4/5.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#102033" },
  loginContainer: { padding: 18, gap: 12 },
  hero: { backgroundColor: "#173655", borderRadius: 22, padding: 18, gap: 8, borderWidth: 1, borderColor: "#2f5577" },
  heroTitle: { color: "#fff", fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  heroText: { color: "#d6e5ef", fontSize: 14, lineHeight: 20 },
  eyebrow: { color: "#e0a338", fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  topBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 21, fontWeight: "800" },
  content: { padding: 12, gap: 12, paddingBottom: 28 },
  card: { backgroundColor: "#f7f1e6", borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: "#eadfcf" },
  custodyCard: { backgroundColor: "#173655", borderRadius: 20, padding: 14, gap: 10, borderWidth: 1, borderColor: "#315979" },
  cardTitle: { color: "#12304b", fontSize: 16, fontWeight: "800" },
  custodyRail: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  custodyStep: { backgroundColor: "#254762", color: "#f8ecd6", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: "700" },
  statusLine: { color: "#cfe1ef", fontSize: 12 },
  input: { backgroundColor: "#fffaf2", borderRadius: 12, borderWidth: 1, borderColor: "#e0d2bf", paddingHorizontal: 12, paddingVertical: 10, color: "#17212b" },
  connectionHint: { backgroundColor: "#173655", borderRadius: 14, borderWidth: 1, borderColor: "#315979", padding: 12, gap: 8 },
  hintText: { color: "#d6e5ef", fontSize: 12, lineHeight: 18 },
  hintButton: { alignSelf: "flex-start", backgroundColor: "#f7f1e6", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  hintButtonText: { color: "#123a5d", fontSize: 12, fontWeight: "800" },
  multiline: { minHeight: 82, textAlignVertical: "top" },
  primaryBtn: { backgroundColor: "#123a5d", borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flex: 1 },
  secondaryBtn: { backgroundColor: "#5c6f7e", borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  successBtn: { backgroundColor: "#19785f", borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  warningBtn: { backgroundColor: "#bd6a22", borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  outlineBtn: { borderWidth: 1, borderColor: "#c9d8e3", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  outlineText: { color: "#fff", fontWeight: "700" },
  btnText: { color: "#fff", fontWeight: "800" },
  muted: { color: "#5b6773", fontSize: 12, lineHeight: 17 },
  row: { flexDirection: "row", gap: 10 },
  deliveryPills: { gap: 8 },
  deliveryPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#d0c1ad", backgroundColor: "#fffaf2" },
  deliveryPillActive: { backgroundColor: "#123a5d", borderColor: "#123a5d" },
  deliveryPillText: { color: "#12304b", fontWeight: "700" },
  deliveryPillTextActive: { color: "#fff", fontWeight: "800" },
  activeBox: { gap: 8, backgroundColor: "#fffaf2", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#eadfcf" },
  itemMain: { color: "#17212b", fontSize: 14, fontWeight: "800" },
  syncStats: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  stat: { backgroundColor: "#fffaf2", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, color: "#12304b", fontWeight: "800", fontSize: 12 },
  queueRow: { flexDirection: "row", gap: 10, alignItems: "center", borderTopWidth: 1, borderTopColor: "#eadfcf", paddingTop: 10 },
  preview: { width: 58, height: 58, borderRadius: 12, backgroundColor: "#d8c8b4" },
  errorText: { color: "#9a3412", fontSize: 12, marginTop: 2 },
  integrityNote: { color: "#cfe1ef", fontSize: 12, lineHeight: 18, paddingHorizontal: 6 },
});
