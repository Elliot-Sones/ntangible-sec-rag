import express from "express";

import { handleChat, createChatSession } from "../lib/chat/service.ts";
import { getBootstrapPayload, getSessionMessages } from "../lib/store/query.ts";
import { seedDatabase } from "../lib/store/seed.ts";

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.get("/bootstrap", async (_request, response, next) => {
    try {
      response.json(await getBootstrapPayload());
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions", async (request, response, next) => {
    try {
      const selectedSport = typeof request.body?.selectedSport === "string" ? request.body.selectedSport : null;
      response.json(await createChatSession(selectedSport));
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:sessionId/messages", async (request, response, next) => {
    try {
      response.json(await getSessionMessages(request.params.sessionId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/chat", async (request, response, next) => {
    try {
      const message = typeof request.body?.message === "string" ? request.body.message : "";
      if (!message.trim()) {
        response.status(400).json({ error: "message is required" });
        return;
      }

      const selectedSport = typeof request.body?.selectedSport === "string" ? request.body.selectedSport : null;
      const sessionId = typeof request.body?.sessionId === "string" ? request.body.sessionId : null;

      response.json(
        await handleChat({
          message,
          selectedSport,
          sessionId
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/seed", async (_request, response, next) => {
    try {
      response.json(await seedDatabase());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
