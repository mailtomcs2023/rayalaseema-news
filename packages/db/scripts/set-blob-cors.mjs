// One-off: configure CORS on the Azure Blob storage account so the browser can
// upload videos DIRECTLY to Blob via a SAS URL (a cross-origin PUT from the
// admin site). Without this, the browser blocks the upload.
//
// Run on the server (where AZURE_STORAGE_CONNECTION_STRING is set):
//   cd /home/azureuser/app && node packages/db/scripts/set-blob-cors.mjs
//
// Idempotent: re-running just re-applies the same rule.
import { BlobServiceClient } from "@azure/storage-blob";
import fs from "node:fs";

function getConn() {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) return process.env.AZURE_STORAGE_CONNECTION_STRING;
  for (const p of ["apps/admin/.env", ".env", "apps/web/.env"]) {
    try {
      const m = fs.readFileSync(p, "utf8").match(/^AZURE_STORAGE_CONNECTION_STRING=(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      /* next */
    }
  }
  return null;
}

const conn = getConn();
if (!conn) {
  console.error("AZURE_STORAGE_CONNECTION_STRING not found (env or apps/admin/.env)");
  process.exit(1);
}

const svc = BlobServiceClient.fromConnectionString(conn);
const cors = [
  {
    allowedOrigins: "https://admin.rayalaseemanews.com,https://rayalaseemanews.com,http://localhost:3001,http://localhost:3000",
    allowedMethods: "PUT,GET,HEAD,OPTIONS",
    allowedHeaders: "*",
    exposedHeaders: "*",
    maxAgeInSeconds: 3600,
  },
];

const props = await svc.getProperties();
props.cors = cors;
await svc.setProperties(props);
console.log("✅ Blob CORS configured:");
console.log(JSON.stringify(cors, null, 2));
