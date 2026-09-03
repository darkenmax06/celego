import path from "node:path";
import { createRelayServer } from "./app";
import { JsonFileRelayMetadataStore } from "./store";

const port = Number(process.env.RELAY_PORT ?? 3900);
const metadataFile =
  process.env.RELAY_METADATA_FILE ?? path.join(process.cwd(), ".relay", "metadata.json");

const server = createRelayServer(new JsonFileRelayMetadataStore(metadataFile));

server.listen(port, () => {
  console.log(`Celego Relay escuchando en http://0.0.0.0:${port}`);
});
