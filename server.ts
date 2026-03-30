import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./src/lib/config.ts";
import { createApiRouter } from "./src/routes/api.ts";

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(currentDir, "public");

app.use(express.json({ limit: "2mb" }));
app.use("/api", createApiRouter());
app.use(express.static(publicDir));

app.get("*", (_request, response) => {
  response.sendFile(path.join(publicDir, "index.html"));
});

app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({
    error: error.message || "Unexpected server error"
  });
});

app.listen(config.port, () => {
  console.log(`ntangible-sec-rag listening on http://localhost:${config.port}`);
});
