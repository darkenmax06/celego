import { processSecureEvidenceJobs } from "@/lib/secure-evidence-processing";

async function main() {
  const result = await processSecureEvidenceJobs({
    simulateDecryption: process.env.RELAY_REAL_DOWNLOAD !== "true",
  });
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
