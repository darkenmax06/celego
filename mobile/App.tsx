import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  messengerId: string | null;
};

type RouteItem = {
  id: string;
  sequence: number;
  checkedAt: string | null;
  card: {
    id: string;
    tc: string;
    status: string;
    customer: { nombre: string; cedula: string };
  };
  proofs: Array<{ id: string; fileUrl: string; createdAt: string }>;
};

type RouteRow = {
  id: string;
  fecha: string;
  messenger: { id: string; nombre: string };
  items: RouteItem[];
};

const STORAGE_KEY = "celego_mobile_auth_v1";

export default function App() {
  const [baseUrl, setBaseUrl] = useState("http://10.0.2.2:3000");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [messengerId, setMessengerId] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as {
          baseUrl: string;
          token: string;
          user: AuthUser;
          messengerId: string;
          email: string;
        };
        setBaseUrl(parsed.baseUrl);
        setToken(parsed.token);
        setUser(parsed.user);
        setMessengerId(parsed.messengerId ?? "");
        setEmail(parsed.email ?? "");
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    })();
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
      if (!res.ok) {
        throw new Error(json.error ?? "No se pudo iniciar sesion");
      }
      setToken(json.token);
      setUser(json.user);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          baseUrl,
          token: json.token,
          user: json.user,
          messengerId,
          email,
        }),
      );
      setStatusMessage("Sesion iniciada");
      await loadRoutes(baseUrl, json.token);
    } catch (error) {
      Alert.alert("Login", error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function loadRoutes(currentBaseUrl = baseUrl, currentToken = token) {
    if (!currentToken) return;
    setLoading(true);
    setStatusMessage("");
    try {
      const url = `${currentBaseUrl}/api/mobile/rutas?date=${today}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar rutas");
      setRoutes(json.routes ?? []);
      setStatusMessage(`Rutas cargadas: ${(json.routes ?? []).length}`);
    } catch (error) {
      Alert.alert("Rutas", error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setToken("");
    setUser(null);
    setRoutes([]);
    setPassword("");
  }

  async function takeAndUploadPhoto(routeItemId: string) {
    if (!token) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso requerido", "Debes habilitar acceso a la camara.");
      return;
    }

    const capture = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
      mediaTypes: ["images"],
    });
    if (capture.canceled || !capture.assets.length) return;

    const asset = capture.assets[0];
    const uri = asset.uri;
    const mimeType = asset.mimeType ?? "image/jpeg";
    const fileName = asset.fileName ?? `proof-${routeItemId}.jpg`;

    setUploadingItemId(routeItemId);
    try {
      const form = new FormData();
      form.append("routeItemId", routeItemId);
      form.append(
        "file",
        {
          uri,
          name: fileName,
          type: mimeType,
        } as unknown as Blob,
      );
      form.append("note", "Subida desde app mobile");
      form.append("markAs", "ACUSE_RECIBIDO");

      const res = await fetch(`${baseUrl}/api/mobile/rutas/pruebas`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo subir evidencia");

      await loadRoutes();
      Alert.alert("Evidencia", "Foto subida correctamente.");
    } catch (error) {
      Alert.alert("Carga de foto", error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setUploadingItemId(null);
    }
  }

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <Text style={styles.title}>Celego Mensajeros</Text>
          <TextInput
            style={styles.input}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="Base URL (ej: http://192.168.1.20:3000)"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            value={messengerId}
            onChangeText={setMessengerId}
            placeholder="Messenger ID (requerido para rol MENSAJERO)"
            autoCapitalize="none"
          />
          <Pressable style={styles.primaryBtn} onPress={() => void login()} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Entrar</Text>}
          </Pressable>
          <Text style={styles.helper}>
            En Android emulador usa 10.0.2.2 para alcanzar localhost.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Rutas de hoy</Text>
          <Text style={styles.subtitle}>{user.name} ({user.role})</Text>
        </View>
        <Pressable style={styles.ghostBtn} onPress={() => void logout()}>
          <Text style={styles.ghostBtnText}>Salir</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryBtn} onPress={() => void loadRoutes()} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Actualizar</Text>}
        </Pressable>
      </View>

      {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}

      <ScrollView contentContainerStyle={styles.list}>
        {routes.map((route) => (
          <View key={route.id} style={styles.routeCard}>
            <Text style={styles.routeTitle}>
              {route.messenger.nombre} - {new Date(route.fecha).toLocaleDateString()}
            </Text>
            {route.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemMain}>{item.card.tc}</Text>
                  <Text style={styles.itemSub}>
                    {item.card.customer.nombre} - {item.card.customer.cedula}
                  </Text>
                  <Text style={styles.itemSub}>
                    Estado: {item.card.status} | Pruebas: {item.proofs.length}
                  </Text>
                  {item.proofs[0] ? (
                    <Image
                      source={{ uri: `${baseUrl}${item.proofs[0].fileUrl}` }}
                      alt="Evidencia de entrega"
                      style={styles.preview}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
                <Pressable
                  style={styles.photoBtn}
                  onPress={() => void takeAndUploadPhoto(item.id)}
                  disabled={uploadingItemId === item.id}
                >
                  {uploadingItemId === item.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Foto</Text>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        ))}
        {!routes.length ? (
          <Text style={styles.empty}>No hay rutas para hoy o no hay asignaciones para este mensajero.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f7f8fb",
  },
  loginContainer: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f2544",
  },
  subtitle: {
    color: "#334155",
    fontSize: 12,
    marginTop: 2,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d8dde7",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  helper: {
    color: "#475569",
    fontSize: 12,
  },
  primaryBtn: {
    backgroundColor: "#0f2544",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  photoBtn: {
    backgroundColor: "#0f2544",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    minWidth: 70,
  },
  btnText: {
    color: "#fff",
    fontWeight: "600",
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostBtnText: {
    color: "#334155",
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  status: {
    paddingHorizontal: 16,
    color: "#047857",
    fontSize: 12,
    paddingBottom: 6,
  },
  list: {
    padding: 12,
    gap: 10,
  },
  routeCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderColor: "#e2e8f0",
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  routeTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f2544",
  },
  itemRow: {
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  itemMain: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
  },
  itemSub: {
    color: "#475569",
    fontSize: 12,
    marginTop: 1,
  },
  preview: {
    width: 120,
    height: 90,
    borderRadius: 8,
    marginTop: 6,
  },
  empty: {
    textAlign: "center",
    color: "#475569",
    marginTop: 24,
    paddingHorizontal: 20,
  },
});
